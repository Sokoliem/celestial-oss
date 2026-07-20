import { describe, expect, it } from 'vitest';
import {
  arc,
  bezier,
  circle,
  clone,
  easing,
  ellipse,
  interpolateNumber,
  interpolateValue,
  keyframes,
  line,
  path,
  type SpringConfig,
  sequence,
  sineWave,
  spiral,
  spring,
  tween,
} from '../index.js';
import { createSpringConfig, springPresets, springWith } from '../presets.js';

describe('Multi-value animations', () => {
  describe('tween with objects', () => {
    it('should animate object values', () => {
      const anim = tween({
        from: { x: 0, y: 0 },
        to: { x: 100, y: 50 },
        duration: 100,
      });

      expect(anim.value()).toEqual({ x: 0, y: 0 });

      anim.tick(0);
      anim.tick(50);
      const midValue = anim.value() as { x: number; y: number };
      expect(midValue.x).toBeCloseTo(50, 0);
      expect(midValue.y).toBeCloseTo(25, 0);

      anim.tick(100);
      expect(anim.value()).toEqual({ x: 100, y: 50 });
    });

    it('should animate nested objects', () => {
      const anim = tween({
        from: { pos: { x: 0, y: 0 }, scale: 1 },
        to: { pos: { x: 100, y: 100 }, scale: 2 },
        duration: 100,
      });

      anim.tick(0);
      anim.tick(50);
      const midValue = anim.value() as { pos: { x: number; y: number }; scale: number };
      expect(midValue.pos.x).toBeCloseTo(50, 0);
      expect(midValue.pos.y).toBeCloseTo(50, 0);
      expect(midValue.scale).toBeCloseTo(1.5, 0);
    });

    it('should animate arrays', () => {
      const anim = tween({
        from: [0, 0, 0],
        to: [255, 128, 64],
        duration: 100,
      });

      anim.tick(0);
      anim.tick(50);
      const midValue = anim.value() as number[];
      expect(midValue[0]).toBeCloseTo(127.5, 0);
      expect(midValue[1]).toBeCloseTo(64, 0);
      expect(midValue[2]).toBeCloseTo(32, 0);
    });
  });

  describe('spring with objects', () => {
    it('should animate object values with spring physics', () => {
      const anim = spring(
        { x: 100, y: 100 },
        {
          stiffness: 400,
          damping: 25,
          from: { x: 0, y: 0 },
        },
      );

      for (let i = 0; i < 100; i++) {
        anim.tick(i * 16);
      }

      const value = anim.value() as { x: number; y: number };
      expect(value.x).toBeCloseTo(100, 0);
      expect(value.y).toBeCloseTo(100, 0);
      expect(anim.done()).toBe(true);
    });
  });
});

describe('Animation controls', () => {
  describe('pause/resume', () => {
    it('should pause and resume animation', () => {
      const anim = tween({ from: 0, to: 100, duration: 100 });

      anim.tick(0);
      anim.tick(25);
      expect(anim.value()).toBe(25);

      anim.pause();
      expect(anim.playing()).toBe(false);

      anim.tick(50);
      expect(anim.value()).toBe(25);

      anim.resume();
      expect(anim.playing()).toBe(true);

      anim.tick(75);
      expect(anim.value()).toBeCloseTo(25, 0);

      anim.tick(125);
      expect(anim.value()).toBeCloseTo(75, 0);
    });
  });

  describe('seek', () => {
    it('should jump to specific progress point', () => {
      const anim = tween({ from: 0, to: 100, duration: 100 });

      anim.seek(0.5);
      expect(anim.value()).toBe(50);

      anim.seek(0.75);
      expect(anim.value()).toBe(75);

      anim.seek(1);
      expect(anim.value()).toBe(100);
      expect(anim.done()).toBe(true);
    });
  });

  describe('reverse', () => {
    it('should reverse animation direction', () => {
      const anim = tween({ from: 0, to: 100, duration: 100 });

      anim.tick(0);
      anim.tick(50);
      expect(anim.value()).toBe(50);
      expect(anim.direction()).toBe(1);

      anim.reverse();
      expect(anim.direction()).toBe(-1);
    });
  });

  describe('speed', () => {
    it('should control playback speed', () => {
      const anim = tween({ from: 0, to: 100, duration: 100 });

      anim.speed(2);
      anim.tick(0);
      anim.tick(25);
      expect(anim.value()).toBe(50);
    });
  });

  describe('progress', () => {
    it('should return current progress via seek', () => {
      const anim = tween({ from: 0, to: 100, duration: 100 });

      anim.seek(0.5);
      expect(anim.value()).toBe(50);

      anim.seek(0.75);
      expect(anim.value()).toBe(75);
    });
  });
});

describe('Animation callbacks', () => {
  describe('onStart', () => {
    it('should fire when animation starts', () => {
      let fired = false;
      const anim = tween({
        from: 0,
        to: 100,
        duration: 100,
        onStart: () => {
          fired = true;
        },
      });

      expect(fired).toBe(false);
      anim.tick(0);
      expect(fired).toBe(true);
    });
  });

  describe('onUpdate', () => {
    it('should fire on each tick', () => {
      let callCount = 0;
      const anim = tween({
        from: 0,
        to: 100,
        duration: 100,
        onUpdate: () => {
          callCount++;
        },
      });

      anim.tick(0);
      anim.tick(25);
      anim.tick(50);
      expect(callCount).toBe(3);
    });
  });

  describe('onComplete', () => {
    it('should fire when animation completes', () => {
      let completed = false;
      const anim = tween({
        from: 0,
        to: 100,
        duration: 100,
        onComplete: () => {
          completed = true;
        },
      });

      anim.tick(0);
      anim.tick(50);
      expect(completed).toBe(false);

      anim.tick(100);
      expect(completed).toBe(true);
    });
  });

  describe('onCancel', () => {
    it('should fire when animation is stopped before completion', () => {
      let cancelled = false;
      const anim = tween({
        from: 0,
        to: 100,
        duration: 100,
        onCancel: () => {
          cancelled = true;
        },
      });

      anim.tick(0);
      anim.tick(25);
      expect(cancelled).toBe(false);

      anim.stop();
      expect(cancelled).toBe(true);
    });
  });
});

describe('Spring presets', () => {
  it('should provide named spring configurations', () => {
    expect(springPresets.snappy).toEqual({ stiffness: 400, damping: 25 });
    expect(springPresets.gentle).toEqual({ stiffness: 120, damping: 14 });
    expect(springPresets.bouncy).toEqual({ stiffness: 300, damping: 10 });
  });

  it('should create spring config with preset', () => {
    const config = springWith('snappy');
    expect(config.stiffness).toBe(400);
    expect(config.damping).toBe(25);
  });

  it('should allow overriding preset values', () => {
    const config = springWith('snappy', { mass: 2 });
    expect(config.stiffness).toBe(400);
    expect(config.damping).toBe(25);
    expect(config.mass).toBe(2);
  });

  it('should keep springWith stiffness and damping locked at runtime', () => {
    const runtimeOverrides = { stiffness: 999, damping: 1, mass: 2 } as Partial<SpringConfig<number>>;
    const config = springWith('snappy', runtimeOverrides);

    expect(config.stiffness).toBe(400);
    expect(config.damping).toBe(25);
    expect(config.mass).toBe(2);
  });

  it('should let createSpringConfig override stiffness and damping', () => {
    const config = createSpringConfig('snappy', {
      stiffness: 600,
      damping: 30,
      precision: 0.001,
    });

    expect(config.stiffness).toBe(600);
    expect(config.damping).toBe(30);
    expect(config.precision).toBe(0.001);
  });
});

describe('Keyframe animations', () => {
  it('should animate through keyframes', () => {
    const anim = keyframes({
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 100 },
        { offset: 1, value: 50 },
      ],
      duration: 100,
    });

    anim.tick(0);
    expect(anim.value()).toBe(0);

    anim.tick(50);
    expect(anim.value()).toBe(100);

    anim.tick(100);
    expect(anim.value()).toBe(50);
  });

  it('should apply per-segment easing', () => {
    const anim = keyframes({
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 100, easing: easing.linear },
        { offset: 1, value: 100 },
      ],
      duration: 100,
    });

    anim.tick(0);
    anim.tick(25);
    expect(anim.value()).toBe(50);
  });

  it('should loop when configured', () => {
    const anim = keyframes({
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 100 },
      ],
      duration: 100,
      loop: true,
    });

    anim.tick(0);
    anim.tick(100);
    expect(anim.done()).toBe(false);

    anim.tick(200);
    expect(anim.value()).toBe(0);
  });

  it('should support multi-value keyframes', () => {
    const anim = keyframes({
      keyframes: [
        { offset: 0, value: { x: 0, y: 0 } },
        { offset: 1, value: { x: 100, y: 50 } },
      ],
      duration: 100,
    });

    anim.tick(0);
    anim.tick(50);
    const midValue = anim.value() as { x: number; y: number };
    expect(midValue.x).toBeCloseTo(50, 0);
    expect(midValue.y).toBeCloseTo(25, 0);
  });

  it('should fire onComplete only once after non-looping completion', () => {
    let completed = 0;
    const anim = keyframes({
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 1, value: 1 },
      ],
      duration: 100,
      onComplete: () => {
        completed++;
      },
    });

    anim.tick(0);
    anim.tick(100);
    anim.tick(150);
    anim.tick(200);

    expect(anim.done()).toBe(true);
    expect(completed).toBe(1);
  });
});

describe('Path animations', () => {
  describe('line', () => {
    it('should animate along a line', () => {
      const anim = line({ x: 0, y: 0 }, { x: 100, y: 100 }, { duration: 100 });

      anim.tick(0);
      anim.tick(50);
      const midPoint = anim.value();
      expect(midPoint.x).toBeCloseTo(50, 0);
      expect(midPoint.y).toBeCloseTo(50, 0);
    });

    it('should fire onComplete only once after non-looping completion', () => {
      let completed = 0;
      const anim = line(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        {
          duration: 100,
          onComplete: () => {
            completed++;
          },
        },
      );

      anim.tick(0);
      anim.tick(100);
      anim.tick(150);
      anim.tick(200);

      expect(anim.done()).toBe(true);
      expect(completed).toBe(1);
    });
  });

  describe('circle', () => {
    it('should animate in a circle', () => {
      const anim = circle({ x: 50, y: 50 }, 25, { duration: 100 });

      anim.tick(0);
      const start = anim.value();
      expect(start.x).toBeCloseTo(75, 0);
      expect(start.y).toBeCloseTo(50, 0);

      anim.tick(25);
      const q1 = anim.value();
      expect(q1.x).toBeCloseTo(50, 0);
      expect(q1.y).toBeCloseTo(75, 0);

      anim.tick(50);
      const half = anim.value();
      expect(half.x).toBeCloseTo(25, 0);
      expect(half.y).toBeCloseTo(50, 0);
    });

    it('should loop continuously', () => {
      const anim = circle({ x: 0, y: 0 }, 10, { duration: 100, loop: true });

      anim.tick(0);
      anim.tick(100);
      expect(anim.done()).toBe(false);
    });
  });

  describe('arc', () => {
    it('should animate along an arc', () => {
      const anim = arc({ x: 0, y: 0 }, 10, 0, Math.PI / 2, { duration: 100 });

      anim.tick(0);
      const start = anim.value();
      expect(start.x).toBeCloseTo(10, 0);
      expect(start.y).toBeCloseTo(0, 0);

      anim.tick(100);
      const end = anim.value();
      expect(end.x).toBeCloseTo(0, 0);
      expect(end.y).toBeCloseTo(10, 0);
    });
  });

  describe('bezier', () => {
    it('should animate along a bezier curve', () => {
      const anim = bezier(
        [
          { x: 0, y: 0 },
          { x: 50, y: 100 },
          { x: 100, y: 0 },
        ],
        { duration: 100 },
      );

      anim.tick(0);
      expect(anim.value().x).toBeCloseTo(0, 0);

      anim.tick(50);
      const mid = anim.value();
      expect(mid.x).toBeCloseTo(50, 0);
      expect(mid.y).toBeGreaterThan(0);

      anim.tick(100);
      expect(anim.value().x).toBeCloseTo(100, 0);
    });
  });

  describe('ellipse', () => {
    it('should animate in an ellipse', () => {
      const anim = ellipse({ x: 50, y: 50 }, 30, 15, { duration: 100 });

      anim.tick(0);
      const start = anim.value();
      expect(start.x).toBeCloseTo(80, 0);
      expect(start.y).toBeCloseTo(50, 0);

      anim.tick(25);
      const q1 = anim.value();
      expect(q1.x).toBeCloseTo(50, 0);
      expect(q1.y).toBeCloseTo(65, 0);
    });
  });

  describe('spiral', () => {
    it('should animate in a spiral', () => {
      const anim = spiral({ x: 50, y: 50 }, 10, 30, 2, { duration: 100 });

      anim.tick(0);
      const start = anim.value();
      expect(start.x).toBeCloseTo(60, 0);
      expect(start.y).toBeCloseTo(50, 0);
    });
  });

  describe('sineWave', () => {
    it('should animate along a sine wave', () => {
      const anim = sineWave({ x: 0, y: 50 }, { x: 100, y: 50 }, 10, 2, { duration: 100 });

      anim.tick(0);
      const start = anim.value();
      expect(start.x).toBeCloseTo(0, 0);
      expect(start.y).toBeCloseTo(50, 0);

      anim.tick(25);
      const q1 = anim.value();
      expect(q1.x).toBeCloseTo(25, 0);
    });
  });

  describe('path', () => {
    it('should animate along a series of points', () => {
      const anim = path(
        [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
        ],
        { duration: 100 },
      );

      anim.tick(0);
      expect(anim.value()).toEqual({ x: 0, y: 0 });

      anim.tick(50);
      const mid = anim.value();
      expect(mid.x).toBeCloseTo(50, 0);
      expect(mid.y).toBeCloseTo(0, 0);

      anim.tick(100);
      expect(anim.value()).toEqual({ x: 50, y: 50 });
    });

    it('should keep zero-length paths finite', () => {
      const anim = path(
        [
          { x: 3, y: 4 },
          { x: 3, y: 4 },
          { x: 3, y: 4 },
        ],
        { duration: 100 },
      );

      anim.tick(0);
      anim.tick(50);

      expect(anim.value()).toEqual({ x: 3, y: 4 });
      expect(Number.isFinite(anim.value().x)).toBe(true);
      expect(Number.isFinite(anim.value().y)).toBe(true);
    });
  });
});

describe('Interpolation utilities', () => {
  describe('interpolateNumber', () => {
    it('should interpolate between numbers', () => {
      expect(interpolateNumber(0, 100, 0)).toBe(0);
      expect(interpolateNumber(0, 100, 0.5)).toBe(50);
      expect(interpolateNumber(0, 100, 1)).toBe(100);
    });
  });

  describe('interpolateValue', () => {
    it('should interpolate objects', () => {
      const result = interpolateValue({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5) as { x: number; y: number };
      expect(result.x).toBe(50);
      expect(result.y).toBe(25);
    });

    it('should interpolate arrays', () => {
      const result = interpolateValue([0, 0], [100, 50], 0.5) as number[];
      expect(result[0]).toBe(50);
      expect(result[1]).toBe(25);
    });
  });

  describe('clone', () => {
    it('should deep clone objects', () => {
      const original = { x: 0, y: { z: 0 } };
      const cloned = clone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect((cloned as { x: number; y: { z: number } }).y).not.toBe(original.y);
    });

    it('should deep clone arrays', () => {
      const original = [
        [1, 2],
        [3, 4],
      ];
      const cloned = clone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect((cloned as number[][])[0]).not.toBe(original[0]);
    });
  });
});

describe('Expanded easing functions', () => {
  it('should provide quintic easings', () => {
    expect(easing.easeInQuint(0.5)).toBeCloseTo(0.03125, 4);
    expect(easing.easeOutQuint(0.5)).toBeCloseTo(0.96875, 4);
  });

  it('should provide sinusoidal easings', () => {
    expect(easing.easeInSine(0)).toBe(0);
    expect(easing.easeInSine(1)).toBeCloseTo(1, 10);
    expect(easing.easeOutSine(0.5)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('should provide exponential easings', () => {
    expect(easing.easeInExpo(0)).toBe(0);
    expect(easing.easeInExpo(1)).toBe(1);
    expect(easing.easeOutExpo(0.5)).toBeCloseTo(0.969, 2);
  });

  it('should provide circular easings', () => {
    expect(easing.easeInCirc(0)).toBe(0);
    expect(easing.easeInCirc(1)).toBe(1);
    expect(easing.easeOutCirc(0.5)).toBeCloseTo(0.866, 2);
  });

  it('should provide elastic easings', () => {
    expect(easing.easeInElastic(0)).toBe(0);
    expect(easing.easeInElastic(1)).toBe(1);
    expect(easing.easeOutElastic(0)).toBe(0);
    expect(easing.easeOutElastic(1)).toBe(1);
  });

  it('should provide bounce easings', () => {
    expect(easing.easeInBounce(0)).toBe(0);
    expect(easing.easeInBounce(1)).toBe(1);
    expect(easing.easeOutBounce(0)).toBe(0);
    expect(easing.easeOutBounce(1)).toBe(1);
  });

  it('should provide steps easing', () => {
    const stepEasing = easing.steps(4, false);
    expect(stepEasing(0)).toBe(0);
    expect(stepEasing(0.1)).toBeCloseTo(0.25, 2);
    expect(stepEasing(0.5)).toBeCloseTo(0.5, 2);
    expect(stepEasing(0.9)).toBeCloseTo(1, 2);
  });
});

describe('Sequence with controls', () => {
  it('should support pause/resume on sequence', () => {
    const anim1 = tween({ from: 0, to: 50, duration: 50 });
    const anim2 = tween({ from: 50, to: 100, duration: 50 });
    const seq = sequence(anim1, anim2);

    seq.tick(0);
    seq.tick(25);
    expect(seq.value()).toBe(25);

    seq.pause();
    seq.tick(50);
    expect(seq.value()).toBe(25);

    seq.resume();
    seq.tick(75);
    expect(seq.value()).toBe(25);

    seq.tick(100);
    expect(seq.value()).toBe(50);
  });
});

describe('Velocity inheritance', () => {
  it('should accept initial velocity for spring', () => {
    const anim = spring(100, {
      stiffness: 400,
      damping: 25,
      from: 0,
      initialVelocity: 1000,
    });

    anim.tick(0);
    anim.tick(16);

    const value = anim.value() as number;
    expect(value).toBeGreaterThan(16);
  });

  it('should accept initial velocity for multi-value spring', () => {
    const anim = spring(
      { x: 100, y: 100 },
      {
        stiffness: 400,
        damping: 25,
        from: { x: 0, y: 0 },
        initialVelocity: { x: 500, y: 0 },
      },
    );

    for (let i = 0; i < 10; i++) {
      anim.tick(i * 16);
    }

    const value = anim.value() as { x: number; y: number };
    expect(value.x).toBeGreaterThan(0);
    expect(value.y).toBeGreaterThan(0);
  });
});
