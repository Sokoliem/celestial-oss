import { describe, expect, it } from 'vitest';
import { easing } from '../easing.js';

describe('easing', () => {
  const allNamedEasings: [string, (t: number) => number][] = [
    ['linear', easing.linear],
    ['easeIn', easing.easeIn],
    ['easeOut', easing.easeOut],
    ['easeInOut', easing.easeInOut],
    ['easeInQuad', easing.easeInQuad],
    ['easeOutQuad', easing.easeOutQuad],
    ['easeInOutQuad', easing.easeInOutQuad],
    ['easeInQuart', easing.easeInQuart],
    ['easeOutQuart', easing.easeOutQuart],
    ['easeInOutQuart', easing.easeInOutQuart],
    ['bounce', easing.bounce],
    ['elastic', easing.elastic],
    ['backIn', easing.backIn],
    ['backOut', easing.backOut],
    ['backInOut', easing.backInOut],
  ];

  it.each(allNamedEasings)('%s returns 0 for t=0', (_name, fn) => {
    expect(fn(0)).toBeCloseTo(0, 5);
  });

  it.each(allNamedEasings)('%s returns 1 for t=1', (_name, fn) => {
    expect(fn(1)).toBeCloseTo(1, 5);
  });

  it('linear returns t unchanged', () => {
    expect(easing.linear(0.25)).toBe(0.25);
    expect(easing.linear(0.5)).toBe(0.5);
    expect(easing.linear(0.75)).toBe(0.75);
  });

  it('easeIn starts slow (f(0.5) < 0.5)', () => {
    expect(easing.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut starts fast (f(0.5) > 0.5)', () => {
    expect(easing.easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOut is symmetric around midpoint', () => {
    const val = easing.easeInOut(0.5);
    expect(val).toBeCloseTo(0.5, 5);
  });

  it('easeInQuad starts slow', () => {
    expect(easing.easeInQuad(0.5)).toBeLessThan(0.5);
  });

  it('easeOutQuad starts fast', () => {
    expect(easing.easeOutQuad(0.5)).toBeGreaterThan(0.5);
  });

  it('bounce creates bounce effect (values stay within [0,1] range)', () => {
    // Bounce should produce values that are valid (between 0 and 1)
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easing.bounce(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.001);
    }
    // Bounce at intermediate values should show non-linear behavior
    const v1 = easing.bounce(0.5);
    expect(v1).not.toBeCloseTo(0.5, 1);
  });

  it('elastic produces overshoot (some values > 1)', () => {
    let hasOvershoot = false;
    for (let t = 0.5; t < 1; t += 0.01) {
      if (easing.elastic(t) > 1) {
        hasOvershoot = true;
        break;
      }
    }
    expect(hasOvershoot).toBe(true);
  });

  it('backIn produces negative values at start', () => {
    // backIn should go slightly negative before progressing
    const v = easing.backIn(0.2);
    expect(v).toBeLessThan(0);
  });

  it('backOut produces overshoot before settling', () => {
    const v = easing.backOut(0.8);
    expect(v).toBeGreaterThan(1);
  });

  it('cubicBezier returns 0 for t=0 and 1 for t=1', () => {
    const bezier = easing.cubicBezier(0.25, 0.1, 0.25, 1.0);
    expect(bezier(0)).toBeCloseTo(0, 5);
    expect(bezier(1)).toBeCloseTo(1, 5);
  });

  it('cubicBezier produces valid curve for CSS ease preset', () => {
    // CSS "ease" is cubic-bezier(0.25, 0.1, 0.25, 1.0)
    const cssEase = easing.cubicBezier(0.25, 0.1, 0.25, 1.0);
    const mid = cssEase(0.5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // It's a monotonically increasing curve
    const vals = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => cssEase(t));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it('cubicBezier with linear params approximates linear', () => {
    const linear = easing.cubicBezier(0, 0, 1, 1);
    expect(linear(0.5)).toBeCloseTo(0.5, 1);
  });

  it('should throw RangeError when cubicBezier x1 is out of [0, 1]', () => {
    // A4 regression: cubicBezier does not validate that x1 and x2 are in [0, 1].
    // CSS spec requires this for the x-coordinate curve to be monotonic.
    expect(() => easing.cubicBezier(-0.5, 0.1, 0.25, 1.0)).toThrow(RangeError);
    expect(() => easing.cubicBezier(1.5, 0.1, 0.25, 1.0)).toThrow(RangeError);
  });

  it('should throw RangeError when cubicBezier x2 is out of [0, 1]', () => {
    expect(() => easing.cubicBezier(0.25, 0.1, -0.1, 1.0)).toThrow(RangeError);
    expect(() => easing.cubicBezier(0.25, 0.1, 1.5, 1.0)).toThrow(RangeError);
  });

  it('should include x1 and x2 values in cubicBezier RangeError message', () => {
    expect(() => easing.cubicBezier(-0.5, 0.1, 1.5, 1.0)).toThrow(/x1 and x2 must be in \[0, 1\]/);
  });

  it('should allow y1 and y2 outside [0, 1] for cubicBezier (CSS spec allows this)', () => {
    // y values CAN be outside [0, 1] -- this creates overshoot/undershoot effects
    expect(() => easing.cubicBezier(0.25, -0.5, 0.25, 1.5)).not.toThrow();
  });

  it('should accept cubicBezier x1 and x2 at boundary values 0 and 1', () => {
    expect(() => easing.cubicBezier(0, 0, 1, 1)).not.toThrow();
    expect(() => easing.cubicBezier(0, 0.5, 1, 0.5)).not.toThrow();
  });

  it('cached() should stay close to the uncached easing curve', () => {
    const base = (t: number) => Math.sin(t * Math.PI * 0.5);
    const cached = easing.cached(base, 256);

    for (let t = 0; t <= 1; t += 0.0375) {
      expect(cached(t)).toBeCloseTo(base(t), 2);
    }
  });
});
