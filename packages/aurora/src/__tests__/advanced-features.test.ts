import { describe, expect, it } from 'vitest';
import { createSpringHandoff, handoffToSpring } from '../handoff.js';
import {
  createFrameBudget,
  createUiTransitionState,
  decay,
  getUiTransitionOpacity,
  interpolateValue,
  interruptible,
  recommendFrameFidelity,
  setUiTransitionTarget,
  spring,
  tickUiTransitionState,
  tween,
} from '../index.js';
import { createTimeline } from '../timeline.js';

describe('color interpolation', () => {
  it('should interpolate matching hex colors through the built-in color path', () => {
    const midpoint = interpolateValue('#ff0000', '#00ff00', 0.5);

    expect(midpoint).toMatch(/^#[0-9a-f]{6}$/);
    expect(midpoint).not.toBe('#808000');
  });

  it('should normalize short hex colors to long lowercase output', () => {
    const midpoint = interpolateValue('#F00', '#0f0', 0.5);
    expect(midpoint).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('timeline', () => {
  it('should seek and scrub overlapping tracks on a shared clock', () => {
    const timeline = createTimeline();
    timeline.add('alpha', tween({ from: 0, to: 100, duration: 100 }), { at: 0, duration: 100 });
    timeline.add('beta', tween({ from: 0, to: 50, duration: 100 }), { at: 50, duration: 100 });
    timeline.addMarker('midpoint', 50);

    timeline.seek(75);
    expect(timeline.value('alpha')).toBeCloseTo(75, 0);
    expect(timeline.value('beta')).toBeCloseTo(12.5, 0);
    expect(timeline.passedMarkers()).toEqual(['midpoint']);

    timeline.scrub(1);
    expect(timeline.done()).toBe(true);
    expect(timeline.value('alpha')).toBe(100);
    expect(timeline.value('beta')).toBe(50);
  });
});

describe('decay', () => {
  it('should monotonically reduce velocity toward rest', () => {
    const animation = decay(0, { velocity: 100, deceleration: 0.9, restDelta: 0.5 });
    const samples: number[] = [];

    animation.tick(0);
    for (let i = 1; i <= 4; i++) {
      animation.tick(i * 16);
      samples.push(Math.abs(animation.velocity()));
    }

    expect(samples[1]!).toBeLessThan(samples[0]!);
    expect(samples[2]!).toBeLessThan(samples[1]!);
    expect(samples[3]!).toBeLessThan(samples[2]!);
  });

  it('should stop at clamp boundaries', () => {
    const animation = decay(0, { velocity: 200, deceleration: 0.95, clamp: [0, 1] });

    animation.tick(0);
    for (let i = 1; i <= 20; i++) {
      animation.tick(i * 16);
      if (animation.done()) {
        break;
      }
    }

    expect(animation.done()).toBe(true);
    expect(animation.value()).toBe(1);
    expect(animation.velocity()).toBe(0);
  });
});

describe('interruptible', () => {
  it('should preserve sampled velocity across a handoff', () => {
    const animation = interruptible(tween({ from: 0, to: 100, duration: 100 }));

    animation.tick(0);
    animation.tick(50);
    const handoffVelocity = animation.velocity();

    animation.handoff((state) =>
      spring(150, {
        stiffness: 300,
        damping: 18,
        from: state.value,
        initialVelocity: state.velocity,
      }),
    );

    animation.tick(66);
    animation.tick(82);
    expect(handoffVelocity).toBeGreaterThan(0);
    expect(animation.value()).toBeGreaterThan(50);
    expect(animation.velocity()).toBeGreaterThan(0);
  });

  it('should retarget with layout handoff presets', () => {
    const animation = interruptible(tween({ from: 0, to: 100, duration: 100 }));
    animation.tick(0);
    animation.tick(50);

    handoffToSpring(animation, 150, 'snappyPanel');
    animation.tick(66);
    animation.tick(82);

    expect(animation.value()).toBeGreaterThan(50);
    expect(animation.velocity()).toBeGreaterThan(0);
  });

  it('should expose reusable spring handoff factories', () => {
    const factory = createSpringHandoff<number>(1, 'gentleOverlay');
    const next = factory({ value: 0.5, velocity: 2 });

    next.tick(0);
    next.tick(16);
    expect(next.value()).toBeGreaterThan(0.5);
  });
});

describe('frame budget', () => {
  it('should lower and recover fidelity based on frame cost', () => {
    const budget = createFrameBudget(60);

    budget.beginFrame(0);
    budget.consume(20);
    budget.endFrame(20);
    expect(budget.overBudget()).toBe(true);
    expect(budget.fidelity()).toBeCloseTo(0.9, 5);

    budget.beginFrame(40);
    budget.consume(5);
    budget.endFrame(45);
    expect(budget.fidelity()).toBeCloseTo(0.95, 5);
  });

  it('recommends fidelity tiers for consumers', () => {
    expect(recommendFrameFidelity(1).tier).toBe('full');
    expect(recommendFrameFidelity(0.8).allowExpensiveEffects).toBe(false);
    expect(recommendFrameFidelity(0.6).allowDecorativeAnimation).toBe(false);
    expect(recommendFrameFidelity(0.2).allowAnimation).toBe(false);

    const budget = createFrameBudget(60);
    budget.beginFrame(0);
    budget.consume(20);
    budget.endFrame(20);
    expect(budget.recommendation().tier).toBe('reduced');
  });
});

describe('ui transition state', () => {
  it('runs deterministic enter and exit transitions from deltas', () => {
    const initial = createUiTransitionState({ duration: 100 });
    const entering = setUiTransitionTarget(initial, true, { duration: 100 });
    const halfway = tickUiTransitionState(entering, 50);
    const entered = tickUiTransitionState(halfway, 50);

    expect(halfway.phase).toBe('entering');
    expect(halfway.progress).toBeCloseTo(0.5, 5);
    expect(getUiTransitionOpacity(halfway)).toBeCloseTo(0.5, 5);
    expect(entered.phase).toBe('entered');
    expect(entered.visible).toBe(true);
    expect(getUiTransitionOpacity(entered)).toBe(1);

    const exiting = setUiTransitionTarget(entered, false, { duration: 100 });
    const exited = tickUiTransitionState(exiting, 100);
    expect(exited.phase).toBe('exited');
    expect(exited.visible).toBe(false);
    expect(getUiTransitionOpacity(exited)).toBe(0);
  });

  it('honors reduced motion by completing immediately', () => {
    const initial = createUiTransitionState({ duration: 100 });
    const next = setUiTransitionTarget(initial, true, { duration: 100, reduceMotion: true });

    expect(next.phase).toBe('entered');
    expect(next.progress).toBe(1);
  });

  it('preserves in-flight progress when the target is unchanged', () => {
    const initial = createUiTransitionState({ duration: 100 });
    const entering = setUiTransitionTarget(initial, true, { duration: 100 });
    const partial = tickUiTransitionState(entering, 25);
    const unchanged = setUiTransitionTarget(partial, true, { duration: 100 });

    expect(unchanged.phase).toBe('entering');
    expect(unchanged.progress).toBeCloseTo(0.25, 5);
    expect(getUiTransitionOpacity(unchanged)).toBeCloseTo(0.25, 5);
  });

  it('retargets exits from the current opacity without snapping entered', () => {
    const entered = setUiTransitionTarget(createUiTransitionState({ duration: 100 }), true, { duration: 100, reduceMotion: true });
    const exiting = setUiTransitionTarget(entered, false, { duration: 100 });
    const partialExit = tickUiTransitionState(exiting, 40);
    const retargeted = setUiTransitionTarget(partialExit, true, { duration: 100 });

    expect(retargeted.phase).toBe('entering');
    expect(retargeted.progress).toBeCloseTo(0.6, 5);
    expect(getUiTransitionOpacity(retargeted)).toBeCloseTo(0.6, 5);
  });
});
