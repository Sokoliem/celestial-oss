import type { ThemeInput } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import type { FloatingWindowConfig } from './compat.js';
import {
  clampFloatingWindowFrame,
  type FloatingViewportBounds,
  type FloatingWindowFrame,
  type FloatingWindowResizeEdge,
  getFloatingFullscreenArea,
  getFloatingWorkArea,
} from './floating-window-drag.js';
import { finiteCell, isSafeRecordKey, MAX_CELL_SIZE, MAX_SPLIT_PANES, nonNegativeInteger, positiveInteger } from './internal.js';

export type WindowMode = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'hidden' | 'closed';

/** Visible mode resumed after a suspended (minimized/hidden) window is activated. */
export type WindowRestoreMode = 'normal' | 'maximized' | 'fullscreen';

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
  restoreMode?: WindowRestoreMode;
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
  bounds?: FloatingViewportBounds;
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
const WINDOW_RESTORE_MODES = new Set<WindowRestoreMode>(['normal', 'maximized', 'fullscreen']);

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

function normalizeBounds(bounds: FloatingViewportBounds | undefined, fallback: FloatingWindowFrame): FloatingViewportBounds {
  const cols = positiveInteger(bounds?.cols, fallback.width);
  const rows = positiveInteger(bounds?.rows, fallback.height);
  const leftInset = nonNegativeInteger(bounds?.leftInset, 0, Math.max(0, cols - 1));
  const topInset = nonNegativeInteger(bounds?.topInset, 0, Math.max(0, rows - 1));
  return {
    cols,
    rows,
    leftInset,
    rightInset: nonNegativeInteger(bounds?.rightInset, 0, Math.max(0, cols - leftInset - 1)),
    topInset,
    bottomInset: nonNegativeInteger(bounds?.bottomInset, 0, Math.max(0, rows - topInset - 1)),
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

function assignRestoreFrame<M>(window: DesktopWindowState<M>, frame: FloatingWindowFrame | undefined): DesktopWindowState<M> {
  return {
    ...window,
    restoreFrame: frame ? { ...frame } : undefined,
    restoreBounds: frame ? { ...frame } : undefined,
  };
}

function nextZIndex<M>(windows: readonly DesktopWindowState<M>[]): number {
  return Math.min(windows.reduce((max, window) => Math.max(max, finiteCell(window.zIndex)), 0) + 1, MAX_CELL_SIZE);
}

function windowLayerRank(window: DesktopWindowState<unknown>): number {
  if (window.modal || window.role === 'modal') return 2;
  return window.alwaysOnTop ? 1 : 0;
}

/**
 * Rebase lifecycle z-order into explicit normal, always-on-top, and modal
 * bands. Standalone lifecycle helpers do not pass through WindowManager's
 * normalizer, so they must preserve the same visual-modal invariant directly.
 */
function normalizeWindowZOrder<M>(windows: readonly DesktopWindowState<M>[]): DesktopWindowState<M>[] {
  const ranked = windows
    .map((window, index) => ({ window, index }))
    .sort(
      (a, b) =>
        windowLayerRank(a.window) - windowLayerRank(b.window) ||
        finiteCell(a.window.zIndex) - finiteCell(b.window.zIndex) ||
        a.index - b.index,
    );
  const zById = new Map(ranked.map(({ window }, index) => [window.id, index + 1]));
  return windows.map((window) => ({ ...window, zIndex: zById.get(window.id)! }));
}

function focusFallback<M>(windows: DesktopWindowState<M>[], preferredId?: string): DesktopWindowState<M>[] {
  const visible = windows.filter((window) => window.mode !== 'closed' && window.mode !== 'hidden' && window.mode !== 'minimized');
  const modal = [...visible].filter((window) => window.modal || window.role === 'modal').sort((a, b) => b.zIndex - a.zIndex)[0];
  const candidates = visible.filter((window) => window.focusable !== false);
  const target = modal
    ? modal.focusable === false
      ? undefined
      : modal
    : preferredId
      ? candidates.find((window) => window.id === preferredId)
      : [...candidates].sort((a, b) => b.zIndex - a.zIndex)[0];
  if (!target) {
    return windows.map((window) => ({ ...window, focused: false }));
  }
  return windows.map((window) => ({ ...window, focused: window.id === target.id }));
}

function visibleMode(window: DesktopWindowState<unknown>): WindowRestoreMode {
  if (window.mode === 'maximized' || window.mode === 'fullscreen') return window.mode;
  return 'normal';
}

function modeBeforeSuspension(window: DesktopWindowState<unknown>): WindowRestoreMode {
  if (window.mode === 'minimized' || window.mode === 'hidden' || window.mode === 'closed') {
    return WINDOW_RESTORE_MODES.has(window.restoreMode ?? 'normal') ? (window.restoreMode ?? 'normal') : 'normal';
  }
  return visibleMode(window);
}

function setMode<M>(window: DesktopWindowState<M>, mode: WindowMode): DesktopWindowState<M> {
  return {
    ...window,
    mode,
    minimized: mode === 'minimized',
    maximized: mode === 'maximized',
    fullscreen: mode === 'fullscreen',
    hidden: mode === 'hidden',
    closed: mode === 'closed',
  };
}

function frameForVisibleMode<M>(window: DesktopWindowState<M>, mode: WindowRestoreMode, bounds: FloatingViewportBounds): FloatingWindowFrame {
  if (mode === 'maximized') return getFloatingWorkArea(bounds);
  if (mode === 'fullscreen') return getFloatingFullscreenArea(bounds);
  return clampFloatingWindowFrame(
    bounds,
    {
      width: window.restoreFrame?.width ?? window.frame.width,
      height: window.restoreFrame?.height ?? window.frame.height,
      minWidth: window.minWidth ?? 1,
      minHeight: window.minHeight ?? 1,
      maxWidth: window.maxWidth,
      maxHeight: window.maxHeight,
    },
    window.restoreFrame ?? window.frame,
  );
}

function restoreSuspendedWindow<M>(window: DesktopWindowState<M>, bounds: FloatingViewportBounds): DesktopWindowState<M> {
  const restoreMode = WINDOW_RESTORE_MODES.has(window.restoreMode ?? 'normal') ? (window.restoreMode ?? 'normal') : 'normal';
  const restored = assignFrame(window, frameForVisibleMode(window, restoreMode, bounds));
  return setMode({ ...restored, restoreMode }, restoreMode);
}

export function createDesktopWindow<M = unknown>(config: FloatingWindowConfig & Partial<DesktopWindowState<M>>): DesktopWindowState<M> {
  if (!isSafeRecordKey(config.id)) {
    throw new TypeError(`Invalid window id: ${config.id || '<empty>'}`);
  }
  const frame = normalizeFrame(config.frame ?? frameFromWindow(config), config);
  const requestedMode =
    config.mode ??
    (config.closed
      ? 'closed'
      : config.hidden
        ? 'hidden'
        : config.minimized
          ? 'minimized'
          : config.fullscreen
            ? 'fullscreen'
            : config.maximized
              ? 'maximized'
              : 'normal');
  const mode = WINDOW_MODES.has(requestedMode) ? requestedMode : 'normal';
  const requestedRole = config.role ?? 'window';
  const role = WINDOW_ROLES.has(requestedRole) ? requestedRole : 'window';
  const legacyRestoreMode = mode === 'fullscreen' || config.fullscreen ? 'fullscreen' : mode === 'maximized' || config.maximized ? 'maximized' : 'normal';
  const requestedRestoreMode = config.restoreMode ?? legacyRestoreMode;
  const restoreMode = WINDOW_RESTORE_MODES.has(requestedRestoreMode) ? requestedRestoreMode : 'normal';
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
    restoreMode,
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

export function fullscreenWindow<M = unknown>(windows: readonly DesktopWindowState<M>[], id: string, bounds: FloatingViewportBounds): WindowLifecycleResult<M> {
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
      const focused = focusFallback(normalizeWindowZOrder([...windows, next]), next.focused ? next.id : undefined);
      return {
        windows: focused,
        accepted: true,
        focusedWindowId: focused.find((window) => window.focused)?.id,
      };
    }
    case 'close': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      if (target!.closable === false) {
        return { windows, accepted: false, reason: 'window-not-closable' };
      }
      const closePolicy = options.closePolicy ?? 'remove';
      const next =
        closePolicy === 'mark-closed'
          ? windows.map((window) =>
              window.id === command.id
                ? setMode(
                    {
                      ...assignRestoreFrame(window, window.mode === 'normal' ? window.frame : window.restoreFrame),
                      restoreMode: modeBeforeSuspension(window),
                      focused: false,
                      lastCloseReason: command.reason,
                    },
                    'closed',
                  )
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
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      const next = focusFallback(
        windows.map((window) =>
          window.id === command.id
            ? setMode(
                {
                  ...assignRestoreFrame(window, window.mode === 'normal' ? window.frame : window.restoreFrame),
                  restoreMode: modeBeforeSuspension(window),
                  focused: false,
                },
                'hidden',
              )
            : window,
        ),
      );
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'show': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const restored = restoreSuspendedWindow(target!, bounds);
      restored.zIndex = nextZIndex(windows);
      const replaced = windows.map((window) => (window.id === command.id ? restored : window));
      const next = focusFallback(normalizeWindowZOrder(replaced), restored.focusable === false ? undefined : command.id);
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'minimize': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      if (target!.minimizable === false) {
        return { windows, accepted: false, reason: 'window-not-minimizable' };
      }
      target!.restoreMode = modeBeforeSuspension(target!);
      if (target!.mode === 'normal') Object.assign(target!, assignRestoreFrame(target!, target!.frame));
      Object.assign(target!, setMode({ ...target!, focused: false }, 'minimized'));
      const next = focusFallback(windows);
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'maximize': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      if (target!.maximizable === false) {
        return { windows, accepted: false, reason: 'window-not-maximizable' };
      }
      if (target!.mode !== 'maximized') {
        if (target!.mode === 'normal') Object.assign(target!, assignRestoreFrame(target!, target!.frame));
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const nextTarget = setMode(assignFrame(target!, getFloatingWorkArea(bounds)), 'maximized');
      nextTarget.restoreMode = 'maximized';
      nextTarget.zIndex = nextZIndex(windows);
      const next = focusFallback(
        normalizeWindowZOrder(windows.map((window) => (window.id === command.id ? nextTarget : window))),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'fullscreen': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      if (target!.fullscreenable === false) {
        return { windows, accepted: false, reason: 'window-not-fullscreenable' };
      }
      if (target!.mode !== 'fullscreen') {
        if (target!.mode === 'normal') Object.assign(target!, assignRestoreFrame(target!, target!.frame));
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const nextTarget = setMode(assignFrame(target!, getFloatingFullscreenArea(bounds)), 'fullscreen');
      nextTarget.restoreMode = 'fullscreen';
      nextTarget.zIndex = nextZIndex(windows);
      const next = focusFallback(
        normalizeWindowZOrder(windows.map((window) => (window.id === command.id ? nextTarget : window))),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'restore': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const nextTarget =
        target!.mode === 'minimized' || target!.mode === 'hidden'
          ? restoreSuspendedWindow(target!, bounds)
          : setMode(assignFrame(target!, frameForVisibleMode(target!, 'normal', bounds)), 'normal');
      nextTarget.zIndex = nextZIndex(windows);
      const next = focusFallback(
        normalizeWindowZOrder(windows.map((window) => (window.id === command.id ? nextTarget : window))),
        command.id,
      );
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
    case 'focus': {
      if (target!.mode === 'closed') {
        return { windows, accepted: false, reason: 'window-closed' };
      }
      if (target!.focusable === false) {
        return { windows, accepted: false, reason: 'window-not-focusable' };
      }
      const bounds = normalizeBounds(options.bounds, target!.frame);
      const focusedTarget = target!.mode === 'minimized' || target!.mode === 'hidden' ? restoreSuspendedWindow(target!, bounds) : target!;
      focusedTarget.zIndex = nextZIndex(windows);
      const replaced = windows.map((window) => (window.id === command.id ? focusedTarget : window));
      const next = focusFallback(normalizeWindowZOrder(replaced), command.id);
      return { windows: next, accepted: true, focusedWindowId: next.find((window) => window.focused)?.id };
    }
  }
}
