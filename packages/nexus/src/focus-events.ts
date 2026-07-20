/**
 * Focus Event Protocol — structured focus lifecycle events.
 *
 * Provides a deriveFocusEvents function that compares previous and next
 * FocusStackState snapshots and emits the appropriate lifecycle events.
 */

import type { FocusStackState } from './focus-stack.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FocusEvent =
  | { type: 'focus-entered'; layerId: string; elementId: string; previousElementId?: string }
  | { type: 'focus-left'; layerId: string; elementId: string; nextElementId?: string }
  | { type: 'layer-activated'; layerId: string; previousLayerId?: string }
  | { type: 'layer-deactivated'; layerId: string; nextLayerId?: string }
  | { type: 'focus-trapped'; layerId: string; attemptedAction: 'tab' | 'click' | 'escape' };

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Compare two FocusStackState snapshots and derive the focus lifecycle events
 * that occurred during the transition.
 *
 * Events are emitted in a logical order:
 *   1. focus-left (old element loses focus)
 *   2. layer-deactivated (old layer loses active status)
 *   3. layer-activated (new layer gains active status)
 *   4. focus-entered (new element gains focus)
 */
export function deriveFocusEvents(prev: FocusStackState, next: FocusStackState): FocusEvent[] {
  const events: FocusEvent[] = [];

  const prevLayer = prev.layers.length > 0 ? prev.layers[prev.layers.length - 1] : undefined;
  const nextLayer = next.layers.length > 0 ? next.layers[next.layers.length - 1] : undefined;

  const prevLayerId = prevLayer?.id;
  const nextLayerId = nextLayer?.id;
  const prevFocusId = prevLayer?.activeFocusId;
  const nextFocusId = nextLayer?.activeFocusId;

  const layerChanged = prevLayerId !== nextLayerId;

  if (layerChanged) {
    // Focus left old element
    if (prevFocusId !== undefined && prevLayerId !== undefined) {
      events.push({
        type: 'focus-left',
        layerId: prevLayerId,
        elementId: prevFocusId,
        nextElementId: nextFocusId,
      });
    }

    // Layer deactivated
    if (prevLayerId !== undefined) {
      events.push({
        type: 'layer-deactivated',
        layerId: prevLayerId,
        nextLayerId,
      });
    }

    // Layer activated
    if (nextLayerId !== undefined) {
      events.push({
        type: 'layer-activated',
        layerId: nextLayerId,
        previousLayerId: prevLayerId,
      });
    }

    // Focus entered new element
    if (nextFocusId !== undefined && nextLayerId !== undefined) {
      events.push({
        type: 'focus-entered',
        layerId: nextLayerId,
        elementId: nextFocusId,
        previousElementId: prevFocusId,
      });
    }
  } else if (prevLayerId !== undefined && nextLayerId !== undefined) {
    // Same layer — check if focus changed within the layer
    if (prevFocusId !== nextFocusId) {
      if (prevFocusId !== undefined) {
        events.push({
          type: 'focus-left',
          layerId: prevLayerId,
          elementId: prevFocusId,
          nextElementId: nextFocusId,
        });
      }
      if (nextFocusId !== undefined) {
        events.push({
          type: 'focus-entered',
          layerId: nextLayerId,
          elementId: nextFocusId,
          previousElementId: prevFocusId,
        });
      }
    }
  }

  return events;
}
