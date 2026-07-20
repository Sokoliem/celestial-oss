import { describe, expect, it, vi } from 'vitest';

vi.mock('@celestial/corona', () => ({
  color: {
    toOklch: () => null,
    fromOklch: () => ({ rgb: [0, 0, 0] }),
  },
}));

const { breatheAnimation, wobble } = await import('../animation-presets.js');
const { getInterpolator, interpolateWithType } = await import('../interpolate.js');
const { tween } = await import('../tween.js');

describe('Aurora primitive expansion', () => {
  it('wobble follows the expected keyframe values', () => {
    const animation = wobble();

    animation.tick(0);
    animation.tick(75);
    expect(animation.value()).toBeCloseTo(-3, 5);

    animation.tick(150);
    expect(animation.value()).toBeCloseTo(2.4, 5);

    animation.tick(500);
    expect(animation.value()).toBe(0);
  });

  it('breatheAnimation uses the default tween range and timing', () => {
    const animation = breatheAnimation();

    animation.tick(0);
    expect(animation.value()).toBe(0);

    animation.tick(1000);
    expect(animation.value()).toBeCloseTo(0.5, 5);

    animation.tick(2000);
    expect(animation.value()).toBe(1);
  });

  it('registers the particle interpolator by name', () => {
    expect(typeof getInterpolator('particle')).toBe('function');
  });

  it('interpolates particle values with default opacity fallback', () => {
    const value = interpolateWithType({ x: 0, y: 10 }, { x: 20, y: 30, opacity: 0.5 }, 0.5, 'particle') as { x: number; y: number; opacity: number };

    expect(value).toEqual({
      x: 10,
      y: 20,
      opacity: 0.75,
    });
  });

  it('supports particle interpolation through tween configs', () => {
    const animation = tween({
      from: { x: 0, y: 0, opacity: 0 },
      to: { x: 10, y: 20, opacity: 1 },
      duration: 100,
      interpolate: 'particle',
    });

    animation.tick(0);
    animation.tick(50);

    expect(animation.value()).toEqual({
      x: 5,
      y: 10,
      opacity: 0.5,
    });
  });
});
