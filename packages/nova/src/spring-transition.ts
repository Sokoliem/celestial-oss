/**
 * Spring-physics transition engine.
 *
 * Wraps Aurora's spring animation to drive transition progress using
 * physics-based motion instead of linear duration-based timing. Springs
 * produce natural overshoot, settle, and can be re-targeted mid-flight
 * with velocity continuity.
 *
 * Usage:
 *   const tx = createSpringTransition({
 *     strategy: 'slide',
 *     direction: 'left',
 *     spring: { stiffness: 300, damping: 20 },
 *   });
 *
 *   tx.start(now);
 *   tx.tick(now + 16);
 *   const frame = tx.render('old view', 'new view');
 */

import type { SpringConfig, SpringPreset } from '@celestial/aurora';
import { spring as createSpring, type SpringAnimation } from '@celestial/aurora';
import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { RippleOrigin } from './strategies/ripple.js';
import { safeContent } from './strategies/text.js';
import { finiteNumber } from './validation.js';

export type SpringTransitionStrategy = 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter' | 'glitch';

export interface SpringTransitionConfig extends MotionPreference {
  /** Visual strategy for the transition. Default: 'crossfade'. */
  strategy?: SpringTransitionStrategy;
  /** Direction for slide/wipe strategies. Default: 'left'. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Ripple origin for ripple transitions. */
  rippleOrigin?: RippleOrigin;
  /** Flip axis for flip transitions. */
  flipAxis?: FlipAxis;
  /** Cursor for typewriter transitions. */
  typewriterCursor?: string;
  /** Spring configuration — stiffness, damping, mass, precision. */
  spring: SpringConfig | SpringPreset;
}

export interface SpringTransitionController {
  /** Begin the transition. Call once when the content key changes. */
  start(now: number): void;
  /** Advance the spring physics. Call every frame. */
  tick(now: number): void;
  /** Render the current transition frame. */
  render(oldContent: string, newContent: string): string;
  /** Current progress (0..1+, may overshoot with bouncy springs). */
  progress(): number;
  /** Whether the spring has settled at the target. */
  done(): boolean;
  /** Reset to initial state. */
  reset(): void;
  /**
   * Re-target the spring mid-flight. Useful for interrupted transitions:
   * the spring preserves current velocity and redirects toward the new target.
   * target=1 means complete the transition; target=0 means cancel/revert.
   */
  retarget(target: number): void;
}

/**
 * Normalize a SpringConfig | SpringPreset into a full SpringConfig<number>.
 * SpringPreset is a plain { stiffness, damping, mass?, precision? } object.
 * SpringConfig extends that with callbacks and `from`/`initialVelocity`.
 * We pick out the physics fields explicitly to avoid TS spread union issues.
 */
function toSpringConfig(input: SpringConfig | SpringPreset, from: number): SpringConfig {
  const base: SpringConfig = {
    stiffness: input.stiffness,
    damping: input.damping,
    ...(input.mass !== undefined && { mass: input.mass }),
    ...(input.precision !== undefined && { precision: input.precision }),
    from,
  };

  // If the input is a full SpringConfig, preserve callbacks and velocityPrecision
  if ('onStart' in input || 'onUpdate' in input || 'onComplete' in input || 'onCancel' in input || 'initialVelocity' in input || 'velocityPrecision' in input) {
    const full = input as SpringConfig;
    return {
      ...base,
      ...(full.onStart && { onStart: full.onStart }),
      ...(full.onUpdate && { onUpdate: full.onUpdate }),
      ...(full.onComplete && { onComplete: full.onComplete }),
      ...(full.onCancel && { onCancel: full.onCancel }),
      ...(full.initialVelocity !== undefined && { initialVelocity: full.initialVelocity }),
      ...(full.velocityPrecision !== undefined && { velocityPrecision: full.velocityPrecision }),
    };
  }

  return base;
}

export function createSpringTransition(config: SpringTransitionConfig): SpringTransitionController {
  const strategy = config.strategy ?? 'crossfade';
  const direction = config.direction ?? 'left';
  const rippleOrigin = config.rippleOrigin;
  const flipAxis = config.flipAxis ?? 'horizontal';
  const typewriterCursor = config.typewriterCursor ?? '▌';
  const reducedMotion = shouldReduceMotion(config);

  // Build spring config: animate from 0 to 1
  const fromValue = 'from' in config.spring && config.spring.from !== undefined ? ((config.spring as SpringConfig).from as number) : 0;
  const springConfig: SpringConfig = toSpringConfig(config.spring, fromValue);

  const springAnim: SpringAnimation = createSpring(1, springConfig);
  let started = false;

  return {
    start(now: number): void {
      const time = finiteNumber(now, 'now');
      started = true;
      if (reducedMotion) {
        springAnim.setTarget(1);
        springAnim.seek(1);
        return;
      }
      springAnim.start();
      springAnim.tick(time);
    },

    tick(now: number): void {
      const time = finiteNumber(now, 'now');
      if (!started || reducedMotion) return;
      springAnim.tick(time);
    },

    render(oldContent: string, newContent: string): string {
      const safeOldContent = safeContent(oldContent);
      const safeNewContent = safeContent(newContent);
      if (!started) return safeOldContent;
      if (reducedMotion) return safeNewContent;
      return applyStrategy(strategy, safeOldContent, safeNewContent, springAnim.value(), {
        direction,
        rippleOrigin,
        flipAxis,
        typewriterCursor,
        clampProgress: true,
      });
    },

    progress(): number {
      if (started && reducedMotion) return 1;
      return springAnim.value();
    },

    done(): boolean {
      if (started && reducedMotion) return true;
      return springAnim.done();
    },

    reset(): void {
      springAnim.reset();
      started = false;
    },

    retarget(target: number): void {
      springAnim.setTarget(target);
    },
  };
}
