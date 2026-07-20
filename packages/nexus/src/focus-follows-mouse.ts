import type { FocusStackState } from './focus-stack.js';
import { getActiveLayer, isLayerTrapped } from './focus-stack.js';
import { createHoverIntentState, type HoverIntentState, hoverIntentUpdate, resolveHoverIntentConfig } from './hover-intent.js';

export interface FocusFollowsConfig {
  dwellMs?: number;
  mode?: 'sloppy' | 'strict';
  excludeRegions?: string[];
}

export interface FocusFollowsMouseState {
  hoverIntent: HoverIntentState;
  focusedRegionId: string | null;
  pendingRegionId: string | null;
}

export type FocusFollowsMouseMsg =
  | { type: 'focus-follow-mouse-move'; x: number; y: number; regionId: string | null; timestamp: number }
  | { type: 'focus-follow-mouse-tick'; timestamp: number }
  | { type: 'focus-follow-mouse-click'; regionId: string | null }
  | { type: 'focus-follow-mouse-reset' };

export function createFocusFollowsMouseState(): FocusFollowsMouseState {
  return {
    hoverIntent: createHoverIntentState(),
    focusedRegionId: null,
    pendingRegionId: null,
  };
}

export function focusFollowsMouseUpdate(
  msg: FocusFollowsMouseMsg,
  state: FocusFollowsMouseState,
  config: FocusFollowsConfig = {},
  focusStack?: FocusStackState,
): FocusFollowsMouseState {
  // When a focus stack is provided and the active layer is trapped,
  // ignore mouse hover focus changes for regions outside that layer.
  if (focusStack && isLayerTrapped(focusStack)) {
    const activeLayer = getActiveLayer(focusStack);
    if (activeLayer) {
      // For click and move messages, suppress if the region is not in the trapped layer
      if (msg.type === 'focus-follow-mouse-click' || msg.type === 'focus-follow-mouse-move') {
        const regionId = msg.regionId;
        if (regionId !== null && !activeLayer.focusableIds.includes(regionId)) {
          return state;
        }
      }
    }
  }

  switch (msg.type) {
    case 'focus-follow-mouse-reset':
      return createFocusFollowsMouseState();
    case 'focus-follow-mouse-click':
      return handleClick(msg.regionId, state, config);
    case 'focus-follow-mouse-move':
      return handleHoverMessage(
        { type: 'hover-cursor-move', x: msg.x, y: msg.y, regionId: sanitizeRegion(msg.regionId, config), timestamp: msg.timestamp },
        state,
        config,
      );
    case 'focus-follow-mouse-tick':
      return handleHoverMessage({ type: 'hover-tick', timestamp: msg.timestamp }, state, config);
  }
}

export function getFocusedRegionId(state: FocusFollowsMouseState): string | null {
  return state.focusedRegionId;
}

function handleClick(regionId: string | null, state: FocusFollowsMouseState, config: FocusFollowsConfig): FocusFollowsMouseState {
  const nextRegionId = sanitizeRegion(regionId, config);
  if (nextRegionId === null) {
    return state;
  }

  return {
    ...state,
    focusedRegionId: nextRegionId,
    pendingRegionId: nextRegionId,
  };
}

function handleHoverMessage(
  msg: { type: 'hover-cursor-move'; x: number; y: number; regionId: string | null; timestamp: number } | { type: 'hover-tick'; timestamp: number },
  state: FocusFollowsMouseState,
  config: FocusFollowsConfig,
): FocusFollowsMouseState {
  const hoverConfig = resolveHoverIntentConfig({
    dwellMs: config.dwellMs,
  });
  const result = hoverIntentUpdate(msg, state.hoverIntent, hoverConfig);

  let focusedRegionId = state.focusedRegionId;
  let pendingRegionId = state.pendingRegionId;
  const mode = config.mode ?? 'sloppy';

  if (msg.type === 'hover-cursor-move') {
    pendingRegionId = msg.regionId;
  }

  for (const event of result.events) {
    if (event.event === 'hover-enter') {
      pendingRegionId = event.regionId;
      if (mode === 'sloppy') {
        focusedRegionId = event.regionId;
      }
    } else if (event.event === 'hover-exit' && pendingRegionId === event.regionId) {
      pendingRegionId = null;
    }
  }

  return {
    hoverIntent: result.state,
    focusedRegionId,
    pendingRegionId,
  };
}

function sanitizeRegion(regionId: string | null, config: FocusFollowsConfig): string | null {
  if (regionId === null) {
    return null;
  }

  if (config.excludeRegions?.includes(regionId)) {
    return null;
  }

  return regionId;
}
