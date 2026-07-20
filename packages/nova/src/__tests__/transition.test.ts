import { beforeEach, describe, expect, it } from 'vitest';
import { resetTransitionState, transition } from '../transition.js';

describe('transition', () => {
  beforeEach(() => {
    // Clear all transition state between tests
    resetTransitionState();
  });

  it('with no key change returns content as-is', () => {
    const content = 'hello world';
    // First call establishes the key
    transition(content, { key: 'a', tick: 0 });
    // Second call with same key: no transition
    const result = transition(content, { key: 'a', tick: 1 });
    expect(result).toBe(content);
  });

  it('with key change starts animation', () => {
    const old = 'old content';
    const new_ = 'new content';

    // Establish initial state
    transition(old, { key: 'a', tick: 0 });
    // Change key to trigger transition
    const result = transition(new_, { key: 'b', tick: 1 });
    // Should be in transition (not the raw new content yet, since progress < 1)
    // The result should be a transitioning frame
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('at progress 0 shows old content (start of transition)', () => {
    transition('old', { key: 'a', tick: 0 });
    // Same tick as key change => progress = 0
    const result = transition('new', { key: 'b', tick: 0 });
    // At progress 0, crossfade returns old content
    expect(result).toContain('old');
  });

  it('at progress >= 1 shows new content (transition complete)', () => {
    transition('old', { key: 'a', tick: 0 });
    // Transition starts at tick 1, duration is 6, so tick 7 means progress = 6/6 = 1
    transition('new', { key: 'b', tick: 1 });
    const result = transition('new', { key: 'b', tick: 7 });
    expect(result).toBe('new');
  });

  it('completes and returns new content after duration ticks', () => {
    transition('old', { key: 'a', tick: 0 });
    transition('new', { key: 'b', tick: 10 });
    // Default duration is 6, so at tick 16 it should be complete
    const result = transition('new', { key: 'b', tick: 16 });
    expect(result).toBe('new');
  });

  it('supports slide type', () => {
    transition('AAAA', { key: 'a', tick: 0, type: 'slide', direction: 'left' });
    const result = transition('BBBB', { key: 'b', tick: 1, type: 'slide', direction: 'left' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('supports crossfade type', () => {
    transition('old', { key: 'a', tick: 0, type: 'crossfade' });
    const result = transition('new', { key: 'b', tick: 1, type: 'crossfade' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('supports wipe type', () => {
    transition('old\nold', { key: 'a', tick: 0, type: 'wipe', direction: 'down' });
    const result = transition('new\nnew', { key: 'b', tick: 1, type: 'wipe', direction: 'down' });
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('default type is crossfade', () => {
    transition('old', { key: 'a', tick: 0 });
    // Trigger transition at tick 1, then advance to tick 3 for visible fade
    transition('new', { key: 'b', tick: 1 });
    const result = transition('new', { key: 'b', tick: 3 });
    // Crossfade mid-progress: should have true color fade
    expect(result).toContain('\x1b[38;2;');
  });

  it('default duration is 6', () => {
    transition('old', { key: 'a', tick: 0 });
    transition('new', { key: 'b', tick: 10 });
    // At tick 13, progress = (13-10)/6 = 0.5, still in transition
    // Crossfade at 0.5 shows dimmed new content (not raw 'new')
    const midResult = transition('new', { key: 'b', tick: 13 });
    expect(midResult).not.toBe('new'); // still transitioning (dimmed)

    // At tick 16, progress = (16-10)/6 = 1.0, transition complete
    const doneResult = transition('new', { key: 'b', tick: 16 });
    expect(doneResult).toBe('new');
  });

  it('custom duration changes transition length', () => {
    transition('old', { key: 'a', tick: 0, duration: 3 });
    transition('new', { key: 'b', tick: 10, duration: 3 });
    // At tick 13, progress = (13-10)/3 = 1.0, should be complete
    const result = transition('new', { key: 'b', tick: 13, duration: 3 });
    expect(result).toBe('new');
  });

  it('multiple independent transitions do not interfere', () => {
    // First transition with key 'a' -> 'b'
    transition('old1', { key: 'a', tick: 0 });
    transition('new1', { key: 'b', tick: 1 });

    // Second transition (different key namespace) - uses different initial key
    transition('old2', { key: 'x', tick: 0 });
    transition('new2', { key: 'y', tick: 1 });

    // Completing the first shouldn't affect the second
    const result1 = transition('new1', { key: 'b', tick: 7 });
    // eslint-disable-next-line no-control-regex
    const plain = result1.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toBe('new1');
  });
});

describe('transition with id (multi-slot concurrent transitions)', () => {
  beforeEach(() => {
    resetTransitionState();
  });

  it('two slots with same key values do not collide when using id', () => {
    // Slot 1: key 'a' -> 'b'
    transition('slot1-old', { key: 'a', id: 'slot1', tick: 0 });
    transition('slot1-new', { key: 'b', id: 'slot1', tick: 1 });

    // Slot 2: key 'a' -> 'b' (same keys, different slot)
    transition('slot2-old', { key: 'a', id: 'slot2', tick: 0 });
    transition('slot2-new', { key: 'b', id: 'slot2', tick: 1 });

    // Complete slot 1 transition
    const result1 = transition('slot1-new', { key: 'b', id: 'slot1', tick: 7 });
    expect(result1).toBe('slot1-new');

    // Slot 2 should still be in transition at tick 4
    const result2 = transition('slot2-new', { key: 'b', id: 'slot2', tick: 4 });
    expect(result2).not.toBe('slot2-new'); // still transitioning

    // Complete slot 2
    const result2Done = transition('slot2-new', { key: 'b', id: 'slot2', tick: 7 });
    expect(result2Done).toBe('slot2-new');
  });

  it('id-based slot persists across key changes without scanning', () => {
    // Establish slot with id
    transition('content-a', { key: 'a', id: 'myslot', tick: 0 });

    // Change key within the same slot
    transition('content-b', { key: 'b', id: 'myslot', tick: 5 });

    // Mid-transition: should be transitioning
    const mid = transition('content-b', { key: 'b', id: 'myslot', tick: 8 });
    expect(mid).not.toBe('content-b'); // still in transition (5 + 6 = 11 for complete)

    // Complete
    const done = transition('content-b', { key: 'b', id: 'myslot', tick: 11 });
    expect(done).toBe('content-b');
  });

  it('same id with no key change returns content as-is', () => {
    transition('hello', { key: 'a', id: 'slot', tick: 0 });
    const result = transition('hello', { key: 'a', id: 'slot', tick: 5 });
    expect(result).toBe('hello');
  });

  it('three concurrent slots with overlapping keys remain independent', () => {
    // All three slots use key 'x' initially
    transition('A', { key: 'x', id: 'alpha', tick: 0 });
    transition('B', { key: 'x', id: 'beta', tick: 0 });
    transition('C', { key: 'x', id: 'gamma', tick: 0 });

    // All three transition to key 'y' at different times
    transition('A2', { key: 'y', id: 'alpha', tick: 2 });
    transition('B2', { key: 'y', id: 'beta', tick: 4 });
    transition('C2', { key: 'y', id: 'gamma', tick: 6 });

    // Alpha completes first (started at 2, duration 6, done at 8)
    const alphaResult = transition('A2', { key: 'y', id: 'alpha', tick: 8 });
    expect(alphaResult).toBe('A2');

    // Beta still in transition at tick 8 (started at 4, done at 10)
    const betaResult = transition('B2', { key: 'y', id: 'beta', tick: 8 });
    expect(betaResult).not.toBe('B2');

    // Gamma still in transition at tick 8 (started at 6, done at 12)
    const gammaResult = transition('C2', { key: 'y', id: 'gamma', tick: 8 });
    expect(gammaResult).not.toBe('C2');

    // All complete eventually
    expect(transition('B2', { key: 'y', id: 'beta', tick: 10 })).toBe('B2');
    expect(transition('C2', { key: 'y', id: 'gamma', tick: 12 })).toBe('C2');
  });

  it('without id falls back to key-based lookup (backwards compatible)', () => {
    // This is the legacy behavior: no id provided
    transition('old', { key: 'a', tick: 0 });
    transition('new', { key: 'b', tick: 1 });
    const result = transition('new', { key: 'b', tick: 7 });
    expect(result).toBe('new');
  });
});

describe('mid-transition key change', () => {
  beforeEach(() => {
    resetTransitionState();
  });

  it('restarts transition when key changes during active transition', () => {
    // Establish initial state
    transition('content-a', { key: 'a', id: 'slot', tick: 0 });

    // Start transition a -> b
    transition('content-b', { key: 'b', id: 'slot', tick: 10 });

    // Mid-transition (tick 13, progress = 3/6 = 0.5), change key to 'c'
    const midFrame = transition('content-c', { key: 'c', id: 'slot', tick: 13 });

    // Should be a transitioning frame (not raw content-c)
    expect(midFrame).toBeDefined();
    expect(typeof midFrame).toBe('string');

    // The transition should restart from the captured frame, so it needs
    // another full duration from tick 13 to complete
    // At tick 19 (13 + 6), the transition from captured frame -> content-c completes
    const doneResult = transition('content-c', { key: 'c', id: 'slot', tick: 19 });
    expect(doneResult).toBe('content-c');
  });

  it('captured frame becomes new previousContent on mid-transition change', () => {
    // Use crossfade for predictable behavior
    transition('old', { key: 'a', id: 'slot', tick: 0, type: 'crossfade' });

    // Start transition a -> b at tick 10
    transition('new', { key: 'b', id: 'slot', tick: 10, type: 'crossfade' });

    // At tick 10, progress is 0/6 = 0, crossfade shows dimmed old content
    // Change key at tick 10 to 'c'
    transition('newest', { key: 'c', id: 'slot', tick: 10, type: 'crossfade' });

    // The transition just started (progress=0), so it returns the captured
    // frame as raw content. Advance a tick to see the fade.
    const frame2 = transition('newest', { key: 'c', id: 'slot', tick: 12, type: 'crossfade' });
    // Now should have true color faded content
    expect(frame2).toContain('\x1b[38;2;'); // true color faded content
  });

  it('multiple rapid key changes each restart the transition', () => {
    transition('A', { key: 1, id: 'rapid', tick: 0, duration: 10 });

    // Start 1 -> 2
    transition('B', { key: 2, id: 'rapid', tick: 5, duration: 10 });

    // Mid-transition, change to 3
    transition('C', { key: 3, id: 'rapid', tick: 8, duration: 10 });

    // Mid-transition again, change to 4
    transition('D', { key: 4, id: 'rapid', tick: 11, duration: 10 });

    // The last transition started at tick 11 with duration 10
    // It should complete at tick 21
    const stillActive = transition('D', { key: 4, id: 'rapid', tick: 18, duration: 10 });
    expect(stillActive).not.toBe('D'); // still transitioning

    const done = transition('D', { key: 4, id: 'rapid', tick: 21, duration: 10 });
    expect(done).toBe('D');
  });

  it('mid-transition key change works without id (backwards compatible)', () => {
    transition('old', { key: 'a', tick: 0 });

    // Start transition a -> b
    transition('mid', { key: 'b', tick: 5 });

    // Change to 'c' mid-transition (at tick 8, progress = 3/6 = 0.5)
    const frame = transition('final', { key: 'c', tick: 8 });
    expect(frame).toBeDefined();
    expect(typeof frame).toBe('string');
    // The frame should be a transition frame, not the raw final content
    expect(frame).not.toBe('final');

    // Should complete after full duration from restart point (tick 8 + 6 = 14)
    const done = transition('final', { key: 'c', tick: 14 });
    expect(done).toBe('final');
  });

  it('transition completes normally when key does not change mid-transition', () => {
    // Verify the fix doesn't break normal transitions
    transition('old', { key: 'a', id: 'normal', tick: 0 });
    transition('new', { key: 'b', id: 'normal', tick: 10 });

    // Progress through the transition normally
    const mid = transition('new', { key: 'b', id: 'normal', tick: 13 });
    expect(mid).not.toBe('new'); // still in transition

    const done = transition('new', { key: 'b', id: 'normal', tick: 16 });
    expect(done).toBe('new');

    // After completion, same key returns content as-is
    const after = transition('new', { key: 'b', id: 'normal', tick: 20 });
    expect(after).toBe('new');
  });
});

describe('stateMap memory leak regression', () => {
  beforeEach(() => {
    resetTransitionState();
  });

  it('should clean up stateMap entries after transition completes', () => {
    // Regression: completed transitions stay in stateMap forever with active: false.
    // After a transition completes (progress >= 1), the entry should be deleted.

    // Run many transitions to completion — if entries accumulate, it's a leak.
    for (let i = 0; i < 100; i++) {
      const id = `leak-test-${i}`;
      // Establish initial state
      transition('old', { key: 'a', id, tick: 0 });
      // Start transition
      transition('new', { key: 'b', id, tick: 1 });
      // Complete transition (default duration=6, so tick 7 => progress=1)
      const result = transition('new', { key: 'b', id, tick: 7 });
      expect(result).toBe('new');
    }

    // After all transitions complete, we need a way to check the map size.
    // Since resetTransitionState() clears the map, we can at least verify
    // that running 100 transitions and completing them doesn't break anything.
    // The actual verification is that completed entries get deleted.
    // We'll do one more transition with a previously used id to verify
    // that no stale state interferes.
    const freshResult = transition('fresh', { key: 'x', id: 'leak-test-0', tick: 100 });
    // If the old entry was properly cleaned up, this should be returned as-is
    // (first call for this slot = no transition)
    expect(freshResult).toBe('fresh');
  });
});
