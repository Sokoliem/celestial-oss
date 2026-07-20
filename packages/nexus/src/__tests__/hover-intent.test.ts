import { describe, expect, it } from 'vitest';
import {
  createHoverIntentState,
  DEFAULT_HOVER_INTENT_CONFIG,
  type HoverIntentMsg,
  type HoverIntentState,
  hoverIntentUpdate,
  resolveHoverIntentConfig,
} from '../hover-intent.js';

const cfg = DEFAULT_HOVER_INTENT_CONFIG;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function move(x: number, y: number, regionId: string | null, timestamp: number): HoverIntentMsg {
  return { type: 'hover-cursor-move', x, y, regionId, timestamp };
}

function tick(timestamp: number): HoverIntentMsg {
  return { type: 'hover-tick', timestamp };
}

/** Apply a sequence of messages to a state, returning final state + all events. */
function applyAll(msgs: HoverIntentMsg[], initial: HoverIntentState = createHoverIntentState(), config = cfg) {
  let state = initial;
  const allEvents: ReturnType<typeof hoverIntentUpdate>['events'] = [];
  for (const msg of msgs) {
    const result = hoverIntentUpdate(msg, state, config);
    state = result.state;
    allEvents.push(...result.events);
  }
  return { state, events: allEvents };
}

// ---------------------------------------------------------------------------
// createHoverIntentState
// ---------------------------------------------------------------------------

describe('createHoverIntentState', () => {
  it('returns idle state', () => {
    const state = createHoverIntentState();
    expect(state).toEqual({
      phase: 'idle',
      regionId: null,
      enterX: 0,
      enterY: 0,
      enterTime: 0,
      exitTime: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveHoverIntentConfig
// ---------------------------------------------------------------------------

describe('resolveHoverIntentConfig', () => {
  it('returns defaults when no config provided', () => {
    const resolved = resolveHoverIntentConfig();
    expect(resolved).toEqual({
      dwellMs: 300,
      exitGraceMs: 100,
      movementTolerance: 1,
    });
  });

  it('merges partial config with defaults', () => {
    const resolved = resolveHoverIntentConfig({ dwellMs: 500 });
    expect(resolved).toEqual({
      dwellMs: 500,
      exitGraceMs: 100,
      movementTolerance: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// hoverIntentUpdate — idle phase
// ---------------------------------------------------------------------------

describe('hoverIntentUpdate', () => {
  describe('idle phase', () => {
    it('transitions to entering when cursor enters a region', () => {
      const { state } = hoverIntentUpdate(move(5, 10, 'btn-1', 1000), createHoverIntentState(), cfg);
      expect(state.phase).toBe('entering');
      expect(state.regionId).toBe('btn-1');
      expect(state.enterX).toBe(5);
      expect(state.enterY).toBe(10);
      expect(state.enterTime).toBe(1000);
    });

    it('stays idle when cursor moves with no region', () => {
      const { state, events } = hoverIntentUpdate(move(5, 10, null, 1000), createHoverIntentState(), cfg);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([]);
    });

    it('stays idle on tick', () => {
      const { state, events } = hoverIntentUpdate(tick(1000), createHoverIntentState(), cfg);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // entering phase
  // ---------------------------------------------------------------------------

  describe('entering phase', () => {
    const enteringState: HoverIntentState = {
      phase: 'entering',
      regionId: 'btn-1',
      enterX: 5,
      enterY: 10,
      enterTime: 1000,
      exitTime: 0,
    };

    it('stays entering when cursor is within movement tolerance', () => {
      // Move by 1 cell (tolerance = 1)
      const { state, events } = hoverIntentUpdate(move(6, 10, 'btn-1', 1100), enteringState, cfg);
      expect(state.phase).toBe('entering');
      expect(events).toEqual([]);
    });

    it('resets to idle when cursor moves beyond tolerance (fast pass-through)', () => {
      // Move by 2 cells (tolerance = 1)
      const { state, events } = hoverIntentUpdate(move(8, 10, 'btn-1', 1100), enteringState, cfg);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([]);
    });

    it('starts fresh entering for a different region', () => {
      const { state, events } = hoverIntentUpdate(move(20, 20, 'btn-2', 1100), enteringState, cfg);
      expect(state.phase).toBe('entering');
      expect(state.regionId).toBe('btn-2');
      expect(state.enterX).toBe(20);
      expect(state.enterY).toBe(20);
      expect(state.enterTime).toBe(1100);
      expect(events).toEqual([]);
    });

    it('returns to idle when cursor leaves region before dwell', () => {
      const { state, events } = hoverIntentUpdate(move(20, 20, null, 1100), enteringState, cfg);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([]);
    });

    it('stays entering when tick fires before dwellMs', () => {
      // Only 200ms elapsed, dwellMs = 300
      const { state, events } = hoverIntentUpdate(tick(1200), enteringState, cfg);
      expect(state.phase).toBe('entering');
      expect(events).toEqual([]);
    });

    it('transitions to active and emits hover-enter when dwellMs elapses', () => {
      // 300ms elapsed, dwellMs = 300
      const { state, events } = hoverIntentUpdate(tick(1300), enteringState, cfg);
      expect(state.phase).toBe('active');
      expect(state.regionId).toBe('btn-1');
      expect(events).toEqual([{ event: 'hover-enter', regionId: 'btn-1' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // active phase
  // ---------------------------------------------------------------------------

  describe('active phase', () => {
    const activeState: HoverIntentState = {
      phase: 'active',
      regionId: 'btn-1',
      enterX: 5,
      enterY: 10,
      enterTime: 1000,
      exitTime: 0,
    };

    it('emits hover-move when cursor moves within same region', () => {
      const { state, events } = hoverIntentUpdate(move(7, 12, 'btn-1', 1400), activeState, cfg);
      expect(state.phase).toBe('active');
      expect(events).toEqual([{ event: 'hover-move', regionId: 'btn-1', x: 7, y: 12 }]);
    });

    it('transitions to exiting when cursor leaves region', () => {
      const { state, events } = hoverIntentUpdate(move(50, 50, null, 1400), activeState, cfg);
      expect(state.phase).toBe('exiting');
      expect(state.exitTime).toBe(1400);
      expect(events).toEqual([]);
    });

    it('transitions to entering new region and emits hover-exit for old', () => {
      const { state, events } = hoverIntentUpdate(move(30, 30, 'btn-2', 1400), activeState, cfg);
      expect(state.phase).toBe('entering');
      expect(state.regionId).toBe('btn-2');
      expect(state.enterTime).toBe(1400);
      expect(events).toEqual([{ event: 'hover-exit', regionId: 'btn-1' }]);
    });

    it('stays active on tick', () => {
      const { state, events } = hoverIntentUpdate(tick(1400), activeState, cfg);
      expect(state.phase).toBe('active');
      expect(events).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // exiting phase
  // ---------------------------------------------------------------------------

  describe('exiting phase', () => {
    const exitingState: HoverIntentState = {
      phase: 'exiting',
      regionId: 'btn-1',
      enterX: 5,
      enterY: 10,
      enterTime: 1000,
      exitTime: 1400,
    };

    it('returns to active if cursor re-enters same region within grace', () => {
      const { state, events } = hoverIntentUpdate(move(6, 11, 'btn-1', 1450), exitingState, cfg);
      expect(state.phase).toBe('active');
      expect(state.exitTime).toBe(0);
      expect(events).toEqual([]);
    });

    it('transitions to entering new region and emits hover-exit', () => {
      const { state, events } = hoverIntentUpdate(move(30, 30, 'btn-2', 1450), exitingState, cfg);
      expect(state.phase).toBe('entering');
      expect(state.regionId).toBe('btn-2');
      expect(events).toEqual([{ event: 'hover-exit', regionId: 'btn-1' }]);
    });

    it('stays exiting when tick fires before exitGraceMs', () => {
      // Only 50ms elapsed, exitGraceMs = 100
      const { state, events } = hoverIntentUpdate(tick(1450), exitingState, cfg);
      expect(state.phase).toBe('exiting');
      expect(events).toEqual([]);
    });

    it('transitions to idle and emits hover-exit when exitGraceMs elapses', () => {
      // 100ms elapsed, exitGraceMs = 100
      const { state, events } = hoverIntentUpdate(tick(1500), exitingState, cfg);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([{ event: 'hover-exit', regionId: 'btn-1' }]);
    });

    it('stays exiting when cursor remains outside', () => {
      const { state, events } = hoverIntentUpdate(move(50, 50, null, 1450), exitingState, cfg);
      expect(state.phase).toBe('exiting');
      expect(events).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: full lifecycle
  // ---------------------------------------------------------------------------

  describe('full lifecycle', () => {
    it('idle → entering → active → exiting → idle', () => {
      const { state, events } = applyAll([
        move(5, 10, 'btn-1', 1000), // idle → entering
        tick(1300), // entering → active (dwell elapsed)
        move(50, 50, null, 1400), // active → exiting
        tick(1500), // exiting → idle (grace elapsed)
      ]);
      expect(state.phase).toBe('idle');
      expect(events).toEqual([
        { event: 'hover-enter', regionId: 'btn-1' },
        { event: 'hover-exit', regionId: 'btn-1' },
      ]);
    });

    it('re-enters same region after tolerance exceeded and dwells successfully', () => {
      // Cursor enters, moves too far (reset to idle), re-enters, dwells → active
      const { state, events } = applyAll([
        move(5, 10, 'btn-1', 1000), // idle → entering
        move(10, 10, 'btn-1', 1050), // movement > tolerance (5 cells) → idle
        move(5, 10, 'btn-1', 1100), // idle → entering (fresh dwell timer at 1100)
        tick(1399), // not yet 300ms from 1100
        tick(1400), // 300ms from 1100 → active
      ]);
      expect(state.phase).toBe('active');
      expect(events).toEqual([{ event: 'hover-enter', regionId: 'btn-1' }]);
    });

    it('exiting → active when cursor re-enters within grace period', () => {
      const { state, events } = applyAll([
        move(5, 10, 'btn-1', 1000), // idle → entering
        tick(1300), // entering → active
        move(50, 50, null, 1400), // active → exiting
        move(5, 10, 'btn-1', 1450), // exiting → active (grace absorbed)
        move(6, 11, 'btn-1', 1500), // active → active (hover-move)
      ]);
      expect(state.phase).toBe('active');
      expect(events).toEqual([
        { event: 'hover-enter', regionId: 'btn-1' },
        { event: 'hover-move', regionId: 'btn-1', x: 6, y: 11 },
      ]);
    });
  });
});
