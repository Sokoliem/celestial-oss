/**
 * Shared strategy dispatcher.
 *
 * Six high-level controllers in nova (`transition`, `createTransition`/builders,
 * `transitionEffect`, `createSpringTransition`, `createGestureTransition`,
 * `createSharedElementTransition`) each used to maintain their own near-
 * identical switch on the strategy key. Adding a new strategy meant editing
 * all six. This module is the one place that knows how to invoke each pure
 * strategy from a string key.
 *
 * Individual controllers may narrow their public strategy key types
 * (`TransitionOpts['type']`, `SpringTransitionStrategy`, …); the dispatcher
 * accepts the **superset** and gracefully falls through to crossfade for
 * unknown keys, matching the prior `default:` branch.
 */

import { morph } from '../morph.js';
import { finiteNumber } from '../validation.js';
import { blur } from './blur.js';
import { crossfade } from './crossfade.js';
import { dissolve } from './dissolve.js';
import { type FlipAxis, flip } from './flip.js';
import { type GlitchOpts, glitch } from './glitch.js';
import { type RippleOrigin, ripple } from './ripple.js';
import { slide } from './slide.js';
import { safeContent } from './text.js';
import { typewriterReveal } from './typewriter.js';
import { wipe } from './wipe.js';
import { type ZoomMode, type ZoomOrigin, zoom } from './zoom.js';

/**
 * Superset of every strategy key any nova entry point accepts. `'fade'` is an
 * alias for `'crossfade'` (kept for the builder-tier API). `'none'` means
 * pass-through: returns oldContent until progress reaches 1, then newContent.
 */
export type StrategyKey =
  | 'slide'
  | 'crossfade'
  | 'fade'
  | 'wipe'
  | 'morph'
  | 'blur'
  | 'dissolve'
  | 'zoom'
  | 'ripple'
  | 'flip'
  | 'typewriter'
  | 'glitch'
  | 'none';

/**
 * Uniform options bag covering every parameter any current controller
 * forwards to a strategy. Each controller sets only the fields it cares
 * about; defaults match the per-strategy defaults that were inlined across
 * the six previous dispatchers.
 */
export interface StrategyOptions {
  /** For `slide` and `wipe`. Default: `'left'`. */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** For `zoom`. */
  zoomMode?: ZoomMode;
  /** For `zoom`. */
  zoomOrigin?: ZoomOrigin;
  /** For `dissolve`. */
  dissolveSeed?: number;
  /** For `ripple`. Default: `{ x: 0.5, y: 0.5 }`. */
  rippleOrigin?: RippleOrigin;
  /** For `flip`. Default: `'horizontal'`. */
  flipAxis?: FlipAxis;
  /** For `typewriter`. Default: `'▌'`. */
  typewriterCursor?: string;
  /** For `glitch`. */
  glitchOpts?: GlitchOpts;
  /**
   * Clamp progress to `[0, 1]` before invoking the strategy. Spring and
   * gesture controllers set this `true` because their progress can overshoot
   * (springs settle past 1; drag gestures can be over-pulled). Default
   * `false` — most callers already pre-clamp.
   */
  clampProgress?: boolean;
}

export function applyStrategy(strategy: StrategyKey, oldContent: string, newContent: string, progress: number, options: StrategyOptions = {}): string {
  const numericProgress = finiteNumber(progress, 'progress');
  const p = options.clampProgress ? Math.max(0, Math.min(1, numericProgress)) : numericProgress;
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const direction = options.direction ?? 'left';
  switch (strategy) {
    case 'slide':
      return slide(safeOldContent, safeNewContent, p, direction);
    case 'wipe':
      return wipe(safeOldContent, safeNewContent, p, direction);
    case 'morph':
      return morph(safeOldContent, safeNewContent, { tick: p, duration: 1 });
    case 'blur':
      return blur(safeOldContent, safeNewContent, p);
    case 'dissolve':
      return dissolve(safeOldContent, safeNewContent, p, options.dissolveSeed);
    case 'zoom':
      return zoom(safeOldContent, safeNewContent, p, options.zoomMode, options.zoomOrigin);
    case 'ripple':
      return ripple(safeOldContent, safeNewContent, p, options.rippleOrigin?.x ?? 0.5, options.rippleOrigin?.y ?? 0.5);
    case 'flip':
      return flip(safeOldContent, safeNewContent, p, options.flipAxis ?? 'horizontal');
    case 'typewriter':
      return typewriterReveal(safeOldContent, safeNewContent, p, options.typewriterCursor ?? '▌');
    case 'glitch':
      return glitch(safeOldContent, safeNewContent, p, options.glitchOpts);
    case 'none':
      return p >= 1 ? safeNewContent : safeOldContent;
    case 'fade':
    case 'crossfade':
    default:
      return crossfade(safeOldContent, safeNewContent, p);
  }
}
