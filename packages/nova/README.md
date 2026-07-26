# @celestial/nova

View transitions and motion utilities for the Celestial TUI ecosystem.

Nova covers four related jobs:
- key-driven content transitions with internal state management
- ten pure transition strategies: slide, crossfade, wipe, morph, blur, dissolve, zoom, ripple, flip, and typewriter
- physics-based and gesture-driven transition engines wrapping Aurora springs and Nexus drag
- shared-element transition composition for cross-view element continuity

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Quick Start

```typescript
import { transition } from '@celestial/nova';

let tick = 0;

const firstFrame = transition('Home', {
  key: 'home',
  id: 'main-view',
  tick: tick++,
});

const nextFrame = transition('Settings', {
  key: 'settings',
  id: 'main-view',
  type: 'slide',
  direction: 'left',
  duration: 6,
  tick: tick++,
});
```

`transition()` stores previous content per slot. When `key` changes, Nova animates from the cached content to the new content until `duration` ticks have elapsed.

## Highlights

- `transition()` for stateful key-driven content changes
- Ten pure strategies: `slide()`, `crossfade()`, `wipe()`, `morph()`, `blur()`, `dissolve()`, `zoom()`, `ripple()`, `flip()`, `typewriterReveal()`
- Builder APIs: `createTransition()`, `slideTransition()`, `fadeTransition()`, `wipeTransition()`, `morphTransition()`, `blurTransition()`, `dissolveTransition()`, `zoomTransition()`, `rippleTransition()`, `flipTransition()`, `typewriterTransition()`
- Spring-physics transitions via `createSpringTransition()` wrapping Aurora springs
- Gesture-scrubbed transitions via `createGestureTransition()` bridging Nexus drag to Nova progress
- Shared-element transition compositor via `createSharedElementTransition()`
- Text morphing with `morph()` and `computeMorphOps()`
- Fade helpers: `fadeText()`, `fadeChar()`, `fadeLinePerChar()`
- Composition helpers for Aurora, Mirage, and Nova effects
- Shared-element interpolation helpers for cross-view continuity
- Swipe callback helper via `createSwipeNavigator()`

---

## Core API

### Stateful transitions

```typescript
import { transition, resetTransitionState, type TransitionOpts } from '@celestial/nova';
```

```typescript
function transition(content: string, opts: TransitionOpts): string
function resetTransitionState(): void
```

`resetTransitionState()` clears all cached slot state. Useful in tests.

```typescript
function renderScreen(content: string, viewKey: string, tick: number): string {
  return transition(content, {
    key: viewKey,
    id: 'screen',
    type: 'crossfade',
    duration: 6,
    tick,
  });
}
```

### TransitionOpts

```typescript
interface TransitionOpts {
  key: string | number
  id?: string
  type?: 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter'
  direction?: 'left' | 'right' | 'up' | 'down'
  duration?: number
  tick: number
  easing?: (t: number) => number
  zoomMode?: ZoomMode
  zoomOrigin?: ZoomOrigin
  dissolveSeed?: number
  rippleOrigin?: RippleOrigin
  flipAxis?: FlipAxis
  typewriterCursor?: string
}
```

### ZoomOrigin

```typescript
interface ZoomOrigin {
  x?: number
  y?: number
}
```

Normalized position (0–1). Defaults to `{ x: 0.5, y: 0.5 }` (center).

### RippleOrigin

```typescript
interface RippleOrigin {
  x?: number
  y?: number
}
```

Normalized position (0–1). Defaults to `{ x: 0.5, y: 0.5 }` (center).

### ZoomMode

```typescript
type ZoomMode = 'in' | 'out'
```

`'in'` expands new content from origin outward. `'out'` collapses old content toward origin, revealing new from edges.

### FlipAxis

```typescript
type FlipAxis = 'horizontal' | 'vertical'
```

---

## Pure Strategies

Use the pure strategy functions when you already manage timing elsewhere.

```typescript
import {
  crossfade,
  slide,
  wipe,
  blur,
  dissolve,
  zoom,
  ripple,
  flip,
  typewriterReveal,
  morph,
} from '@celestial/nova';
```

```typescript
function crossfade(oldContent: string, newContent: string, progress: number): string
function slide(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right' | 'up' | 'down'): string
function wipe(oldContent: string, newContent: string, progress: number, direction: 'left' | 'right' | 'up' | 'down'): string
function blur(oldContent: string, newContent: string, progress: number): string
function dissolve(oldContent: string, newContent: string, progress: number, seed?: number): string
function zoom(oldContent: string, newContent: string, progress: number, mode?: ZoomMode, origin?: ZoomOrigin): string
function ripple(oldContent: string, newContent: string, progress: number, originX?: number, originY?: number): string
function flip(oldContent: string, newContent: string, progress: number, axis?: FlipAxis): string
function typewriterReveal(oldContent: string, newContent: string, progress: number, cursor?: string): string
function morph(oldContent: string, newContent: string, opts: MorphOpts): string
```

```typescript
const slideFrame = slide('Old', 'New', 0.5, 'left');
const fadeFrame = crossfade('Old', 'New', 0.5);
const wipeFrame = wipe('Old', 'New', 0.5, 'down');
const blurFrame = blur('Old', 'New', 0.5);
const dissolveFrame = dissolve('Old', 'New', 0.5, 42);
const zoomFrame = zoom('Old', 'New', 0.5, 'in', { x: 0.5, y: 0.5 });
const rippleFrame = ripple('Old', 'New', 0.5, 0.5, 0.5);
const flipFrame = flip('Old', 'New', 0.5, 'horizontal');
const typewriterFrame = typewriterReveal('Old', 'New', 0.5, '▌');
const morphFrame = morph('Old', 'New', { tick: 5, duration: 10 });
```

**Blur** uses Unicode block elements (░▒▓█) to progressively defocus content with color desaturation. The old content blurs out in the first half, then the new content de-blurs in the second half.

**Dissolve** uses a deterministic golden-ratio hash for random character-level reveal, with sparkle effects at flip points. The `seed` parameter controls the randomization pattern.

**Zoom** reveals content using a radial iris effect with configurable origin point and feathered edges. Supports `'in'` (expand from origin) and `'out'` (collapse to origin) modes.

---

## Transition Builders

The builder API matches a more traditional controller shape. All ten strategies are available.

```typescript
import {
  createTransition,
  slideTransition,
  fadeTransition,
  wipeTransition,
  morphTransition,
  blurTransition,
  dissolveTransition,
  zoomTransition,
  rippleTransition,
  flipTransition,
  typewriterTransition,
  type TransitionState,
  type TransitionConfig,
  type TransitionPairConfig,
  type TransitionController,
  type TransitionBuilderType,
} from '@celestial/nova';
```

### Strategy-specific builders

Each builder returns a `TransitionController` with `start`, `tick`, `render`, and `isActive` methods.

```typescript
const slideIn = slideTransition({ direction: 'left', duration: 8 });
const blurOut = blurTransition({ duration: 10 });
const dissolveIn = dissolveTransition({ duration: 12 });
const zoomIn = zoomTransition({ duration: 8 });
const rippleIn = rippleTransition({ duration: 8, rippleOrigin: { x: 0.2, y: 0.3 } });
const flipIn = flipTransition({ duration: 8, flipAxis: 'vertical' });
const typewriterIn = typewriterTransition({ duration: 8, typewriterCursor: '|' });
const morphTo = morphTransition({ duration: 6 });
```

### createTransition()

```typescript
function createTransition(opts: TransitionPairConfig): TransitionController
```

```typescript
const tx = createTransition({
  enter: { type: 'slide', direction: 'right', duration: 8 },
  exit: { type: 'slide', direction: 'left', duration: 8 },
});

const state = tx.tick(tx.start(100), 104);
const frame = tx.render('Old view', 'New view', state);
```

### TransitionState

```typescript
interface TransitionState {
  startTime: number
  progress: number
  complete: boolean
}
```

### TransitionController

```typescript
interface TransitionController {
  start(now: number): TransitionState
  tick(state: TransitionState, now: number): TransitionState
  render(oldContent: string, newContent: string, state: TransitionState): string
  isActive(state: TransitionState): boolean
}
```

---

## Text Motion

### morph()

`morph()` performs spatial text morphing — shared characters serve as stable anchors that slide from their old positions to their new positions, while removed characters shrink away and added characters grow in. All three happen simultaneously with overlapping timing, producing a fluid reorganization instead of a delete-then-insert.

How it works:
1. **LCS alignment** identifies which characters are kept, removed, or added
2. **Kept characters** anchor at full opacity and interpolate their column position from old to new layout
3. **Removed characters** shrink their occupied width (1 to 0) and fade out over `[0, 0.6]` progress
4. **Added characters** grow their width (0 to 1) and fade in over `[0.4, 1.0]` progress
5. **Overlap zone** `[0.4, 0.6]`: both removed and added characters are visible simultaneously
6. **Output width** smoothly interpolates from old length to new length
7. **Color-aware**: preserves ANSI color codes through the animation (true color, 256-color, basic)

Multi-line text is morphed line-by-line, with identical lines passed through unchanged.

```typescript
import { morph, computeMorphOps, type MorphOpts, type MorphOp } from '@celestial/nova';

const frame = morph('Loading...', 'Complete!', {
  tick: 5,
  duration: 10,
});

const eased = morph('Hello World', 'Hello Brave World', {
  tick: 3,
  duration: 10,
  startTick: 0,
  easing: (t) => t * t,
});
```

### MorphOpts

```typescript
interface MorphOpts {
  tick: number
  duration: number
  startTick?: number
  easing?: (t: number) => number
}
```

### computeMorphOps()

```typescript
function computeMorphOps(oldChars: StyledChar[], newChars: StyledChar[]): MorphOp[]
```

For LCS-level control, use `computeMorphOps()` directly:

```typescript
import { computeMorphOps, parseStyledChars } from '@celestial/nova';

const ops = computeMorphOps(
  parseStyledChars('Hello World'),
  parseStyledChars('Hello Brave World'),
);
```

### Fade helpers

```typescript
import { fadeChar, fadeLinePerChar, fadeText, fadeStyledChar, parseStyledChars, stripAnsi, type StyledChar } from '@celestial/nova';
```

```typescript
function fadeText(text: string, opacity: number): string
function fadeChar(char: string, opacity: number): string
function fadeLinePerChar(line: string, opacities: number[]): string
function fadeStyledChar(styled: StyledChar, opacity: number): string
function parseStyledChars(text: string): StyledChar[]
function stripAnsi(text: string): string
```

```typescript
const fullLine = fadeText('System online', 0.65);
const character = fadeChar('A', 0.4);
const feathered = fadeLinePerChar('Hello', [1, 0.8, 0.6, 0.4, 0.2]);
```

`fadeStyledChar` and `parseStyledChars` preserve existing ANSI color codes by modulating the original RGB values instead of replacing them with grayscale.

```typescript
const chars = parseStyledChars('\x1b[38;2;255;0;0mHello\x1b[0m');
const faded = fadeStyledChar(chars[0], 0.5);
```

### StyledChar

```typescript
interface StyledChar {
  ansi: string
  char: string
  plain: string
}
```

---

## Shared Element Helpers

Lightweight shared-element interpolation helpers for cross-view continuity.

```typescript
import {
  createSharedElementState,
  captureElements,
  beginTransition,
  endTransition,
  getTransitionProgress,
  isTransitioning,
  getInterpolatedRect,
  type LayoutRect,
  type CapturedElement,
  type SharedElementState,
} from '@celestial/nova';
```

### Functions

```typescript
function createSharedElementState(): SharedElementState
function captureElements(state: SharedElementState, elements: Map<string, CapturedElement>): SharedElementState
function beginTransition(state: SharedElementState, tick: number, duration: number): SharedElementState
function endTransition(state: SharedElementState): SharedElementState
function getTransitionProgress(state: SharedElementState, tick: number): number
function isTransitioning(state: SharedElementState): boolean
function getInterpolatedRect(state: SharedElementState, id: string, targetRect: LayoutRect, tick: number, easing?: (t: number) => number): LayoutRect
```

### Types

```typescript
interface LayoutRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface CapturedElement {
  rect: LayoutRect
  content: string
}

interface SharedElementState {
  captured: ReadonlyMap<string, CapturedElement>
  transitioning: boolean
  startTick: number
  duration: number
}
```

### Usage

```typescript
let shared = createSharedElementState();
shared = captureElements(shared, new Map([
  ['hero', { rect: { x: 0, y: 0, width: 10, height: 3 }, content: 'Hero' }],
]));
shared = beginTransition(shared, 0, 10);

isTransitioning(shared);             // true
getTransitionProgress(shared, 5);    // 0.5

const rect = getInterpolatedRect(
  shared,
  'hero',
  { x: 20, y: 5, width: 20, height: 3 },
  5,
);

shared = endTransition(shared);       // transitioning = false
```

---

## Shared Element Transition Compositor

The `createSharedElementTransition()` composes background view transitions with shared-element rect interpolation in a single tick-driven controller. During a route change, the background animates using any strategy while shared elements simultaneously fly from source to destination positions.

```typescript
import {
  createSharedElementTransition,
  type SharedElementTransitionConfig,
  type SharedElementTransitionController,
  type SharedElementTransitionState,
  type SharedElementStrategy,
} from '@celestial/nova';
```

```typescript
const controller = createSharedElementTransition({
  strategy: 'zoom',
  direction: 'left',
  zoomMode: 'in',
  zoomOrigin: { x: 0.5, y: 0.5 },
  dissolveSeed: 42,
  duration: 8,
  easing: (t) => t * t,
  onComplete: () => console.log('done'),
});

let state = controller.init();

state = controller.capture(state, new Map([
  ['hero', { rect: { x: 0, y: 0, width: 10, height: 5 }, content: 'Hero' }],
  ['title', { rect: { x: 0, y: 6, width: 20, height: 2 }, content: 'Title' }],
]));

state = controller.begin(state, currentTick);

state = controller.tick(state, currentTick);
const bgFrame = controller.renderBackground(state, oldContent, newContent);
const heroRect = controller.getElementRect(state, 'hero', destHeroRect);
const progress = controller.progress(state);
const active = controller.isActive(state);

state = controller.end(state);
state = controller.reset();
```

All ten strategies are supported: `crossfade`, `slide`, `wipe`, `morph`, `blur`, `dissolve`, `zoom`, `ripple`, `flip`, `typewriter`.

### SharedElementTransitionConfig

```typescript
interface SharedElementTransitionConfig {
  strategy?: SharedElementStrategy
  direction?: 'left' | 'right' | 'up' | 'down'
  duration?: number
  easing?: (t: number) => number
  zoomMode?: ZoomMode
  zoomOrigin?: ZoomOrigin
  dissolveSeed?: number
  rippleOrigin?: RippleOrigin
  flipAxis?: FlipAxis
  typewriterCursor?: string
  onComplete?: () => void
}
```

`direction` sets the background direction for `slide` and `wipe` strategies (default: `'left'`). `zoomOrigin` configures the radial iris origin for the `zoom` strategy. `rippleOrigin` configures the reveal origin for the `ripple` strategy. `flipAxis` controls the collapse axis for `flip`. `typewriterCursor` customizes the insertion cursor for `typewriter`. `dissolveSeed` controls the randomization pattern for the `dissolve` strategy.

### SharedElementTransitionController

```typescript
interface SharedElementTransitionController {
  init(): SharedElementTransitionState
  capture(state, elements): SharedElementTransitionState
  begin(state, tick): SharedElementTransitionState
  tick(state, currentTick): SharedElementTransitionState
  renderBackground(state, oldContent, newContent): string
  getElementRect(state, elementId, targetRect): LayoutRect
  progress(state): number
  isActive(state): boolean
  end(state): SharedElementTransitionState
  reset(): SharedElementTransitionState
}
```

`end()` manually terminates the transition, marking it completed without waiting for the full duration. `reset()` returns a fresh initial state, clearing all captured elements.

---

## Spring-Physics Transitions

Wrap any transition strategy with Aurora's spring physics for natural, interruptible animations. Springs overshoot, settle, and can be retargeted mid-flight.

```typescript
import {
  createSpringTransition,
  type SpringTransitionConfig,
  type SpringTransitionController,
  type SpringTransitionStrategy,
} from '@celestial/nova';
```

```typescript
const spring = createSpringTransition({
  strategy: 'crossfade',
  spring: 'bouncy',
});

let state = spring.start('Old content', 'New content');
state = spring.tick(state, 16);
const frame = spring.render(state);

state = spring.retarget(state, 'Even newer content');
```

Available presets: `snappy`, `gentle`, `bouncy`, `stiff`, `slow`, `responsive`, `wobbly`, `critical`, `overdamped`.

---

## Gesture-Scrubbed Transitions

Bridge Nexus drag events to Nova transition progress for swipe-to-navigate UIs. Drag scrubs the transition; release commits or cancels with a spring settle.

```typescript
import {
  createGestureTransition,
  type GestureTransitionConfig,
  type GestureTransitionController,
  type GestureTransitionStrategy,
  type GesturePhase,
} from '@celestial/nova';
```

```typescript
const gesture = createGestureTransition({
  strategy: 'slide',
  direction: 'left',
  commitThreshold: 0.4,
  velocityThreshold: 0.5,
  spring: 'responsive',
  onCommit: () => router.navigate('/next'),
  onCancel: () => {},
});

let state = gesture.init('Old content', 'New content');

state = gesture.grab(state);
state = gesture.drag(state, 0.35);
const frame = gesture.render(state);
state = gesture.release(state, velocity);
state = gesture.tick(state, 16);
const settlingFrame = gesture.render(state);
```

---

## Swipe Navigation Helper

`createSwipeNavigator()` is a small callback dispatcher for swipe gesture payloads, including gestures produced by `@celestial/nexus`.

```typescript
import {
  createSwipeNavigator,
  type SwipeGesture,
  type SwipeNavigator,
  type SwipeNavigatorOpts,
} from '@celestial/nova';
```

```typescript
const navigator = createSwipeNavigator({
  threshold: 5,
  velocity: 0.2,
  onSwipeLeft: () => ({ type: 'next' }),
  onSwipeRight: () => ({ type: 'back' }),
  onSwipeUp: () => ({ type: 'scroll-up' }),
  onSwipeDown: () => ({ type: 'scroll-down' }),
});

const gesture: SwipeGesture = {
  gesture: 'swipe',
  direction: 'left',
  distance: 12,
  velocity: 0.3,
};

if (navigator.matches(gesture)) {
  const msg = navigator.handleSwipe(gesture);
}
```

### SwipeNavigatorOpts

```typescript
interface SwipeNavigatorOpts<M = unknown> {
  threshold?: number
  velocity?: number
  onSwipeLeft?: () => M
  onSwipeRight?: () => M
  onSwipeUp?: () => M
  onSwipeDown?: () => M
}
```

### SwipeNavigator

```typescript
interface SwipeNavigator<M = unknown> {
  matches(gesture: SwipeGesture): boolean
  handleSwipe(gesture: SwipeGesture): M | undefined
}
```

`matches()` checks whether a gesture meets the configured `threshold` (minimum distance) and `velocity` constraints. `handleSwipe()` returns `undefined` if the gesture doesn't match.

---

## Composition

Nova integrates with Aurora and Mirage through a shared effect model.

```typescript
import {
  compose,
  composeParallel,
  composeSequence,
  composeStagger,
  valueEffect,
  transitionEffect,
  styleEffect,
  type ComposedAnimation,
  type AnimationEffect,
  type ValueEffect,
  type ValueEffectOpts,
  type TransitionEffect,
  type TransitionType,
  type TransitionEffectOpts,
  type StyleEffect,
  type StyleType,
  type StyleEffectOpts,
} from '@celestial/nova';
```

### ComposedAnimation

```typescript
interface ComposedAnimation {
  tick(now: number): void
  done(): boolean
  reset(): void
  applyTransition(oldContent: string, newContent: string): string
  applyStyle(content: string): string
  value(): number
}
```

`applyStyle()` delegates to Mirage's style functions (`shimmer`, `glow`, `breathe`, `colorCycle`) using default colors from `@celestial/corona`. To customize colors, use Mirage directly instead of composing through Nova.

### compose() / composeParallel()

All effects tick simultaneously. `compose` is an alias for `composeParallel`.

```typescript
function composeParallel(...effects: AnimationEffect[]): ComposedAnimation
function compose(...effects: AnimationEffect[]): ComposedAnimation
```

```typescript
const effects = composeParallel(
  valueEffect(tween({ from: 0, to: 100, duration: 10 })),
  transitionEffect('crossfade', { duration: 10 }),
  styleEffect('shimmer', { speed: 1 }),
);
```

### composeSequence()

Effects run one at a time in order. Each effect starts when the previous one completes.

```typescript
function composeSequence(...effects: AnimationEffect[]): ComposedAnimation
```

```typescript
const seq = composeSequence(
  transitionEffect('slide', { duration: 6 }),
  styleEffect('shimmer', { speed: 1 }),
);
```

### composeStagger()

Effects start in parallel, but each one is offset by `delayMs` from the previous.

```typescript
function composeStagger(effects: AnimationEffect[], delayMs: number): ComposedAnimation
```

```typescript
const staggered = composeStagger([
  transitionEffect('crossfade', { duration: 6 }),
  styleEffect('glow', { speed: 1 }),
  valueEffect(tween({ from: 0, to: 100, duration: 6 })),
], 200);
```

### Effect builders

```typescript
function valueEffect(animation: Animation): ValueEffect
function transitionEffect(type: TransitionType, opts?: TransitionEffectOpts): TransitionEffect
function styleEffect(type: StyleType, opts?: StyleEffectOpts): StyleEffect
```

`TransitionType` covers all ten transition strategies. `TransitionEffectOpts` supports `direction`, `rippleOrigin`, `flipAxis`, and `typewriterCursor` where applicable.

`styleEffect` supports exactly four types: `'shimmer'`, `'glow'`, `'breathe'`, and `'colorCycle'`. These effects run indefinitely — `done()` always returns `false` — and are intended for persistent ambient styling. When composed with finite effects via `composeSequence`, style effects will prevent the sequence from completing unless placed last.

---

## Related Packages

- `@celestial/aurora` - numeric animation primitives, spring physics, easing, and tweens
- `@celestial/compass` - dependency-free headless routing and immutable screen navigation that applications can pair with Nova transitions
- `@celestial/mirage` - text styling effects (shimmer, glow, breathe, color cycle)
- `@celestial/nexus` - mouse and gesture recognition primitives (drag, swipe)

## License

MIT
