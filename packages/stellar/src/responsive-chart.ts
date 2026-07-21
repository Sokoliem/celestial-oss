/**
 * Responsive Charts — size-aware chart rendering with breakpoint selection
 * and layout feedback integration.
 *
 * Bridges Stellar's charting API with Nebula's Sub.layout for
 * automatic chart resizing when container dimensions change.
 */

import type { VNode } from '@celestial/nebula';
import { Sub } from '@celestial/nebula';
import { type BarChartOpts, chart, type LineChartOpts, type ScatterChartOpts } from './chart.js';
import { boundedPositiveInteger, positiveNumber } from './validation.js';

const MAX_RESPONSIVE_EXTENT = 100_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChartSize {
  width: number;
  height: number;
}

export type ChartFactory = (size: ChartSize) => VNode;

export interface ResponsiveChartConfig {
  /** Unique identifier — used as layoutId for Sub.layout feedback. */
  id: string;
  /** Default factory that produces a VNode for the given size. */
  factory: ChartFactory;
  /** Default size to use when no layout feedback is available yet. */
  defaultSize?: ChartSize;
  /** Minimum size constraints — dimensions will not go below these. */
  minSize?: { width?: number; height?: number };
  /** Aspect ratio (width / height). Height is adjusted upward if needed. */
  aspectRatio?: number;
  /** Breakpoint-based factory selection. */
  breakpoints?: {
    compact?: { maxWidth: number; factory: ChartFactory };
    detail?: { minWidth: number; factory: ChartFactory };
  };
}

export interface ChartSizeState {
  readonly sizes: ReadonlyMap<string, ChartSize>;
}

// ── ChartSizeState management ────────────────────────────────────────────────

/** Create an empty chart size state. */
export function initChartSizes(): ChartSizeState {
  return { sizes: new Map() };
}

/** Immutably update the size for a chart id. */
export function updateChartSize(state: ChartSizeState, id: string, size: ChartSize): ChartSizeState {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return state;
  const normalized = {
    width: Math.min(MAX_RESPONSIVE_EXTENT, Math.floor(size.width)),
    height: Math.min(MAX_RESPONSIVE_EXTENT, Math.floor(size.height)),
  };
  const previous = state.sizes.get(id);
  if (previous?.width === normalized.width && previous.height === normalized.height) return state;
  const next = new Map(state.sizes);
  next.set(id, normalized);
  return { sizes: next };
}

/** Retrieve the stored size for a chart id, or the provided default. */
export function getChartSize(state: ChartSizeState, id: string, defaultSize?: ChartSize): ChartSize | undefined {
  const size = state.sizes.get(id) ?? defaultSize;
  return size ? { ...size } : undefined;
}

// ── responsiveChart ──────────────────────────────────────────────────────────

/**
 * Produce a VNode for a chart that adapts to the given size.
 *
 * Applies min-size constraints, aspect ratio correction, and
 * breakpoint-based factory selection before delegating to the
 * appropriate chart factory. The result is tagged with a layoutId
 * so Nebula's Sub.layout can feed back the actual rendered rect.
 */
export function responsiveChart(config: ResponsiveChartConfig, currentSize: ChartSize): VNode {
  // 1. Apply minimum size constraints
  let width = boundedPositiveInteger(currentSize.width, 1, MAX_RESPONSIVE_EXTENT);
  let height = boundedPositiveInteger(currentSize.height, 1, MAX_RESPONSIVE_EXTENT);

  if (config.minSize?.width !== undefined) {
    width = Math.max(width, boundedPositiveInteger(config.minSize.width, 1, MAX_RESPONSIVE_EXTENT));
  }
  if (config.minSize?.height !== undefined) {
    height = Math.max(height, boundedPositiveInteger(config.minSize.height, 1, MAX_RESPONSIVE_EXTENT));
  }

  // 2. Apply aspect ratio correction (only increases height)
  if (config.aspectRatio !== undefined && Number.isFinite(config.aspectRatio) && config.aspectRatio > 0) {
    const requiredHeight = Math.ceil(width / positiveNumber(config.aspectRatio, 1));
    height = Math.min(MAX_RESPONSIVE_EXTENT, Math.max(height, requiredHeight));
  }

  const constrainedSize: ChartSize = { width, height };

  // 3. Select factory based on breakpoints
  let selectedFactory = config.factory;

  if (config.breakpoints) {
    const { compact, detail } = config.breakpoints;
    if (compact && Number.isFinite(compact.maxWidth) && width <= compact.maxWidth) {
      selectedFactory = compact.factory;
    } else if (detail && Number.isFinite(detail.minWidth) && width >= detail.minWidth) {
      selectedFactory = detail.factory;
    }
  }

  // 4. Call the selected factory
  const vnode = selectedFactory(constrainedSize);

  // 5. Attach layoutId for Sub.layout feedback (using animated() pattern)
  return { ...vnode, layoutId: config.id } as VNode;
}

// ── chartLayoutSub ───────────────────────────────────────────────────────────

/**
 * Create a subscription that feeds back layout rects for the given chart ids.
 *
 * Each chart id produces a separate Sub.layout; they are combined via Sub.batch.
 * When the layout engine reports a rect for a chart, the toMsg callback is
 * invoked so the app can update its ChartSizeState.
 */
export function chartLayoutSub<M>(chartIds: string[], toMsg: (id: string, size: ChartSize) => M): Sub<M> {
  // Use a single Sub.layout for all chart IDs. This way we can check which
  // IDs actually have rects and only emit messages for those.
  // For IDs without rects (first paint before layout), we still must return
  // a message since Sub.layout always dispatches the callback result.
  // We call toMsg with the first found rect's data, or with a safe fallback.
  //
  // To properly handle per-ID dispatch, we use individual subs but guard
  // against null dispatch by calling toMsg with the actual rect data.
  // When no rect is found, we call toMsg with { width: 0, height: 0 }
  // which is a valid, non-crashing message the app can filter in update().
  const subs = [...new Set(chartIds.filter((id) => id.trim() !== ''))].map((id) =>
    Sub.layout<M>([id], (rects) => {
      const rect = rects.rects.get(id);
      if (!rect) {
        // Return a zero-size message rather than null-as-M.
        // The app's update() can check for zero dimensions and ignore.
        // This is safe because { width: 0, height: 0 } is a valid ChartSize
        // and toMsg will produce a properly typed message.
        return toMsg(id, { width: 0, height: 0 });
      }
      return toMsg(id, { width: rect.width, height: rect.height });
    }),
  );
  return Sub.batch(...subs);
}

// ── Chart factory helpers ────────────────────────────────────────────────────

/**
 * Create a ChartFactory for line charts.
 * The returned function accepts a ChartSize and produces a VNode.
 */
export function lineChartFactory(opts: Omit<LineChartOpts, 'width' | 'height'>): ChartFactory {
  return (size: ChartSize): VNode => {
    return chart.line({ ...opts, width: size.width, height: size.height }).toVNode();
  };
}

/**
 * Create a ChartFactory for bar charts.
 * The returned function accepts a ChartSize and produces a VNode.
 */
export function barChartFactory(opts: Omit<BarChartOpts, 'width' | 'height'>): ChartFactory {
  return (size: ChartSize): VNode => {
    return chart.bar({ ...opts, width: size.width, height: size.height }).toVNode();
  };
}

/**
 * Create a ChartFactory for scatter charts.
 * The returned function accepts a ChartSize and produces a VNode.
 */
export function scatterChartFactory(opts: Omit<ScatterChartOpts, 'width' | 'height'>): ChartFactory {
  return (size: ChartSize): VNode => {
    return chart.scatter({ ...opts, width: size.width, height: size.height }).toVNode();
  };
}
