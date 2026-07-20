import type { FloatingWindowConfig } from './compat.js';
import type { WindowBounds } from './primitives/geometry.js';
import { computeSnappedPosition, type SnapConfig, type SnapGuide } from './snap.js';
import { type StateUpdateResult, stateUpdateResult } from './state/update.js';
import { hitTestFloatingWindowResizeEdge } from './floating-window-drag.js';
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
  const parts = event.handlerTag.split(':');
  if (parts[0] !== 'window' || !parts[1] || !parts[2] || !parts[3]) return null;
  const [, id, phase, ...targetParts] = parts;
  const target = targetParts.join(':') as WindowChromeHoverTarget;
  if (phase === 'hover') return { type: 'hover-window-chrome', id, target };
  if (phase === 'leave') return { type: 'leave-window-chrome', id, target };
  return null;
}

/**
 * Update only resize-edge hover state from a raw pointer position. Title bars
 * and controls use semantic element events; borders need coordinate hit tests.
 */
export function windowManagerHoverAt(manager: WindowManager, x: number, y: number): WindowManager {
  const visible = [...manager.windows]
    .filter((window) => !window.minimized && !window.hidden && !window.closed)
    .sort((a, b) => b.zIndex - a.zIndex);
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

function normalizeWindows(windows: FloatingWindowConfig[]): ManagedWindow[] {
  return windows.map((window, index) => ({
    ...window,
    zIndex: window.zIndex ?? index + 1,
    mode: window.mode ?? (window.minimized ? 'minimized' : window.maximized ? 'maximized' : 'normal'),
    role: window.role ?? 'window',
    hidden: window.hidden ?? false,
    closed: window.closed ?? false,
    fullscreen: window.fullscreen ?? false,
    modal: window.modal ?? false,
    alwaysOnTop: window.alwaysOnTop ?? false,
    closable: window.closable ?? true,
    minimizable: window.minimizable ?? true,
    maximizable: window.maximizable ?? true,
    fullscreenable: window.fullscreenable ?? true,
    minimized: window.minimized ?? false,
    maximized: window.maximized ?? false,
    focused: window.focused ?? false,
    restoreBounds: window.restoreBounds,
    frame: window.frame ? { ...window.frame } : { x: window.x, y: window.y, width: window.width, height: window.height },
    restoreFrame: window.restoreFrame ? { ...window.restoreFrame } : window.restoreBounds ? { ...window.restoreBounds } : undefined,
  }));
}

function snapshotBounds(window: ManagedWindow): WindowBounds {
  return {
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
  };
}

function restoreWindowBounds(window: ManagedWindow): void {
  if (!window.restoreBounds) return;
  window.x = window.restoreBounds.x;
  window.y = window.restoreBounds.y;
  window.width = window.restoreBounds.width;
  window.height = window.restoreBounds.height;
  window.frame = snapshotBounds(window);
}

export function createWindowManager(windows: FloatingWindowConfig[] = [], bounds: { cols: number; rows: number } = { cols: 80, rows: 24 }): WindowManager {
  return { windows: normalizeWindows(windows), bounds, snapGuides: [] };
}

function nextFrontZIndex(windows: ManagedWindow[]): number {
  return windows.reduce((max, window) => Math.max(max, window.zIndex), 0) + 1;
}

export function windowManagerUpdate(msg: WindowManagerMsg, manager: WindowManager): WindowManager {
  const windows = manager.windows.map((window) => ({ ...window }));
  if (msg.type === 'create-window') {
    const next = createDesktopWindow({ ...msg.window, zIndex: msg.window.zIndex ?? nextFrontZIndex(windows) });
    return {
      ...manager,
      snapGuides: [],
      windows: normalizeWindows([...windows, next]),
    };
  }

  if (msg.type === 'window-command') {
    const result = applyWindowCommand(
      msg.command,
      windows.map((window) => createDesktopWindow(window)),
      { bounds: manager.bounds, closePolicy: msg.policy },
    );
    return {
      ...manager,
      snapGuides: [],
      windows: normalizeWindows(result.windows),
    };
  }

  const target = windows.find((window) => window.id === msg.id);
  if (!target) return manager;

  switch (msg.type) {
    case 'focus-window': {
      const zIndex = nextFrontZIndex(windows);
      return {
        ...manager,
        snapGuides: [],
        windows: windows.map((window) => ({ ...window, focused: window.id === msg.id, zIndex: window.id === msg.id ? zIndex : window.zIndex })),
      };
    }
    case 'move-window':
      target.x = msg.x;
      target.y = msg.y;
      target.frame = { x: msg.x, y: msg.y, width: target.width, height: target.height };
      return { ...manager, windows, snapGuides: [] };
    case 'snap-move-window': {
      const snapped = computeSnappedPosition(
        { x: msg.x, y: msg.y },
        snapshotBounds(target),
        windows.filter((window) => window.id !== msg.id),
        manager.bounds,
        msg.config,
      );
      target.x = snapped.x;
      target.y = snapped.y;
      target.frame = { x: snapped.x, y: snapped.y, width: target.width, height: target.height };
      return { ...manager, windows, snapGuides: snapped.guides };
    }
    case 'resize-window':
      target.width = msg.width;
      target.height = msg.height;
      target.frame = { x: target.x, y: target.y, width: msg.width, height: msg.height };
      return { ...manager, windows, snapGuides: [] };
    case 'set-window-frame':
      target.x = msg.frame.x;
      target.y = msg.frame.y;
      target.width = msg.frame.width;
      target.height = msg.frame.height;
      target.frame = { ...msg.frame };
      return { ...manager, windows, snapGuides: [] };
    case 'hover-window-chrome':
      target.chrome = { ...target.chrome, hoveredTarget: msg.target };
      return { ...manager, windows };
    case 'leave-window-chrome':
      if (!msg.target || target.chrome?.hoveredTarget === msg.target) {
        target.chrome = { ...target.chrome, hoveredTarget: null };
      }
      return { ...manager, windows };
    case 'close-window': {
      if (target.closable === false) {
        return manager;
      }
      if (msg.policy === 'mark-closed') {
        target.mode = 'closed';
        target.closed = true;
        target.focused = false;
        target.lastCloseReason = msg.reason;
        return { ...manager, windows: normalizeWindows(windows), snapGuides: [] };
      }
      return { ...manager, windows: normalizeWindows(windows.filter((window) => window.id !== msg.id)), snapGuides: [] };
    }
    case 'destroy-window':
      return { ...manager, windows: normalizeWindows(windows.filter((window) => window.id !== msg.id)), snapGuides: [] };
    case 'hide-window':
      target.mode = 'hidden';
      target.hidden = true;
      target.focused = false;
      return { ...manager, windows: normalizeWindows(windows), snapGuides: [] };
    case 'show-window':
      target.mode = 'normal';
      target.hidden = false;
      target.closed = false;
      target.focused = true;
      target.zIndex = nextFrontZIndex(windows);
      return { ...manager, windows: normalizeWindows(windows), snapGuides: [] };
    case 'minimize-window': {
      if (target.minimizable === false) {
        return manager;
      }
      target.mode = 'minimized';
      target.minimized = true;
      target.focused = false;
      // Promote the new frontmost visible window so the UI is never
      // left with no focused window after a minimize.
      const newFront = [...windows].filter((w) => !w.minimized).sort((a, b) => b.zIndex - a.zIndex)[0];
      if (newFront) {
        newFront.focused = true;
      }
      return { ...manager, windows, snapGuides: [] };
    }
    case 'maximize-window':
      if (target.maximizable === false) {
        return manager;
      }
      if (!target.maximized) {
        target.restoreBounds = snapshotBounds(target);
      }
      target.mode = 'maximized';
      target.maximized = true;
      target.minimized = false;
      target.x = 0;
      target.y = 0;
      target.width = manager.bounds.cols;
      target.height = manager.bounds.rows;
      target.frame = snapshotBounds(target);
      target.zIndex = nextFrontZIndex(windows);
      return { ...manager, windows, snapGuides: [] };
    case 'restore-window':
      restoreWindowBounds(target);
      target.minimized = false;
      target.maximized = false;
      target.fullscreen = false;
      target.mode = 'normal';
      return { ...manager, windows, snapGuides: [] };
    case 'fullscreen-window':
      if (target.fullscreenable === false) {
        return manager;
      }
      if (!target.fullscreen) {
        target.restoreBounds = snapshotBounds(target);
      }
      target.mode = 'fullscreen';
      target.fullscreen = true;
      target.maximized = false;
      target.minimized = false;
      target.x = 0;
      target.y = 0;
      target.width = manager.bounds.cols;
      target.height = manager.bounds.rows;
      target.frame = snapshotBounds(target);
      target.zIndex = nextFrontZIndex(windows);
      return { ...manager, windows, snapGuides: [] };
  }
}

export function windowManagerUpdateResult(msg: WindowManagerMsg, manager: WindowManager): StateUpdateResult<WindowManager> {
  return stateUpdateResult(windowManagerUpdate(msg, manager));
}

export function getFrontmostWindow(manager: WindowManager): ManagedWindow | undefined {
  return [...manager.windows].filter((window) => !window.minimized && !window.hidden && !window.closed).sort((a, b) => b.zIndex - a.zIndex)[0];
}
