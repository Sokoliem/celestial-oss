import { box, event, text, type VNode } from '@celestial/core/nebula';
import { CURRENT_LAYOUT_VERSION, type HorizonLayoutState } from './persistence.js';
import { createSessionStore, loadSession, type SessionStore, saveSession } from './session.js';
import { splitPane } from './split.js';
import { floating } from './stack.js';
import type { TabConfig as BaseTabConfig, TabStyle } from './tabs.js';
import { renderWindowChrome } from './window-chrome.js';
import { createDesktopWindow, type WindowChromeConfig, type WindowMode, type WindowRole } from './window-lifecycle.js';
import type { WindowManager } from './windows.js';

export interface Pane {
  id: string;
  content: VNode;
  size: number | 'flex';
  minSize?: number;
}

export interface SplitLayout {
  direction: 'horizontal' | 'vertical';
  panes: Pane[];
  gap?: number;
  border?: unknown;
}

function normalizeSizes(panes: Pane[]): number[] {
  const flexCount = panes.filter((pane) => pane.size === 'flex').length;
  const fixedTotal = panes.reduce((sum, pane) => sum + (typeof pane.size === 'number' ? pane.size : 0), 0);
  const flexWeight = flexCount > 0 ? Math.max(1, fixedTotal / flexCount) : 1;
  return panes.map((pane) => (typeof pane.size === 'number' ? pane.size : flexWeight));
}

function buildSplit(direction: 'horizontal' | 'vertical', panes: Pane[], gap = 0): VNode {
  if (panes.length === 0) {
    return { kind: 'empty' };
  }
  if (panes.length === 1) {
    return panes[0]!.content;
  }

  const [first, ...rest] = panes;
  const sizes = normalizeSizes(panes);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const ratio = total === 0 ? 0.5 : sizes[0]! / total;
  const separator = gap > 0 ? ' '.repeat(gap) : undefined;

  return splitPane({
    direction,
    ratio,
    first: first!.content,
    second: buildSplit(direction, rest, gap),
    separator,
    minSize: first?.minSize ?? 1,
  });
}

export function createSplitLayout(layout: SplitLayout): VNode {
  return buildSplit(layout.direction, layout.panes, layout.gap);
}

export function splitH(layout: Omit<SplitLayout, 'direction'>): VNode {
  return createSplitLayout({ ...layout, direction: 'horizontal' });
}

export function splitV(layout: Omit<SplitLayout, 'direction'>): VNode {
  return createSplitLayout({ ...layout, direction: 'vertical' });
}

export interface TabConfig extends BaseTabConfig {
  id?: string;
  closable?: boolean;
  icon?: string;
}

export interface CreateTabBarConfig {
  tabs: TabConfig[];
  active: string;
  position?: 'top' | 'bottom';
  onClose?: (id: string) => unknown;
  onSelect?: (id: string) => unknown;
  style?: TabStyle;
}

interface TabNodeContext {
  activeIndex: number;
  onClose?: (id: string) => unknown;
  onSelect?: (id: string) => unknown;
}

function renderTabLabel(tab: TabConfig): string {
  const prefix = tab.icon ? `${tab.icon} ` : '';
  const suffix = tab.closable ? ' x' : '';
  return `${prefix}${tab.label}${suffix}`;
}

function toHandlerId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return fallback;
}

function buildTabNode(tab: TabConfig, index: number, context: TabNodeContext): VNode {
  const id = tab.id ?? tab.label;
  const labelNode: VNode = { kind: 'text', content: renderTabLabel(tab) };
  const eventNode: VNode = context.onSelect
    ? {
        kind: 'event',
        id: `tab:${id}`,
        child: labelNode,
        handlers: { onClick: toHandlerId(context.onSelect(id), `select:${id}`) },
      }
    : labelNode;
  const closeNode =
    tab.closable && context.onClose
      ? {
          kind: 'event' as const,
          id: `tab-close:${id}`,
          child: { kind: 'text' as const, content: 'x' },
          handlers: { onClick: toHandlerId(context.onClose(id), `close:${id}`) },
        }
      : null;

  return {
    kind: 'focus',
    id: `tab-focus:${id}`,
    focused: index === context.activeIndex,
    tabIndex: index,
    child: closeNode ? { kind: 'row', children: [eventNode, closeNode] } : eventNode,
  } satisfies VNode;
}

export function createTabBar(config: CreateTabBarConfig): VNode {
  const activeIndex = Math.max(
    0,
    config.tabs.findIndex((tab) => (tab.id ?? tab.label) === config.active),
  );
  const tabRow: VNode = {
    kind: 'row',
    children: config.tabs.map((tab, index) =>
      buildTabNode(tab, index, {
        activeIndex,
        onClose: config.onClose,
        onSelect: config.onSelect,
      }),
    ),
  };

  const content = config.tabs[activeIndex]?.content ?? { kind: 'empty' };
  const children = config.position === 'bottom' ? [content, tabRow] : [tabRow, content];
  return {
    kind: 'column',
    children,
  };
}

export interface FloatingWindowConfig {
  id: string;
  title?: string;
  content: VNode;
  role?: WindowRole;
  mode?: WindowMode;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Canonical frame snapshot kept in sync by WindowManager. */
  frame?: { x: number; y: number; width: number; height: number };
  zIndex?: number;
  draggable?: boolean;
  resizable?: boolean;
  focusable?: boolean;
  minimized?: boolean;
  maximized?: boolean;
  fullscreen?: boolean;
  hidden?: boolean;
  closed?: boolean;
  modal?: boolean;
  alwaysOnTop?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  fullscreenable?: boolean;
  chrome?: WindowChromeConfig;
  focused?: boolean;
  restoreBounds?: { x: number; y: number; width: number; height: number };
  restoreFrame?: { x: number; y: number; width: number; height: number };
  layoutId?: string;
}

export function createFloatingWindow(config: FloatingWindowConfig): FloatingWindowConfig {
  return config;
}

function renderFloatingWindow(window: FloatingWindowConfig): VNode {
  if (!window.title) {
    return window.content;
  }
  return renderWindowChrome(createDesktopWindow(window));
}

export function withFloatingWindows(base: VNode, windows: FloatingWindowConfig[] | WindowManager): VNode {
  const list = Array.isArray(windows) ? windows : windows.windows;
  return [...list]
    .filter(
      (window) => !window.minimized && !window.hidden && !window.closed && window.mode !== 'minimized' && window.mode !== 'hidden' && window.mode !== 'closed',
    )
    .sort((a, b) => (a.zIndex ?? 10) - (b.zIndex ?? 10))
    .reduce(
      (current, window) =>
        floating({
          base: current,
          overlay: renderFloatingWindow(window),
          x: window.x,
          y: window.y,
          width: window.width,
          height: window.height,
          zIndex: window.zIndex,
          layoutId: window.layoutId ?? `floating-window:${window.id}`,
        }),
      base,
    );
}

export interface Workspace {
  name: string;
  layout: unknown;
}

export interface WorkspaceManager {
  store: SessionStore;
  workspaces: Record<string, Workspace>;
}

function toLayoutState(workspace: Workspace): HorizonLayoutState {
  return {
    version: CURRENT_LAYOUT_VERSION,
    splits: [],
    tabs: [],
    floats: [],
    tiles: [],
    workspace: null,
    focus: { focusedPaneId: null },
    constraints: { paneConstraints: {} },
    paneContent: { __workspace: workspace.layout, __preview: { title: workspace.name, panes: 1 } },
  };
}

export function createWorkspaceManager(): WorkspaceManager {
  return {
    store: createSessionStore(),
    workspaces: {},
  };
}

export function saveWorkspace(manager: WorkspaceManager, workspace: Workspace): WorkspaceManager {
  const state = toLayoutState(workspace);
  return {
    store: saveSession(manager.store, {
      name: workspace.name,
      workspace: { layout: workspace.layout, activeIndex: 0 },
      preview: { title: workspace.name, panes: Object.keys(state.paneContent ?? {}).length },
    }),
    workspaces: {
      ...manager.workspaces,
      [workspace.name]: workspace,
    },
  };
}

export function loadWorkspace(manager: WorkspaceManager, name: string): Workspace | null {
  const local = manager.workspaces[name];
  if (local) {
    return local;
  }
  const session = loadSession(manager.store, name);
  if (!session) {
    return null;
  }
  return {
    name,
    layout: session.workspace.layout,
  };
}

export interface PipConfig {
  content: VNode;
  x: number | 'left' | 'right';
  y: number | 'top' | 'bottom';
  width: number;
  height: number;
  cornerRadius?: number;
  zIndex?: number;
  /** Stable semantic id used by hit testing and layout diagnostics. */
  surfaceId?: string;
  /**
   * Handler tag fired only when the pointer presses outside the PiP surface.
   * Horizon renders a viewport-sized transparent backdrop below a shielding
   * surface, so inside clicks can never race click-away dismissal.
   */
  onClickAway?: string;
}

export function createPip(config: PipConfig): PipConfig {
  return config;
}

function resolvePipAxis(value: number | 'left' | 'right' | 'top' | 'bottom', max: number, size: number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (value === 'right' || value === 'bottom') {
    return Math.max(0, max - size);
  }
  return 0;
}

export function withPip(base: VNode, pip: PipConfig, bounds: { cols: number; rows: number } = { cols: 80, rows: 24 }): VNode {
  const surfaceId = pip.surfaceId ?? 'pip';
  const zIndex = pip.zIndex ?? 20;
  const cols = Math.max(0, Math.floor(bounds.cols));
  const rows = Math.max(0, Math.floor(bounds.rows));
  const width = Math.min(Math.max(0, Math.floor(pip.width)), cols);
  const height = Math.min(Math.max(0, Math.floor(pip.height)), rows);
  const x = Math.min(Math.max(0, resolvePipAxis(pip.x, cols, width)), Math.max(0, cols - width));
  const y = Math.min(Math.max(0, resolvePipAxis(pip.y, rows, height)), Math.max(0, rows - height));
  let layeredBase = base;

  if (pip.onClickAway) {
    const backdrop = event(
      `pip-backdrop:${surfaceId}`,
      box(text(''), undefined, { width: cols, height: rows, overflow: 'hidden' }),
      { onClick: pip.onClickAway },
      { label: `Dismiss ${surfaceId}`, intent: 'dismiss', affordances: ['click'], cursor: 'default', extra: { surfaceId, clickAway: true } },
    );
    layeredBase = floating({
      base: layeredBase,
      overlay: backdrop,
      x: 0,
      y: 0,
      width: cols,
      height: rows,
      zIndex: zIndex - 1,
      layoutId: `pip-backdrop:${surfaceId}`,
    });
  }

  const shieldedContent = event(
    `pip-surface:${surfaceId}`,
    box(pip.content, undefined, { width, height, overflow: 'hidden' }),
    {},
    { label: surfaceId, intent: 'interact', affordances: [], cursor: 'default', extra: { surfaceId, blocksClickAway: true } },
  );
  return floating({
    base: layeredBase,
    overlay: shieldedContent,
    x,
    y,
    width,
    height,
    zIndex,
    layoutId: `pip-surface:${surfaceId}`,
  });
}
