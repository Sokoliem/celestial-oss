import type { FloatingWindowConfig } from './compat.js';
import { hitTestFloatingWindowResizeEdge } from './floating-window-drag.js';
import { finiteCell, isSafeRecordKey, MAX_SPLIT_PANES, positiveInteger } from './internal.js';
import type { WindowBounds } from './primitives/geometry.js';
import { computeSnappedPosition, type SnapConfig, type SnapGuide } from './snap.js';
import { type StateUpdateResult, stateUpdateResult } from './state/update.js';
import {
  applyWindowCommand,
  createDesktopWindow,
  type WindowChromeHoverTarget,
  type WindowCommand,
  type WindowMode,
  type WindowRole,
} from './window-lifecycle.js';

export interface ManagedWindow extends FloatingWindowConfig {
  mode?: WindowMode;
  role?: WindowRole;
  hidden?: boolean;
  closed?: boolean;
  fullscreen?: boolean;
  modal?: boolean;
  alwaysOnTop?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  fullscreenable?: boolean;
  minimized?: boolean;
  maximized?: boolean;
  focused?: boolean;
  zIndex: number;
  restoreBounds?: WindowBounds;
  workspaceId?: string;
  lastCloseReason?: string;
  frame?: WindowBounds;
  restoreFrame?: WindowBounds;
}

export interface WindowManager {
  windows: ManagedWindow[];
  bounds: { cols: number; rows: number };
  snapGuides: SnapGuide[];
}

export type WindowManagerMsg =
  | { type: 'create-window'; window: FloatingWindowConfig & Partial<ManagedWindow> }
  | { type: 'focus-window'; id: string }
  | { type: 'move-window'; id: string; x: number; y: number }
  | { type: 'snap-move-window'; id: string; x: number; y: number; config?: SnapConfig }
  | { type: 'resize-window'; id: string; width: number; height: number }
  | { type: 'set-window-frame'; id: string; frame: WindowBounds }
  | { type: 'close-window'; id: string; reason?: string; policy?: 'remove' | 'mark-closed' }
  | { type: 'destroy-window'; id: string; reason?: string }
  | { type: 'hide-window'; id: string }
  | { type: 'show-window'; id: string }
  | { type: 'minimize-window'; id: string }
  | { type: 'restore-window'; id: string }
  | { type: 'maximize-window'; id: string }
  | { type: 'fullscreen-window'; id: string }
  | { type: 'hover-window-chrome'; id: string; target: WindowChromeHoverTarget }
  | { type: 'leave-window-chrome'; id: string; target?: WindowChromeHoverTarget }
  | { type: 'window-command'; command: WindowCommand; policy?: 'remove' | 'mark-closed' };

/** Convert Horizon's stable chrome enter/leave tags into manager messages. */
export function windowManagerMsgFromChromeEvent(event: { handlerTag: string }): WindowManagerMsg | null {
  const match = /^window:(.+):(hover|leave):(.+)$/.exec(event.handlerTag);
  if (!match) return null;
  const [, id, phase, rawTarget] = match;
  if (!id || !rawTarget || !isSafeRecordKey(id)) return null;
  const validTarget =
    rawTarget === 'titlebar' ||
    rawTarget === 'close' ||
    rawTarget === 'minimize' ||
    rawTarget === 'maximize' ||
    rawTarget === 'fullscreen' ||
    rawTarget === 'restore' ||
    /^resize:(left|right|top|bottom|top-left|top-right|bottom-left|bottom-right)$/.test(rawTarget);
  if (!validTarget) return null;
  const target = rawTarget as WindowChromeHoverTarget;
  if (phase === 'hover') return { type: 'hover-window-chrome', id, target };
  if (phase === 'leave') return { type: 'leave-window-chrome', id, target };
  return null;
}

/**
 * Update only resize-edge hover state from a raw pointer position. Title bars
 * and controls use semantic element events; borders need coordinate hit tests.
 */
export function windowManagerHoverAt(manager: WindowManager, x: number, y: number): WindowManager {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return manager;
  const visible = [...manager.windows].filter((window) => !window.minimized && !window.hidden && !window.closed).sort((a, b) => b.zIndex - a.zIndex);
  const hit = visible.find((window) => x >= window.x && x < window.x + window.width && y >= window.y && y < window.y + window.height);
  const edge = hit?.resizable === false ? null : hit ? hitTestFloatingWindowResizeEdge(snapshotBounds(hit), x, y) : null;
  const nextTarget = edge ? (`resize:${edge}` as const) : null;
  let changed = false;
  const windows = manager.windows.map((window) => {
    const current = window.chrome?.hoveredTarget ?? null;
    const ownsNext = window.id === hit?.id && nextTarget !== null;
    if (ownsNext) {
      if (current === nextTarget) return window;
      changed = true;
      return { ...window, chrome: { ...window.chrome, hoveredTarget: nextTarget } };
    }
    if (current?.startsWith('resize:')) {
      changed = true;
      return { ...window, chrome: { ...window.chrome, hoveredTarget: null } };
    }
    return window;
  });
  return changed ? { ...manager, windows } : manager;
}

function normalizeWindows(windows: readonly FloatingWindowConfig[]): ManagedWindow[] {
  if (windows.length > MAX_SPLIT_PANES) {
    throw new RangeError(`Window managers support at most ${MAX_SPLIT_PANES} windows`);
  }
  const ids = new Set<string>();
  const normalized = windows.map((window, index) => {
    const next = createDesktopWindow({ ...window, zIndex: window.zIndex ?? index + 1 });
    if (ids.has(next.id)) throw new RangeError(`Duplicate window id: ${next.id}`);
    ids.add(next.id);
    return next as ManagedWindow;
  });
  const focused = normalized.filter((window) => window.focused && !window.minimized && !window.hidden && !window.closed).sort((a, b) => b.zIndex - a.zIndex)[0];
  return focused ? normalized.map((window) => ({ ...window, focused: window.id === focused.id })) : normalized;
}

function snapshotBounds(window: ManagedWindow): WindowBounds {
  return {
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
  };
}

export function createWindowManager(windows: FloatingWindowConfig[] = [], bounds: { cols: number; rows: number } = { cols: 80, rows: 24 }): WindowManager {
  return {
    windows: normalizeWindows(windows.slice()),
    bounds: { cols: positiveInteger(bounds.cols, 80), rows: positiveInteger(bounds.rows, 24) },
    snapGuides: [],
  };
}

function nextFrontZIndex(windows: ManagedWindow[]): number {
  return finiteCell(windows.reduce((max, window) => Math.max(max, finiteCell(window.zIndex)), 0) + 1, 1);
}

function lifecycleCommandFromManagerMsg(msg: WindowManagerMsg): { command: WindowCommand; closePolicy?: 'remove' | 'mark-closed' } | null {
  switch (msg.type) {
    case 'focus-window':
      return { command: { type: 'focus', id: msg.id } };
    case 'close-window':
      return { command: { type: 'close', id: msg.id, reason: msg.reason }, closePolicy: msg.policy };
    case 'destroy-window':
      return { command: { type: 'destroy', id: msg.id, reason: msg.reason } };
    case 'hide-window':
      return { command: { type: 'hide', id: msg.id } };
    case 'show-window':
      return { command: { type: 'show', id: msg.id } };
    case 'minimize-window':
      return { command: { type: 'minimize', id: msg.id } };
    case 'maximize-window':
      return { command: { type: 'maximize', id: msg.id } };
    case 'fullscreen-window':
      return { command: { type: 'fullscreen', id: msg.id } };
    case 'restore-window':
      return { command: { type: 'restore', id: msg.id } };
    default:
      return null;
  }
}

export function windowManagerUpdate(msg: WindowManagerMsg, manager: WindowManager): WindowManager {
  const bounds = { cols: positiveInteger(manager.bounds.cols, 80), rows: positiveInteger(manager.bounds.rows, 24) };
  const windows = normalizeWindows(manager.windows);
  if (msg.type === 'create-window') {
    const next = createDesktopWindow({ ...msg.window, zIndex: msg.window.zIndex ?? nextFrontZIndex(windows) });
    const result = applyWindowCommand(
      { type: 'create', window: next },
      windows.map((window) => createDesktopWindow(window)),
      { bounds },
    );
    return {
      ...manager,
      bounds,
      snapGuides: [],
      windows: normalizeWindows(result.windows),
    };
  }

  if (msg.type === 'window-command') {
    const result = applyWindowCommand(
      msg.command,
      windows.map((window) => createDesktopWindow(window)),
      { bounds, closePolicy: msg.policy },
    );
    return {
      ...manager,
      bounds,
      snapGuides: [],
      windows: normalizeWindows(result.windows),
    };
  }

  const lifecycle = lifecycleCommandFromManagerMsg(msg);
  if (lifecycle) {
    const result = applyWindowCommand(
      lifecycle.command,
      windows.map((window) => createDesktopWindow(window)),
      {
        bounds,
        closePolicy: lifecycle.closePolicy,
      },
    );
    return { ...manager, bounds, snapGuides: [], windows: normalizeWindows(result.windows) };
  }

  const target = windows.find((window) => window.id === msg.id);
  if (!target) return { ...manager, bounds, windows };

  switch (msg.type) {
    case 'move-window':
      target.x = finiteCell(msg.x, target.x);
      target.y = finiteCell(msg.y, target.y);
      target.frame = snapshotBounds(target);
      return { ...manager, bounds, windows, snapGuides: [] };
    case 'snap-move-window': {
      const snapped = computeSnappedPosition(
        { x: msg.x, y: msg.y },
        snapshotBounds(target),
        windows.filter((window) => window.id !== msg.id),
        bounds,
        msg.config,
      );
      target.x = snapped.x;
      target.y = snapped.y;
      target.frame = { x: snapped.x, y: snapped.y, width: target.width, height: target.height };
      return { ...manager, bounds, windows, snapGuides: snapped.guides };
    }
    case 'resize-window': {
      const next = createDesktopWindow({
        ...target,
        width: msg.width,
        height: msg.height,
        frame: { x: target.x, y: target.y, width: msg.width, height: msg.height },
      });
      return { ...manager, bounds, windows: windows.map((window) => (window.id === target.id ? next : window)), snapGuides: [] };
    }
    case 'set-window-frame': {
      const next = createDesktopWindow({ ...target, ...msg.frame, frame: msg.frame });
      return { ...manager, bounds, windows: windows.map((window) => (window.id === target.id ? next : window)), snapGuides: [] };
    }
    case 'hover-window-chrome':
      target.chrome = { ...target.chrome, hoveredTarget: msg.target };
      return { ...manager, bounds, windows };
    case 'leave-window-chrome':
      if (!msg.target || target.chrome?.hoveredTarget === msg.target) {
        target.chrome = { ...target.chrome, hoveredTarget: null };
      }
      return { ...manager, bounds, windows };
    default:
      return { ...manager, bounds, windows };
  }
}

export function windowManagerUpdateResult(msg: WindowManagerMsg, manager: WindowManager): StateUpdateResult<WindowManager> {
  return stateUpdateResult(windowManagerUpdate(msg, manager));
}

export function getFrontmostWindow(manager: WindowManager): ManagedWindow | undefined {
  return [...manager.windows]
    .filter(
      (window) => !window.minimized && !window.hidden && !window.closed && window.mode !== 'minimized' && window.mode !== 'hidden' && window.mode !== 'closed',
    )
    .sort((a, b) => finiteCell(b.zIndex) - finiteCell(a.zIndex))[0];
}
