import { describe, expect, it } from 'vitest';
import { bounce, fadeIn, pulse, repeat, shake, slideUp, staggerGrid, yoyo } from '../index.js';
import { tween } from '../tween.js';

describe('sequence extensions', () => {
  it('repeat() should mirror loop() semantics', () => {
    const animation = repeat(tween({ from: 0, to: 10, duration: 100 }), 2);
    const start = 1000;

    animation.tick(start);
    animation.tick(start + 100);
    expect(animation.done()).toBe(false);

    animation.tick(start + 200);
    animation.tick(start + 300);
    expect(animation.done()).toBe(true);
    expect(animation.value()).toBe(10);
  });

  it('yoyo() should play forward and then backward', () => {
    const animation = yoyo(tween({ from: 0, to: 10, duration: 100 }), 2);
    const start = 1000;

    animation.tick(start);
    animation.tick(start + 100);
    expect(animation.done()).toBe(false);
    expect(animation.value()).toBe(10);

    animation.tick(start + 150);
    expect(animation.value()).toBeCloseTo(5, 0);

    animation.tick(start + 200);
    expect(animation.done()).toBe(true);
    expect(animation.value()).toBeCloseTo(0, 6);
  });

  it('staggerGrid() should produce center-weighted Manhattan delays', () => {
    const grid = staggerGrid(3, 3, { from: 'center', delay: 10 });

    expect(grid(4, 9)).toBe(0);
    expect(grid(1, 9)).toBe(10);
    expect(grid(8, 9)).toBe(20);
  });
});

describe('animation presets', () => {
  it('fadeIn() should tween opacity from 0 to 1', () => {
    const animation = fadeIn();

    animation.tick(0);
    animation.tick(100);
    expect(animation.value()).toBeGreaterThan(0);
    expect(animation.value()).toBeLessThan(1);
  });

  it('slideUp() should animate y and opacity together', () => {
    const animation = slideUp(2);

    animation.tick(0);
    animation.tick(120);
    expect(animation.value().y).toBeLessThan(2);
    expect(animation.value().opacity).toBeGreaterThan(0);
  });

  it('pulse(), bounce(), and shake() should return to their origin at completion', () => {
    const pulseAnimation = pulse();
    pulseAnimation.tick(0);
    pulseAnimation.tick(1000);
    expect(pulseAnimation.value()).toBeCloseTo(1, 6);

    const bounceAnimation = bounce();
    bounceAnimation.tick(0);
    bounceAnimation.tick(1000);
    expect(bounceAnimation.value()).toBeCloseTo(0, 6);

    const shakeAnimation = shake();
    shakeAnimation.tick(0);
    shakeAnimation.tick(1000);
    expect(shakeAnimation.value()).toBeCloseTo(0, 6);
  });
});
