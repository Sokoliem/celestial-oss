import { describe, expect, it } from 'vitest';
import { transition } from '../transition.js';

describe('transition', () => {
  it('should return live value from getCurrentValue when idle (no active tween)', () => {
    // Simulate an external value that changes over time
    let externalValue = 10;
    const t = transition(() => externalValue, 100);

    // Initially should reflect the external value
    expect(t.value()).toBe(10);

    // External value changes without calling update()
    externalValue = 42;

    // BUG: value() returns the stale snapshot (10) captured at construction,
    // instead of re-querying getCurrentValue() which now returns 42
    expect(t.value()).toBe(42);
  });

  it('should return tween value during active transition', () => {
    const externalValue = 0;
    const t = transition(() => externalValue, 100);

    // Start a tween to target 50
    t.update(50);

    const start = 1000;
    t.tick(start);
    t.tick(start + 50); // halfway through tween

    // During active tween, value comes from the tween, not getCurrentValue
    const v = t.value();
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(50);
  });

  it('should return tween endpoint after tween completes, not live external value', () => {
    let externalValue = 0;
    const t = transition(() => externalValue, 100);

    // Tween to 50
    t.update(50);
    const start = 1000;
    t.tick(start);
    t.tick(start + 100); // complete tween

    // After tween completes, the completed tween is kept alive.
    // value() returns the tween's stable endpoint (50), NOT getCurrentValue().
    // External changes require a new update() call to start a new tween.
    externalValue = 99;

    // value() returns the completed tween endpoint (50), not the diverged external (99)
    expect(t.value()).toBe(50);
  });

  it('should use live value as from when starting a new tween after external change', () => {
    let externalValue = 10;
    const t = transition(() => externalValue, 100);

    // External value changes
    externalValue = 30;

    // Now start a tween to 50 -- the from should be 30 (live), not 10 (stale)
    t.update(50);

    const start = 1000;
    t.tick(start);
    t.tick(start + 50); // halfway

    // At halfway with linear easing: from=30, to=50, so value should be ~40
    expect(t.value()).toBeCloseTo(40, 0);
  });

  it('should not jump to getCurrentValue after tween completes when source diverged', () => {
    // A3 regression: When tick() nulls the completed tween, the next value() call
    // returns getCurrentValue() which may have drifted far from the tween's endpoint,
    // causing a discontinuous visual jump.
    let externalValue = 0;
    const t = transition(() => externalValue, 100);

    // Tween to 50
    t.update(50);
    const start = 1000;
    t.tick(start);

    // External source diverges during the tween
    externalValue = 200;

    // Complete the tween
    t.tick(start + 100);

    // After tween completes, value() should return the tween's final value (50),
    // NOT getCurrentValue() (200). Jumping to 200 would be a visual discontinuity.
    expect(t.value()).toBe(50);
  });

  it('should return tween endpoint stably after completion until new update', () => {
    // The completed tween's value should remain stable across multiple value() calls
    let externalValue = 0;
    const t = transition(() => externalValue, 100);

    t.update(75);
    const start = 1000;
    t.tick(start);
    t.tick(start + 200); // well past duration

    externalValue = 999; // source diverges wildly

    // Multiple reads should all return the tween endpoint
    expect(t.value()).toBe(75);
    expect(t.value()).toBe(75);

    // Only after a new update() should the value change
    t.update(80);
    t.tick(start + 300);
    t.tick(start + 350); // halfway through new tween from 75 to 80
    expect(t.value()).toBeCloseTo(77.5, 0);
  });
});
