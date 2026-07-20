/**
 * Layer-Aware Keyboard Dispatch — routes keyboard events through the focus stack.
 *
 * Pure function: takes key info + focus stack state, returns routing result
 * with an optional FocusStackMsg for the caller to dispatch.
 */

import type { FocusStackMsg, FocusStackState } from './focus-stack.js';
import { getActiveFocusId, getActiveLayer } from './focus-stack.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KeyboardRouteResult {
  consumed: boolean;
  layerId: string;
  elementId?: string;
  focusStackMsg?: FocusStackMsg;
}

export interface KeyboardRouteOptions {
  tabCycles?: boolean;
  escapeCloses?: boolean;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function routeKeyboard(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean },
  state: FocusStackState,
  options?: KeyboardRouteOptions,
): KeyboardRouteResult {
  const layer = getActiveLayer(state);
  if (!layer) {
    return { consumed: false, layerId: '' };
  }

  const tabCycles = options?.tabCycles !== false;
  const escapeCloses = options?.escapeCloses !== false;
  const k = key.toLowerCase();

  // Tab / Shift+Tab
  if (k === 'tab' && tabCycles) {
    if (modifiers.shift) {
      return {
        consumed: true,
        layerId: layer.id,
        elementId: getActiveFocusId(state),
        focusStackMsg: { type: 'focus-prev' },
      };
    }
    return {
      consumed: true,
      layerId: layer.id,
      elementId: getActiveFocusId(state),
      focusStackMsg: { type: 'focus-next' },
    };
  }

  // Escape
  if (k === 'escape' && escapeCloses) {
    return {
      consumed: true,
      layerId: layer.id,
      elementId: getActiveFocusId(state),
      focusStackMsg: { type: 'focus-escape' },
    };
  }

  // All other keys — route to the active layer's focused element
  // but don't consume (the caller decides what to do with them)
  return {
    consumed: false,
    layerId: layer.id,
    elementId: getActiveFocusId(state),
  };
}
