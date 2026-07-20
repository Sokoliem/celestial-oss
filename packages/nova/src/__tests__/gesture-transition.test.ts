import { describe, expect, it } from 'vitest';
import { createGestureTransition } from '../gesture-transition.js';

describe('createGestureTransition', () => {
  it('returns a controller with the expected API', () => {
    const tx = createGestureTransition();
    expect(typeof tx.phase).toBe('function');
    expect(typeof tx.dragStart).toBe('function');
    expect(typeof tx.drag).toBe('function');
    expect(typeof tx.release).toBe('function');
    expect(typeof tx.tick).toBe('function');
    expect(typeof tx.render).toBe('function');
    expect(typeof tx.progress).toBe('function');
    expect(typeof tx.done).toBe('function');
    expect(typeof tx.committed).toBe('function');
    expect(typeof tx.reset).toBe('function');
  });

  it('starts in idle phase', () => {
    const tx = createGestureTransition();
    expect(tx.phase()).toBe('idle');
  });

  it('transitions to dragging phase on dragStart', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    expect(tx.phase()).toBe('dragging');
  });

  it('updates progress during drag', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(50, 100); // 50% progress
    expect(tx.progress()).toBeCloseTo(0.5, 2);
  });

  it('clamps drag progress to [0, 1]', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(150, 100); // > 100% — should clamp
    expect(tx.progress()).toBe(1);
    tx.drag(-50, 100); // negative — abs -> 0.5
    expect(tx.progress()).toBeCloseTo(0.5, 2);
  });

  it('ignores drag when not in dragging phase', () => {
    const tx = createGestureTransition();
    tx.drag(50, 100);
    expect(tx.progress()).toBe(0);
  });

  it('commits when progress exceeds threshold on release', () => {
    const tx = createGestureTransition({ commitThreshold: 0.4 });
    tx.dragStart();
    tx.drag(50, 100); // 50% > 40% threshold
    tx.release(0); // zero velocity

    expect(tx.phase()).toBe('settling');

    // Settle the spring
    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(tx.phase()).toBe('idle');
    expect(tx.committed()).toBe(true);
    expect(tx.progress()).toBe(1);
  });

  it('cancels when progress is below threshold on release', () => {
    const tx = createGestureTransition({ commitThreshold: 0.4 });
    tx.dragStart();
    tx.drag(20, 100); // 20% < 40% threshold
    tx.release(0);

    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(tx.committed()).toBe(false);
    expect(tx.progress()).toBe(0);
  });

  it('commits on high velocity even with low progress', () => {
    const tx = createGestureTransition({
      commitThreshold: 0.4,
      velocityThreshold: 0.3,
    });
    tx.dragStart();
    tx.drag(10, 100); // Only 10% progress
    tx.release(0.5); // High velocity (> 0.3 threshold)

    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(tx.committed()).toBe(true);
    expect(tx.progress()).toBe(1);
  });

  it('fires onCommit callback', () => {
    let committed = false;
    const tx = createGestureTransition({
      commitThreshold: 0.3,
      onCommit: () => {
        committed = true;
      },
    });
    tx.dragStart();
    tx.drag(50, 100);
    tx.release(0);

    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(committed).toBe(true);
  });

  it('fires onCancel callback', () => {
    let cancelled = false;
    const tx = createGestureTransition({
      commitThreshold: 0.5,
      onCancel: () => {
        cancelled = true;
      },
    });
    tx.dragStart();
    tx.drag(10, 100); // 10% < 50%
    tx.release(0);

    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(cancelled).toBe(true);
  });

  it('renders old content when idle at progress 0', () => {
    const tx = createGestureTransition();
    expect(tx.render('old', 'new')).toBe('old');
  });

  it('renders new content when idle at progress 1 (after commit)', () => {
    const tx = createGestureTransition({ commitThreshold: 0.3 });
    tx.dragStart();
    tx.drag(80, 100);
    tx.release(0);

    for (let t = 0; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.phase() === 'idle') break;
    }

    expect(tx.render('old', 'new')).toBe('new');
  });

  it('renders transition frames during drag', () => {
    const tx = createGestureTransition({ strategy: 'crossfade' });
    tx.dragStart();
    tx.drag(50, 100);

    const frame = tx.render('old text', 'new text');
    expect(frame).toContain('\x1b[');
  });

  it('defaults to slide strategy', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(50, 100);

    const frame = tx.render('OLD', 'NEW');
    expect(typeof frame).toBe('string');
  });

  it('supports all strategies', () => {
    const strategies = ['slide', 'crossfade', 'wipe', 'morph', 'blur', 'dissolve', 'zoom'] as const;

    for (const strategy of strategies) {
      const tx = createGestureTransition({ strategy });
      tx.dragStart();
      tx.drag(50, 100);
      const frame = tx.render('old content', 'new content');
      expect(typeof frame).toBe('string');
    }
  });

  it('reset() returns to idle', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(50, 100);

    tx.reset();
    expect(tx.phase()).toBe('idle');
    expect(tx.progress()).toBe(0);
    expect(tx.committed()).toBe(false);
  });

  it('done() is true when idle with no spring', () => {
    const tx = createGestureTransition();
    expect(tx.done()).toBe(true);
  });

  it('done() is false during settling', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(50, 100);
    tx.release(0);
    expect(tx.done()).toBe(false);
  });

  it('ignores release when not dragging', () => {
    const tx = createGestureTransition();
    tx.release(0.5);
    expect(tx.phase()).toBe('idle');
  });

  it('ignores tick when not settling', () => {
    const tx = createGestureTransition();
    tx.tick(100);
    expect(tx.phase()).toBe('idle');
    expect(tx.progress()).toBe(0);
  });

  it('handles drag with total <= 0', () => {
    const tx = createGestureTransition();
    tx.dragStart();
    tx.drag(50, 0);
    expect(tx.progress()).toBe(0);
    tx.drag(50, -10);
    expect(tx.progress()).toBe(0);
  });

  it('can re-grab during settle (dragStart resets settle)', () => {
    const tx = createGestureTransition({ commitThreshold: 0.3 });
    tx.dragStart();
    tx.drag(50, 100);
    tx.release(0);

    // Start settling
    tx.tick(0);
    tx.tick(16);
    expect(tx.phase()).toBe('settling');

    // Re-grab!
    tx.dragStart();
    expect(tx.phase()).toBe('dragging');
    // Progress is preserved (not reset)
    expect(tx.progress()).toBeGreaterThan(0);
  });
});
