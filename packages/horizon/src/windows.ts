import type { FloatingWindowConfig } from './compat.js';
import {
  clampFloatingWindowFrame,
  type FloatingViewportBounds,
  getFloatingFullscreenArea,
  getFloatingWorkArea,
  hitTestFloatingWindowResizeEdge,
} from './floating-window-drag.js';
import { finiteCell, isSafeRecordKey, MAX_SPLIT_PANES, nonNegativeInteger, positiveInteger } from './internal.js';
import type { WindowBounds } from './primitives/geometry.js';
import { computeSnappedPosition, type SnapConfig, type SnapGuide } from './snap.js';
import type { StateUpdateResult } from './state/update.js';
import {
  applyWindowCommand,
  createDesktopWindow,
  type WindowChromeHoverTarget,
  type WindowCommand,
  type WindowMode,
  type WindowRestoreMode,
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
  restoreMode?: WindowRestoreMode;
  workspaceId?: string;
  lastCloseReason?: string;
  frame?: WindowBounds;
  restoreFrame?: WindowBounds;
}

/** Outer terminal bounds plus the area reserved by application chrome. */
export interface WindowManagerBounds extends FloatingViewportBounds {}

export interface WindowManager {
  windows: ManagedWindow[];
  bounds: WindowManagerBounds;
  snapGuides: SnapGuide[];
  activeWorkspaceId?: string;
}

export interface WindowManagerOptions {
  activeWorkspaceId?: string;
}

export type WindowManagerMsg =
  | { type: 'create-window'; window: FloatingWindowConfig & Partial<ManagedWindow> }
  | { type: 'activate-window'; id: string }
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
  | { type: 'set-bounds'; bounds: WindowManagerBounds }
  | { type: 'set-active-workspace'; id?: string }
  | { type: 'set-window-workspace'; id: string; workspaceId?: string }
  | { type: 'hover-window-chrome'; id: string; target: WindowChromeHoverTarget }
  | { type: 'leave-window-chrome'; id: string; target?: WindowChromeHoverTarget }
  | { type: 'window-command'; command: WindowCommand; policy?: 'remove' | 'mark-closed' };

export type WindowManagerDiagnosticCode =
  | 'window-not-found'
  | 'window-id-exists'
  | 'window-limit-reached'
  | 'window-closed'
  | 'window-not-focusable'
  | 'window-not-draggable'
  | 'window-not-resizable'
  | 'window-not-normal'
  | 'window-not-closable'
  | 'window-not-minimizable'
  | 'window-not-maximizable'
  | 'window-not-fullscreenable'
  | 'modal-blocked'
  | 'invalid-window'
  | 'invalid-workspace';

export interface WindowManagerDiagnostic {
  readonly code: WindowManagerDiagnosticCode;
  readonly windowId?: string;
  readonly message: string;
}

export interface WindowManagerUpdateOutcome extends StateUpdateResult<WindowManager, never, WindowManagerDiagnostic> {
  readonly accepted: boolean;
  readonly changed: boolean;
}

function normalizeBounds(bounds: WindowManagerBounds | undefined, fallback: WindowManagerBounds = { cols: 80, rows: 24 }): WindowManagerBounds {
  const cols = positiveInteger(bounds?.cols, positiveInteger(fallback.cols, 80));
  const rows = positiveInteger(bounds?.rows, positiveInteger(fallback.rows, 24));
  const leftInset = nonNegativeInteger(bounds?.leftInset, 0, cols - 1);
  const rightInset = nonNegativeInteger(bounds?.rightInset, 0, cols - leftInset - 1);
  const topInset = nonNegativeInteger(bounds?.topInset, 0, rows - 1);
  const bottomInset = nonNegativeInteger(bounds?.bottomInset, 0, rows - topInset - 1);
  return { cols, rows, leftInset, rightInset, topInset, bottomInset };
}

function snapshotBounds(window: Pick<ManagedWindow, 'x' | 'y' | 'width' | 'height'>): WindowBounds {
  return { x: window.x, y: window.y, width: window.width, height: window.height };
}

function isSuspended(window: ManagedWindow): boolean {
  return (
    window.mode === 'minimized' ||
    window.mode === 'hidden' ||
    window.mode === 'closed' ||
    window.minimized === true ||
    window.hidden === true ||
    window.closed === true
  );
}

function belongsToActiveWorkspace(window: ManagedWindow, activeWorkspaceId: string | undefined): boolean {
  return window.workspaceId === undefined || activeWorkspaceId === undefined || window.workspaceId === activeWorkspaceId;
}

function layerRank(window: ManagedWindow): number {
  if (window.modal || window.role === 'modal') return 2;
  return window.alwaysOnTop ? 1 : 0;
}

function reflowWindow(window: ManagedWindow, bounds: WindowManagerBounds): ManagedWindow {
  const normalized = createDesktopWindow(window) as ManagedWindow;
  const defaults = {
    width: normalized.width,
    height: normalized.height,
    minWidth: normalized.minWidth ?? 1,
    minHeight: normalized.minHeight ?? 1,
    maxWidth: normalized.maxWidth,
    maxHeight: normalized.maxHeight,
  };
  const restoreFrame = normalized.restoreFrame ? clampFloatingWindowFrame(bounds, defaults, normalized.restoreFrame) : undefined;
  let frame: WindowBounds;
  if (normalized.mode === 'maximized') frame = getFloatingWorkArea(bounds);
  else if (normalized.mode === 'fullscreen') frame = getFloatingFullscreenArea(bounds);
  else frame = clampFloatingWindowFrame(bounds, defaults, normalized.frame ?? normalized);
  return createDesktopWindow({
    ...normalized,
    ...frame,
    frame,
    restoreFrame,
    restoreBounds: restoreFrame,
  }) as ManagedWindow;
}

function normalizeWindows(
  windows: readonly (FloatingWindowConfig & Partial<ManagedWindow>)[],
  bounds: WindowManagerBounds,
  activeWorkspaceId?: string,
): ManagedWindow[] {
  if (windows.length > MAX_SPLIT_PANES) throw new RangeError(`Window managers support at most ${MAX_SPLIT_PANES} windows`);
  const ids = new Set<string>();
  const normalized = windows.map((window, index) => {
    const next = reflowWindow(createDesktopWindow({ ...window, zIndex: window.zIndex ?? index + 1 }) as ManagedWindow, bounds);
    if (ids.has(next.id)) throw new RangeError(`Duplicate window id: ${next.id}`);
    ids.add(next.id);
    return { window: next, index };
  });

  normalized.sort((a, b) => layerRank(a.window) - layerRank(b.window) || finiteCell(a.window.zIndex) - finiteCell(b.window.zIndex) || a.index - b.index);
  const ordered = normalized.map(({ window }, index) => ({ ...window, zIndex: index + 1 }));
  const visible = ordered.filter((window) => !isSuspended(window) && belongsToActiveWorkspace(window, activeWorkspaceId));
  const visibleModal = [...visible].filter((window) => window.modal || window.role === 'modal').sort((a, b) => b.zIndex - a.zIndex)[0];
  const requestedFocus = [...visible].filter((window) => window.focused && window.focusable !== false).sort((a, b) => b.zIndex - a.zIndex)[0];
  const fallbackFocus = [...visible].filter((window) => window.focusable !== false).sort((a, b) => b.zIndex - a.zIndex)[0];
  const focusedId = visibleModal && visibleModal.focusable !== false ? visibleModal.id : (requestedFocus?.id ?? fallbackFocus?.id);
  return ordered.map((window) => ({ ...window, focused: focusedId !== undefined && window.id === focusedId }));
}

function managerWith(
  manager: WindowManager,
  windows: readonly (FloatingWindowConfig & Partial<ManagedWindow>)[],
  bounds = manager.bounds,
  activeWorkspaceId = manager.activeWorkspaceId,
  snapGuides: SnapGuide[] = [],
): WindowManager {
  const normalizedBounds = normalizeBounds(bounds, manager.bounds);
  return {
    ...manager,
    bounds: normalizedBounds,
    activeWorkspaceId,
    snapGuides,
    windows: normalizeWindows(windows, normalizedBounds, activeWorkspaceId),
  };
}

function diagnostic(manager: WindowManager, code: WindowManagerDiagnosticCode, windowId?: string): WindowManagerUpdateOutcome {
  const entry: WindowManagerDiagnostic = {
    code,
    ...(windowId === undefined ? {} : { windowId }),
    message: windowId ? `${code}: ${windowId}` : code,
  };
  return { model: manager, effects: [], diagnostics: [entry], accepted: false, changed: false };
}

function accepted(model: WindowManager, changed = true): WindowManagerUpdateOutcome {
  return { model, effects: [], diagnostics: [], accepted: true, changed };
}

function managerFingerprint(manager: WindowManager): string {
  return JSON.stringify({
    bounds: manager.bounds,
    activeWorkspaceId: manager.activeWorkspaceId,
    snapGuides: manager.snapGuides,
    windows: manager.windows.map((window) => ({
      id: window.id,
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
      zIndex: window.zIndex,
      mode: window.mode,
      restoreMode: window.restoreMode,
      restoreFrame: window.restoreFrame,
      workspaceId: window.workspaceId,
      focused: window.focused,
      minimized: window.minimized,
      maximized: window.maximized,
      fullscreen: window.fullscreen,
      hidden: window.hidden,
      closed: window.closed,
      lastCloseReason: window.lastCloseReason,
      hoveredTarget: window.chrome?.hoveredTarget ?? null,
    })),
  });
}

function acceptedAfter(previous: WindowManager, model: WindowManager): WindowManagerUpdateOutcome {
  return accepted(model, managerFingerprint(previous) !== managerFingerprint(model));
}

function decodeWindowId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw);
    return isSafeRecordKey(id) ? id : null;
  } catch {
    return isSafeRecordKey(raw) ? raw : null;
  }
}

/** Encode an id for Horizon's stable, colon-delimited element event tags. */
export function encodeWindowEventId(id: string): string {
  if (!isSafeRecordKey(id)) throw new TypeError(`Invalid window id: ${id || '<empty>'}`);
  return encodeURIComponent(id);
}

/** Convert Horizon's stable chrome enter/leave tags into manager messages. */
export function windowManagerMsgFromChromeEvent(event: { handlerTag: string }): WindowManagerMsg | null {
  const match = /^window:(.+):(hover|leave):(.+)$/.exec(event.handlerTag);
  if (!match) return null;
  const [, rawId, phase, rawTarget] = match;
  const id = rawId ? decodeWindowId(rawId) : null;
  if (!id || !rawTarget) return null;
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

/** Parse both chrome hover tags and chrome command tags without splitting ids. */
export function windowManagerMsgFromWindowEvent(event: { handlerTag: string }): WindowManagerMsg | null {
  const hover = windowManagerMsgFromChromeEvent(event);
  if (hover) return hover;
  const match = /^window:(.+):(close|minimize|maximize|fullscreen|restore|focus)$/.exec(event.handlerTag);
  if (!match) return null;
  const id = match[1] ? decodeWindowId(match[1]) : null;
  if (!id) return null;
  switch (match[2]) {
    case 'close':
      return { type: 'close-window', id };
    case 'minimize':
      return { type: 'minimize-window', id };
    case 'maximize':
      return { type: 'maximize-window', id };
    case 'fullscreen':
      return { type: 'fullscreen-window', id };
    case 'restore':
      return { type: 'restore-window', id };
    case 'focus':
      return { type: 'focus-window', id };
    default:
      return null;
  }
}

export function getVisibleWindows(manager: WindowManager): ManagedWindow[] {
  return [...manager.windows]
    .filter((window) => !isSuspended(window) && belongsToActiveWorkspace(window, manager.activeWorkspaceId))
    .sort((a, b) => b.zIndex - a.zIndex);
}

export function getMinimizedWindows(manager: WindowManager, options: { allWorkspaces?: boolean } = {}): ManagedWindow[] {
  return [...manager.windows]
    .filter(
      (window) =>
        (window.mode === 'minimized' || window.minimized === true) &&
        (options.allWorkspaces === true || belongsToActiveWorkspace(window, manager.activeWorkspaceId)),
    )
    .sort((a, b) => b.zIndex - a.zIndex);
}

function activeModal(manager: WindowManager): ManagedWindow | undefined {
  return getVisibleWindows(manager).find((window) => window.modal || window.role === 'modal');
}

/**
 * Update only resize-edge hover state from a raw pointer position. Title bars
 * and controls use semantic element events; borders need coordinate hit tests.
 */
export function windowManagerHoverAt(manager: WindowManager, x: number, y: number): WindowManager {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return manager;
  const modal = activeModal(manager);
  const visible = modal ? [modal] : getVisibleWindows(manager);
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

export function createWindowManager(
  windows: FloatingWindowConfig[] = [],
  bounds: WindowManagerBounds = { cols: 80, rows: 24 },
  options: WindowManagerOptions = {},
): WindowManager {
  const normalizedBounds = normalizeBounds(bounds);
  const activeWorkspaceId = options.activeWorkspaceId && isSafeRecordKey(options.activeWorkspaceId) ? options.activeWorkspaceId : undefined;
  return {
    windows: normalizeWindows(windows.slice(), normalizedBounds, activeWorkspaceId),
    bounds: normalizedBounds,
    snapGuides: [],
    activeWorkspaceId,
  };
}

function nextFrontZIndex(windows: ManagedWindow[]): number {
  return windows.reduce((max, window) => Math.max(max, finiteCell(window.zIndex)), 0) + 1;
}

function lifecycleCommandFromManagerMsg(msg: WindowManagerMsg): { command: WindowCommand; closePolicy?: 'remove' | 'mark-closed' } | null {
  switch (msg.type) {
    case 'activate-window':
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

function lifecycleReason(reason: string | undefined): WindowManagerDiagnosticCode {
  const supported: WindowManagerDiagnosticCode[] = [
    'window-not-found',
    'window-id-exists',
    'window-limit-reached',
    'window-closed',
    'window-not-focusable',
    'window-not-closable',
    'window-not-minimizable',
    'window-not-maximizable',
    'window-not-fullscreenable',
  ];
  return supported.includes(reason as WindowManagerDiagnosticCode) ? (reason as WindowManagerDiagnosticCode) : 'invalid-window';
}

function targetIdForMessage(msg: WindowManagerMsg): string | undefined {
  if ('id' in msg) return msg.id;
  if (msg.type === 'window-command' && 'id' in msg.command) return msg.command.id;
  return undefined;
}

export function windowManagerUpdateResult(msg: WindowManagerMsg, manager: WindowManager): WindowManagerUpdateOutcome {
  const bounds = normalizeBounds(manager.bounds);
  let base: WindowManager;
  try {
    base = managerWith(manager, manager.windows, bounds, manager.activeWorkspaceId, manager.snapGuides);
  } catch {
    return diagnostic(manager, 'invalid-window', targetIdForMessage(msg));
  }

  if (msg.type === 'set-bounds') {
    const nextBounds = normalizeBounds(msg.bounds, bounds);
    const next = managerWith(base, base.windows, nextBounds, base.activeWorkspaceId);
    return acceptedAfter(manager, next);
  }

  if (msg.type === 'set-active-workspace') {
    if (msg.id !== undefined && !isSafeRecordKey(msg.id)) return diagnostic(base, 'invalid-workspace');
    if (msg.id === base.activeWorkspaceId) return accepted(base, false);
    return acceptedAfter(base, managerWith(base, base.windows, bounds, msg.id));
  }

  if (msg.type === 'create-window') {
    try {
      const next = createDesktopWindow({ ...msg.window, zIndex: msg.window.zIndex ?? nextFrontZIndex(base.windows) });
      const result = applyWindowCommand(
        { type: 'create', window: next },
        base.windows.map((window) => createDesktopWindow(window)),
        { bounds },
      );
      if (!result.accepted) return diagnostic(base, lifecycleReason(result.reason), msg.window.id);
      return accepted(managerWith(base, result.windows, bounds, base.activeWorkspaceId));
    } catch {
      return diagnostic(base, 'invalid-window', msg.window.id);
    }
  }

  if (msg.type === 'window-command' && msg.command.type === 'create') {
    return windowManagerUpdateResult({ type: 'create-window', window: msg.command.window }, base);
  }

  const id = targetIdForMessage(msg);
  const target = id === undefined ? undefined : base.windows.find((window) => window.id === id);
  if (id !== undefined && !target) return diagnostic(base, 'window-not-found', id);
  if (msg.type === 'set-window-workspace' && msg.workspaceId !== undefined && !isSafeRecordKey(msg.workspaceId)) {
    return diagnostic(base, 'invalid-workspace', id);
  }

  const activation = msg.type === 'activate-window' || msg.type === 'focus-window' || (msg.type === 'window-command' && msg.command.type === 'focus');
  const currentModal = activeModal(base);
  if (currentModal && activation && currentModal.id !== id) return diagnostic(base, 'modal-blocked', id);
  let activeBase = base;
  if (activation && target?.workspaceId && target.workspaceId !== base.activeWorkspaceId) {
    activeBase = managerWith(base, base.windows, bounds, target.workspaceId);
  }
  const modal = activeModal(activeBase);

  const modalBlockedMessage =
    modal &&
    id !== undefined &&
    modal.id !== id &&
    msg.type !== 'destroy-window' &&
    !(msg.type === 'window-command' && 'source' in msg.command && msg.command.source === 'programmatic');
  if (modalBlockedMessage) return diagnostic(activeBase, 'modal-blocked', id);

  if (msg.type === 'set-window-workspace' && target) {
    if (target.workspaceId === msg.workspaceId) return accepted(base, false);
    const windows = base.windows.map((window) => (window.id === target.id ? { ...window, workspaceId: msg.workspaceId } : window));
    return acceptedAfter(base, managerWith(base, windows, bounds, base.activeWorkspaceId));
  }

  if (msg.type === 'window-command') {
    const result = applyWindowCommand(
      msg.command,
      activeBase.windows.map((window) => createDesktopWindow(window)),
      { bounds, closePolicy: msg.policy },
    );
    if (!result.accepted) return diagnostic(activeBase, lifecycleReason(result.reason), id);
    return acceptedAfter(base, managerWith(activeBase, result.windows, bounds, activeBase.activeWorkspaceId));
  }

  const lifecycle = lifecycleCommandFromManagerMsg(msg);
  if (lifecycle) {
    const result = applyWindowCommand(
      lifecycle.command,
      activeBase.windows.map((window) => createDesktopWindow(window)),
      { bounds, closePolicy: lifecycle.closePolicy },
    );
    if (!result.accepted) return diagnostic(activeBase, lifecycleReason(result.reason), id);
    return acceptedAfter(base, managerWith(activeBase, result.windows, bounds, activeBase.activeWorkspaceId));
  }

  if (!target || id === undefined) return diagnostic(base, 'window-not-found', id);
  switch (msg.type) {
    case 'move-window':
    case 'snap-move-window': {
      if (target.mode !== 'normal') return diagnostic(base, 'window-not-normal', target.id);
      if (target.draggable === false) return diagnostic(base, 'window-not-draggable', target.id);
      let x = msg.x;
      let y = msg.y;
      let guides: SnapGuide[] = [];
      if (msg.type === 'snap-move-window') {
        const snapped = computeSnappedPosition(
          { x: msg.x, y: msg.y },
          snapshotBounds(target),
          getVisibleWindows(base).filter((window) => window.id !== target.id),
          bounds,
          msg.config,
        );
        x = snapped.x;
        y = snapped.y;
        guides = snapped.guides;
      }
      const frame = clampFloatingWindowFrame(
        bounds,
        {
          width: target.width,
          height: target.height,
          minWidth: target.minWidth ?? 1,
          minHeight: target.minHeight ?? 1,
          maxWidth: target.maxWidth,
          maxHeight: target.maxHeight,
        },
        { ...snapshotBounds(target), x, y },
      );
      const next = createDesktopWindow({ ...target, ...frame, frame, restoreFrame: frame, restoreBounds: frame }) as ManagedWindow;
      return acceptedAfter(
        base,
        managerWith(
          base,
          base.windows.map((window) => (window.id === target.id ? next : window)),
          bounds,
          base.activeWorkspaceId,
          guides,
        ),
      );
    }
    case 'resize-window':
    case 'set-window-frame': {
      if (target.mode !== 'normal') return diagnostic(base, 'window-not-normal', target.id);
      if (target.resizable === false) return diagnostic(base, 'window-not-resizable', target.id);
      const requested = msg.type === 'resize-window' ? { ...snapshotBounds(target), width: msg.width, height: msg.height } : msg.frame;
      if (msg.type === 'set-window-frame' && target.draggable === false && (requested.x !== target.x || requested.y !== target.y)) {
        return diagnostic(base, 'window-not-draggable', target.id);
      }
      const frame = clampFloatingWindowFrame(
        bounds,
        {
          width: target.width,
          height: target.height,
          minWidth: target.minWidth ?? 1,
          minHeight: target.minHeight ?? 1,
          maxWidth: target.maxWidth,
          maxHeight: target.maxHeight,
        },
        requested,
      );
      const next = createDesktopWindow({ ...target, ...frame, frame, restoreFrame: frame, restoreBounds: frame }) as ManagedWindow;
      return acceptedAfter(
        base,
        managerWith(
          base,
          base.windows.map((window) => (window.id === target.id ? next : window)),
          bounds,
          base.activeWorkspaceId,
        ),
      );
    }
    case 'hover-window-chrome': {
      if (target.chrome?.hoveredTarget === msg.target) return accepted(base, false);
      const windows = base.windows.map((window) => (window.id === target.id ? { ...window, chrome: { ...window.chrome, hoveredTarget: msg.target } } : window));
      return accepted({ ...base, windows });
    }
    case 'leave-window-chrome': {
      if (msg.target && target.chrome?.hoveredTarget !== msg.target) return accepted(base, false);
      if (!target.chrome?.hoveredTarget) return accepted(base, false);
      const windows = base.windows.map((window) => (window.id === target.id ? { ...window, chrome: { ...window.chrome, hoveredTarget: null } } : window));
      return accepted({ ...base, windows });
    }
    default:
      return accepted(base, false);
  }
}

export function windowManagerUpdate(msg: WindowManagerMsg, manager: WindowManager): WindowManager {
  return windowManagerUpdateResult(msg, manager).model;
}

export function getFrontmostWindow(manager: WindowManager): ManagedWindow | undefined {
  return getVisibleWindows(manager)[0];
}
