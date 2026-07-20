/**
 * Nebula Compositor
 *
 * Sits between planLayout and rasterize. Compares consecutive LayoutPlans
 * and interpolates positions for elements whose LayoutRect changed, using
 * Aurora tween or spring animations.
 */

import { type Animation, type EasingFn, spring, tween } from '@celestial/aurora';
import type { LayoutEntry, LayoutPlan, LayoutRect } from './vdom.js';

export interface LayoutTransitionConfig {
  duration: number;
  easing?: EasingFn;
  spring?: { stiffness: number; damping: number; mass?: number };
}

export interface CompositorOptions {
  defaultTransition?: LayoutTransitionConfig;
  overrides?: Map<string, LayoutTransitionConfig>;
  animateOnlyOverrides?: boolean;
}

export interface Compositor {
  /** Feed a new layout plan. Returns an interpolated plan for the current tick. */
  update(newPlan: LayoutPlan, now?: number): LayoutPlan;
  /** True if any layout animations are still running */
  isAnimating(): boolean;
  /** Reset all animation state */
  reset(): void;
}

/**
 * Tracks animations for all four rect properties of a single element.
 * For tween-based animations: animations interpolate from `from` to `to`.
 * For spring-based: spring value = delta, offset by `fromRect` to get absolute position.
 */
interface RectAnimations {
  x: Animation;
  y: Animation;
  width: Animation;
  height: Animation;
  fromRect: LayoutRect;
  useSpring: boolean;
  config: LayoutTransitionConfig;
}

function cloneEntry(
  entry: LayoutEntry,
  animatedRects: Map<string, LayoutRect>,
  newIndex: Map<string, LayoutEntry>,
  inheritedOffsetX = 0,
  inheritedOffsetY = 0,
): LayoutEntry {
  const interpolatedRect = animatedRects.get(entry.id);
  const rect = interpolatedRect
    ? interpolatedRect
    : {
        x: entry.rect.x + inheritedOffsetX,
        y: entry.rect.y + inheritedOffsetY,
        width: entry.rect.width,
        height: entry.rect.height,
      };
  const childOffsetX = interpolatedRect ? rect.x - entry.rect.x : inheritedOffsetX;
  const childOffsetY = interpolatedRect ? rect.y - entry.rect.y : inheritedOffsetY;
  const children = entry.children.map((c) => cloneEntry(c, animatedRects, newIndex, childOffsetX, childOffsetY));

  // Preserve all LayoutEntry metadata while swapping geometry for the animated tick.
  // Hand-copying only rect-facing fields drops resolvedStyle and other render state,
  // which causes animated overlays to fall back to monochrome mid-transition.
  const cloned: LayoutEntry = {
    ...entry,
    rect,
    children,
  };

  if ('layoutId' in entry.node && entry.node.layoutId) {
    newIndex.set(entry.id, cloned);
  }

  return cloned;
}

function cloneOverlayEntries(
  overlays: LayoutPlan['overlays'],
  animatedRects: Map<string, LayoutRect>,
  newIndex: Map<string, LayoutEntry>,
): LayoutPlan['overlays'] {
  return overlays?.map((overlay) => ({
    ...overlay,
    entry: cloneEntry(overlay.entry, animatedRects, newIndex),
  }));
}

export function createCompositor(options?: CompositorOptions): Compositor {
  const defaultTransition = options?.defaultTransition ?? { duration: 300 };
  const overrides = options?.overrides;
  const animateOnlyOverrides = options?.animateOnlyOverrides ?? false;

  /** Previous plan's rects indexed by layoutId */
  let prevRects = new Map<string, LayoutRect>();
  /** Currently running animations indexed by layoutId */
  let animations = new Map<string, RectAnimations>();
  /** Whether we have a previous plan at all */
  let hasPrev = false;
  /** Time of the last update (used to initialize tweens so they start from the right moment) */
  let prevTime = 0;

  function getConfig(layoutId: string): LayoutTransitionConfig | null {
    if (overrides?.has(layoutId)) {
      return overrides.get(layoutId)!;
    }
    if (animateOnlyOverrides) {
      return null;
    }
    return defaultTransition;
  }

  /**
   * Create animations for transitioning from one rect to another.
   * For tweens: initialize at `startTime` so by `currentTime` the animation shows correct progress.
   * For springs: initialize at `startTime` so the spring has time to evolve.
   */
  function createRectAnimations(from: LayoutRect, to: LayoutRect, config: LayoutTransitionConfig, startTime: number, currentTime: number): RectAnimations {
    const useSpring = !!config.spring;

    if (useSpring) {
      const springCfg = config.spring!;
      const makeSpr = (delta: number) => {
        const s = spring(delta, {
          stiffness: springCfg.stiffness,
          damping: springCfg.damping,
          mass: springCfg.mass,
        });
        // Initialize the spring at startTime, then tick to currentTime
        s.tick(startTime);
        if (currentTime > startTime) {
          s.tick(currentTime);
        }
        return s;
      };

      return {
        x: makeSpr(to.x - from.x),
        y: makeSpr(to.y - from.y),
        width: makeSpr(to.width - from.width),
        height: makeSpr(to.height - from.height),
        fromRect: from,
        useSpring: true,
        config,
      };
    }

    // Tween-based: initialize at startTime so progress is correct at currentTime
    const easing = config.easing;
    const duration = config.duration;

    const makeTw = (fromVal: number, toVal: number) => {
      const tw = tween({ from: fromVal, to: toVal, duration, easing });
      // First tick sets startTime inside the tween
      tw.tick(startTime);
      // Second tick computes progress relative to startTime
      if (currentTime > startTime) {
        tw.tick(currentTime);
      }
      return tw;
    };

    return {
      x: makeTw(from.x, to.x),
      y: makeTw(from.y, to.y),
      width: makeTw(from.width, to.width),
      height: makeTw(from.height, to.height),
      fromRect: from,
      useSpring: false,
      config,
    };
  }

  function tickAnimations(anims: RectAnimations, now: number): void {
    anims.x.tick(now);
    anims.y.tick(now);
    anims.width.tick(now);
    anims.height.tick(now);
  }

  function animsDone(anims: RectAnimations): boolean {
    return anims.x.done() && anims.y.done() && anims.width.done() && anims.height.done();
  }

  function getAnimatedRect(anims: RectAnimations): LayoutRect {
    if (anims.useSpring) {
      // Spring values are deltas from the original position
      return {
        x: anims.fromRect.x + anims.x.value(),
        y: anims.fromRect.y + anims.y.value(),
        width: anims.fromRect.width + anims.width.value(),
        height: anims.fromRect.height + anims.height.value(),
      };
    }
    // Tween values are absolute
    return {
      x: anims.x.value(),
      y: anims.y.value(),
      width: anims.width.value(),
      height: anims.height.value(),
    };
  }

  function rectsEqual(a: LayoutRect, b: LayoutRect): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }

  function update(newPlan: LayoutPlan, now?: number): LayoutPlan {
    const time = now ?? Date.now();

    if (!hasPrev) {
      // First update: no previous plan, pass through unchanged
      hasPrev = true;
      prevTime = time;
      for (const [id, entry] of newPlan.index) {
        prevRects.set(id, entry.rect);
      }
      return newPlan;
    }

    // Phase 1: Detect changes and create/retarget animations
    for (const [id, entry] of newPlan.index) {
      const prevRect = prevRects.get(id);
      const newRect = entry.rect;
      const existingAnim = animations.get(id);

      if (prevRect && !rectsEqual(prevRect, newRect)) {
        const config = getConfig(id);
        if (!config) {
          animations.delete(id);
          continue;
        }

        if (existingAnim && !animsDone(existingAnim)) {
          // Retarget: get current animated position and start new animation from there
          const currentRect = getAnimatedRect(existingAnim);
          const newAnims = createRectAnimations(currentRect, newRect, config, time, time);
          animations.set(id, newAnims);
        } else {
          // New animation: starts from prevTime so current progress reflects elapsed time
          const anims = createRectAnimations(prevRect, newRect, config, prevTime, time);
          animations.set(id, anims);
        }
      } else if (!prevRect) {
        // New element appearing — no animation, pass through unchanged
      }
      // If rects are equal, no animation needed (and existing one stays if running)
    }

    // Phase 2: Tick all animations and collect interpolated rects
    const animatedRects = new Map<string, LayoutRect>();

    // Iterate over a snapshot of keys to allow deletion during iteration
    const animKeys = [...animations.keys()];
    for (const id of animKeys) {
      const anims = animations.get(id)!;

      if (!newPlan.index.has(id)) {
        // Element disappeared — remove its animation
        animations.delete(id);
        continue;
      }

      tickAnimations(anims, time);
      const interpolated = getAnimatedRect(anims);
      animatedRects.set(id, interpolated);

      if (animsDone(anims)) {
        // Animation complete — snap to final target and clean up
        const finalRect = newPlan.index.get(id)!.rect;
        animatedRects.set(id, finalRect);
        animations.delete(id);
      }
    }

    // Phase 3: Update prevRects for next comparison
    const newPrevRects = new Map<string, LayoutRect>();
    for (const [id, entry] of newPlan.index) {
      // Always store the target (final) rect from the new plan
      // so next comparison detects changes against the target, not the animated position
      newPrevRects.set(id, entry.rect);
    }
    prevRects = newPrevRects;
    prevTime = time;

    // Phase 4: Clone the plan with interpolated rects
    const newIndex = new Map<string, LayoutEntry>();
    const newRoot = cloneEntry(newPlan.root, animatedRects, newIndex);

    return {
      root: newRoot,
      index: newIndex,
      width: newPlan.width,
      height: newPlan.height,
      overlays: cloneOverlayEntries(newPlan.overlays, animatedRects, newIndex),
    };
  }

  function isAnimatingFn(): boolean {
    return animations.size > 0;
  }

  function resetFn(): void {
    prevRects = new Map();
    animations = new Map();
    hasPrev = false;
    prevTime = 0;
  }

  return {
    update,
    isAnimating: isAnimatingFn,
    reset: resetFn,
  };
}
