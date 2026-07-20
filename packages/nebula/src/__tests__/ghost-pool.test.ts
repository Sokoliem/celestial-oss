import { describe, expect, it } from 'vitest';
import { createGhostPool, createPresenceTracker, type LifecycleConfig } from '../ghost-pool.js';

// Minimal VNode and LayoutRect for test fixtures
const makeTextNode = (content: string) => ({ kind: 'text' as const, content });

const makeRect = (x = 0, y = 0, width = 10, height = 3) => ({ x, y, width, height });

const baseConfig: LifecycleConfig = {
  exit: { type: 'fadeOut', duration: 1000 },
};

// --- GhostPool Tests ---

describe('GhostPool', () => {
  it('createGhostPool starts with no ghosts', () => {
    const pool = createGhostPool();
    expect(pool.hasGhosts()).toBe(false);
  });

  it('beginExit adds a ghost (hasGhosts = true)', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    expect(pool.hasGhosts()).toBe(true);
  });

  it('getGhosts returns ghost with progress 0 at start time', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 100, baseConfig);
    const ghosts = pool.getGhosts(100);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.id).toBe('a');
    expect(ghosts[0]!.progress).toBe(0);
  });

  it('getGhosts returns ghost with progress 0.5 at midpoint', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    const ghosts = pool.getGhosts(500);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.progress).toBeCloseTo(0.5);
  });

  it('getGhosts returns ghost with progress 1 at end', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    const ghosts = pool.getGhosts(1000);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.progress).toBe(1);
  });

  it('getGhosts clamps progress to 1 beyond duration', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    const ghosts = pool.getGhosts(2000);
    expect(ghosts[0]!.progress).toBe(1);
  });

  it('getGhosts applies easing function to progress', () => {
    const easedConfig: LifecycleConfig = {
      exit: {
        type: 'fadeOut',
        duration: 1000,
        easing: (t: number) => t * t, // quadratic ease-in
      },
    };
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, easedConfig);
    const ghosts = pool.getGhosts(500);
    // raw progress is 0.5, eased = 0.5^2 = 0.25
    expect(ghosts[0]!.progress).toBeCloseTo(0.25);
  });

  it('getCompleted returns empty when no ghosts completed', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    expect(pool.getCompleted(500)).toEqual([]);
  });

  it('getCompleted returns ID when ghost animation is done', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    const completed = pool.getCompleted(1000);
    expect(completed).toContain('a');
  });

  it('reap removes completed ghosts', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    pool.reap(1000);
    expect(pool.hasGhosts()).toBe(false);
    expect(pool.getGhosts(1000)).toHaveLength(0);
  });

  it('reap keeps in-progress ghosts', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    pool.beginExit('b', makeTextNode('world'), makeRect(), 500, baseConfig);
    pool.reap(1000);
    // 'a' started at 0, duration 1000 -> done at 1000 -> reaped
    // 'b' started at 500, duration 1000 -> done at 1500 -> still active
    expect(pool.hasGhosts()).toBe(true);
    const ghosts = pool.getGhosts(1000);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.id).toBe('b');
  });

  it('multiple ghosts can coexist', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    pool.beginExit('b', makeTextNode('world'), makeRect(5, 5), 0, baseConfig);
    pool.beginExit('c', makeTextNode('!'), makeRect(10, 10), 0, baseConfig);
    const ghosts = pool.getGhosts(0);
    expect(ghosts).toHaveLength(3);
    const ids = ghosts.map((g) => g.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('beginExit with duplicate ID replaces old ghost', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('old'), makeRect(), 0, baseConfig);
    pool.beginExit('a', makeTextNode('new'), makeRect(), 500, baseConfig);
    const ghosts = pool.getGhosts(500);
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]!.id).toBe('a');
    expect(ghosts[0]!.progress).toBe(0); // new ghost just started
    expect(ghosts[0]!.startTime).toBe(500);
  });

  it('reset clears all ghosts', () => {
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, baseConfig);
    pool.beginExit('b', makeTextNode('world'), makeRect(), 0, baseConfig);
    pool.reset();
    expect(pool.hasGhosts()).toBe(false);
    expect(pool.getGhosts(0)).toHaveLength(0);
  });

  it('getGhosts preserves node and rect from beginExit', () => {
    const pool = createGhostPool();
    const node = makeTextNode('hello');
    const rect = makeRect(3, 7, 20, 5);
    pool.beginExit('a', node, rect, 0, baseConfig);
    const ghosts = pool.getGhosts(0);
    expect(ghosts[0]!.node).toBe(node);
    expect(ghosts[0]!.rect).toEqual(rect);
  });

  it('uses exit config duration for ghost duration', () => {
    const config: LifecycleConfig = {
      exit: { type: 'slideOut', duration: 2000 },
    };
    const pool = createGhostPool();
    pool.beginExit('a', makeTextNode('hello'), makeRect(), 0, config);
    const ghosts = pool.getGhosts(1000);
    expect(ghosts[0]!.progress).toBeCloseTo(0.5);
    expect(ghosts[0]!.duration).toBe(2000);
  });
});

// --- PresenceTracker Tests ---

describe('PresenceTracker', () => {
  it('first update: all IDs are entered, none exited', () => {
    const tracker = createPresenceTracker();
    const result = tracker.update(new Set(['a', 'b', 'c']));
    expect(result.entered.sort()).toEqual(['a', 'b', 'c']);
    expect(result.exited).toEqual([]);
  });

  it('second update with same IDs: no enters or exits', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a', 'b']));
    const result = tracker.update(new Set(['a', 'b']));
    expect(result.entered).toEqual([]);
    expect(result.exited).toEqual([]);
  });

  it('ID removed: appears in exited', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a', 'b', 'c']));
    const result = tracker.update(new Set(['a', 'c']));
    expect(result.exited).toEqual(['b']);
    expect(result.entered).toEqual([]);
  });

  it('ID added: appears in entered', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a']));
    const result = tracker.update(new Set(['a', 'b']));
    expect(result.entered).toEqual(['b']);
    expect(result.exited).toEqual([]);
  });

  it('multiple enters and exits in one update', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a', 'b', 'c']));
    const result = tracker.update(new Set(['b', 'd', 'e']));
    expect(result.entered.sort()).toEqual(['d', 'e']);
    expect(result.exited.sort()).toEqual(['a', 'c']);
  });

  it('reset clears previous state', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a', 'b']));
    tracker.reset();
    // After reset, it's as if first call — everything is "entered"
    const result = tracker.update(new Set(['a', 'b']));
    expect(result.entered.sort()).toEqual(['a', 'b']);
    expect(result.exited).toEqual([]);
  });

  it('getPreviousIds returns the last set of IDs', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a', 'b']));
    expect(tracker.getPreviousIds()).toEqual(new Set(['a', 'b']));
  });

  it('getPreviousIds returns empty set before first update', () => {
    const tracker = createPresenceTracker();
    expect(tracker.getPreviousIds()).toEqual(new Set());
  });

  it('getPreviousIds returns empty set after reset', () => {
    const tracker = createPresenceTracker();
    tracker.update(new Set(['a']));
    tracker.reset();
    expect(tracker.getPreviousIds()).toEqual(new Set());
  });
});
