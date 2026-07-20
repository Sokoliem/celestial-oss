/**
 * Animation effect adapters that unify Aurora animations, Nova transitions,
 * and Mirage style effects under a common interface.
 *
 * Each effect type wraps its underlying system and exposes a consistent
 * tick/done/reset/progress API suitable for composition.
 */

import type { Animation } from '@celestial/aurora';
import { color as coronaColor } from '@celestial/corona';
import { breathe, colorCycle, glow, shimmer } from '@celestial/mirage';
import { type MotionPreference, shouldReduceMotion } from './motion.js';
import { applyStrategy } from './strategies/dispatch.js';
import type { FlipAxis } from './strategies/flip.js';
import type { RippleOrigin } from './strategies/ripple.js';
import { finiteNumber, nonNegativeNumber } from './validation.js';

// ---------------------------------------------------------------------------
// Common interface
// ---------------------------------------------------------------------------

export interface AnimationEffect {
  readonly kind: 'value' | 'transition' | 'style';
  tick(now: number): void;
  progress(): number;
  done(): boolean;
  reset(): void;
}

export interface ValueEffect extends AnimationEffect {
  readonly kind: 'value';
  value(): number;
}

export interface TransitionEffect extends AnimationEffect {
  readonly kind: 'transition';
  apply(oldContent: string, newContent: string): string;
}

export interface StyleEffect extends AnimationEffect {
  readonly kind: 'style';
  apply(content: string): string;
}

// ---------------------------------------------------------------------------
// ValueEffect — wraps an Aurora Animation
// ---------------------------------------------------------------------------

export interface ValueEffectOpts extends MotionPreference {
  /** Start value of the animation range (for progress computation). Default: 0 */
  from?: number;
  /** End value of the animation range (for progress computation). Default: 1 */
  to?: number;
}

export function valueEffect(animation: Animation, opts: ValueEffectOpts = {}): ValueEffect {
  const from = finiteNumber(opts.from ?? 0, 'from');
  const to = finiteNumber(opts.to ?? 1, 'to');
  const range = to - from;
  const reducedMotion = shouldReduceMotion(opts);
  if (reducedMotion) animation.seek(1);

  return {
    kind: 'value' as const,

    tick(now: number): void {
      const time = finiteNumber(now, 'now');
      if (reducedMotion) return;
      animation.tick(time);
    },

    value(): number {
      return animation.value();
    },

    progress(): number {
      if (reducedMotion) return 1;
      if (animation.done()) return 1;
      if (range === 0) return animation.done() ? 1 : 0;
      return Math.max(0, Math.min(1, (animation.value() - from) / range));
    },

    done(): boolean {
      if (reducedMotion) return true;
      return animation.done();
    },

    reset(): void {
      animation.reset();
    },
  };
}

// ---------------------------------------------------------------------------
// TransitionEffect — wraps Nova transition strategies
// ---------------------------------------------------------------------------

export type TransitionType = 'slide' | 'crossfade' | 'wipe' | 'morph' | 'blur' | 'dissolve' | 'zoom' | 'ripple' | 'flip' | 'typewriter' | 'glitch';

export interface TransitionEffectOpts extends MotionPreference {
  duration: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  rippleOrigin?: RippleOrigin;
  flipAxis?: FlipAxis;
  typewriterCursor?: string;
}

export function transitionEffect(type: TransitionType, opts: TransitionEffectOpts): TransitionEffect {
  const { direction = 'left', rippleOrigin, flipAxis = 'horizontal', typewriterCursor = '▌' } = opts;
  const duration = nonNegativeNumber(opts.duration, 'duration');
  const reducedMotion = shouldReduceMotion(opts);
  let startTime: number | null = null;
  let lastTime: number | null = null;
  let elapsed = 0;

  function currentProgress(): number {
    if (duration <= 0) return 1;
    return Math.min(1, elapsed / duration);
  }

  return {
    kind: 'transition' as const,

    tick(now: number): void {
      const time = Math.max(finiteNumber(now, 'now'), lastTime ?? Number.NEGATIVE_INFINITY);
      if (reducedMotion) return;
      if (startTime === null) {
        startTime = time;
      }
      lastTime = time;
      elapsed = time - startTime;
    },

    progress(): number {
      if (reducedMotion) return 1;
      return currentProgress();
    },

    done(): boolean {
      if (reducedMotion) return true;
      return currentProgress() >= 1;
    },

    reset(): void {
      startTime = null;
      lastTime = null;
      elapsed = 0;
    },

    apply(oldContent: string, newContent: string): string {
      if (reducedMotion) return newContent;
      return applyStrategy(type, oldContent, newContent, currentProgress(), {
        direction,
        rippleOrigin,
        flipAxis,
        typewriterCursor,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// StyleEffect — wraps Mirage visual effect functions
// ---------------------------------------------------------------------------

export type StyleType = 'shimmer' | 'glow' | 'breathe' | 'colorCycle';

export interface StyleEffectOpts extends MotionPreference {
  speed?: number;
  intensity?: number;
}

export function styleEffect(type: StyleType, opts: StyleEffectOpts = {}): StyleEffect {
  const reducedMotion = shouldReduceMotion(opts);
  const speed = finiteNumber(opts.speed ?? 1, 'speed');
  const intensity = nonNegativeNumber(opts.intensity ?? 2, 'intensity');
  let tickCount = 0;
  let startTime: number | null = null;
  let lastTime: number | null = null;

  // Default colors for breathe effect
  const breatheFrom = coronaColor.rgb(100, 100, 255);
  const breatheTo = coronaColor.rgb(255, 100, 100);
  // Default color for shimmer effect
  const shimmerColor = coronaColor.rgb(255, 255, 255);
  // Default color for glow effect
  const glowColor = coronaColor.rgb(100, 150, 255);

  return {
    kind: 'style' as const,

    tick(now: number): void {
      const time = Math.max(finiteNumber(now, 'now'), lastTime ?? Number.NEGATIVE_INFINITY);
      if (reducedMotion) return;
      if (startTime === null) {
        startTime = time;
      }
      lastTime = time;
      tickCount = time - startTime;
    },

    progress(): number {
      return tickCount;
    },

    done(): boolean {
      // Style effects run indefinitely — they never complete
      return reducedMotion;
    },

    reset(): void {
      tickCount = 0;
      startTime = null;
      lastTime = null;
    },

    apply(content: string): string {
      switch (type) {
        case 'shimmer':
          return shimmer(content, { tick: tickCount, speed, color: shimmerColor, reduceMotion: reducedMotion });
        case 'glow':
          return glow(content, { color: glowColor, intensity });
        case 'breathe':
          return breathe(content, { from: breatheFrom, to: breatheTo, tick: tickCount, speed, reduceMotion: reducedMotion });
        case 'colorCycle':
          return colorCycle(content, { tick: tickCount, speed, reduceMotion: reducedMotion });
        default:
          return content;
      }
    },
  };
}
