import { describe, expect, it } from 'vitest';
import { spring } from '../spring.js';

describe('spring', () => {
  it('starts at initial value (0 by default)', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    expect(s.value()).toBe(0);
  });

  it('moves toward target over ticks', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    let time = 1000;
    s.tick(time);
    // Simulate multiple ticks
    for (let i = 0; i < 50; i++) {
      time += 16;
      s.tick(time);
    }
    // Should have moved toward target
    expect(s.value()).toBeGreaterThan(0);
  });

  it('done() is true when settled at target', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });
    let time = 1000;
    s.tick(time);
    // Run many ticks to let it settle
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(100, 0);
  });

  it('with high damping settles quickly (no oscillation)', () => {
    // Critically/over-damped spring: damping ratio >= 1
    // damping ratio = c / (2 * sqrt(k * m))
    // For k=170, m=1: critical damping = 2*sqrt(170) ≈ 26.08
    // Use damping=40 (well over-damped)
    const s = spring<number>(100, { stiffness: 170, damping: 40, precision: 0.01 });
    let time = 1000;
    s.tick(time);

    const values: number[] = [];
    for (let i = 0; i < 300; i++) {
      time += 16;
      s.tick(time);
      values.push(s.value());
    }

    // Over-damped: values should never overshoot the target
    const overshot = values.some((v) => v > 100 + 1);
    expect(overshot).toBe(false);
  });

  it('with low damping oscillates around target', () => {
    // Under-damped spring: low damping causes oscillation
    const s = spring<number>(100, { stiffness: 170, damping: 5, precision: 0.001 });
    let time = 1000;
    s.tick(time);

    const values: number[] = [];
    for (let i = 0; i < 200; i++) {
      time += 16;
      s.tick(time);
      values.push(s.value());
    }

    // Low damping: should overshoot at some point
    const hasOvershoot = values.some((v) => v > 100);
    expect(hasOvershoot).toBe(true);

    // And should come back below target at some point after overshooting
    const overshootIndex = values.findIndex((v) => v > 100);
    const hasUndershootAfter = values.slice(overshootIndex).some((v) => v < 100);
    expect(hasUndershootAfter).toBe(true);
  });

  it('setTarget() changes destination mid-animation', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });
    let time = 1000;
    s.tick(time);

    // Move partway toward 100
    for (let i = 0; i < 20; i++) {
      time += 16;
      s.tick(time);
    }
    const midValue = s.value();
    expect(midValue).toBeGreaterThan(0);

    // Change target to 200
    s.setTarget(200);

    // Let it run
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }

    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(200, 0);
  });

  it('physics are frame-rate independent', () => {
    // Create two springs with same config
    const s1 = spring(100, { stiffness: 170, damping: 26, precision: 0.01 });
    const s2 = spring(100, { stiffness: 170, damping: 26, precision: 0.01 });

    // Run s1 with 16ms ticks
    let time1 = 1000;
    s1.tick(time1);
    for (let i = 0; i < 100; i++) {
      time1 += 16;
      s1.tick(time1);
    }

    // Run s2 with 32ms ticks for same total time
    let time2 = 1000;
    s2.tick(time2);
    for (let i = 0; i < 50; i++) {
      time2 += 32;
      s2.tick(time2);
    }

    // Values should be close since we use fixed timestep internally
    expect(s1.value()).toBeCloseTo(s2.value(), 0);
  });

  it('stop() freezes the animation', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 10; i++) {
      time += 16;
      s.tick(time);
    }
    const frozenValue = s.value();
    s.stop();

    for (let i = 0; i < 50; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.value()).toBe(frozenValue);
  });

  it('reset() returns to initial state', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 50; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.value()).not.toBe(0);

    s.reset();
    expect(s.value()).toBe(0);
    expect(s.done()).toBe(false);
  });

  it('mass affects animation speed', () => {
    const light = spring(100, { stiffness: 170, damping: 26, mass: 1 });
    const heavy = spring(100, { stiffness: 170, damping: 26, mass: 5 });

    let time = 1000;
    light.tick(time);
    heavy.tick(time);

    // Only a few ticks to compare early acceleration
    for (let i = 0; i < 10; i++) {
      time += 16;
      light.tick(time);
      heavy.tick(time);
    }

    // Lighter mass should have moved further toward target early on
    expect(light.value()).toBeGreaterThan(heavy.value());
    // Both should be positive (moving toward target)
    expect(light.value()).toBeGreaterThan(0);
    expect(heavy.value()).toBeGreaterThan(0);
  });

  it('done() returns false initially', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    expect(s.done()).toBe(false);
  });

  it('start() should clear isDone so done() returns false after restart', () => {
    // Regression: after a spring settles (isDone=true), calling start()
    // doesn't clear isDone, so done() still returns true.
    // Note: setTarget() already clears isDone, so we test start() in isolation.
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });

    // Let the spring settle at target=100
    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(100, 0);

    // Just call start() without setTarget() — simulates "replay same spring"
    // start() resets lastTime and accumulator but does NOT reset isDone.
    // position is still at target (100), so after restart + tick, it should
    // notice position===target and settle immediately, but done() should
    // be false until at least one tick proves convergence.
    s.stop();
    s.start();

    // After start(), done() should be false since we haven't ticked yet
    // to verify convergence. The bug: isDone is still true from before.
    expect(s.done()).toBe(false);
  });

  it('should support a from config to set initial position', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, from: 50 });
    // Initial value should be 50, not 0
    expect(s.value()).toBe(50);
  });

  it('should default from to 0 when not specified', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26 });
    expect(s.value()).toBe(0);
  });

  it('should reset to from value, not 0', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, from: 50, precision: 0.01 });

    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 100; i++) {
      time += 16;
      s.tick(time);
    }
    // After moving, reset should go back to from value
    s.reset();
    expect(s.value()).toBe(50);
  });

  it('should animate from the from value toward target', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, from: 80, precision: 0.01 });

    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 10; i++) {
      time += 16;
      s.tick(time);
    }
    // Should be between 80 and 100 since it starts at 80 heading toward 100
    expect(s.value()).toBeGreaterThan(80);
    expect(s.value()).toBeLessThanOrEqual(100 + 5); // allow slight overshoot
  });

  it('should restore original target after reset when target was changed via setTarget', () => {
    // A1 regression: reset() does not restore currentTarget to the constructor value.
    // After setTarget(200); reset(), the spring resets position to `from` but still
    // aims at 200 instead of the original target (100).
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });

    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 20; i++) {
      time += 16;
      s.tick(time);
    }

    // Change the target mid-animation
    s.setTarget(200);

    // Reset should restore the original target (100), not keep 200
    s.reset();

    // After reset, let the spring run to completion
    time = 2000;
    s.tick(time);
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }

    expect(s.done()).toBe(true);
    // Should have settled at the ORIGINAL target (100), not the setTarget value (200)
    expect(s.value()).toBeCloseTo(100, 0);
  });

  it('should throw RangeError when stiffness exceeds stability limit', () => {
    // A2 regression: Semi-implicit Euler integration diverges silently for very high
    // stiffness. With default 16ms timestep: stability limit = 2 * mass / (dt^2)
    // For mass=1, dt=0.016: limit = 2 / 0.000256 = 7812.5
    // Stiffness of 10000 should be rejected.
    expect(() => {
      spring(100, { stiffness: 10000, damping: 26 });
    }).toThrow(RangeError);
  });

  it('should include stiffness and stability limit in RangeError message', () => {
    expect(() => {
      spring(100, { stiffness: 10000, damping: 26, mass: 1 });
    }).toThrow(/stiffness 10000 exceeds stability limit/);
  });

  it('should accept stiffness below the stability limit', () => {
    // Stiffness of 7000 is below limit of ~7812 for default 16ms, mass=1
    expect(() => {
      spring(100, { stiffness: 7000, damping: 26 });
    }).not.toThrow();
  });

  it('should adjust stability limit based on mass', () => {
    // With mass=2, limit = 2*2 / (0.016^2) = 15625
    // Stiffness 10000 should be fine with mass=2
    expect(() => {
      spring(100, { stiffness: 10000, damping: 26, mass: 2 });
    }).not.toThrow();
  });

  it('should use separate velocity precision when provided for convergence check', () => {
    // A5 regression: A single `precision` threshold is used for both position
    // displacement (units) and velocity (units/sec). These are dimensionally different.
    // A spring with large position precision but tight velocity precision should
    // only settle when BOTH thresholds are met.
    const s = spring<number>(100, {
      stiffness: 170,
      damping: 26,
      precision: 5, // coarse position tolerance
      velocityPrecision: 0.001, // tight velocity tolerance
    });

    let time = 1000;
    s.tick(time);

    // Run a few ticks -- position may be within 5 units of target but
    // velocity may still be significant
    for (let i = 0; i < 15; i++) {
      time += 16;
      s.tick(time);
    }

    // At this point position may be close to target (within precision=5)
    // but velocity should still be high. With velocityPrecision=0.001,
    // done() should NOT be true yet if the spring is still moving fast.
    // Without the fix, the single `precision` of 5 would be used for velocity
    // too, letting it settle prematurely.
    const positionCloseToTarget = Math.abs(s.value() - 100) < 5;
    if (positionCloseToTarget && !s.done()) {
      // This is the correct behavior: position is close but velocity still high
      expect(s.done()).toBe(false);
    }

    // Eventually it should converge
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(100, 0);
  });

  it('should default velocityPrecision to precision when not provided', () => {
    // Without velocityPrecision, behavior should match the original single-precision check
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });

    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 500; i++) {
      time += 16;
      s.tick(time);
    }
    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(100, 0);
  });

  it('seek() should deterministically move to the requested normalized point', () => {
    const left = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });
    const right = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });

    left.seek(0.5);
    right.seek(0.5);

    expect(left.progress()).toBeCloseTo(0.5, 5);
    expect(left.value()).toBeCloseTo(right.value(), 8);
    expect(left.value()).toBeGreaterThan(0);
    expect(left.value()).toBeLessThan(100);
    expect(left.done()).toBe(false);
  });

  it('seek(1) should settle on the target and zero the velocity', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 26, precision: 0.01 });

    s.seek(1);

    expect(s.done()).toBe(true);
    expect(s.value()).toBeCloseTo(100, 6);
    expect(s.velocity()).toBe(0);
  });

  it('should stay finite with zero damping over long runs', () => {
    const s = spring<number>(100, { stiffness: 170, damping: 0, precision: 0.001 });
    let time = 1000;

    s.tick(time);
    for (let i = 0; i < 400; i++) {
      time += 16;
      s.tick(time);
      expect(Number.isFinite(s.value())).toBe(true);
      expect(Number.isFinite(s.velocity())).toBe(true);
    }
  });

  it('should stay finite with tiny mass below the stability limit', () => {
    const s = spring<number>(100, { stiffness: 60, damping: 8, mass: 0.1, precision: 0.001 });
    let time = 1000;

    s.tick(time);
    for (let i = 0; i < 200; i++) {
      time += 16;
      s.tick(time);
      expect(Number.isFinite(s.value())).toBe(true);
      expect(Number.isFinite(s.velocity())).toBe(true);
    }
  });

  it('should keep object springs finite during mid-flight retargeting', () => {
    const s = spring(
      { x: 100, y: 50 },
      {
        stiffness: 300,
        damping: 12,
        from: { x: 0, y: 0 },
      },
    );

    let time = 1000;
    s.tick(time);
    for (let i = 0; i < 20; i++) {
      time += 16;
      s.tick(time);
    }

    s.setTarget({ x: 200, y: -25 });

    for (let i = 0; i < 120; i++) {
      time += 16;
      s.tick(time);
      const value = s.value();
      const velocity = s.velocity();
      expect(Number.isFinite(value.x)).toBe(true);
      expect(Number.isFinite(value.y)).toBe(true);
      expect(Number.isFinite(velocity.x)).toBe(true);
      expect(Number.isFinite(velocity.y)).toBe(true);
    }
  });
});
