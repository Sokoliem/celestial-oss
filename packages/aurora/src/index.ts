export {
  bounce,
  breatheAnimation,
  fadeIn,
  pulse,
  shake,
  slideUp,
  wobble,
} from './animation-presets.js';
export { type DecayAnimation, decay } from './decay.js';
export { animationDuration, hasDuration } from './duration.js';
export { easing } from './easing.js';
export { createFrameBudget, type FrameBudget, type FrameFidelityRecommendation, type FrameFidelityTier, recommendFrameFidelity } from './frame-budget.js';
export {
  createSpringHandoff,
  handoffToSpring,
  type LayoutHandoffPresetName,
  layoutHandoffPresets,
} from './handoff.js';
export {
  type Animatable,
  clone,
  getInterpolator,
  type Interpolator,
  interpolate,
  interpolateArray,
  interpolateNumber,
  interpolateObject,
  interpolateValue,
  interpolateWithType,
  type ParticleValue,
  type PhysicalAnimatable,
  registerInterpolator,
} from './interpolate.js';
export {
  type InterruptibleAnimation,
  type InterruptState,
  interruptible,
} from './interruptible.js';
export { keyframes } from './keyframes.js';
export {
  arc,
  bezier,
  circle,
  cubicBezier,
  ellipse,
  line,
  path,
  quadraticBezier,
  sineWave,
  spiral,
} from './motion.js';
export {
  createSpringConfig,
  type SpringPresetName,
  springPresets,
  springWith,
} from './presets.js';
export {
  delay,
  loop,
  parallel,
  repeat,
  type StaggerDelayResolver,
  type StaggerOrigin,
  sequence,
  stagger,
  staggerGrid,
  yoyo,
} from './sequence.js';
export { type SpringAnimation, spring } from './spring.js';
export {
  createTimeline,
  type Timeline,
  type TimelineMarker,
  type TimelineTrack,
} from './timeline.js';
export { type Transition, transition } from './transition.js';
export { tween } from './tween.js';
export type {
  Animation,
  AnimationCallbacks,
  DecayConfig,
  EasingFn,
  Keyframe,
  KeyframesConfig,
  MotionAnimation,
  PathConfig,
  SpringConfig,
  SpringPreset,
  TimedAnimation,
  TweenConfig,
} from './types.js';
export {
  morph,
  pulse as pulseUi,
  type SlideInValue,
  slideIn,
  snap,
  softFade,
  UI_PRESET_DESCRIPTORS,
  type UiPresetDescriptor,
  type UiPresetName,
  type UiPresetOptions,
  uiPresets,
} from './ui-presets.js';
export {
  createUiTransitionState,
  getUiTransitionOpacity,
  isUiTransitionComplete,
  setUiTransitionTarget,
  tickUiTransitionState,
  type UiTransitionConfig,
  type UiTransitionPhase,
  type UiTransitionState,
} from './ui-transition.js';

// Backdrop transition preset — Phase 0 P0-12 (wrapper-motion.ts replacement)
export {
  type BackdropTransitionState,
  type CreateBackdropTransitionOptions,
  DEFAULT_BACKDROP_BOOTSTRAP_MS,
  DEFAULT_BACKDROP_DURATION_MS,
  createBackdropTransition,
  getBackdropOpacity,
  isBackdropSettled,
  setBackdropVisible,
  tickBackdropTransition,
} from './backdrop-transition.js';
