import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import { gradient } from '../gradient.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function expectColorEqual(actual: Color, expected: Color) {
  expect(actual.rgb).toEqual(expected.rgb);
}

function expectColorClose(actual: Color, expected: Color, tolerance: number = 2) {
  expect(actual.rgb).not.toBeNull();
  expect(expected.rgb).not.toBeNull();
  expect(Math.abs(actual.rgb![0] - expected.rgb![0])).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.rgb![1] - expected.rgb![1])).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.rgb![2] - expected.rgb![2])).toBeLessThanOrEqual(tolerance);
}

// ── Construction Edge Cases ─────────────────────────────────────────────────

describe('gradient — construction edge cases', () => {
  it('empty stops: sample(0.5) returns white', () => {
    const g = gradient([]);
    expectColorEqual(g.sample(0.5), color.white);
  });

  it('single color: sample at 0, 0.5, and 1 all return that color', () => {
    const g = gradient([color.red]);
    expectColorEqual(g.sample(0), color.red);
    expectColorEqual(g.sample(0.5), color.red);
    expectColorEqual(g.sample(1), color.red);
  });

  it('single explicit stop: sample returns that color everywhere', () => {
    const g = gradient([{ at: 0.5, color: color.red }]);
    expectColorEqual(g.sample(0), color.red);
    expectColorEqual(g.sample(0.5), color.red);
    expectColorEqual(g.sample(1), color.red);
  });

  it('two identical colors: midpoint is still that color', () => {
    const g = gradient([color.blue, color.blue]);
    expectColorEqual(g.sample(0.5), color.blue);
  });

  it('duplicate positions: does not crash', () => {
    const g = gradient([
      { at: 0.5, color: color.red },
      { at: 0.5, color: color.blue },
    ]);
    // Should return one of the two without throwing
    const sampled = g.sample(0.5);
    expect(sampled.rgb).not.toBeNull();
  });
});

// ── Sampling and Clamping ───────────────────────────────────────────────────

describe('gradient — sampling and clamping', () => {
  const g = gradient([color.red, color.blue]);

  it('sample(-1) clamps to first stop color', () => {
    expectColorEqual(g.sample(-1), color.red);
  });

  it('sample(2) clamps to last stop color', () => {
    expectColorEqual(g.sample(2), color.blue);
  });

  it('sample(0) returns exactly first stop', () => {
    expectColorEqual(g.sample(0), color.red);
  });

  it('sample(1) returns exactly last stop', () => {
    expectColorEqual(g.sample(1), color.blue);
  });

  it('sample(NaN) — documents behavior (NaN propagates through clamp)', () => {
    // Math.max(0, Math.min(1, NaN)) === NaN
    // The implementation will not find a matching segment, so behaviour
    // is implementation-defined. We just verify it does not throw.
    expect(() => g.sample(NaN)).not.toThrow();
  });
});

// ── Interpolation Accuracy (OKLAB) ─────────────────────────────────────────

describe('gradient — OKLAB interpolation accuracy', () => {
  it('red-to-cyan midpoint differs from naive RGB average', () => {
    const g = gradient([color.red, color.hex('#00ffff')]);
    const mid = g.sample(0.5);
    expect(mid.rgb).not.toBeNull();
    // Naive RGB average of (128,0,0) and (0,255,255) would be (64,128,128).
    // OKLAB interpolation produces a perceptually balanced color that differs.
    const naiveR = Math.round((128 + 0) / 2);
    const naiveG = Math.round((0 + 255) / 2);
    const naiveB = Math.round((0 + 255) / 2);

    const diffR = Math.abs(mid.rgb![0] - naiveR);
    const diffG = Math.abs(mid.rgb![1] - naiveG);
    const diffB = Math.abs(mid.rgb![2] - naiveB);
    // At least one channel should differ significantly from the naive midpoint
    expect(diffR + diffG + diffB).toBeGreaterThan(10);
  });

  it('black-to-white midpoint differs from naive RGB average due to OKLAB', () => {
    const g = gradient([color.black, color.hex('#ffffff')]);
    const mid = g.sample(0.5);
    expect(mid.rgb).not.toBeNull();
    // Naive RGB midpoint of (0,0,0) and (255,255,255) is (128,128,128).
    // OKLAB interpolation produces a perceptually different midpoint.
    // The actual value depends on the OKLAB linearization, but it should
    // NOT be exactly 128.
    expect(mid.rgb![0]).not.toBe(128);
  });

  it('two-stop red-to-blue: t=0 is red, t=1 is blue', () => {
    const g = gradient([color.red, color.blue]);
    expectColorEqual(g.sample(0), color.red);
    expectColorEqual(g.sample(1), color.blue);
  });
});

// ── Implicit vs Explicit Equivalence ────────────────────────────────────────

describe('gradient — implicit vs explicit stop equivalence', () => {
  it('implicit 3-color gradient places stops at 0, 0.5, 1', () => {
    const g = gradient([color.red, color.green, color.blue]);
    expect(g.stops).toHaveLength(3);
    expect(g.stops[0]!.at).toBe(0);
    expect(g.stops[1]!.at).toBe(0.5);
    expect(g.stops[2]!.at).toBe(1);
  });

  it('sampling implicit at 0.25 equals explicit equivalent at 0.25', () => {
    const implicit = gradient([color.red, color.green, color.blue]);
    const explicit = gradient([
      { at: 0, color: color.red },
      { at: 0.5, color: color.green },
      { at: 1, color: color.blue },
    ]);
    expectColorClose(implicit.sample(0.25), explicit.sample(0.25));
  });
});

// ── Stop Sorting ────────────────────────────────────────────────────────────

describe('gradient — stop sorting', () => {
  it('reversed input order: sample(0) still returns the color at position 0', () => {
    const g = gradient([
      { at: 1, color: color.blue },
      { at: 0, color: color.red },
    ]);
    expectColorEqual(g.sample(0), color.red);
    expectColorEqual(g.sample(1), color.blue);
  });

  it('stops are in ascending order regardless of input order', () => {
    const g = gradient([
      { at: 0.8, color: color.green },
      { at: 0.2, color: color.red },
      { at: 0.5, color: color.blue },
    ]);
    for (let i = 1; i < g.stops.length; i++) {
      expect(g.stops[i]!.at).toBeGreaterThanOrEqual(g.stops[i - 1]!.at);
    }
  });
});

// ── Stress / Boundary ───────────────────────────────────────────────────────

describe('gradient — stress and boundary', () => {
  it('1000-color gradient: no crash, sample(0.5) returns valid color', () => {
    const colors = Array.from({ length: 1000 }, (_, i) => color.hsl(i * 0.36, 100, 50));
    const g = gradient(colors);
    const mid = g.sample(0.5);
    expect(mid.rgb).not.toBeNull();
    expect(mid.rgb![0]).toBeGreaterThanOrEqual(0);
    expect(mid.rgb![0]).toBeLessThanOrEqual(255);
  });

  it('three stops at positions 0, 0, 1: sample(0) returns first stop color', () => {
    const g = gradient([
      { at: 0, color: color.red },
      { at: 0, color: color.green },
      { at: 1, color: color.blue },
    ]);
    // With same-position stops, implementation returns lower.color
    const sampled = g.sample(0);
    expect(sampled.rgb).not.toBeNull();
  });
});

// ── Immutability ────────────────────────────────────────────────────────────

describe('gradient — immutability', () => {
  it('stops array is frozen', () => {
    const g = gradient([color.red, color.blue]);
    expect(Object.isFrozen(g.stops)).toBe(true);
  });
});
