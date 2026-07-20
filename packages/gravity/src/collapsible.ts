import { type SpringAnimation, type SpringConfig, spring } from '@celestial/aurora';
import { DEFAULT_SPRING_CONFIG } from './atoms.js';
import { measureNode } from './measure.js';
import { preferReducedMotion } from './motion-prefs.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, MeasurementContext, VNode } from './types.js';

const DEFAULT_SPRING: SpringConfig<number> = DEFAULT_SPRING_CONFIG;

const DEFAULT_THRESHOLD = 0.15;

export type CollapsibleAxis = 'width' | 'height';

export interface CollapsibleConfig {
  open: boolean;
  child: VNode;
  collapsedChild?: VNode;
  axis?: CollapsibleAxis;
  threshold?: number;
  reduceMotion?: boolean;
  spring?: SpringConfig<number>;
  model?: CollapsibleModel;
}

export interface CollapsibleModel {
  open: boolean;
  progress: number;
  axis: CollapsibleAxis;
  animation: SpringAnimation<number> | null;
}

export type CollapsibleMsg = { type: 'collapsible-set'; open: boolean } | { type: 'collapsible-toggle' } | { type: 'collapsible-tick'; now: number };

interface MeasurementCacheEntry {
  child: VNode;
  collapsedChild: VNode | null;
  signature: string;
  childSize: { width: number; height: number };
  collapsedSize: { width: number; height: number };
}

export function createCollapsibleModel(open: boolean, axis: CollapsibleAxis = 'width'): CollapsibleModel {
  const progress = open ? 1 : 0;
  return {
    open,
    progress,
    axis,
    animation: null,
  };
}

export function collapsibleUpdate(
  msg: CollapsibleMsg,
  model: CollapsibleModel,
  options?: { reduceMotion?: boolean; spring?: SpringConfig<number> },
): CollapsibleModel {
  switch (msg.type) {
    case 'collapsible-set':
      return startCollapsibleTransition(model, msg.open, options);
    case 'collapsible-toggle':
      return startCollapsibleTransition(model, !model.open, options);
    case 'collapsible-tick':
      return tickCollapsible(model, msg.now);
  }
}

export function isCollapsibleAnimating(model: CollapsibleModel): boolean {
  return model.animation !== null && !model.animation.done();
}

export function getCollapsibleProgress(model: CollapsibleModel): number {
  if (model.animation) {
    return clamp01(model.animation.value());
  }
  return clamp01(model.progress);
}

export function collapsible(config: CollapsibleConfig): ComponentNode {
  const axis = config.axis ?? 'width';
  const threshold = clamp01(config.threshold ?? DEFAULT_THRESHOLD);
  const reduceMotionPref = preferReducedMotion(config.reduceMotion);

  let cache: MeasurementCacheEntry | null = null;

  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      cache = ensureMeasurementCache(cache, config.child, config.collapsedChild ?? null, measurementContext);

      const progress = resolveProgress(config, reduceMotionPref);
      const useCollapsed = progress < threshold && config.collapsedChild !== undefined;
      const innerNode = useCollapsed ? config.collapsedChild! : config.child;
      const baseSize = useCollapsed ? cache.collapsedSize : cache.childSize;
      const targetSize = cache.childSize;
      const collapsedSize = config.collapsedChild ? cache.collapsedSize : { width: 0, height: 0 };

      if (axis === 'width') {
        const interpolated = lerp(collapsedSize.width, targetSize.width, progress);
        const width = useCollapsed ? Math.max(0, baseSize.width) : Math.max(0, Math.round(interpolated));
        return {
          kind: 'box',
          width,
          height: Math.max(targetSize.height, collapsedSize.height),
          children: [innerNode],
        };
      }

      const interpolated = lerp(collapsedSize.height, targetSize.height, progress);
      const height = useCollapsed ? Math.max(0, baseSize.height) : Math.max(0, Math.round(interpolated));
      return {
        kind: 'box',
        width: Math.max(targetSize.width, collapsedSize.width),
        height,
        children: [innerNode],
      };
    },
  };
}

function resolveProgress(config: CollapsibleConfig, reduceMotionPref: boolean): number {
  if (config.model) {
    if (reduceMotionPref) {
      return config.model.open ? 1 : 0;
    }
    return getCollapsibleProgress(config.model);
  }
  return config.open ? 1 : 0;
}

function ensureMeasurementCache(
  cache: MeasurementCacheEntry | null,
  child: VNode,
  collapsedChild: VNode | null,
  context: MeasurementContext,
): MeasurementCacheEntry {
  const signature = `${context.container.cols}x${context.container.rows}`;
  if (cache && cache.child === child && cache.collapsedChild === collapsedChild && cache.signature === signature) {
    return cache;
  }

  const childSize = measureNode(child, context);
  const collapsedSize = collapsedChild ? measureNode(collapsedChild, context) : { width: 0, height: 0 };

  return {
    child,
    collapsedChild,
    signature,
    childSize,
    collapsedSize,
  };
}

function startCollapsibleTransition(
  model: CollapsibleModel,
  target: boolean,
  options?: { reduceMotion?: boolean; spring?: SpringConfig<number> },
): CollapsibleModel {
  if (model.open === target && model.animation === null) {
    return model;
  }

  const reduceMotionPref = preferReducedMotion(options?.reduceMotion);
  if (reduceMotionPref) {
    model.animation?.stop();
    return {
      ...model,
      open: target,
      progress: target ? 1 : 0,
      animation: null,
    };
  }

  const targetValue = target ? 1 : 0;
  const fromValue = clamp01(model.animation ? model.animation.value() : model.progress);
  if (model.animation && !model.animation.done()) {
    model.animation.setTarget(targetValue);
    return {
      ...model,
      open: target,
      progress: fromValue,
    };
  }

  model.animation?.stop();
  const animation = spring(targetValue, {
    ...DEFAULT_SPRING,
    ...(options?.spring ?? {}),
    from: fromValue,
  });

  return {
    ...model,
    open: target,
    progress: fromValue,
    animation,
  };
}

function tickCollapsible(model: CollapsibleModel, now: number): CollapsibleModel {
  if (!model.animation) {
    return model;
  }

  model.animation.tick(now);
  const value = clamp01(model.animation.value());

  if (model.animation.done()) {
    return {
      ...model,
      progress: model.open ? 1 : 0,
      animation: null,
    };
  }

  return {
    ...model,
    progress: value,
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
