/**
 * Hover Intent Engine — distinguishes deliberate hovers from fast pass-throughs.
 *
 * Pure state machine: no side effects, no timers. The caller sends
 * `hover-tick` messages periodically and `hover-cursor-move` on mouse events.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HoverIntentConfig {
  dwellMs?: number;
  exitGraceMs?: number;
  movementTolerance?: number;
}

export const DEFAULT_HOVER_INTENT_CONFIG: Required<HoverIntentConfig> = {
  dwellMs: 300,
  exitGraceMs: 100,
  movementTolerance: 1,
};

export type HoverPhase = 'idle' | 'entering' | 'active' | 'exiting';

export interface HoverIntentState {
  phase: HoverPhase;
  regionId: string | null;
  enterX: number;
  enterY: number;
  enterTime: number;
  exitTime: number;
}

export type HoverIntentMsg =
  | { type: 'hover-cursor-move'; x: number; y: number; regionId: string | null; timestamp: number }
  | { type: 'hover-tick'; timestamp: number };

export type HoverIntentEvent =
  | { event: 'hover-enter'; regionId: string }
  | { event: 'hover-exit'; regionId: string }
  | { event: 'hover-move'; regionId: string; x: number; y: number };

// ---------------------------------------------------------------------------
// Factory / helpers
// ---------------------------------------------------------------------------

export function createHoverIntentState(): HoverIntentState {
  return {
    phase: 'idle',
    regionId: null,
    enterX: 0,
    enterY: 0,
    enterTime: 0,
    exitTime: 0,
  };
}

export function resolveHoverIntentConfig(config?: HoverIntentConfig): Required<HoverIntentConfig> {
  return { ...DEFAULT_HOVER_INTENT_CONFIG, ...config };
}

// ---------------------------------------------------------------------------
// Core reducer
// ---------------------------------------------------------------------------

export function hoverIntentUpdate(
  msg: HoverIntentMsg,
  state: HoverIntentState,
  config: Required<HoverIntentConfig>,
): { state: HoverIntentState; events: HoverIntentEvent[] } {
  switch (state.phase) {
    case 'idle':
      return idleUpdate(msg, state, config);
    case 'entering':
      return enteringUpdate(msg, state, config);
    case 'active':
      return activeUpdate(msg, state, config);
    case 'exiting':
      return exitingUpdate(msg, state, config);
  }
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

function idleUpdate(
  msg: HoverIntentMsg,
  state: HoverIntentState,
  _config: Required<HoverIntentConfig>,
): { state: HoverIntentState; events: HoverIntentEvent[] } {
  if (msg.type === 'hover-cursor-move' && msg.regionId !== null) {
    return {
      state: {
        phase: 'entering',
        regionId: msg.regionId,
        enterX: msg.x,
        enterY: msg.y,
        enterTime: msg.timestamp,
        exitTime: 0,
      },
      events: [],
    };
  }
  return { state, events: [] };
}

function enteringUpdate(
  msg: HoverIntentMsg,
  state: HoverIntentState,
  config: Required<HoverIntentConfig>,
): { state: HoverIntentState; events: HoverIntentEvent[] } {
  if (msg.type === 'hover-cursor-move') {
    // Left the region entirely
    if (msg.regionId === null) {
      return {
        state: createHoverIntentState(),
        events: [],
      };
    }

    // Moved to a different region — start fresh
    if (msg.regionId !== state.regionId) {
      return {
        state: {
          phase: 'entering',
          regionId: msg.regionId,
          enterX: msg.x,
          enterY: msg.y,
          enterTime: msg.timestamp,
          exitTime: 0,
        },
        events: [],
      };
    }

    // Same region — check movement tolerance
    const withinTolerance = Math.abs(msg.x - state.enterX) <= config.movementTolerance && Math.abs(msg.y - state.enterY) <= config.movementTolerance;

    if (!withinTolerance) {
      // Moved too far — fast pass-through, reset to idle
      return {
        state: createHoverIntentState(),
        events: [],
      };
    }

    // Within tolerance — stay entering
    return { state, events: [] };
  }

  // hover-tick
  if (msg.type === 'hover-tick') {
    const elapsed = msg.timestamp - state.enterTime;
    if (elapsed >= config.dwellMs) {
      return {
        state: {
          ...state,
          phase: 'active',
        },
        events: [{ event: 'hover-enter', regionId: state.regionId! }],
      };
    }
    return { state, events: [] };
  }

  return { state, events: [] };
}

function activeUpdate(
  msg: HoverIntentMsg,
  state: HoverIntentState,
  _config: Required<HoverIntentConfig>,
): { state: HoverIntentState; events: HoverIntentEvent[] } {
  if (msg.type === 'hover-cursor-move') {
    // Same region — emit hover-move
    if (msg.regionId === state.regionId) {
      return {
        state,
        events: [{ event: 'hover-move', regionId: state.regionId!, x: msg.x, y: msg.y }],
      };
    }

    // Left region entirely — start exiting
    if (msg.regionId === null) {
      return {
        state: {
          ...state,
          phase: 'exiting',
          exitTime: msg.timestamp,
        },
        events: [],
      };
    }

    // Moved to a new region — exit old, start entering new
    return {
      state: {
        phase: 'entering',
        regionId: msg.regionId,
        enterX: msg.x,
        enterY: msg.y,
        enterTime: msg.timestamp,
        exitTime: 0,
      },
      events: [{ event: 'hover-exit', regionId: state.regionId! }],
    };
  }

  // tick — no-op in active
  return { state, events: [] };
}

function exitingUpdate(
  msg: HoverIntentMsg,
  state: HoverIntentState,
  config: Required<HoverIntentConfig>,
): { state: HoverIntentState; events: HoverIntentEvent[] } {
  if (msg.type === 'hover-cursor-move') {
    // Re-entered the same region — cancel exit, back to active
    if (msg.regionId === state.regionId) {
      return {
        state: {
          ...state,
          phase: 'active',
          exitTime: 0,
        },
        events: [],
      };
    }

    // Entered a new region — exit old, start entering new
    if (msg.regionId !== null) {
      return {
        state: {
          phase: 'entering',
          regionId: msg.regionId,
          enterX: msg.x,
          enterY: msg.y,
          enterTime: msg.timestamp,
          exitTime: 0,
        },
        events: [{ event: 'hover-exit', regionId: state.regionId! }],
      };
    }

    // Still outside — stay exiting
    return { state, events: [] };
  }

  // hover-tick — check grace period
  if (msg.type === 'hover-tick') {
    const elapsed = msg.timestamp - state.exitTime;
    if (elapsed >= config.exitGraceMs) {
      return {
        state: createHoverIntentState(),
        events: [{ event: 'hover-exit', regionId: state.regionId! }],
      };
    }
    return { state, events: [] };
  }

  return { state, events: [] };
}
