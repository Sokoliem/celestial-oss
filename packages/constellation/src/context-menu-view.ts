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
import {
  type Color,
  DEFAULT_GLYPH_TOKENS,
  ensureReadableColor,
  type GlyphLevel,
  resolveElevationBorder,
  resolveGlyph,
  type SemanticTheme,
  style,
  truncate,
  type ThemeInput,
  type TokenContract,
  visualWidth,
} from '@celestial/corona';
import { stack } from '@celestial/gravity';
import { box, event, overlay, row, text, type ThemeContext, type VNode } from '@celestial/nebula';
import { type ContextMenuState, MAX_CONTEXT_MENU_ITEMS, type MenuItem } from './context-menu.js';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { resolveTheme, useTokens } from './theme.js';

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

export const contextMenuViewContract: TokenContract<ContextMenuViewTokens> = {
  background: (theme: SemanticTheme) => theme.elevation.floating.surface ?? theme.colors.surfaceRaised,
  border: (theme: SemanticTheme) => theme.elevation.floating.border ?? theme.colors.border,
  text: (theme: SemanticTheme) => theme.colors.text,
  textMuted: (theme: SemanticTheme) => theme.colors.muted,
  selectedBackground: (theme: SemanticTheme) => theme.states.selected.bg ?? theme.colors.surfaceAlt,
  selectedText: (theme: SemanticTheme) => theme.states.selected.fg,
  separator: (theme: SemanticTheme) => theme.colors.divider,
  shortcut: (theme: SemanticTheme) => theme.colors.textSoft,
};

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
  /** Optional semantic overrides. Defaults resolve from the live theme. */
  tokens?: Partial<ContextMenuViewTokens>;
  theme?: ThemeInput;
  themeCtx?: ThemeContext;
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
  /**
   * Stable interaction namespace. When supplied, enabled menu rows become
   * framework-owned hover/click regions parsed by
   * `contextMenuViewActionFromEvent`.
   */
  interactionId?: string;
}

export type ContextMenuViewAction = { type: 'highlight' | 'select'; index: number };

const UNSAFE_INTERACTION_ID = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;

function safeInteractionId(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !UNSAFE_INTERACTION_ID.test(value);
}

/** Parse row actions emitted by an interactive `contextMenuView`. */
export function contextMenuViewActionFromEvent(
  input: { elementId: string; handlerTag: string },
  interactionId: string,
): ContextMenuViewAction | null {
  if (!safeInteractionId(interactionId)) return null;
  const prefix = `${interactionId}:item:`;
  if (!input.elementId.startsWith(prefix)) return null;
  const index = Number(input.elementId.slice(prefix.length));
  if (!Number.isSafeInteger(index) || index < 0) return null;
  if (input.handlerTag === `${interactionId}:highlight`) return { type: 'highlight', index };
  if (input.handlerTag === `${interactionId}:select`) return { type: 'select', index };
  return null;
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
  /** Index in `state.items` represented by the first visible row. */
  readonly firstItemIndex: number;
  /** Total rows in the active menu level, including rows clipped by the viewport. */
  readonly totalRowCount: number;
}

interface ContextMenuWindow<M> {
  readonly items: readonly MenuItem<M>[];
  readonly firstItemIndex: number;
  readonly totalRowCount: number;
}

function visibleMenuWindow<M>(state: ContextMenuState<M>, viewport?: { cols: number; rows: number }): ContextMenuWindow<M> {
  const totalRowCount = Math.min(state.items.length, MAX_CONTEXT_MENU_ITEMS);
  const capacity = viewport ? Math.max(1, positiveInteger(viewport.rows, 1) - 2) : totalRowCount;
  const visibleCount = Math.min(totalRowCount, capacity);
  const selectedIndex = Number.isInteger(state.selectedIndex) ? Math.max(0, Math.min(totalRowCount - 1, state.selectedIndex)) : 0;
  const firstItemIndex = Math.max(0, Math.min(totalRowCount - visibleCount, selectedIndex - visibleCount + 1));
  return {
    items: state.items.slice(firstItemIndex, firstItemIndex + visibleCount),
    firstItemIndex,
    totalRowCount,
  };
}

function normalizedViewport(viewport: { cols: number; rows: number } | undefined): { cols: number; rows: number } | undefined {
  return viewport ? { cols: positiveInteger(viewport.cols, 1), rows: positiveInteger(viewport.rows, 1) } : undefined;
}

function resolveMenuWidth(items: readonly MenuItem<unknown>[], override: number | undefined, viewport?: { cols: number; rows: number }): number {
  const measured = measureItemWidth(items);
  return Math.min(positiveInteger(override, measured), viewport?.cols ?? 100_000);
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
  const { state, width: widthOverride, clampBounds } = options;
  if (!state.open || state.items.length === 0) return null;
  const viewport = normalizedViewport(options.viewport);
  const window = visibleMenuWindow(state, viewport);
  const width = resolveMenuWidth(state.items.slice(0, MAX_CONTEXT_MENU_ITEMS), widthOverride, viewport);
  const innerWidth = Math.max(1, width - 2);
  const height = window.items.length + 2;
  const innerHeight = Math.max(0, height - 2);
  const placement = applyClampBounds(clampPosition(state.x, state.y, width, height, viewport), width, height, viewport, clampBounds);
  return {
    x: placement.x,
    y: placement.y,
    width,
    height,
    innerWidth,
    innerHeight,
    rowCount: window.items.length,
    firstItemIndex: window.firstItemIndex,
    totalRowCount: window.totalRowCount,
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
export function measureContextMenuItemWidth(items: readonly MenuItem<unknown>[], options: MeasureContextMenuItemWidthOptions = {}): number {
  const min = positiveInteger(options.min, 12);
  const max = positiveInteger(options.max, 80);
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
  const safeX = nonNegativeInteger(x, 0);
  const safeY = nonNegativeInteger(y, 0);
  if (!viewport) return { x: safeX, y: safeY };
  return {
    x: Math.max(0, Math.min(safeX, viewport.cols - width)),
    y: Math.max(0, Math.min(safeY, viewport.rows - height)),
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
  const minX = nonNegativeInteger(bounds.minX, 0);
  const minY = nonNegativeInteger(bounds.minY, 0);
  const requestedMaxX = Number.isFinite(bounds.maxX) ? nonNegativeInteger(bounds.maxX, minX) : viewportMaxX;
  const requestedMaxY = Number.isFinite(bounds.maxY) ? nonNegativeInteger(bounds.maxY, minY) : viewportMaxY;
  const maxX = Math.max(minX, Math.min(viewportMaxX, requestedMaxX));
  const maxY = Math.max(minY, Math.min(viewportMaxY, requestedMaxY));
  return {
    x: Math.max(minX, Math.min(maxX, position.x)),
    y: Math.max(minY, Math.min(maxY, position.y)),
  };
}

export function contextMenuView<M>(options: ContextMenuViewOptions<M>): VNode | null {
  const { state, width: widthOverride, clampBounds, visibleHeight, glyphLevel = 'wide' } = options;
  if (!state.open || state.items.length === 0) return null;
  if (visibleHeight !== undefined && visibleHeight <= 0) return null;
  const resolvedTokens = useTokens(contextMenuViewContract, options, 'ContextMenuView');
  const suppliedTokens: ContextMenuViewTokens = { ...resolvedTokens, ...options.tokens };
  // Token overrides remain a supported escape hatch, but they must not be an
  // escape hatch from the framework's contrast contract.
  const tokens: ContextMenuViewTokens = {
    ...suppliedTokens,
    text: ensureReadableColor(suppliedTokens.text, suppliedTokens.background),
    textMuted: ensureReadableColor(suppliedTokens.textMuted, suppliedTokens.background),
    shortcut: ensureReadableColor(suppliedTokens.shortcut, suppliedTokens.background),
    selectedText: ensureReadableColor(suppliedTokens.selectedText, suppliedTokens.selectedBackground),
    border: ensureReadableColor(suppliedTokens.border, suppliedTokens.background, { minimum: 3 }),
    separator: ensureReadableColor(suppliedTokens.separator, suppliedTokens.background, { minimum: 3 }),
  };
  const theme = resolveTheme(options);

  const viewport = normalizedViewport(options.viewport);
  const window = visibleMenuWindow(state, viewport);
  const width = resolveMenuWidth(state.items.slice(0, MAX_CONTEXT_MENU_ITEMS), widthOverride, viewport);
  const innerWidth = Math.max(1, width - 2);
  const height = window.items.length + 2;
  const placement = applyClampBounds(clampPosition(state.x, state.y, width, height, viewport), width, height, viewport, clampBounds);
  const renderedHeight = visibleHeight === undefined ? height : Math.min(nonNegativeInteger(visibleHeight, height), height);
  const zIndex = nonNegativeInteger(options.zIndex, 100);
  const interactionId = options.interactionId;
  if (interactionId !== undefined && !safeInteractionId(interactionId)) {
    throw new RangeError('ContextMenuView interactionId must be a safe, non-empty identifier of at most 256 characters.');
  }

  const rows: VNode[] = window.items.map((item, visibleIndex) => {
    if (item.separator) {
      return text(resolveGlyph(DEFAULT_GLYPH_TOKENS.divider, glyphLevel).repeat(innerWidth), style({ color: tokens.separator, background: tokens.background }));
    }
    const hasCursor = window.firstItemIndex + visibleIndex === state.selectedIndex;
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
    const face =
      hintWidth === 0
        ? row(text(labelPadded, cellStyle), text(shortcutPadded, shortcutStyle))
        : row(text(labelPadded, cellStyle), text(fitCells(hint, hintWidth, 'right'), hintStyle), text(shortcutPadded, shortcutStyle));
    if (interactionId === undefined || item.disabled) return face;
    const index = window.firstItemIndex + visibleIndex;
    return event(
      `${interactionId}:item:${index}`,
      face,
      {
        onClick: `${interactionId}:select`,
        onRightClick: `${interactionId}:select`,
        onMouseEnter: `${interactionId}:highlight`,
      },
      {
        label: item.label,
        intent: item.submenu?.length ? 'open' : 'select',
        affordances: ['hover', 'click'],
        cursor: 'pointer',
        keyboardHint: item.shortcut,
      },
    );
  });

  return overlay(
    box(
      stack(rows),
      style({
        border: resolveElevationBorder(theme, 'floating'),
        borderColor: tokens.border,
        background: tokens.background,
      }),
      { width, height: renderedHeight, overflow: 'hidden' },
    ),
    { x: placement.x, y: placement.y, width, height: renderedHeight, zIndex },
  );
}
