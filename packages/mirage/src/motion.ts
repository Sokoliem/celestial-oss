import { reduceMotion } from '@celestial/corona';
import { finiteNumber } from './validation.js';

/** Shared accessibility controls for time-based Mirage effects. */
export interface MotionEffectOpts {
  /** Explicit reduced-motion override. Environment preferences are used when omitted. */
  reduceMotion?: boolean;
  /** Set false only when motion is essential to the experience. Default: true. */
  respectReducedMotion?: boolean;
}

/** Resolve a stable tick when reduced motion is requested. */
export function motionTick(opts: MotionEffectOpts & { tick: number }, staticTick = 0): number {
  const shouldReduce = opts.reduceMotion ?? (opts.respectReducedMotion !== false && reduceMotion());
  if (shouldReduce) return Number.isFinite(staticTick) || staticTick === Number.POSITIVE_INFINITY ? staticTick : 0;
  return finiteNumber(opts.tick, 0);
}

/** Whether a dynamic VNode effect should collapse to its static identity. */
export function shouldReduceMotion(opts: MotionEffectOpts): boolean {
  return opts.reduceMotion ?? (opts.respectReducedMotion !== false && reduceMotion());
}
