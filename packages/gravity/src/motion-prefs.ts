import { reduceMotion } from '@celestial/corona';

/**
 * Resolve the effective reduced-motion preference for layout primitives.
 * Pass an explicit boolean to override the environment-derived default.
 */
export function preferReducedMotion(opt?: boolean): boolean {
  if (typeof opt === 'boolean') {
    return opt;
  }
  return reduceMotion();
}
