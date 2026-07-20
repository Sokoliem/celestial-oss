/**
 * Chained transition controller.
 *
 * Runs a sequence of transition strategies back-to-back as a single
 * controller, where each stage handles a portion of the total duration.
 * Useful for multi-stage reveals (e.g. wipe-in → settle-blur → typewriter)
 * without having to wire up `composeSequence` manually.
 *
 * Each stage produces a transition from the *previous* visible frame to
 * the destination content — so the chain "ratchets toward" the new content
 * over the lifetime of the controller.
 *
 *   const tx = createChainedTransition([
 *     { strategy: 'wipe', duration: 6, options: { direction: 'right' } },
 *     { strategy: 'blur', duration: 4 },
 *     { strategy: 'typewriter', duration: 8 },
 *   ]);
 *   tx.start(now);
 *   const frame = tx.render('old', 'new', now + 7);
 *   tx.done(now + 18);  // true when total duration elapsed
 */

import { applyStrategy, type StrategyKey, type StrategyOptions } from './strategies/dispatch.js';

export type ChainedTransitionStrategy = Exclude<StrategyKey, 'none'>;

export interface ChainedTransitionStage {
  strategy: ChainedTransitionStrategy;
  duration: number;
  /** Options forwarded to the strategy (direction, glitchOpts, rippleOrigin, …). */
  options?: Omit<StrategyOptions, 'clampProgress'>;
  /** Easing applied to this stage's progress. Default linear. */
  easing?: (t: number) => number;
}

export interface ChainedTransitionController {
  start(startTick: number): void;
  /** Whether the entire chain has completed at the given tick. */
  done(tick: number): boolean;
  /** Index of the currently-running stage (0-based). -1 before start, length when finished. */
  activeStage(tick: number): number;
  /** Render the current frame. */
  render(oldContent: string, newContent: string, tick: number): string;
}

interface StageBoundary {
  stage: ChainedTransitionStage;
  startOffset: number;
  endOffset: number;
}

function computeBoundaries(stages: readonly ChainedTransitionStage[]): StageBoundary[] {
  const out: StageBoundary[] = [];
  let cursor = 0;
  for (const stage of stages) {
    const end = cursor + Math.max(0, stage.duration);
    out.push({ stage, startOffset: cursor, endOffset: end });
    cursor = end;
  }
  return out;
}

export function createChainedTransition(stages: readonly ChainedTransitionStage[]): ChainedTransitionController {
  if (stages.length === 0) {
    throw new Error('createChainedTransition: stages array must not be empty');
  }
  const boundaries = computeBoundaries(stages);
  const total = boundaries[boundaries.length - 1]!.endOffset;

  let started = false;
  let startTick = 0;

  function elapsedAt(tick: number): number {
    return started ? tick - startTick : 0;
  }

  function activeIndex(tick: number): number {
    if (!started) return -1;
    const elapsed = elapsedAt(tick);
    if (elapsed >= total) return boundaries.length;
    for (let i = 0; i < boundaries.length; i += 1) {
      if (elapsed < boundaries[i]!.endOffset) return i;
    }
    return boundaries.length;
  }

  return {
    start(s: number): void {
      started = true;
      startTick = s;
    },

    done(tick: number): boolean {
      if (!started) return false;
      return elapsedAt(tick) >= total;
    },

    activeStage(tick: number): number {
      return activeIndex(tick);
    },

    render(oldContent: string, newContent: string, tick: number): string {
      if (!started) return oldContent;
      const elapsed = elapsedAt(tick);
      if (elapsed >= total) return newContent;

      const idx = activeIndex(tick);
      const boundary = boundaries[idx]!;
      const localElapsed = elapsed - boundary.startOffset;
      const stage = boundary.stage;
      const rawProgress = stage.duration <= 0 ? 1 : Math.min(1, localElapsed / stage.duration);
      const easedProgress = stage.easing ? stage.easing(rawProgress) : rawProgress;
      let stageOldContent = oldContent;

      for (let i = 0; i < idx; i += 1) {
        const priorStage = boundaries[i]!.stage;
        stageOldContent = applyStrategy(priorStage.strategy, stageOldContent, newContent, 1, {
          ...priorStage.options,
          clampProgress: true,
        });
      }

      return applyStrategy(stage.strategy, stageOldContent, newContent, easedProgress, {
        ...stage.options,
        clampProgress: true,
      });
    },
  };
}
