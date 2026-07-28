import { type Color, createTheme, resolveComponentTokens, style, type ThemeInput, type TokenContract, truncate, visualWidth } from '@celestial/core/corona';
import { box, column, empty, event, focus, row, type ThemeContext, text, type VNode } from '@celestial/core/nebula';
import { isSafeRecordKey, positiveInteger } from './internal.js';
import { encodeWindowEventId, getMinimizedWindows, type ManagedWindow, type WindowManager } from './windows.js';

export interface WindowShelfTokens {
  background: Color;
  labelBackground: Color;
  labelText: Color;
  itemBackground: Color;
  text: Color;
  activeText: Color;
  activeBackground: Color;
  hoverText: Color;
  hoverBackground: Color;
  overflowText: Color;
}

export const windowShelfContract: TokenContract<WindowShelfTokens> = {
  background: (theme) => theme.elevation.raised.surface ?? theme.colors.surfaceRaised,
  labelBackground: (theme) => theme.colors.interactive,
  labelText: (theme) => theme.colors.inverse,
  itemBackground: (theme) => theme.colors.surfaceAlt,
  text: (theme) => theme.colors.textSoft,
  activeText: (theme) => theme.states.active.fg,
  activeBackground: (theme) => theme.states.active.bg ?? theme.colors.surfaceAlt,
  hoverText: (theme) => theme.states.hover.fg,
  hoverBackground: (theme) => theme.states.hover.bg ?? theme.colors.surfaceAlt,
  overflowText: (theme) => theme.colors.muted,
};

export interface WindowShelfConfig {
  manager: WindowManager;
  /** Total shelf width in terminal cells. */
  width: number;
  /** Include minimized windows from inactive workspaces. Default false. */
  allWorkspaces?: boolean;
  /** Window whose shelf button owns keyboard focus. */
  focusedWindowId?: string;
  /** Window currently hovered by the pointer. */
  hoveredWindowId?: string;
  /** Maximum width of an individual window button. Default 24 cells. */
  maxItemWidth?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface WindowShelfStatusBarConfig extends WindowShelfConfig {
  /** The application's permanent status row or status surface. */
  statusBar: VNode;
}

export interface WindowShelfMeasureOptions {
  /** Include minimized windows from inactive workspaces. Default false. */
  allWorkspaces?: boolean;
}

export type WindowShelfAction =
  | { type: 'activate'; id: string }
  | { type: 'context'; id: string }
  | { type: 'hover'; id: string }
  | { type: 'leave'; id: string }
  | { type: 'overflow' };

/** Rows the conditional shelf currently needs in its host shell. */
export function windowShelfReservedRows(manager: WindowManager, options: WindowShelfMeasureOptions = {}): 0 | 1 {
  return getMinimizedWindows(manager, { allWorkspaces: options.allWorkspaces }).length > 0 ? 1 : 0;
}

interface ShelfItem {
  window: ManagedWindow;
  label: string;
  width: number;
}

function decodeShelfWindowId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    return isSafeRecordKey(id) ? id : null;
  } catch {
    return null;
  }
}

/** Parse the stable event tags emitted by {@link windowShelf}. */
export function windowShelfActionFromEvent(event: { handlerTag: string }): WindowShelfAction | null {
  if (event.handlerTag === 'window-shelf:overflow') return { type: 'overflow' };
  const match = /^window-shelf:(.+):(activate|context|hover|leave)$/.exec(event.handlerTag);
  if (!match?.[1] || !match[2]) return null;
  const id = decodeShelfWindowId(match[1]);
  if (!id) return null;
  if (match[2] === 'activate') return { type: 'activate', id };
  if (match[2] === 'context') return { type: 'context', id };
  if (match[2] === 'hover') return { type: 'hover', id };
  return { type: 'leave', id };
}

function makeLabel(window: ManagedWindow, maxWidth: number, left: string, right: string): string {
  const frameWidth = visualWidth(left) + visualWidth(right);
  if (maxWidth <= frameWidth) return truncate(`${left}${right}`, maxWidth);
  const title = window.title ?? window.id;
  return `${left}${truncate(title, maxWidth - frameWidth)}${right}`;
}

function planShelfItems(
  windows: ManagedWindow[],
  width: number,
  maxItemWidth: number,
  left: string,
  right: string,
  overflowGlyph: string,
): {
  items: ShelfItem[];
  overflow: number;
  overflowLabel: string;
} {
  const items: ShelfItem[] = [];
  let used = 0;

  for (let index = 0; index < windows.length; index += 1) {
    const remainingAfter = windows.length - index - 1;
    const overflowLabel = remainingAfter > 0 ? ` ${overflowGlyph}${remainingAfter}` : '';
    const reserve = visualWidth(overflowLabel);
    const available = width - used - reserve;
    if (available <= 0) break;
    const label = makeLabel(windows[index]!, Math.min(maxItemWidth, available), left, right);
    const itemWidth = visualWidth(label);
    if (itemWidth <= 0 || used + itemWidth + reserve > width) break;
    items.push({ window: windows[index]!, label, width: itemWidth });
    used += itemWidth;
  }

  const overflow = windows.length - items.length;
  const overflowLabel = overflow > 0 ? truncate(` ${overflowGlyph}${overflow}`, Math.max(0, width - used)) : '';
  return { items, overflow, overflowLabel };
}

/**
 * Render a conditional, one-row task shelf for minimized managed windows.
 * The shelf is deliberately stateless: activate/context/overflow tags are
 * parsed with {@link windowShelfActionFromEvent} and routed by the host app.
 */
export function windowShelf(config: WindowShelfConfig): VNode {
  const width = positiveInteger(config.width, 1);
  const windows = getMinimizedWindows(config.manager, { allWorkspaces: config.allWorkspaces });
  if (windows.length === 0) return empty();

  const theme = config.themeCtx?.current() ?? createTheme(config.theme);
  const tokens = resolveComponentTokens(windowShelfContract, theme, 'WindowShelf');
  const maxItemWidth = positiveInteger(config.maxItemWidth, 24, width);
  const fullLabel = ` MINIMIZED ${windows.length} `;
  const compactLabel = ` M:${windows.length} `;
  const minimumItemWidth = 5;
  const shelfLabel = width - visualWidth(fullLabel) >= minimumItemWidth ? fullLabel : width - visualWidth(compactLabel) >= minimumItemWidth ? compactLabel : '';
  const itemAreaWidth = Math.max(0, width - visualWidth(shelfLabel));
  const plan = planShelfItems(windows, itemAreaWidth, maxItemWidth, ` ${theme.glyphs.keycapLeft}`, `${theme.glyphs.keycapRight} `, theme.glyphs.ellipsis);
  const children: VNode[] = shelfLabel ? [text(shelfLabel, style({ color: tokens.labelText, background: tokens.labelBackground, bold: true }))] : [];
  children.push(
    ...plan.items.map(({ window, label }) => {
      const encodedId = encodeWindowEventId(window.id);
      const hovered = config.hoveredWindowId === window.id;
      const focused = config.focusedWindowId === window.id;
      const button = event(
        `window-shelf:${encodedId}`,
        text(
          label,
          style({
            color: hovered ? tokens.hoverText : focused ? tokens.activeText : tokens.text,
            background: hovered ? tokens.hoverBackground : focused ? tokens.activeBackground : tokens.itemBackground,
            bold: hovered || focused,
          }),
        ),
        {
          onClick: `window-shelf:${encodedId}:activate`,
          onRightClick: `window-shelf:${encodedId}:context`,
          onMouseEnter: `window-shelf:${encodedId}:hover`,
          onMouseLeave: `window-shelf:${encodedId}:leave`,
        },
        {
          label: `Restore ${window.title ?? window.id}`,
          summary: window.workspaceId ? `Minimized window in workspace ${window.workspaceId}` : 'Minimized window',
          intent: 'restore-window',
          affordances: ['hover', 'click'],
          cursor: 'pointer',
          extra: { windowId: window.id, workspaceId: window.workspaceId, restoreMode: window.restoreMode },
        },
      );
      return focus(`window-shelf:${encodedId}:focus`, button, { focused, group: 'window-shelf' });
    }),
  );

  if (plan.overflow > 0 && plan.overflowLabel) {
    children.push(
      event(
        'window-shelf:overflow-indicator',
        text(plan.overflowLabel, style({ color: tokens.overflowText })),
        { onClick: 'window-shelf:overflow', onRightClick: 'window-shelf:overflow' },
        {
          label: `${plan.overflow} more minimized windows`,
          intent: 'open-window-list',
          affordances: ['click'],
          cursor: 'pointer',
          extra: { count: plan.overflow },
        },
      ),
    );
  }

  return box(row(...children), style({ background: tokens.background }), { width, height: 1, overflow: 'hidden' });
}

/**
 * Compose the permanent status surface with a shelf row only when minimized
 * windows exist. Used as `shellLayout.statusBar`, this makes the shell measure
 * and reserve the extra row instead of allowing a floating shelf to cover
 * application information.
 */
export function windowShelfStatusBar(config: WindowShelfStatusBarConfig): VNode {
  const { statusBar, ...shelfConfig } = config;
  const shelf = windowShelf(shelfConfig);
  return shelf.kind === 'empty' ? statusBar : column(shelf, statusBar);
}
