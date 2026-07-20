import { describe, expect, it } from 'vitest';
import {
  createScrollPhysicsState,
  getScrollPosition,
  isScrollAnimating,
  type ScrollPhysicsConfig,
  type ScrollPhysicsMsg,
  type ScrollPhysicsState,
  scrollPhysicsUpdate,
} from '../scroll-physics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<ScrollPhysicsConfig>): ScrollPhysicsConfig {
  return {
    maxX: 100,
    maxY: 200,
    ...overrides,
  };
}

function applyMessages(state: ScrollPhysicsState, config: ScrollPhysicsConfig, msgs: ScrollPhysicsMsg[]): ScrollPhysicsState {
  let s = state;
  for (const msg of msgs) {
    s = scrollPhysicsUpdate(msg, s, config);
  }
  return s;
}

// ---------------------------------------------------------------------------
// createScrollPhysicsState
// ---------------------------------------------------------------------------

describe('createScrollPhysicsState', () => {
  it('initializes with zero offset and velocity', () => {
    const config = makeConfig();
    const state = createScrollPhysicsState(config);

    expect(state.x.offset).toBe(0);
    expect(state.x.velocity).toBe(0);
    expect(state.x.isAnimating).toBe(false);
    expect(state.y.offset).toBe(0);
    expect(state.y.velocity).toBe(0);
    expect(state.y.isAnimating).toBe(false);
    expect(state.overscrollX).toBe(0);
    expect(state.overscrollY).toBe(0);
    expect(state.isBouncing).toBe(false);
    expect(state.resolvedAxis).toBeNull();
  });

  it('uses config axis lock', () => {
    const config = makeConfig({ axisLock: 'horizontal' });
    const state = createScrollPhysicsState(config);
    expect(state.axisLock).toBe('horizontal');
  });

  it('defaults axis lock to none', () => {
    const config = makeConfig();
    const state = createScrollPhysicsState(config);
    expect(state.axisLock).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// scrollPhysicsUpdate — scroll-delta
// ---------------------------------------------------------------------------

describe('scrollPhysicsUpdate', () => {
  describe('scroll-delta', () => {
    it('updates offset via applyScrollDelta', () => {
      const config = makeConfig();
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 5, dy: 10, timestamp: 100 }, state, config);

      expect(next.x.offset).toBe(5);
      expect(next.y.offset).toBe(10);
    });

    it('respects axis lock horizontal (zeroes dy)', () => {
      const config = makeConfig({ axisLock: 'horizontal' });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 5, dy: 10, timestamp: 100 }, state, config);

      expect(next.x.offset).toBe(5);
      // Y should remain unchanged since dy is zeroed out
      expect(next.y.offset).toBe(0);
    });

    it('respects axis lock vertical (zeroes dx)', () => {
      const config = makeConfig({ axisLock: 'vertical' });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 5, dy: 10, timestamp: 100 }, state, config);

      expect(next.x.offset).toBe(0);
      expect(next.y.offset).toBe(10);
    });

    it('auto-resolves axis on first significant delta', () => {
      const config = makeConfig({ axisLock: 'auto' });
      const state = createScrollPhysicsState(config);

      // |dx| > |dy| → should resolve to horizontal
      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 10, dy: 2, timestamp: 100 }, state, config);

      expect(next.resolvedAxis).toBe('horizontal');
      expect(next.x.offset).toBe(10);
      // dy should be zeroed after resolving horizontal
      expect(next.y.offset).toBe(0);
    });

    it('auto-resolves axis to vertical when |dy| >= |dx|', () => {
      const config = makeConfig({ axisLock: 'auto' });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 2, dy: 10, timestamp: 100 }, state, config);

      expect(next.resolvedAxis).toBe('vertical');
      expect(next.x.offset).toBe(0);
      expect(next.y.offset).toBe(10);
    });

    it('preserves resolved axis on subsequent deltas', () => {
      const config = makeConfig({ axisLock: 'auto' });
      let state = createScrollPhysicsState(config);

      // First delta resolves to horizontal
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 10, dy: 2, timestamp: 100 }, state, config);
      expect(state.resolvedAxis).toBe('horizontal');

      // Second delta — dy is larger but axis is already resolved
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 1, dy: 20, timestamp: 200 }, state, config);
      expect(state.resolvedAxis).toBe('horizontal');
      expect(state.y.offset).toBe(0);
    });

    it('computes elastic overscroll at boundary', () => {
      const config = makeConfig({
        maxY: 50,
        overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
      });
      const state = createScrollPhysicsState(config);

      // Scroll past the max boundary — push 80 into a maxY of 50
      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 80, timestamp: 100 }, state, config);

      // Offset should be clamped at maxY (50)
      expect(next.y.offset).toBe(50);
      // Overscroll should be (80 - 50) * 0.5 = 15
      expect(next.overscrollY).toBe(15);
    });

    it('caps overscroll at maxOverscroll', () => {
      const config = makeConfig({
        maxY: 10,
        overscroll: { elasticity: 1.0, maxOverscroll: 5, bounceBackMs: 200 },
      });
      const state = createScrollPhysicsState(config);

      // Scroll way past boundary: excess = 100 - 10 = 90, elastic = 90 * 1.0 = 90 → capped at 5
      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 100, timestamp: 100 }, state, config);

      expect(next.y.offset).toBe(10);
      expect(next.overscrollY).toBe(5);
    });

    it('computes negative overscroll at lower boundary', () => {
      const config = makeConfig({
        maxY: 100,
        overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
      });
      const state = createScrollPhysicsState(config);

      // Scroll negative past 0
      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: -30, timestamp: 100 }, state, config);

      // Offset should be clamped at 0
      expect(next.y.offset).toBe(0);
      // Overscroll should be negative: -30 * 0.5 = -15
      expect(next.overscrollY).toBe(-15);
    });

    it('does not produce overscroll when config has no overscroll', () => {
      const config = makeConfig({ maxY: 10 });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 50, timestamp: 100 }, state, config);

      expect(next.y.offset).toBe(10);
      expect(next.overscrollY).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // scroll-tick
  // -------------------------------------------------------------------------

  describe('scroll-tick', () => {
    it('decelerates via tickMomentum', () => {
      const config = makeConfig({ friction: 0.5 });
      let state = createScrollPhysicsState(config);

      // Give it some velocity via fling
      state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 0, vy: 10 }, state, config);
      expect(state.y.velocity).toBe(10);

      // Tick should apply friction
      const next = scrollPhysicsUpdate({ type: 'scroll-tick' }, state, config);
      expect(next.y.velocity).toBe(5); // 10 * 0.5
    });

    it('stops animating when velocity below threshold', () => {
      const config = makeConfig({ friction: 0.1 });
      let state = createScrollPhysicsState(config);

      // Small velocity via fling
      state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 0, vy: 1 }, state, config);

      // Tick should reduce below threshold and stop
      const next = scrollPhysicsUpdate({ type: 'scroll-tick' }, state, config);
      // 1 * 0.1 = 0.1 which is < 0.5 threshold in tickMomentum
      expect(next.y.isAnimating).toBe(false);
      expect(next.y.velocity).toBe(0);
    });

    it('bounces back overscroll toward zero', () => {
      const config = makeConfig({
        maxY: 50,
        overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
      });
      let state = createScrollPhysicsState(config);

      // Create overscroll by scrolling past boundary
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 80, timestamp: 100 }, state, config);
      const initialOverscroll = state.overscrollY;
      expect(initialOverscroll).toBeGreaterThan(0);

      // Tick should begin bouncing back
      const next = scrollPhysicsUpdate({ type: 'scroll-tick' }, state, config);
      expect(Math.abs(next.overscrollY)).toBeLessThan(Math.abs(initialOverscroll));
      expect(next.isBouncing).toBe(true);
    });

    it('sets isBouncing to false when overscroll reaches zero', () => {
      const config = makeConfig({
        maxY: 50,
        overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
      });
      let state = createScrollPhysicsState(config);

      // Manually create a state with very small overscroll that will snap to zero
      state = {
        ...state,
        overscrollY: 0.01,
        isBouncing: true,
      };

      const next = scrollPhysicsUpdate({ type: 'scroll-tick' }, state, config);
      expect(next.overscrollY).toBe(0);
      expect(next.isBouncing).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // scroll-fling
  // -------------------------------------------------------------------------

  describe('scroll-fling', () => {
    it('sets velocity and marks animating', () => {
      const config = makeConfig();
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 5, vy: -10 }, state, config);

      expect(next.x.velocity).toBe(5);
      expect(next.x.isAnimating).toBe(true);
      expect(next.y.velocity).toBe(-10);
      expect(next.y.isAnimating).toBe(true);
    });

    it('resets lastTimestamp so subsequent scroll-delta uses default dt', () => {
      const config = makeConfig();
      let state = createScrollPhysicsState(config);

      // First scroll-delta to set lastTimestamp
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 10, timestamp: 100 }, state, config);
      expect(state.y.lastTimestamp).toBe(100);

      // Fling should reset lastTimestamp to 0
      state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 0, vy: 20 }, state, config);
      expect(state.y.lastTimestamp).toBe(0);

      // Subsequent scroll-delta should use default dt (not stale timestamp)
      const next = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 5, timestamp: 5000 }, state, config);
      // Should not produce a wild velocity from stale dt
      expect(Math.abs(next.y.velocity)).toBeLessThan(100);
    });

    it('does not mark animating when velocity is zero', () => {
      const config = makeConfig();
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 0, vy: 0 }, state, config);

      expect(next.x.isAnimating).toBe(false);
      expect(next.y.isAnimating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // scroll-snap
  // -------------------------------------------------------------------------

  describe('scroll-snap', () => {
    it('snaps to nearest point on each axis', () => {
      const config = makeConfig({
        snapPointsX: [{ offset: 0 }, { offset: 25 }, { offset: 50 }],
        snapPointsY: [{ offset: 0 }, { offset: 100 }, { offset: 200 }],
      });
      let state = createScrollPhysicsState(config);

      // Move to some arbitrary position
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 30, dy: 80, timestamp: 100 }, state, config);

      // Snap
      const next = scrollPhysicsUpdate({ type: 'scroll-snap' }, state, config);

      // Nearest to 30 is 25, nearest to 80 is 100
      expect(next.x.offset).toBe(25);
      expect(next.y.offset).toBe(100);
    });

    it('zeroes velocity after snap', () => {
      const config = makeConfig({
        snapPointsX: [{ offset: 0 }, { offset: 50 }],
        snapPointsY: [{ offset: 0 }, { offset: 100 }],
      });
      let state = createScrollPhysicsState(config);

      // Give it velocity and position
      state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 20, vy: 30 }, state, config);

      const next = scrollPhysicsUpdate({ type: 'scroll-snap' }, state, config);

      expect(next.x.velocity).toBe(0);
      expect(next.x.isAnimating).toBe(false);
      expect(next.y.velocity).toBe(0);
      expect(next.y.isAnimating).toBe(false);
    });

    it('leaves position unchanged when no snap points', () => {
      const config = makeConfig();
      let state = createScrollPhysicsState(config);

      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 42, dy: 77, timestamp: 100 }, state, config);

      const next = scrollPhysicsUpdate({ type: 'scroll-snap' }, state, config);

      expect(next.x.offset).toBe(state.x.offset);
      expect(next.y.offset).toBe(state.y.offset);
    });
  });

  // -------------------------------------------------------------------------
  // scroll-to
  // -------------------------------------------------------------------------

  describe('scroll-to', () => {
    it('jumps to target position', () => {
      const config = makeConfig({ maxX: 100, maxY: 200 });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-to', x: 50, y: 150 }, state, config);

      expect(next.x.offset).toBe(50);
      expect(next.y.offset).toBe(150);
    });

    it('clamps to max bounds', () => {
      const config = makeConfig({ maxX: 100, maxY: 200 });
      const state = createScrollPhysicsState(config);

      const next = scrollPhysicsUpdate({ type: 'scroll-to', x: 999, y: 999 }, state, config);

      expect(next.x.offset).toBe(100);
      expect(next.y.offset).toBe(200);
    });

    it('clears overscroll', () => {
      const config = makeConfig({
        maxY: 50,
        overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
      });
      let state = createScrollPhysicsState(config);

      // Create overscroll
      state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 0, dy: 80, timestamp: 100 }, state, config);
      expect(state.overscrollY).toBeGreaterThan(0);

      // scroll-to should clear it
      const next = scrollPhysicsUpdate({ type: 'scroll-to', x: 0, y: 25 }, state, config);
      expect(next.overscrollX).toBe(0);
      expect(next.overscrollY).toBe(0);
    });

    it('zeroes velocity', () => {
      const config = makeConfig();
      let state = createScrollPhysicsState(config);

      // Add velocity
      state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 20, vy: 30 }, state, config);

      const next = scrollPhysicsUpdate({ type: 'scroll-to', x: 10, y: 10 }, state, config);

      expect(next.x.velocity).toBe(0);
      expect(next.x.isAnimating).toBe(false);
      expect(next.y.velocity).toBe(0);
      expect(next.y.isAnimating).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // scroll-reset
  // -------------------------------------------------------------------------

  describe('scroll-reset', () => {
    it('returns to initial state', () => {
      const config = makeConfig({ axisLock: 'vertical' });
      let state = createScrollPhysicsState(config);

      // Modify state extensively
      state = applyMessages(state, config, [
        { type: 'scroll-delta', dx: 10, dy: 50, timestamp: 100 },
        { type: 'scroll-fling', vx: 5, vy: 10 },
      ]);

      const reset = scrollPhysicsUpdate({ type: 'scroll-reset' }, state, config);

      expect(reset.x.offset).toBe(0);
      expect(reset.x.velocity).toBe(0);
      expect(reset.y.offset).toBe(0);
      expect(reset.y.velocity).toBe(0);
      expect(reset.overscrollX).toBe(0);
      expect(reset.overscrollY).toBe(0);
      expect(reset.isBouncing).toBe(false);
      expect(reset.resolvedAxis).toBeNull();
      expect(reset.axisLock).toBe('vertical');
    });
  });
});

// ---------------------------------------------------------------------------
// isScrollAnimating
// ---------------------------------------------------------------------------

describe('isScrollAnimating', () => {
  it('returns true when either axis animating', () => {
    const config = makeConfig();
    let state = createScrollPhysicsState(config);

    state = scrollPhysicsUpdate({ type: 'scroll-fling', vx: 10, vy: 0 }, state, config);

    expect(isScrollAnimating(state)).toBe(true);
  });

  it('returns true when bouncing', () => {
    const config = makeConfig();
    const state: ScrollPhysicsState = {
      ...createScrollPhysicsState(config),
      isBouncing: true,
    };

    expect(isScrollAnimating(state)).toBe(true);
  });

  it('returns false when idle', () => {
    const config = makeConfig();
    const state = createScrollPhysicsState(config);

    expect(isScrollAnimating(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getScrollPosition
// ---------------------------------------------------------------------------

describe('getScrollPosition', () => {
  it('returns offset plus overscroll', () => {
    const config = makeConfig({
      maxY: 50,
      overscroll: { elasticity: 0.5, maxOverscroll: 20, bounceBackMs: 200 },
    });
    let state = createScrollPhysicsState(config);

    // Scroll to create some offset and overscroll
    state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 10, dy: 80, timestamp: 100 }, state, config);

    const pos = getScrollPosition(state);
    expect(pos.x).toBe(state.x.offset + state.overscrollX);
    expect(pos.y).toBe(state.y.offset + state.overscrollY);
  });

  it('returns pure offset when no overscroll', () => {
    const config = makeConfig();
    let state = createScrollPhysicsState(config);

    state = scrollPhysicsUpdate({ type: 'scroll-delta', dx: 10, dy: 20, timestamp: 100 }, state, config);

    const pos = getScrollPosition(state);
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(20);
  });
});
