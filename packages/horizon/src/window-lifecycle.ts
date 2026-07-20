import type { ThemeInput } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import type { FloatingWindowConfig } from './compat.js';
import type { FloatingWindowFrame, FloatingWindowResizeEdge } from './floating-window-drag.js';
import { finiteCell, isSafeRecordKey, MAX_CELL_SIZE, MAX_SPLIT_PANES, positiveInteger } from './internal.js';

export type WindowMode = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'hidden' | 'closed';

export type WindowRole = 'window' | 'modal' | 'palette' | 'tooltip' | 'pip';

export type WindowCommandSource = 'chrome' | 'keymap' | 'mouse' | 'programmatic' | 'escape';

export type WindowCommand =
  | { type: 'create'; window: DesktopWindowState }
  | { type: 'close'; id: string; reason?: string; source?: WindowCommandSource }
  | { type: 'destroy'; id: string; reason?: string; source?: WindowCommandSource }
  | { type: 'hide'; id: string; source?: WindowCommandSource }
  | { type: 'show'; id: string; source?: WindowCommandSource }
  | { type: 'minimize'; id: string; source?: WindowCommandSource }
  | { type: 'maximize'; id: string; source?: WindowCommandSource }
  | { type: 'fullscreen'; id: string; source?: WindowCommandSource }
  | { type: 'restore'; id: string; source?: WindowCommandSource }
  | { type: 'focus'; id: string; source?: WindowCommandSource };

export type WindowChromeControl = 'close' | 'minimize' | 'maximize' | 'fullscreen' | 'restore';

/**
 * The pointer-owned part of integrated window chrome. Keeping this in the
 * managed window state makes hover rendering deterministic and lets every
 * host use the same Horizon event tags instead of inventing local styling.
 */
export type WindowChromeHoverTarget = 'titlebar' | WindowChromeControl | `resize:${FloatingWindowResizeEdge}`;

export interface WindowChromeConfig {
  showTitle?: boolean;
  showClose?: boolean;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showFullscreen?: boolean;
  closeReason?: string;
  /** Current pointer target, normally updated through WindowManager messages. */
  hoveredTarget?: WindowChromeHoverTarget | null;
  /** Optional shared reactive/static theme inputs for integrated chrome. */
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
  onCommand?: (command: WindowCommand, window: DesktopWindowState) => unknown;
}

export interface DesktopWindowState<M = unknown> extends Omit<FloatingWindowConfig, 'content'> {
  content: VNode;
  role: WindowRole;
  mode: WindowMode;
  frame: FloatingWindowFrame;
  restoreFrame?: FloatingWindowFrame;
  workspaceId?: string;
  zIndex: number;
  focused: boolean;
  modal?: boolean;
  alwaysOnTop?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  fullscreenable?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  chrome?: WindowChromeConfig;
  payload?: M;
  lastCloseReason?: string;
}

export interface WindowLifecycleResult<M = unknown> {
  windows: DesktopWindowState<M>[];
  accepted: boolean;
  reason?: string;
  focusedWindowId?: string;
}

export interface WindowLifecycleOptions {
  bounds?: { cols: number; rows: number };
  closePolicy?: 'remove' | 'mark-closed';
}

function frameFromWindow(window: Pick<FloatingWindowConfig, 'x' | 'y' | 'width' | 'height'>): FloatingWindowFrame {
  return {
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
  };
}

const WINDOW_MODES = new Set<WindowMode>(['normal', 'minimized', 'maximized', 'fullscreen', 'hidden', 'closed']);
const WINDOW_ROLES = new Set<WindowRole>(['window', 'modal', 'palette', 'tooltip', 'pip']);

function normalizeFrame(
  frame: FloatingWindowFrame,
  config?: Pick<FloatingWindowConfig, 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'>,
): FloatingWindowFrame {
  const maxWidth = positiveInteger(config?.maxWidth, MAX_CELL_SIZE);
  const maxHeight = positiveInteger(config?.maxHeight, MAX_CELL_SIZE);
  const minWidth = positiveInteger(config?.minWidth, 1, maxWidth);
  const minHeight = positiveInteger(config?.minHeight, 1, maxHeight);
  return {
    x: finiteCell(frame.x),
    y: finiteCell(frame.y),
    width: positiveInteger(frame.width, minWidth, maxWidth),
    height: positiveInteger(frame.height, minHeight, maxHeight),
  };
}

function normalizeBounds(bounds: { cols: number; rows: number } | undefined, fallback: FloatingWindowFrame): { cols: number; rows: number } {
  return {
    cols: positiveInteger(bounds?.cols, fallback.width),
    rows: positiveInteger(bounds?.rows, fallback.height),
  };
}

function assignFrame<M>(window: DesktopWindowState<M>, frame: FloatingWindowFrame): DesktopWindowState<M> {
  return {
    ...window,
    frame,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

function nextZIndex<M>(windows: readonly DesktopWindowState<M>[]): number {
  return Math.min(windows.reduce((max, window) => Math.max(max, finiteCell(window.zIndex)), 0) + 1, MAX_CELL_SIZE);
}

function focusFallback<M>(windows: DesktopWindowState<M>[], preferredId?: string): DesktopWindowState<M>[] {
  const candidates = windows.filter((window) => window.mode !== 'closed' && window.mode !== 'hidden' && window.mode !== 'minimized');
  const target = preferredId ? candidates.find((window) => window.id === preferredId) : [...candidates].sort((a, b) => b.zIndex - a.zIndex)[0];
  if (!target) {
    return windows.map((window) => ({ ...window, focused: false }));
  }
  return windows.map((window) => ({ ...window, focused: window.id === target.id }));
}

export function createDesktopWindow<M = unknown>(config: FloatingWindowConfig & Partial<DesktopWindowState<M>>): DesktopWindowState<M> {
  if (!isSafeRecordKey(config.id)) {
    throw new TypeError(`Invalid window id: ${config.id || '<empty>'}`);
  }
  const frame = normalizeFrame(config.frame ?? frameFromWindow(config), config);
  const requestedMode = config.mode ?? (config.minimized ? 'minimized' : config.maximized ? 'maximized' : 'normal');
  const mode = WINDOW_MODES.has(requestedMode) ? requestedMode : 'normal';
  const requestedRole = config.role ?? 'window';
  const role = WINDOW_ROLES.has(requestedRole) ? requestedRole : 'window';
  const maxWidth = positiveInteger(config.maxWidth, MAX_CELL_SIZE);
  const maxHeight = positiveInteger(config.maxHeight, MAX_CELL_SIZE);
  const minWidth = positiveInteger(config.minWidth, 1, maxWidth);
  const minHeight = positiveInteger(config.minHeight, 1, maxHeight);
  const restoreFrameInput = config.restoreFrame ?? config.restoreBounds;
  const restoreFrame = restoreFrameInput ? normalizeFrame(restoreFrameInput, config) : undefined;
  return {
    ...config,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    frame,
    ...(config.minWidth === undefined ? {} : { minWidth }),
    ...(config.minHeight === undefined ? {} : { minHeight }),
    ...(config.maxWidth === undefined ? {} : { maxWidth }),
    ...(config.maxHeight === undefined ? {} : { maxHeight }),
    restoreFrame,
    role,
    mode,
    zIndex: finiteCell(config.zIndex, 1),
    focused: config.focused ?? false,
    closable: config.closable ?? true,
    minimizable: config.minimizable ?? true,
    maximizable: config.maximizable ?? true,
    fullscreenable: config.fullscreenable ?? true,
    resizable: config.resizable ?? true,
    draggable: config.draggable ?? true,
    modal: config.modal ?? role === 'modal',
    alwaysOnTop: config.alwaysOnTop ?? false,
    minimized: mode === 'minimized',
    maximized: mode === 'maximized',
    fullscreen: mode === 'fullscreen',
    hidden: mode === 'hidden',
    closed: mode === 'closed',
    restoreBounds: restoreFrame ? { ...restoreFrame } : undefined,
    chrome: config.chrome ? { ...config.chrome } : undefined,
  };
}

export function normalizeManagedWindow<M = unknown>(window: FloatingWindowConfig & Partial<DesktopWindowState<M>>): DesktopWindowState<M> {
  return createDesktopWindow(window);
}

export function closeWindow<M = unknown>(
  windows: readonly DesktopWindowState<M>[],
  id: string,
  options: WindowLifecycleOptions = {},
): WindowLifecycleResult<M> {
  return applyWindowCommand({ type: 'close', id }, windows, options);
}

export function hideWindow<M = unknown>(windows: readonly DesktopWindowState<M>[], id: string): WindowLifecycleResult<M> {
  return applyWindowCommand({ type: 'hide', id }, windows);
}

export function showWindow<M = unknown>(windows: readonly DesktopWindowState<M>[], id: string): WindowLifecycleResult<M> {
  return applyWindowCommand({ type: 'show', id }, windows);
}

export function fullscreenWindow<M = unknown>(
  windows: readonly DesktopWindowState<M>[],
  id: string,
  bounds: { cols: number; rows: number },
): WindowLifecycleResult<M> {
  return applyWindowCommand({ type: 'fullscreen', id }, windows, { bounds });
}

export function restoreWindow<M = unknown>(windows: readonly DesktopWindowState<M>[], id: string): WindowLifecycleResult<M> {
  return applyWindowCommand({ type: 'restore', id }, windows);
}

export function windowLifecycleUpdate<M = unknown>(
  command: WindowCommand,
  windows: readonly DesktopWindowState<M>[],
  options: WindowLifecycleOptions = {},
): WindowLifecycleResult<M> {
  return applyWindowCommand(command, windows, options);
}

export function applyWindowCommand<M = unknown>(
  command: WindowCommand,
  inputWindows: readonly DesktopWindowState<M>[],
  options: WindowLifecycleOptions = {},
): WindowLifecycleResult<M> {
  if (inputWindows.length > MAX_SPLIT_PANES) {
    throw new RangeError(`Window lifecycle supports at most ${MAX_SPLIT_PANES} windows`);
  }
  const windows = inputWindows.map((window) => createDesktopWindow(window));
  const ids = new Set<string>();
  for (const window of windows) {
    if (ids.has(window.id)) throw new RangeError(`Duplicate window id: ${window.id}`);
    ids.add(window.id);
  }
  const target = 'id' in command ? windows.find((window) => window.id === command.id) : undefined;

  if (command.type !== 'create' && !target) {
    return { windows, accepted: false, reason: 'window-not-found' };
  }

  switch (command.type) {
    case 'create': {
      if (windows.length >= MAX_SPLIT_PANES) {
        return { windows, accepted: false, reason: 'window-limit-reached' };
      }
      if (ids.has(command.window.id)) {
        return { windows, accepted: false, reason: 'window-id-exists' };
      }
      const next = createDesktopWindow<M>({ ...command.window, zIndex: command.window.zIndex ?? nextZIndex(windows) } as FloatingWindowConfig &
        Partial<DesktopWindowState<M>>);
      return {
        windows: focusFallback([...windows, next], next.focused ? next.id : undefined),
        accepted: true,
        focusedWindowId: next.focused ? next.id : undefined,
      };
    }
    case 'close': {
      if (target!.closable === false) {
        return { windows, accepted: false, reason: 'window-not-closable' };
      }
      const closePolicy = options.closePolicy ?? 'remove';
      const next =
        closePolicy === 'mark-closed'
          ? windows.map((window) =>
              window.id === command.id
                ? {
                    ...window,
                    mode: 'closed' as const,
                    focused: false,
                    minimized: false,
                    maximized: false,
                    fullscreen: false,
                    hidden: false,
                    closed: true,
                    lastCloseReason: command.reason,
                  }
                : window,
            )
          : windows.filter((window) => window.id !== command.id);
      const focused = focusFallback(next);
      return { windows: focused, accepted: true, focusedWindowId: focused.find((window) => window.focused)?.id };
    }
    case 'destroy': {
      const next = focusFallback(windows.filter((window) => window.id !== command.id));
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'hide': {
      const next = focusFallback(
        windows.map((window) => (window.id === command.id ? { ...window, mode: 'hidden' as const, hidden: true, focused: false } : window)),
      );
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'show': {
      target!.mode = 'normal';
      target!.minimized = false;
      target!.maximized = false;
      target!.fullscreen = false;
      target!.hidden = false;
      target!.closed = false;
      target!.zIndex = nextZIndex(windows);
      const next = focusFallback(windows, command.id);
      return { windows: next, accepted: true, focusedWindowId: command.id };
    }
    case 'minimize': {
      if (target!.minimizable === false) {
        return { windows, accepted: false, reason: 'window-not-minimizable' };
      }
      target!.mode = 'minimized';
      target!.minimized = true;
      target!.maximized = false;
      target!.fullscreen = false;
      target!.focused = false;
      const next = focusFallback(windows);
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'maximize': {
      if (target!.maximizable === false) {
        return { windows, accepted: false, reason: 'window-not-maximizable' };
      }
      if (target!.mode !== 'maximized') {
        target!.restoreFrame = { ...target!.frame };
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const nextTarget = assignFrame(target!, { x: 0, y: 0, width: bounds.cols, height: bounds.rows });
      nextTarget.mode = 'maximized';
      nextTarget.maximized = true;
      nextTarget.minimized = false;
      nextTarget.fullscreen = false;
      nextTarget.hidden = false;
      nextTarget.closed = false;
      nextTarget.zIndex = nextZIndex(windows);
      const next = focusFallback(
        windows.map((window) => (window.id === command.id ? nextTarget : window)),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: command.id };
    }
    case 'fullscreen': {
      if (target!.fullscreenable === false) {
        return { windows, accepted: false, reason: 'window-not-fullscreenable' };
      }
      if (target!.mode !== 'fullscreen') {
        target!.restoreFrame = { ...target!.frame };
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const nextTarget = assignFrame(target!, { x: 0, y: 0, width: bounds.cols, height: bounds.rows });
      nextTarget.mode = 'fullscreen';
      nextTarget.maximized = false;
      nextTarget.minimized = false;
      nextTarget.fullscreen = true;
      nextTarget.hidden = false;
      nextTarget.closed = false;
      nextTarget.zIndex = nextZIndex(windows);
      const next = focusFallback(
        windows.map((window) => (window.id === command.id ? nextTarget : window)),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: command.id };
    }
    case 'restore': {
      const restoreFrame = normalizeFrame(target!.restoreFrame ?? target!.frame, target!);
      const nextTarget = assignFrame(target!, restoreFrame);
      nextTarget.mode = 'normal';
      nextTarget.minimized = false;
      nextTarget.maximized = false;
      nextTarget.fullscreen = false;
      nextTarget.hidden = false;
      nextTarget.closed = false;
      const next = focusFallback(
        windows.map((window) => (window.id === command.id ? nextTarget : window)),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: command.id };
    }
    case 'focus': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      target!.mode = target!.mode === 'hidden' ? 'normal' : target!.mode;
      target!.minimized = false;
      target!.hidden = false;
      target!.zIndex = nextZIndex(windows);
      const next = focusFallback(windows, command.id);
      return { windows: next, accepted: true, focusedWindowId: command.id };
    }
  }
}
