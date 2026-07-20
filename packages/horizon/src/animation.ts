import { type Animation, spring as createSpring, easing, type SpringConfig, type TweenConfig } from '@celestial/core/aurora';
import { clampFinite, MAX_CELL_SIZE } from './internal.js';

interface NumberAnimation extends Animation<number> {
  setTarget(target: number): void;
}

export interface LayoutTransition {
  type: 'spring' | 'tween';
  spring?: SpringConfig;
  tween?: TweenConfig;
}

export const transitions = {
  default: { type: 'spring' as const, spring: { stiffness: 200, damping: 25 } },
  fast: { type: 'tween' as const, tween: { duration: 100, easing: easing.easeOut, from: 0, to: 1 } },
  smooth: { type: 'spring' as const, spring: { stiffness: 150, damping: 30 } },
  bouncy: { type: 'spring' as const, spring: { stiffness: 300, damping: 20 } },
  snappy: { type: 'tween' as const, tween: { duration: 150, easing: easing.easeOut, from: 0, to: 1 } },
};

export interface LayoutAnimationConfig {
  transition?: LayoutTransition;
  enter?: LayoutTransition;
  exit?: LayoutTransition;
}

export interface AnimatedLayoutModel {
  id: string;
  animX: NumberAnimation;
  animY: NumberAnimation;
  animWidth: NumberAnimation;
  animHeight: NumberAnimation;
  opacity: number;
  entering: boolean;
  exiting: boolean;
}

export function createAnimatedLayoutModel(
  id: string,
  initialX: number,
  initialY: number,
  initialWidth: number,
  initialHeight: number,
  config?: LayoutAnimationConfig,
): AnimatedLayoutModel {
  const transition = config?.transition ?? transitions.default;
  const x = clampFinite(initialX, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0);
  const y = clampFinite(initialY, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0);
  const width = clampFinite(initialWidth, 0, MAX_CELL_SIZE, 0);
  const height = clampFinite(initialHeight, 0, MAX_CELL_SIZE, 0);

  const springConfig: SpringConfig = transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 1000, damping: 50 };

  return {
    id,
    animX: createSpring(x, { ...springConfig, from: x }),
    animY: createSpring(y, { ...springConfig, from: y }),
    animWidth: createSpring(width, { ...springConfig, from: width }),
    animHeight: createSpring(height, { ...springConfig, from: height }),
    opacity: 1,
    entering: false,
    exiting: false,
  };
}

export type AnimatedLayoutMsg =
  | { type: 'tick'; delta: number }
  | { type: 'set-target'; x?: number; y?: number; width?: number; height?: number }
  | { type: 'enter'; from: { x: number; y: number; width: number; height: number } }
  | { type: 'exit'; to?: { opacity: number } }
  | { type: 'complete-enter' }
  | { type: 'complete-exit' };

export function animatedLayoutUpdate(msg: AnimatedLayoutMsg, model: AnimatedLayoutModel, config?: LayoutAnimationConfig): AnimatedLayoutModel {
  const transition = config?.transition ?? transitions.default;
  const springConfig: SpringConfig = transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 1000, damping: 50 };

  switch (msg.type) {
    case 'tick': {
      const now = Date.now();
      model.animX.tick(now);
      model.animY.tick(now);
      model.animWidth.tick(now);
      model.animHeight.tick(now);
      return { ...model };
    }
    case 'set-target': {
      // Snapshot all current values before stopping any animation so all
      // "from" values are consistent regardless of which axes are updated.
      const fromX = model.animX.value();
      const fromY = model.animY.value();
      const fromW = model.animWidth.value();
      const fromH = model.animHeight.value();

      const updates: Partial<Pick<typeof model, 'animX' | 'animY' | 'animWidth' | 'animHeight'>> = {};

      if (msg.x !== undefined) {
        model.animX.stop();
        const from = clampFinite(fromX, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0);
        updates.animX = createSpring(clampFinite(msg.x, -MAX_CELL_SIZE, MAX_CELL_SIZE, from), { ...springConfig, from });
      }
      if (msg.y !== undefined) {
        model.animY.stop();
        const from = clampFinite(fromY, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0);
        updates.animY = createSpring(clampFinite(msg.y, -MAX_CELL_SIZE, MAX_CELL_SIZE, from), { ...springConfig, from });
      }
      if (msg.width !== undefined) {
        model.animWidth.stop();
        const from = clampFinite(fromW, 0, MAX_CELL_SIZE, 0);
        updates.animWidth = createSpring(clampFinite(msg.width, 0, MAX_CELL_SIZE, from), { ...springConfig, from });
      }
      if (msg.height !== undefined) {
        model.animHeight.stop();
        const from = clampFinite(fromH, 0, MAX_CELL_SIZE, 0);
        updates.animHeight = createSpring(clampFinite(msg.height, 0, MAX_CELL_SIZE, from), { ...springConfig, from });
      }

      if (Object.keys(updates).length === 0) return model;
      return { ...model, ...updates };
    }
    case 'enter': {
      const enterTransition = config?.enter ?? transition;
      const enterSpringConfig: SpringConfig = enterTransition.type === 'spring' ? (enterTransition.spring ?? springConfig) : { stiffness: 200, damping: 25 };

      const targetX = model.animX.value();
      const targetY = model.animY.value();
      const targetWidth = model.animWidth.value();
      const targetHeight = model.animHeight.value();

      return {
        ...model,
        animX: createSpring(clampFinite(targetX, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0), {
          ...enterSpringConfig,
          from: clampFinite(msg.from.x, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0),
        }),
        animY: createSpring(clampFinite(targetY, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0), {
          ...enterSpringConfig,
          from: clampFinite(msg.from.y, -MAX_CELL_SIZE, MAX_CELL_SIZE, 0),
        }),
        animWidth: createSpring(clampFinite(targetWidth, 0, MAX_CELL_SIZE, 0), {
          ...enterSpringConfig,
          from: clampFinite(msg.from.width, 0, MAX_CELL_SIZE, 0),
        }),
        animHeight: createSpring(clampFinite(targetHeight, 0, MAX_CELL_SIZE, 0), {
          ...enterSpringConfig,
          from: clampFinite(msg.from.height, 0, MAX_CELL_SIZE, 0),
        }),
        opacity: 0,
        entering: true,
      };
    }
    case 'exit': {
      return {
        ...model,
        exiting: true,
        opacity: clampFinite(msg.to?.opacity ?? 0, 0, 1),
      };
    }
    case 'complete-enter': {
      return { ...model, entering: false, opacity: 1 };
    }
    case 'complete-exit': {
      return { ...model, exiting: false };
    }
    default:
      return model;
  }
}

export function getAnimatedLayoutValues(model: AnimatedLayoutModel): {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
} {
  return {
    x: clampFinite(model.animX.value(), -MAX_CELL_SIZE, MAX_CELL_SIZE, 0),
    y: clampFinite(model.animY.value(), -MAX_CELL_SIZE, MAX_CELL_SIZE, 0),
    width: clampFinite(model.animWidth.value(), 0, MAX_CELL_SIZE, 0),
    height: clampFinite(model.animHeight.value(), 0, MAX_CELL_SIZE, 0),
    opacity: clampFinite(model.opacity, 0, 1),
  };
}

export function isAnimationComplete(model: AnimatedLayoutModel): boolean {
  return model.animX.done() && model.animY.done() && model.animWidth.done() && model.animHeight.done() && !model.entering && !model.exiting;
}

export interface CollapseAnimationConfig {
  expand?: LayoutTransition;
  collapse?: LayoutTransition;
}

export interface CollapseAnimationModel {
  collapsed: boolean;
  anim: NumberAnimation;
}

export function createCollapseAnimationModel(collapsed: boolean, config?: CollapseAnimationConfig): CollapseAnimationModel {
  const transition = config?.expand ?? transitions.default;
  const springConfig: SpringConfig = transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };

  return {
    collapsed,
    anim: createSpring(collapsed ? 0 : 1, { ...springConfig, from: collapsed ? 0 : 1 }),
  };
}

export type CollapseAnimationMsg = { type: 'tick'; delta: number } | { type: 'toggle' } | { type: 'expand' } | { type: 'collapse' };

export function collapseAnimationUpdate(msg: CollapseAnimationMsg, model: CollapseAnimationModel, config?: CollapseAnimationConfig): CollapseAnimationModel {
  const expandTransition = config?.expand ?? transitions.default;
  const collapseTransition = config?.collapse ?? transitions.default;

  switch (msg.type) {
    case 'tick': {
      model.anim.tick(Date.now());
      return { ...model };
    }
    case 'toggle': {
      const newCollapsed = !model.collapsed;
      const transition = newCollapsed ? collapseTransition : expandTransition;
      const springConfig: SpringConfig =
        transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };

      model.anim.stop();
      return {
        collapsed: newCollapsed,
        anim: createSpring(newCollapsed ? 0 : 1, { ...springConfig, from: model.anim.value() }),
      };
    }
    case 'expand': {
      if (!model.collapsed) return model;
      const springConfig: SpringConfig =
        expandTransition.type === 'spring' ? (expandTransition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };

      model.anim.stop();
      return {
        collapsed: false,
        anim: createSpring(1, { ...springConfig, from: model.anim.value() }),
      };
    }
    case 'collapse': {
      if (model.collapsed) return model;
      const springConfig: SpringConfig =
        collapseTransition.type === 'spring' ? (collapseTransition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };

      model.anim.stop();
      return {
        collapsed: true,
        anim: createSpring(0, { ...springConfig, from: model.anim.value() }),
      };
    }
    default:
      return model;
  }
}

export function getCollapseProgress(model: CollapseAnimationModel): number {
  return clampFinite(model.anim.value(), 0, 1);
}

export function isCollapseAnimationComplete(model: CollapseAnimationModel): boolean {
  return model.anim.done();
}

export interface RatioAnimationModel {
  ratio: number;
  anim: NumberAnimation;
}

export function createRatioAnimationModel(ratio: number, config?: LayoutTransition): RatioAnimationModel {
  const transition = config ?? transitions.default;
  const springConfig: SpringConfig = transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };
  const normalizedRatio = clampFinite(ratio, 0, 1, 0.5);

  return {
    ratio: normalizedRatio,
    anim: createSpring(normalizedRatio, { ...springConfig, from: normalizedRatio }),
  };
}

export type RatioAnimationMsg = { type: 'tick'; delta: number } | { type: 'set-ratio'; ratio: number };

export function ratioAnimationUpdate(msg: RatioAnimationMsg, model: RatioAnimationModel, config?: LayoutTransition): RatioAnimationModel {
  const transition = config ?? transitions.default;
  const springConfig: SpringConfig = transition.type === 'spring' ? (transition.spring ?? { stiffness: 200, damping: 25 }) : { stiffness: 200, damping: 25 };

  switch (msg.type) {
    case 'tick': {
      model.anim.tick(Date.now());
      return { ...model };
    }
    case 'set-ratio': {
      const ratio = clampFinite(msg.ratio, 0, 1, model.ratio);
      if (ratio === model.ratio) return model;
      model.anim.stop();
      return {
        ratio,
        anim: createSpring(ratio, { ...springConfig, from: clampFinite(model.anim.value(), 0, 1, model.ratio) }),
      };
    }
    default:
      return model;
  }
}

export function getAnimatedRatio(model: RatioAnimationModel): number {
  return clampFinite(model.anim.value(), 0, 1, model.ratio);
}

export function isRatioAnimationComplete(model: RatioAnimationModel): boolean {
  return model.anim.done();
}
