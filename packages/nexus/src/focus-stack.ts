/**
 * Focus Stack — stack-based focus manager with push/pop semantics for overlays.
 *
 * Pure state machine: create → update → query. The update function returns
 * `{ state, events }` following the HoverIntentState pattern.
 */

import type { FocusEvent } from './focus-events.js';
import { deriveFocusEvents } from './focus-events.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FocusLayer {
  id: string;
  kind: 'base' | 'modal' | 'overlay' | 'menu' | 'toast';
  trap: boolean;
  focusableIds: string[];
  activeFocusId?: string;
  onEscape?: string;
  restoreFocusOnPop?: boolean;
}

export interface FocusStackState {
  layers: FocusLayer[];
  previousFocusIds: string[];
}

export type FocusStackMsg =
  | { type: 'focus-push-layer'; layer: FocusLayer }
  | { type: 'focus-pop-layer'; layerId?: string }
  | { type: 'focus-set'; layerId: string; elementId: string }
  | { type: 'focus-next' }
  | { type: 'focus-prev' }
  | { type: 'focus-escape' }
  | { type: 'focus-sync-layer'; layerId: string; focusableIds: string[] };

export interface FocusStackUpdateResult {
  state: FocusStackState;
  events: FocusEvent[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFocusStackState(baseLayer: FocusLayer): FocusStackState {
  const layer: FocusLayer = {
    ...baseLayer,
    activeFocusId: baseLayer.activeFocusId ?? baseLayer.focusableIds[0],
  };
  return {
    layers: [layer],
    previousFocusIds: [],
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function focusStackUpdate(msg: FocusStackMsg, state: FocusStackState): FocusStackUpdateResult {
  switch (msg.type) {
    case 'focus-push-layer':
      return handlePushLayer(msg.layer, state);
    case 'focus-pop-layer':
      return handlePopLayer(msg.layerId, state);
    case 'focus-set':
      return handleFocusSet(msg.layerId, msg.elementId, state);
    case 'focus-next':
      return handleFocusCycle(state, 1);
    case 'focus-prev':
      return handleFocusCycle(state, -1);
    case 'focus-escape':
      return handleEscape(state);
    case 'focus-sync-layer':
      return handleSyncLayer(msg.layerId, msg.focusableIds, state);
  }
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

export function getActiveLayer(state: FocusStackState): FocusLayer | undefined {
  return state.layers.length > 0 ? state.layers[state.layers.length - 1] : undefined;
}

export function getActiveFocusId(state: FocusStackState): string | undefined {
  const layer = getActiveLayer(state);
  return layer?.activeFocusId;
}

export function isLayerTrapped(state: FocusStackState): boolean {
  const layer = getActiveLayer(state);
  return layer?.trap === true;
}

export function getLayerById(state: FocusStackState, id: string): FocusLayer | undefined {
  return state.layers.find((l) => l.id === id);
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handlePushLayer(layer: FocusLayer, state: FocusStackState): FocusStackUpdateResult {
  const prev = state;
  const currentFocusId = getActiveFocusId(state);

  const newLayer: FocusLayer = {
    ...layer,
    activeFocusId: layer.activeFocusId ?? layer.focusableIds[0],
  };

  const next: FocusStackState = {
    layers: [...state.layers, newLayer],
    previousFocusIds: [...state.previousFocusIds, currentFocusId ?? ''],
  };

  return { state: next, events: deriveFocusEvents(prev, next) };
}

function handlePopLayer(layerId: string | undefined, state: FocusStackState): FocusStackUpdateResult {
  // Cannot pop if only one layer or no layers
  if (state.layers.length <= 1) {
    return { state, events: [] };
  }

  const prev = state;

  if (layerId !== undefined) {
    // Pop a specific layer by ID
    const index = state.layers.findIndex((l) => l.id === layerId);
    if (index < 0 || index === 0) {
      // Not found or trying to pop base layer
      return { state, events: [] };
    }

    const poppedLayer = state.layers[index]!;
    const restoreFocus = poppedLayer.restoreFocusOnPop !== false;
    const newLayers = [...state.layers.slice(0, index), ...state.layers.slice(index + 1)];
    const newPreviousFocusIds = [...state.previousFocusIds.slice(0, index), ...state.previousFocusIds.slice(index + 1)];

    // Restore focus on the new top layer if needed
    let finalLayers = newLayers;
    if (restoreFocus && newPreviousFocusIds.length > 0 && index >= newLayers.length) {
      // The popped layer was on top — restore focus to the new top layer
      const restoredFocusId = state.previousFocusIds[index];
      if (restoredFocusId && newLayers.length > 0) {
        finalLayers = [...newLayers];
        const topIdx = finalLayers.length - 1;
        const topLayer = finalLayers[topIdx]!;
        if (topLayer.focusableIds.includes(restoredFocusId)) {
          finalLayers[topIdx] = { ...topLayer, activeFocusId: restoredFocusId };
        }
      }
    }

    const next: FocusStackState = { layers: finalLayers, previousFocusIds: newPreviousFocusIds };
    return { state: next, events: deriveFocusEvents(prev, next) };
  }

  // Pop the top layer
  const poppedLayer = state.layers[state.layers.length - 1]!;
  const restoreFocus = poppedLayer.restoreFocusOnPop !== false;
  const newLayers = state.layers.slice(0, -1);
  const newPreviousFocusIds = state.previousFocusIds.slice(0, -1);

  // Restore previous focus on the new top layer
  let finalLayers = newLayers;
  if (restoreFocus && state.previousFocusIds.length > 0) {
    const restoredFocusId = state.previousFocusIds[state.previousFocusIds.length - 1];
    if (restoredFocusId && newLayers.length > 0) {
      finalLayers = [...newLayers];
      const topIdx = finalLayers.length - 1;
      const topLayer = finalLayers[topIdx]!;
      if (topLayer.focusableIds.includes(restoredFocusId)) {
        finalLayers[topIdx] = { ...topLayer, activeFocusId: restoredFocusId };
      }
    }
  }

  const next: FocusStackState = { layers: finalLayers, previousFocusIds: newPreviousFocusIds };
  return { state: next, events: deriveFocusEvents(prev, next) };
}

function handleFocusSet(layerId: string, elementId: string, state: FocusStackState): FocusStackUpdateResult {
  const prev = state;
  const layerIndex = state.layers.findIndex((l) => l.id === layerId);
  if (layerIndex < 0) {
    return { state, events: [] };
  }

  const layer = state.layers[layerIndex]!;
  if (!layer.focusableIds.includes(elementId)) {
    return { state, events: [] };
  }

  const newLayers = [...state.layers];
  newLayers[layerIndex] = { ...layer, activeFocusId: elementId };

  const next: FocusStackState = { ...state, layers: newLayers };
  return { state: next, events: deriveFocusEvents(prev, next) };
}

function handleFocusCycle(state: FocusStackState, direction: 1 | -1): FocusStackUpdateResult {
  const prev = state;
  const layer = getActiveLayer(state);
  if (!layer || layer.focusableIds.length === 0) {
    return { state, events: [] };
  }

  const currentIndex = layer.activeFocusId !== undefined ? layer.focusableIds.indexOf(layer.activeFocusId) : -1;

  let nextIndex: number;
  if (currentIndex < 0) {
    // No current focus — start at beginning or end
    nextIndex = direction === 1 ? 0 : layer.focusableIds.length - 1;
  } else {
    // Wrap around
    const len = layer.focusableIds.length;
    nextIndex = (((currentIndex + direction) % len) + len) % len;
  }

  const nextFocusId = layer.focusableIds[nextIndex];
  if (nextFocusId === undefined || nextFocusId === layer.activeFocusId) {
    return { state, events: [] };
  }

  const newLayers = [...state.layers];
  const topIdx = newLayers.length - 1;
  newLayers[topIdx] = { ...layer, activeFocusId: nextFocusId };

  const next: FocusStackState = { ...state, layers: newLayers };
  return { state: next, events: deriveFocusEvents(prev, next) };
}

function handleEscape(state: FocusStackState): FocusStackUpdateResult {
  const layer = getActiveLayer(state);
  if (!layer) {
    return { state, events: [] };
  }

  // If the layer has onEscape, we emit a focus-trapped event to signal
  // the caller should handle the escape message externally.
  // If the layer is trapped, escape does not pop.
  if (layer.trap) {
    const events: FocusEvent[] = [{ type: 'focus-trapped', layerId: layer.id, attemptedAction: 'escape' }];
    // Even in a trapped layer, if onEscape is set, the caller handles it
    return { state, events };
  }

  // Not trapped — pop the layer (if not the base layer)
  if (state.layers.length <= 1) {
    return { state, events: [] };
  }

  return handlePopLayer(undefined, state);
}

function handleSyncLayer(layerId: string, focusableIds: string[], state: FocusStackState): FocusStackUpdateResult {
  const prev = state;
  const layerIndex = state.layers.findIndex((l) => l.id === layerId);
  if (layerIndex < 0) {
    return { state, events: [] };
  }

  const layer = state.layers[layerIndex]!;
  let activeFocusId = layer.activeFocusId;

  // If current focus is no longer in the focusable list, reset to first
  if (activeFocusId !== undefined && !focusableIds.includes(activeFocusId)) {
    activeFocusId = focusableIds[0];
  }

  const newLayers = [...state.layers];
  newLayers[layerIndex] = { ...layer, focusableIds, activeFocusId };

  const next: FocusStackState = { ...state, layers: newLayers };
  return { state: next, events: deriveFocusEvents(prev, next) };
}
