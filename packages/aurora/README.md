# @celestial/aurora

Animation primitives for the Celestial TUI ecosystem. Aurora provides easing curves, tweens, springs, keyframes, path motion, timelines, sequencing helpers, and interpolation utilities for numbers, arrays, nested objects, and hex colors.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Highlights

- Multi-value animation for numbers, objects, and arrays
- Rich easing set including sine, expo, circ, elastic, back, bounce, cubic bezier, and steps
- Tween, spring, keyframe, and path-based animation primitives
- Decay, interruptible spring handoff, and frame-budget helpers for gesture-driven motion
- Reducer-friendly UI transition state for Elm-style update loops
- Sequencing helpers for chaining, parallel playback, staggering, looping, yoyo, and delays
- Timeline composition with markers and scrubbing
- Built-in OKLCH hex color interpolation and declarative presets
- Built-in animation presets including `wobble()` and `breatheAnimation()`
- Built-in named particle interpolation via `interpolate: 'particle'`
- Playback controls: pause, resume, seek, reverse, speed, progress, and direction
- Lifecycle callbacks: `onStart`, `onUpdate`, `onComplete`, `onCancel`
- Spring handoff presets, fidelity recommendations, and interpolation helpers for higher-level animation systems
- Runtime validation for public factories and finite numeric animation values
- Optional duration metadata for primitives and duration-aware composites

## Quick Start

```typescript
import {
  tween,
  spring,
  easing,
  sequence,
  springPresets,
  wobble,
  breatheAnimation,
  createUiTransitionState,
  setUiTransitionTarget,
  tickUiTransitionState,
} from '@celestial/aurora';

const fadeIn = tween({
  from: 0,
  to: 1,
  duration: 200,
  easing: easing.easeOutCubic,
});

const settle = spring({ x: 30, y: 12 }, {
  ...springPresets.snappy,
  from: { x: 0, y: 0 },
});

const intro = sequence(
  fadeIn,
  tween({ from: 1, to: 0.85, duration: 120 })
);

intro.tick(Date.now());
settle.tick(Date.now());

const attention = wobble();
const pulse = breatheAnimation();

let overlay = createUiTransitionState();
overlay = setUiTransitionTarget(overlay, true);
overlay = tickUiTransitionState(overlay, 16);
```

## Core API

### Tween

```typescript
import { tween, easing } from '@celestial/aurora';

const anim = tween({
  from: { x: 0, y: 0 },
  to: { x: 100, y: 50 },
  duration: 500,
  easing: easing.easeOutCubic,
});
```

- Supports `number`, object, and array values.
- `delay` defaults to `0`.
- `easing` defaults to linear.
- `interpolate` accepts an `Interpolator<T>` or a registered string name for custom interpolation.

### Spring

```typescript
import { spring, springPresets, springWith } from '@celestial/aurora';

const snap = spring(100, springPresets.snappy);

const custom = spring(100, springWith('gentle', {
  from: 0,
  mass: 2,
}));

const thrown = spring({ x: 100, y: 40 }, {
  ...springPresets.bouncy,
  from: { x: 0, y: 0 },
  initialVelocity: { x: 500, y: 0 },
});
```

- `spring(target, config)` animates toward the target and returns `SpringAnimation<T>`.
- `setTarget(next)` retargets a running spring.
- Omitting `from` creates a zero-like value matching the target shape.
- `precision` defaults to `0.01`; `velocityPrecision` defaults to `precision`.
- Throws `RangeError` if stiffness exceeds the stability limit for the given mass.

### Keyframes

```typescript
import { keyframes, easing } from '@celestial/aurora';

const bounce = keyframes({
  keyframes: [
    { offset: 0, value: { y: 0 } },
    { offset: 0.4, value: { y: -100 }, easing: easing.easeOut },
    { offset: 0.6, value: { y: -100 } },
    { offset: 1, value: { y: 0 }, easing: easing.bounce },
  ],
  duration: 800,
});
```

- Keyframes are sorted internally.
- The first keyframe must use `offset: 0`.
- The last keyframe must use `offset: 1`.
- Set `loop: true` to repeat automatically.

### Transition

```typescript
import {
  transition,
  easing,
  createUiTransitionState,
  setUiTransitionTarget,
  tickUiTransitionState,
  getUiTransitionOpacity,
} from '@celestial/aurora';

let target = 0;

const smooth = transition(() => target, 250, easing.easeOutCubic);

smooth.update(100);  // from = getCurrentValue() = 0, to = 100
smooth.tick();       // smoothly transitions from 0 to 100
```

- `transition(getCurrentValue, duration, easingFn?)` creates a numeric smoother.
- The getter `getCurrentValue` is called once during the first `update()` to determine the starting value.
- Subsequent `update()` calls use the current tween value as the starting point, so changes mid-transition are smooth.
- Returns a `Transition` object with `value()`, `update(newTarget)`, and `tick(now?)`.

`createUiTransitionState()`, `setUiTransitionTarget()`, and `tickUiTransitionState()` provide a serializable visibility transition model for reducers. The state stores phase, elapsed time, progress, and eased progress, and `getUiTransitionOpacity()` maps it directly to fade opacity. Pass `reduceMotion: true` to complete transitions immediately while preserving the same state shape.

### Decay

```typescript
import { decay } from '@celestial/aurora';

const fling = decay(0, {
  velocity: 120,
  deceleration: 0.95,
  clamp: [0, 40],
});
```

- `decay(from, config)` models momentum fading toward rest.
- `velocity()` exposes the current scalar velocity.
- Use `clamp` to stop at a hard boundary such as scroll extents.

### Timeline

```typescript
import { createTimeline, fadeIn, slideUp } from '@celestial/aurora';

const timeline = createTimeline();
timeline.add('opacity', fadeIn(), { at: 0, duration: 200 });
timeline.add('offset', slideUp(2), { at: 60, duration: 240 });
timeline.addMarker('intro-ready', 120);

timeline.seek(90);
timeline.values();
timeline.passedMarkers();
```

- `createTimeline()` composes animations on a shared clock.
- `seek(timeMs)` and `scrub(progress)` update all tracks deterministically.
- Markers provide named checkpoints for orchestrated UI transitions.

## Playback Controls

Most Aurora animations expose the shared `Animation<T>` interface:

```typescript
interface Animation<T extends Animatable = number> {
  value(): T;
  done(): boolean;
  reset(): void;
  start(): void;
  stop(): void;
  tick(now?: number): void;
  pause(): void;
  resume(): void;
  seek(progress: number): void;
  reverse(): void;
  speed(factor: number): void;
  progress(): number;
  direction(): 1 | -1;
  playing(): boolean;
  duration?(): number;
}
```

```typescript
const anim = tween({ from: 0, to: 100, duration: 1000 });

anim.pause();
anim.resume();
anim.seek(0.5);
anim.reverse();
anim.speed(2);

anim.progress();
anim.direction();
anim.playing();
anim.done();
```

`seek()` is supported on tweens, keyframes, springs, sequence/parallel/stagger composites, and timeline tracks.

Animations with known timing expose `duration?(): number`. Use `animationDuration(animation)` to read that metadata safely, or `hasDuration(animation)` to narrow an animation to `TimedAnimation<T>`. Tweens include delay in their reported duration; springs and decays report a measured settle duration; composites use known child durations when all children expose timing metadata and fall back to equal weighting for custom animations that do not.

## Animation Presets

```typescript
import {
  fadeIn,
  slideUp,
  pulse,
  bounce,
  shake,
  wobble,
  breatheAnimation,
} from '@celestial/aurora';
```

`wobble(angle?, options?)` is a damped keyframe preset for attention and error states. `breatheAnimation(options?)` is a smooth 0→1 tween intended for looping pulse indicators and ambient motion.

## Lifecycle Callbacks

```typescript
const anim = tween({
  from: 0,
  to: 100,
  duration: 1000,
  onStart: (animation) => console.log('started', animation.value()),
  onUpdate: (value, progress, animation) => console.log(value, progress, animation.value()),
  onComplete: (animation) => console.log('complete', animation.value()),
  onCancel: (animation) => console.log('cancelled', animation.value()),
});
```

All four callbacks receive the `Animation<T>` instance as their last argument. `onUpdate` additionally receives the current interpolated `value` and normalized `progress` (0-1). Callbacks are available on tweens, springs, keyframes, and path animations.

## Sequencing Helpers

```typescript
import { sequence, parallel, stagger, staggerGrid, loop, repeat, yoyo, delay, tween } from '@celestial/aurora';

const seq = sequence(
  tween({ from: 0, to: 50, duration: 200 }),
  tween({ from: 50, to: 100, duration: 200 })
);

const par = parallel(
  tween({ from: 0, to: 1, duration: 300 }),
  tween({ from: 0, to: 10, duration: 300 })
);

const cascaded = stagger([
  tween({ from: 0, to: 1, duration: 150 }),
  tween({ from: 0, to: 1, duration: 150 }),
  tween({ from: 0, to: 1, duration: 150 }),
], 80);

const repeating = loop(tween({ from: 0, to: 1, duration: 500 }));
const repeat3 = repeat(tween({ from: 0, to: 1, duration: 500 }), 3);
const pingPong = yoyo(tween({ from: 0, to: 1, duration: 250 }), 2);
const gridDelay = staggerGrid(3, 3, { from: 'center', delay: 40 });
const delayed = delay(tween({ from: 0, to: 100, duration: 300 }), 200);
```

- `sequence(...animations)` plays animations one after another.
- `parallel(...animations)` plays all animations simultaneously.
- `stagger(animations, delayMs)` starts each animation with an offset.
- `staggerGrid(rows, cols, { from, delay })` returns a 2D stagger resolver for row-major grids.
- `loop(animation, count?)` repeats an animation. Omit `count` for infinite looping.
- `repeat(animation, count?)` is the named loop alias.
- `yoyo(animation, count?)` alternates forward and reverse passes.
- `delay(animation, ms)` postpones the start of an animation.
- Composite `seek()` and `progress()` are duration-aware when child animations expose `duration()` metadata. Custom animations without metadata retain the legacy equal-weight behavior.

## Path Motion

```typescript
import {
  bezier,
  quadraticBezier,
  cubicBezier,
  arc,
  circle,
  ellipse,
  line,
  path,
  spiral,
  sineWave,
} from '@celestial/aurora';
```

### Basic Paths

```typescript
const orbit = circle({ x: 50, y: 50 }, 25, { duration: 2000, loop: true });
const swing = arc({ x: 50, y: 50 }, 30, 0, Math.PI, { duration: 1000 });
const straight = line({ x: 0, y: 0 }, { x: 100, y: 40 }, { duration: 600 });
const route = path([
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 20 },
  { x: 100, y: 20 },
], { duration: 1200 });
```

### Bezier Curves

```typescript
const curve = bezier(
  [{ x: 0, y: 0 }, { x: 50, y: -80 }, { x: 100, y: 80 }, { x: 150, y: 0 }],
  { duration: 1500 }
);

const quad = quadraticBezier({ x: 0, y: 0 }, { x: 50, y: -80 }, { x: 100, y: 0 }, { duration: 800 });
const cubic = cubicBezier({ x: 0, y: 0 }, { x: 33, y: -60 }, { x: 66, y: 60 }, { x: 100, y: 0 }, { duration: 1000 });
```

### Ellipse

```typescript
const oval = ellipse({ x: 50, y: 25 }, 40, 15, { duration: 2000, loop: true });
```

### Spiral

```typescript
const inward = spiral({ x: 50, y: 25 }, 30, 5, 3, { duration: 3000 });
```

- `spiral(center, startRadius, endRadius, turns, config)` traces a spiral from `startRadius` to `endRadius` over the given number of turns.

### Sine Wave

```typescript
const wave = sineWave({ x: 0, y: 25 }, { x: 100, y: 25 }, 10, 3, { duration: 2000 });
```

- `sineWave(start, end, amplitude, frequency, config)` traces a sinusoidal wave from `start` to `end` with the given amplitude and frequency.

### PathConfig

All path helpers return `Animation<{ x: number; y: number }>` and accept:

```typescript
interface PathConfig extends AnimationCallbacks<{ x: number; y: number }> {
  duration: number;
  easing?: EasingFn;
  loop?: boolean;
}
```

## Easing

```typescript
import { easing } from '@celestial/aurora';

easing.linear(t)
easing.easeInQuad(t)
easing.easeOutCubic(t)
easing.easeInOutQuint(t)
easing.easeInSine(t)
easing.easeOutExpo(t)
easing.easeInOutCirc(t)
easing.easeOutElastic(t)
easing.easeInOutBack(t)
easing.easeOutBounce(t)

const custom = easing.cubicBezier(0.25, 0.1, 0.25, 1);
const stepped = easing.steps(4, true);
```

Full set of named easings: `linear`, `easeIn`, `easeOut`, `easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInQuint`, `easeOutQuint`, `easeInOutQuint`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInCirc`, `easeOutCirc`, `easeInOutCirc`, `easeInElastic`, `easeOutElastic`, `easeInOutElastic`, `easeInBack`, `easeOutBack`, `easeInOutBack`, `easeInBounce`, `easeOutBounce`, `easeInOutBounce`.

Aliases: `elastic`, `bounce`, `backIn`, `backOut`, `backInOut`.

Factory functions: `cubicBezier(x1, y1, x2, y2)`, `steps(steps, jumpStart?)`.

## Interpolation Utilities

```typescript
import {
  interpolate,
  interpolateValue,
  interpolateNumber,
  interpolateObject,
  interpolateArray,
  interpolateWithType,
  registerInterpolator,
  getInterpolator,
  clone,
  type ParticleValue,
} from '@celestial/aurora';

const point = interpolateValue({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5);
const scalar = interpolateNumber(0, 100, 0.25);
const copy = clone({ pos: { x: 1, y: 2 } });

registerInterpolator('custom', (from, to, progress) => from);
const interpolator = getInterpolator('custom');
const typed = interpolateWithType([0, 0], [100, 50], 0.5, 'custom');
const brand = interpolateValue('#ff0000', '#00ff00', 0.5);
const particle = tween({
  from: { x: 0, y: 0, opacity: 0 },
  to: { x: 12, y: 4, opacity: 1 },
  duration: 250,
  interpolate: 'particle',
});
```

- `interpolate(from, to, progress)` auto-dispatches to `interpolateNumber`, `interpolateObject`, or `interpolateArray` based on the types of `from` and `to`. Use this when the value types are dynamic or unknown.
- Matching `#rgb` and `#rrggbb` pairs interpolate through OKLCH and normalize to lowercase `#rrggbb`.
- `interpolateValue(from, to, progress)` is the typed convenience wrapper over `interpolate()`.
- `interpolateObject()` and `interpolateArray()` recurse into nested values.
- Non-numeric leaves switch from `from` to `to` at `progress >= 0.5`.
- Use the built-in `'color'` interpolator name to force color interpolation in custom tween configs.
- Use the built-in `'particle'` interpolator name for `{ x, y, opacity }` values.

## Motion Utilities

```typescript
import {
  createFrameBudget,
  createSpringHandoff,
  handoffToSpring,
  interruptible,
  recommendFrameFidelity,
  tween,
} from '@celestial/aurora';

const budget = createFrameBudget(60);
const move = interruptible(tween({ from: 0, to: 100, duration: 150 }));

move.handoff(createSpringHandoff(150, 'snappyPanel'));

const fidelity = budget.recommendation();
const fallback = recommendFrameFidelity(0.4);
handoffToSpring(move, 0, 'preciseCollapse');
```

- `interruptible(animation)` wraps an animation with `velocity()` and `handoff(...)`.
- `createFrameBudget(targetFps)` tracks per-frame cost and exposes a fidelity hint from `0.25` to `1`.
- `FrameBudget.recommendation()` and `recommendFrameFidelity()` convert a numeric fidelity into `full`, `high`, `reduced`, or `minimal` tiers for deciding which motion and visual effects to render under load.
- `createSpringHandoff()` and `handoffToSpring()` preserve sampled value and velocity when an interruptible animation retargets into a layout spring. Built-in layout presets are `snappyPanel`, `gentleOverlay`, and `preciseCollapse`.

## Runtime Validation

Aurora validates public factory inputs at construction time and control inputs at use time:

- Non-finite numeric inputs throw `TypeError`.
- Invalid ranges, such as non-positive durations, negative delays, empty interpolator names, and out-of-range keyframe offsets, throw `RangeError`.
- Spring `from`, `target`, and `initialVelocity` values must be finite numeric shapes with matching object keys and array lengths.
- Unknown named interpolators passed to `interpolateWithType()` or `interpolate: 'name'` throw `RangeError`.
- Explicit `tick(now)` clocks are respected across pause/resume so paused external time is not counted as animation time.

## Spring Presets

### `springPresets`

```typescript
import { springPresets } from '@celestial/aurora';

springPresets.snappy
springPresets.gentle
springPresets.bouncy
```

| Preset | Stiffness | Damping | Feel |
|--------|-----------|---------|------|
| `snappy` | 400 | 25 | Quick, responsive |
| `gentle` | 120 | 14 | Soft, smooth |
| `bouncy` | 300 | 10 | Playful, springy |
| `stiff` | 500 | 30 | Rigid, minimal bounce |
| `slow` | 100 | 20 | Gradual, relaxed |
| `molasses` | 50 | 15 | Very slow, syrupy |
| `wobbly` | 180 | 8 | Oscillating, fun |
| `rubber` | 200 | 12 | Elastic, stretchy |
| `noMotion` | 1000 | 100 | Very fast settling |

### `springWith`

Creates a `SpringConfig<T>` from a preset name with optional overrides. Stiffness and damping from the preset **cannot** be overridden — the `overrides` parameter accepts `Partial<Omit<SpringConfig<T>, 'stiffness' | 'damping'>>`, so only `mass`, `precision`, `velocityPrecision`, `from`, `initialVelocity`, and lifecycle callbacks can be customized.

```typescript
import { springWith } from '@celestial/aurora';

const config = springWith('bouncy', { mass: 2, from: 0 });
```

### `createSpringConfig`

Creates a `SpringConfig<T>` from a preset name with optional overrides. Unlike `springWith`, this function accepts `Partial<SpringConfig<T>>`, allowing **all** properties (including `stiffness` and `damping`) to be overridden.

```typescript
import { createSpringConfig } from '@celestial/aurora';

const config = createSpringConfig('snappy', { stiffness: 600, precision: 0.001 });
```

> **Note:** `springWith` locks stiffness and damping to the preset values, while `createSpringConfig` allows overriding every property. Choose `springWith` when you want predictable preset behavior, and `createSpringConfig` when you need full control.

## Types

### `Animatable`

```typescript
type Animatable = number | Record<string, unknown> | unknown[] | string;
```

### `ParticleValue`

```typescript
interface ParticleValue {
  x: number;
  y: number;
  opacity?: number;
}
```

### `Interpolator<T>`

```typescript
interface Interpolator<T> {
  (from: T, to: T, progress: number): T;
}
```

### `Animation<T>`

```typescript
interface Animation<T extends Animatable = number> {
  value(): T;
  done(): boolean;
  reset(): void;
  start(): void;
  stop(): void;
  tick(now?: number): void;
  pause(): void;
  resume(): void;
  seek(progress: number): void;
  reverse(): void;
  speed(factor: number): void;
  progress(): number;
  direction(): 1 | -1;
  playing(): boolean;
  duration?(): number;
}
```

### `TimedAnimation<T>`

```typescript
type TimedAnimation<T extends Animatable = number> = Animation<T> & {
  duration(): number;
};
```

### `MotionAnimation<T>`

```typescript
interface MotionAnimation<T extends PhysicalAnimatable = number> extends Animation<T> {
  velocity(): T;
}
```

### `SpringAnimation<T>`

Extends `MotionAnimation<T>` with retargeting:

```typescript
interface SpringAnimation<T extends PhysicalAnimatable = number> extends MotionAnimation<T> {
  setTarget(target: T): void;
}
```

### `AnimationCallbacks<T>`

```typescript
interface AnimationCallbacks<T extends Animatable = number> {
  onStart?: (animation: Animation<T>) => void;
  onUpdate?: (value: T, progress: number, animation: Animation<T>) => void;
  onComplete?: (animation: Animation<T>) => void;
  onCancel?: (animation: Animation<T>) => void;
}
```

### `Transition`

```typescript
interface Transition {
  value(): number;
  update(newTarget: number): void;
  tick(now?: number): void;
}
```

### `TweenConfig<T>`

```typescript
interface TweenConfig<T extends Animatable = number> extends AnimationCallbacks<T> {
  readonly from: T;
  readonly to: T;
  readonly duration: number;
  readonly easing?: EasingFn;
  readonly delay?: number;
  readonly interpolate?: Interpolator<T> | string;
}
```

### `SpringConfig<T>`

```typescript
interface SpringConfig<T extends Animatable = number> extends AnimationCallbacks<T> {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass?: number;
  readonly precision?: number;
  readonly velocityPrecision?: number;
  readonly from?: T;
  readonly initialVelocity?: T;
}
```

### `Keyframe<T>`

```typescript
interface Keyframe<T extends Animatable = number> {
  offset: number;
  value: T;
  easing?: EasingFn;
}
```

### `KeyframesConfig<T>`

```typescript
interface KeyframesConfig<T extends Animatable = number> extends AnimationCallbacks<T> {
  keyframes: Keyframe<T>[];
  duration: number;
  loop?: boolean;
}
```

### `PathConfig`

```typescript
interface PathConfig extends AnimationCallbacks<{ x: number; y: number }> {
  duration: number;
  easing?: EasingFn;
  loop?: boolean;
}
```

### `SpringPreset`

```typescript
interface SpringPreset {
  stiffness: number;
  damping: number;
  mass?: number;
  precision?: number;
}
```

### `SpringPresetName`

```typescript
type SpringPresetName = keyof typeof springPresets;
```

### `EasingFn`

```typescript
type EasingFn = (t: number) => number;
```

## Related Packages

- `@celestial/core` - the recommended facade for Aurora and the other preview foundations
- `@celestial/horizon` - window and layout animation built on Aurora primitives

## License

MIT
