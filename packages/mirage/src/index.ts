export {
  type AnimatedBgGradientOpts,
  animatedBgGradient,
  type BgGradientOpts,
  type BgPulseOpts,
  bgGradient,
  bgPulse,
} from './background.js';
export { type ChromaticTextOpts, chromaticText } from './chromatic.js';
// --- Effect composition primitives ---
export {
  compose,
  createEffectContext,
  type Effect,
  type EffectContext,
  type EffectContextSubscriber,
  type GlitchEffectOpts,
  type GradientEffectOpts,
  glitch,
  gradientEffect,
  mapTextContent,
  type ScanEffectOpts,
  scan,
} from './compose.js';
export {
  type AnimatedGradientOpts,
  animatedGradient,
  type EasedBreatheOpts,
  type EasedColorCycleOpts,
  type EasedShimmerOpts,
  easedBreathe,
  easedColorCycle,
  easedShimmer,
} from './eased.js';
export {
  type BreatheOpts,
  breathe,
  type ColorCycleOpts,
  colorCycle,
  type GlowOpts,
  glow,
  type ShimmerOpts,
  shimmer,
} from './effects.js';
export { type GradientOpts, gradient } from './gradient.js';
export { colorToHSL, interpolateColor, interpolateOKLAB, interpolateOKLCH } from './interpolate.js';
export type { MotionEffectOpts } from './motion.js';
export { type NeonSignOpts, neonSign } from './neon-sign.js';
// --- Per-glyph easing ---
export {
  cellProgress,
  ease,
  type PerGlyphOpts,
  type PerGlyphProperty,
  perGlyph,
} from './per-glyph.js';
export { type SpotlightOpts, spotlight } from './spotlight.js';
export { type StencilOpts, stencil } from './stencil.js';
export { type UnderlineWaveOpts, underlineWave } from './underline-wave.js';
