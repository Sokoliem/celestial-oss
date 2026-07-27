import type { MouseEventData, PointerCursor } from '@celestial/core/nebula';
import {
  createHorizonMouseModel,
  horizonMouseUpdate,
  type HorizonMouseEffect,
  type HorizonMouseModel,
} from './mouse.js';
import { windowChromeFloatGeometry } from './window-chrome.js';
import {
  getVisibleWindows,
  type WindowManager,
  type WindowManagerBounds,
  type WindowManagerDiagnostic,
  windowManagerHoverAt,
  windowManagerUpdateResult,
} from './windows.js';

export interface WindowManagerPointerState {
  readonly mouse: HorizonMouseModel;
}

export type WindowManagerPointerMsg =
  | { readonly type: 'pointer'; readonly event: MouseEventData }
  | { readonly type: 'cancel' }
  | { readonly type: 'resize'; readonly bounds: WindowManagerBounds };

export interface WindowManagerPointerResult {
  readonly state: WindowManagerPointerState;
  readonly manager: WindowManager;
  readonly effects: readonly HorizonMouseEffect[];
  readonly diagnostics: readonly WindowManagerDiagnostic[];
  readonly accepted: boolean;
  readonly changed: boolean;
  readonly cursor: PointerCursor;
}

export function createWindowManagerPointerState(bounds: Pick<WindowManagerBounds, 'cols' | 'rows'> = { cols: 80, rows: 24 }): WindowManagerPointerState {
  return { mouse: createHorizonMouseModel({ cols: bounds.cols, rows: bounds.rows, enabled: true }) };
}

function synchronizedMouse(state: WindowManagerPointerState, manager: WindowManager): HorizonMouseModel {
  return {
    ...state.mouse,
    termCols: manager.bounds.cols,
    termRows: manager.bounds.rows,
    geometry: {
      splits: [],
      tabs: [],
      panes: [],
      // Horizon's transient hit map resolves later registrations first.
      floats: getVisibleWindows(manager).reverse().map(windowChromeFloatGeometry),
    },
  };
}

function applyEffects(
  effects: readonly HorizonMouseEffect[],
  manager: WindowManager,
): { manager: WindowManager; diagnostics: WindowManagerDiagnostic[]; accepted: boolean; changed: boolean } {
  let current = manager;
  let accepted = true;
  let changed = false;
  const diagnostics: WindowManagerDiagnostic[] = [];
  for (const effect of effects) {
    const message =
      effect.effect === 'move-float'
        ? ({ type: 'move-window', id: effect.floatId, x: effect.x, y: effect.y } as const)
        : effect.effect === 'resize-float'
          ? ({ type: 'set-window-frame', id: effect.floatId, frame: effect.frame } as const)
          : null;
    if (!message) continue;
    const outcome = windowManagerUpdateResult(message, current);
    current = outcome.model;
    accepted = accepted && outcome.accepted;
    changed = changed || outcome.changed;
    diagnostics.push(...outcome.diagnostics);
  }
  return { manager: current, diagnostics, accepted, changed };
}

/** Framework-owned pointer lifecycle for managed windows, including capture, constraints, cancellation, and cursor state. */
export function windowManagerPointerUpdate(
  message: WindowManagerPointerMsg,
  state: WindowManagerPointerState,
  manager: WindowManager,
): WindowManagerPointerResult {
  let currentManager = manager;
  let managerChanged = false;
  const diagnostics: WindowManagerDiagnostic[] = [];

  if (message.type === 'resize') {
    const bounds = windowManagerUpdateResult({ type: 'set-bounds', bounds: message.bounds }, currentManager);
    currentManager = bounds.model;
    managerChanged = bounds.changed;
    diagnostics.push(...bounds.diagnostics);
    const mouseResult = horizonMouseUpdate(
      { type: 'mouse-resize', cols: currentManager.bounds.cols, rows: currentManager.bounds.rows },
      synchronizedMouse(state, currentManager),
    );
    const applied = applyEffects(mouseResult.effects, currentManager);
    return {
      state: { mouse: mouseResult.model },
      manager: applied.manager,
      effects: mouseResult.effects,
      diagnostics: [...diagnostics, ...applied.diagnostics],
      accepted: bounds.accepted && applied.accepted,
      changed: managerChanged || applied.changed,
      cursor: mouseResult.model.cursor,
    };
  }

  if (message.type === 'pointer' && message.event.type === 'press' && message.event.button === 0) {
    const hit = getVisibleWindows(currentManager).find((window) =>
      message.event.x >= window.x
      && message.event.x < window.x + window.width
      && message.event.y >= window.y
      && message.event.y < window.y + window.height);
    if (hit) {
      const focus = windowManagerUpdateResult({ type: 'focus-window', id: hit.id }, currentManager);
      currentManager = focus.model;
      managerChanged = focus.changed;
      diagnostics.push(...focus.diagnostics);
    }
  }

  const mouseResult = horizonMouseUpdate(
    message.type === 'cancel' ? { type: 'mouse-cancel' } : { type: 'mouse-event', event: message.event },
    synchronizedMouse(state, currentManager),
  );
  const applied = applyEffects(mouseResult.effects, currentManager);
  currentManager = applied.manager;
  if (message.type === 'pointer' && (message.event.type === 'move' || message.event.type === 'release')) {
    const hovered = windowManagerHoverAt(currentManager, message.event.x, message.event.y);
    managerChanged = managerChanged || hovered !== currentManager;
    currentManager = hovered;
  }

  return {
    state: { mouse: mouseResult.model },
    manager: currentManager,
    effects: mouseResult.effects,
    diagnostics: [...diagnostics, ...applied.diagnostics],
    accepted: applied.accepted && diagnostics.length === 0,
    changed: managerChanged || applied.changed,
    cursor: mouseResult.model.cursor,
  };
}
