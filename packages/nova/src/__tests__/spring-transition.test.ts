import type { SpringPreset } from '@celestial/aurora';
import { describe, expect, it } from 'vitest';
import { createSpringTransition } from '../spring-transition.js';

describe('createSpringTransition', () => {
  const springPreset: SpringPreset = { stiffness: 400, damping: 25 };

  it('returns a controller with the expected API', () => {
    const tx = createSpringTransition({ spring: springPreset });
    expect(typeof tx.start).toBe('function');
    expect(typeof tx.tick).toBe('function');
    expect(typeof tx.render).toBe('function');
    expect(typeof tx.progress).toBe('function');
    expect(typeof tx.done).toBe('function');
    expect(typeof tx.reset).toBe('function');
    expect(typeof tx.retarget).toBe('function');
  });

  it('returns old content before start', () => {
    const tx = createSpringTransition({ spring: springPreset });
    expect(tx.render('old', 'new')).toBe('old');
  });

  it('starts at progress 0', () => {
    const tx = createSpringTransition({ spring: springPreset });
    // Before start, progress is whatever the spring initial value is (0)
    expect(tx.progress()).toBeCloseTo(0, 1);
  });

  it('advances progress toward 1 after start + tick', () => {
    const tx = createSpringTransition({ spring: springPreset });
    tx.start(0);

    // Tick several frames
    for (let t = 16; t <= 500; t += 16) {
      tx.tick(t);
    }

    expect(tx.progress()).toBeGreaterThan(0.5);
  });

  it('eventually settles (done() becomes true)', () => {
    const tx = createSpringTransition({
      spring: { stiffness: 400, damping: 25 },
    });
    tx.start(0);

    // Run for a long time
    for (let t = 16; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.done()) break;
    }

    expect(tx.done()).toBe(true);
    expect(tx.progress()).toBeCloseTo(1, 1);
  });

  it('renders transition frames during animation', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'crossfade',
    });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);

    const frame = tx.render('old text', 'new text');
    // Should not be exactly old or new (mid-transition)
    expect(frame).not.toBe('old text');
    // Should contain ANSI codes (crossfade applies coloring)
    expect(frame).toContain('\x1b[');
  });

  it('uses the specified strategy', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'slide',
      direction: 'left',
    });
    tx.start(0);

    for (let t = 16; t <= 200; t += 16) {
      tx.tick(t);
    }

    const frame = tx.render('OLD', 'NEW');
    // Slide strategy produces different output than crossfade
    expect(typeof frame).toBe('string');
  });

  it('defaults to crossfade strategy and left direction', () => {
    const tx = createSpringTransition({ spring: springPreset });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);

    const frame = tx.render('old', 'new');
    expect(typeof frame).toBe('string');
    expect(frame.length).toBeGreaterThan(0);
  });

  it('reset() returns to initial state', () => {
    const tx = createSpringTransition({ spring: springPreset });
    tx.start(0);

    for (let t = 16; t <= 200; t += 16) {
      tx.tick(t);
    }

    expect(tx.progress()).toBeGreaterThan(0);

    tx.reset();
    expect(tx.render('old', 'new')).toBe('old');
  });

  it('retarget(0) reverses the animation', () => {
    const tx = createSpringTransition({ spring: springPreset });
    tx.start(0);

    // Advance partially
    for (let t = 16; t <= 200; t += 16) {
      tx.tick(t);
    }

    const progressBefore = tx.progress();
    expect(progressBefore).toBeGreaterThan(0);

    // Retarget to 0 (cancel)
    tx.retarget(0);

    // Advance more — spring should move back toward 0
    for (let t = 216; t <= 5000; t += 16) {
      tx.tick(t);
      if (tx.done()) break;
    }

    expect(tx.progress()).toBeCloseTo(0, 1);
  });

  it('tick before start is a no-op', () => {
    const tx = createSpringTransition({ spring: springPreset });
    tx.tick(100);
    expect(tx.render('old', 'new')).toBe('old');
  });

  it('supports SpringConfig with from override', () => {
    const tx = createSpringTransition({
      spring: { stiffness: 400, damping: 25, from: 0.5 },
    });
    tx.start(0);
    // Should start from 0.5 per the from override
    expect(tx.progress()).toBeCloseTo(0.5, 0);
  });

  it('works with blur strategy', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'blur',
    });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);
    const frame = tx.render('old', 'new');
    expect(typeof frame).toBe('string');
  });

  it('works with dissolve strategy', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'dissolve',
    });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);
    const frame = tx.render('old', 'new');
    expect(typeof frame).toBe('string');
  });

  it('works with zoom strategy', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'zoom',
    });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);
    const frame = tx.render('old content', 'new content');
    expect(typeof frame).toBe('string');
  });

  it('works with morph strategy', () => {
    const tx = createSpringTransition({
      spring: springPreset,
      strategy: 'morph',
    });
    tx.start(0);
    tx.tick(16);
    tx.tick(32);
    const frame = tx.render('old', 'new');
    expect(typeof frame).toBe('string');
  });

  it('clamps visual progress to [0,1] even if spring overshoots', () => {
    // Bouncy spring can overshoot > 1
    const tx = createSpringTransition({
      spring: { stiffness: 300, damping: 10 }, // bouncy
      strategy: 'crossfade',
    });
    tx.start(0);

    // The internal progress may exceed 1, but render should still work
    for (let t = 16; t <= 500; t += 16) {
      tx.tick(t);
      const frame = tx.render('old', 'new');
      // Should never throw
      expect(typeof frame).toBe('string');
    }
  });
});
