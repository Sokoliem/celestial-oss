/**
 * Easing presets re-exported from `@celestial/aurora`.
 *
 * Every nova controller's `easing` option accepts a `(t: number) => number`
 * function. Aurora ships the canonical implementations (eased / quad / cubic /
 * quart / quint / sine / expo / circ / back / elastic / bounce, in/out/inOut
 * variants). They live here too so consumers of nova don't need to add an
 * extra dependency on aurora just to import an easing curve.
 *
 * Usage:
 *   import { easing, type EasingFn } from '@celestial/nova';
 *   const controller = createTransition({ type: 'slide', easing: easing.easeOutBack });
 */

export type { EasingFn } from '@celestial/aurora';
export { easing } from '@celestial/aurora';
