import { reduceMotion as detectReducedMotion } from '@celestial/corona';

/** Accessibility controls shared by Nova's transition controllers. */
export interface MotionPreference {
  /** Explicit reduced-motion override. Environment preferences are used when omitted. */
  reduceMotion?: boolean;
  /** Set false only when motion is essential. Default: true. */
  respectReducedMotion?: boolean;
}

export function shouldReduceMotion(options: MotionPreference): boolean {
  return options.reduceMotion ?? (options.respectReducedMotion !== false && detectReducedMotion());
}
