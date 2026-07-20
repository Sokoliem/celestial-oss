/**
 * Generic context-menu renderer.
 *
 * Companion to the framework-agnostic `ContextMenuState` reducer in
 * `context-menu.ts`. Renders the open menu as an overlay at its (x, y) using
 * the supplied tokens. Submenus paint to the right of the parent.
 *
 * Usage:
 *
 *   contextMenuView({
 *     state,
 *     tokens,
 *     zIndex: 120,
 *     viewport: { cols, rows },
 *   })
 *
 * The host application is responsible for routing right-click events to a
 * `ctx-open` message and for handling the selected item's `msg` once the user
 * confirms a selection.
 */
import { border, type Color, DEFAULT_GLYPH_TOKENS, type GlyphLevel, resolveGlyph, style, truncate, visualWidth } from '@celestial/corona';
import { stack } from '@celestial/gravity';
import { box, overlay, row, text, type VNode } from '@celestial/nebula';
import type { ContextMenuState, MenuItem } from './context-menu.js';

export interface ContextMenuViewTokens {
  background: Color;
  border: Color;
  text: Color;
  textMuted: Color;
  selectedBackground: Color;
  selectedText: Color;
  separator: Color;
  shortcut: Color;
}

/**
 * Geometry-only options accepted by `measureContextMenuLayout`. Tokens are
 * not needed for measurement; consumers that only want the rendered geometry
 * (mouse routing, sub-region clamping, animation-driven height clipping) can
 * compute it without resolving theme tokens.
 */
export interface ContextMenuLayoutOptions<M> {
  state: ContextMenuState<M>;
  /** Viewport dimensions used to clamp menu position so it stays on-screen. */
  viewport?: { cols: number; rows: number };
  /** Width override; defaults to widest item label + paddings. */
  width?: number;
  /**
   * Optional inner clip applied after viewport clamping. Lets embedders restrict
   * the menu to a sub-region of the viewport (e.g. a sidebar inner column).
   * Defaults are the viewport edges, i.e. no extra clamp. Phase 2 wrapper-rewire.
   */
  clampBounds?: {
    minX?: number;
    maxX?: number;
    minY?: number;
    maxY?: number;
  };
}

export interface ContextMenuViewOptions<M> extends ContextMenuLayoutOptions<M> {
  tokens: ContextMenuViewTokens;
  /** Z-index for the overlay (default 100). */
  zIndex?: number;
  /**
   * Optional vertical clip on the rendered frame. When set, the rendered box's
   * height is clamped to `visibleHeight` so embedders can drive open/close
   * animations by sweeping the value from 0 → full height. Returns `null` when
   * `visibleHeight <= 0`. Phase 2 wrapper-rewire — was a wrapper-side concern.
   */
  visibleHeight?: number;
  /** Terminal glyph capability used for submenu and separator tokens. */
  glyphLevel?: GlyphLevel;
}

function fitCells(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (width <= 0) return '';
  const clipped = truncate(value, width);
  const padding = ' '.repeat(Math.max(0, width - visualWidth(clipped)));
  return align === 'right' ? `${padding}${clipped}` : `${clipped}${padding}`;
}

/**
 * Layout descriptor for a `contextMenuView` render. Returned by
 * `measureContextMenuLayout` so consumers can route mouse hits + clamp
 * positions against the same geometry the view paints at.
 *
 * Phase 2b helper — enables real consumer migration from wrapper-context-menu
 * to constellation by exposing the internal measurement that the wrapper
 * previously owned via its own `createWrapperContextMenuFrame`.
 */
export interface ContextMenuLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Inner content width (width - 2 for the border). */
  readonly innerWidth: number;
  /** Inner content height (height - 2 for the border). */
  readonly innerHeight: number;
  /** Number of rows actually being rendered (= items.length). */
  readonly rowCount: number;
}

/**
 * Compute the layout `contextMenuView` would render for the given state +
 * options. Returns null when the menu would render nothing (closed or empty).
 *
 * Consumers route mouse hits by:
 *   - rejecting any pointer outside `[x, x+width) × [y, y+height)` (or
 *     `[y, y+innerHeight)` when the top/bottom border should not be
 *     hit-active);
 *   - mapping in-bounds row hits via `y - layout.y - 1` (border offset).
 */
export function measureContextMenuLayout<M>(options: ContextMenuLayoutOptions<M>): ContextMenuLayout | null {
  const { state, viewport, width: widthOverride, clampBounds } = options;
  if (!state.open || state.items.length === 0) return null;
  const width = widthOverride ?? measureItemWidth(state.items);
  const innerWidth = Math.max(1, width - 2);
  const height = state.items.length + 2;
  const innerHeight = Math.max(0, height - 2);
  const placement = applyClampBounds(clampPosition(state.x, state.y, width, height, viewport), width, height, viewport, clampBounds);
  return {
    x: placement.x,
    y: placement.y,
    width,
    height,
    innerWidth,
    innerHeight,
    rowCount: state.items.length,
  };
}

export interface MeasureContextMenuItemWidthOptions {
  /** Minimum frame width (border + padding + label). Default 12. */
  min?: number;
  /** Maximum frame width. Default 80. */
  max?: number;
}

/**
 * Compute the frame width `contextMenuView` would auto-pick for `items`. The
 * frame includes 2 cells of border and 2 cells of label padding (1 leading + 1
 * trailing), so a row with a 7-char label measures at least 11 cells before
 * the `min` clamp applies.
 *
 * Use the result as the `width` override on `contextMenuView` /
 * `measureContextMenuLayout` when you need the same width auto-measure would
 * pick but with custom min/max bounds (e.g. embedder-side menus that have a
 * narrower-than-default upper bound).
 */
export function measureContextMenuItemWidth(
  items: readonly MenuItem<unknown>[],
  options: MeasureContextMenuItemWidthOptions = {},
): number {
  const min = options.min ?? 12;
  const max = options.max ?? 80;
  let width = min;
  for (const item of items) {
    if (item.separator) continue;
    const labelLen = visualWidth(item.label);
    const shortcutLen = item.shortcut ? visualWidth(item.shortcut) + 2 : 0;
    const hintLen = item.hint ? visualWidth(item.hint) + 1 : 0;
    const submenuLen = item.submenu ? 2 : 0;
    width = Math.max(width, labelLen + shortcutLen + hintLen + submenuLen + 4);
  }
  return Math.min(max, width);
}

function measureItemWidth(items: readonly MenuItem<unknown>[]): number {
  return measureContextMenuItemWidth(items);
}

function clampPosition(x: number, y: number, width: number, height: number, viewport?: { cols: number; rows: number }): { x: number; y: number } {
  if (!viewport) return { x: Math.max(0, x), y: Math.max(0, y) };
  return {
    x: Math.max(0, Math.min(x, viewport.cols - width)),
    y: Math.max(0, Math.min(y, viewport.rows - height)),
  };
}

function applyClampBounds(
  position: { x: number; y: number },
  width: number,
  height: number,
  viewport: { cols: number; rows: number } | undefined,
  bounds: ContextMenuLayoutOptions<unknown>['clampBounds'],
): { x: number; y: number } {
  if (!bounds) return position;
  const viewportMaxX = viewport ? viewport.cols - width : Number.POSITIVE_INFINITY;
  const viewportMaxY = viewport ? viewport.rows - height : Number.POSITIVE_INFINITY;
  const minX = Math.max(0, bounds.minX ?? 0);
  const minY = Math.max(0, bounds.minY ?? 0);
  const maxX = Math.max(minX, Math.min(viewportMaxX, bounds.maxX ?? viewportMaxX));
  const maxY = Math.max(minY, Math.min(viewportMaxY, bounds.maxY ?? viewportMaxY));
  return {
    x: Math.max(minX, Math.min(maxX, position.x)),
    y: Math.max(minY, Math.min(maxY, position.y)),
  };
}

export function contextMenuView<M>(options: ContextMenuViewOptions<M>): VNode | null {
  const { state, tokens, zIndex = 100, viewport, width: widthOverride, clampBounds, visibleHeight, glyphLevel = 'wide' } = options;
  if (!state.open || state.items.length === 0) return null;
  if (visibleHeight !== undefined && visibleHeight <= 0) return null;

  const width = widthOverride ?? measureItemWidth(state.items);
  const innerWidth = Math.max(1, width - 2);
  const height = state.items.length + 2;
  const placement = applyClampBounds(clampPosition(state.x, state.y, width, height, viewport), width, height, viewport, clampBounds);
  const renderedHeight = visibleHeight === undefined ? height : Math.max(0, Math.min(visibleHeight, height));

  const rows: VNode[] = state.items.map((item, index) => {
    if (item.separator) {
      return text(resolveGlyph(DEFAULT_GLYPH_TOKENS.divider, glyphLevel).repeat(innerWidth), style({ color: tokens.separator, background: tokens.background }));
    }
    const hasCursor = index === state.selectedIndex;
    const isSelected = hasCursor && !item.disabled;
    // Hovered disabled rows keep the selected background so the cursor remains
    // visible, but dim the text to communicate that activation is blocked.
    const selectedDisabled = hasCursor && !!item.disabled;
    const cellStyle = isSelected
      ? style({ color: tokens.selectedText, background: tokens.selectedBackground, bold: true })
      : selectedDisabled
        ? style({ color: tokens.selectedText, background: tokens.selectedBackground, dim: true })
        : item.disabled
          ? style({ color: tokens.textMuted, background: tokens.background })
          : style({ color: tokens.text, background: tokens.background });
    const hintStyle = isSelected
      ? style({ color: tokens.selectedText, background: tokens.selectedBackground, dim: true })
      : selectedDisabled
        ? style({ color: tokens.selectedText, background: tokens.selectedBackground, dim: true })
        : style({ color: tokens.textMuted, background: tokens.background, dim: true });
    const shortcutStyle = isSelected
      ? style({ color: tokens.selectedText, background: tokens.selectedBackground })
      : selectedDisabled
        ? style({ color: tokens.selectedText, background: tokens.selectedBackground, dim: true })
        : style({ color: tokens.shortcut, background: tokens.background });

    const submenuMarker = item.submenu && item.submenu.length > 0 ? ` ${resolveGlyph(DEFAULT_GLYPH_TOKENS.menuArrow, glyphLevel)}` : '';
    const shortcut = item.shortcut ? ` ${item.shortcut}` : '';
    // P0-1 — optional right-aligned hint column rendered between label and shortcut.
    const hint = item.hint ? ` ${item.hint}` : '';
    const labelChunk = ` ${item.label}${submenuMarker}`;
    const shortcutWidth = Math.min(visualWidth(shortcut), innerWidth);
    const hintWidth = Math.min(visualWidth(hint), Math.max(0, innerWidth - shortcutWidth));
    const labelWidth = Math.max(0, innerWidth - shortcutWidth - hintWidth);
    const labelPadded = fitCells(labelChunk, labelWidth);
    const shortcutPadded = fitCells(shortcut, shortcutWidth, 'right');
    if (hintWidth === 0) {
      return row(text(labelPadded, cellStyle), text(shortcutPadded, shortcutStyle));
    }
    return row(text(labelPadded, cellStyle), text(fitCells(hint, hintWidth, 'right'), hintStyle), text(shortcutPadded, shortcutStyle));
  });

  return overlay(
    box(
      stack(rows),
      style({
        border: border.rounded,
        borderColor: tokens.border,
        background: tokens.background,
      }),
      { width, height: renderedHeight, overflow: 'hidden' },
    ),
    { x: placement.x, y: placement.y, width, height: renderedHeight, zIndex },
  );
}
