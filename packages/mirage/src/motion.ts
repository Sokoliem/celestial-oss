import { reduceMotion } from '@celestial/corona';

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
  return shouldReduce ? staticTick : opts.tick;
}

/** Whether a dynamic VNode effect should collapse to its static identity. */
export function shouldReduceMotion(opts: MotionEffectOpts): boolean {
  return opts.reduceMotion ?? (opts.respectReducedMotion !== false && reduceMotion());
}
