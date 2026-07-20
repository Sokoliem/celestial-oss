/**
 * Elm Architecture Chart Components
 *
 * Provides pure, composable chart components that integrate with nebula's
 * Elm Architecture (`app()` / `AppConfig`). Each chart component exposes
 * `init`, `update`, `view`, and `subscriptions` functions that can be
 * embedded in a larger application's Model/Msg cycle.
 *
 * Architecture:
 *   - **ChartModel** holds layers, gesture state, size, animation state.
 *   - **ChartMsg** is a discriminated union of all chart-internal events.
 *   - **`embedChart()`** wires everything together, producing init/update/
 *     view/subscriptions fragments that can be composed into any app.
 *
 * Usage:
 * ```ts
 * const myChart = embedChart({
 *   id: 'revenue',
 *   layers: (model) => [
 *     gridLayer({ horizontal: true }),
 *     lineDataLayer(model.data, { filled: true }),
 *     titleLayer({ title: 'Revenue' }),
 *   ],
 *   initialData: [1, 4, 2, 8, 5],
 *   interactive: { coordMapOpts: { ... }, gestureConfig: { ... } },
 *   animated: true,
 * });
 *
 * // In your app config:
 * const appConfig: AppConfig<AppModel, AppMsg> = {
 *   init: () => {
 *     const [chartModel, chartCmd] = myChart.init();
 *     return [{ chart: chartModel, ... }, Cmd.map(chartCmd, wrapChartMsg)];
 *   },
 *   update: (msg, model) => {
 *     if (isChartMsg(msg)) {
 *       const [cm, cc] = myChart.update(msg.chart, model.chart);
 *       return [{ ...model, chart: cm }, Cmd.map(cc, wrapChartMsg)];
 *     }
 *     ...
 *   },
 *   view: (model) => myChart.view(model.chart),
 *   subscriptions: (model) => Sub.map(myChart.subscriptions(model.chart), wrapChartMsg),
 * };
 * ```
 */

import type { EasingFn } from '@celestial/aurora';
import { easing as easingLib } from '@celestial/aurora';
import type { CellShader, Cmd, FrameInfo, LayoutRects, MouseEventData, Sub, VNode } from '@celestial/nebula';
import { Cmd as CmdNS, Sub as SubNS } from '@celestial/nebula';
import type { CanvasMode } from './canvas.js';
import type { ChartLayer } from './layers.js';
import { composeChart } from './layers.js';
import type { ChartSize } from './responsive-chart.js';

export type { ChartSize } from './responsive-chart.js';

import { shouldAnimate } from './chart-a11y.js';
import {
  type ChartGestureConfig,
  type ChartGestureMsg,
  type ChartGestureState,
  type CoordinateMapOpts,
  chartGestureUpdate,
  createChartGestureState,
  createCoordinateMap,
} from './chart-gestures.js';
import type { HitRegion } from './interactive.js';
import { chartSize, easedProgress, nonNegativeInteger, positiveNumber } from './validation.js';

// ── Chart Model ──────────────────────────────────────────────────────────

// ChartSize is imported from responsive-chart.ts (shared across both modules)

/** Animation state for chart transitions. */
export interface ChartAnimationState {
  /** Whether an animation is currently active. */
  active: boolean;
  /** Current tick (frame counter). */
  tick: number;
  /** Total duration in ticks. */
  duration: number;
  /** Easing function. */
  easing: EasingFn;
  /** Animation progress 0..1 after easing. */
  progress: number;
}

/** The model for an Elm Architecture chart component. */
export interface ChartModel<D = number[]> {
  /** Unique chart identifier. */
  readonly id: string;
  /** Current data. */
  data: D;
  /** Chart size in terminal cells. */
  size: ChartSize;
  /** Gesture state (if interactive). */
  gesture: ChartGestureState | null;
  /** Animation state (if animated). */
  animation: ChartAnimationState | null;
  /** Last rendered hit regions (for gesture coordinate mapping). */
  hitRegions: HitRegion[];
  /** Last rendered shaders. */
  shaders: CellShader[];
  /** Canvas mode. */
  mode: CanvasMode;
}

// ── Chart Messages ───────────────────────────────────────────────────────

/** Discriminated union of all chart-internal messages. */
export type ChartMsg<D = number[]> =
  | { readonly type: 'chart:mouse'; readonly event: MouseEventData }
  | { readonly type: 'chart:animFrame'; readonly frame: FrameInfo }
  | { readonly type: 'chart:layout'; readonly rects: LayoutRects }
  | { readonly type: 'chart:setData'; readonly data: D }
  | { readonly type: 'chart:resize'; readonly size: ChartSize }
  | { readonly type: 'chart:startAnimation'; readonly duration?: number; readonly easing?: EasingFn }
  | { readonly type: 'chart:gesture'; readonly gesture: ChartGestureMsg }
  | { readonly type: 'chart:gestureHandled' };

// ── Chart Configuration ──────────────────────────────────────────────────

/** Interactive mode configuration. */
export interface InteractiveConfig {
  /** Coordinate map options for mapping terminal cells to data coordinates. */
  coordMapOpts: CoordinateMapOpts;
  /** Gesture configuration overrides. */
  gestureConfig?: Partial<ChartGestureConfig>;
}

/** Default gesture configuration. */
const DEFAULT_GESTURE_CONFIG: ChartGestureConfig = {
  rangeSelect: true,
  pan: false,
  longPress: true,
  scrollZoom: false,
  dragThreshold: 2,
  longPressMs: 500,
};

/** Configuration for embedding a chart component. */
export interface EmbedChartConfig<D = number[]> {
  /** Unique chart identifier (used for layout feedback). */
  id: string;
  /** Layer factory — called on each render with current model. */
  layers: (model: ChartModel<D>) => ChartLayer[];
  /** Initial data. */
  initialData: D;
  /** Initial size (default: 60x10). */
  initialSize?: ChartSize;
  /** Enable interactive gesture handling. Pass config object or false. */
  interactive?: InteractiveConfig | false;
  /** Enable enter animation on init. */
  animated?: boolean;
  /** Animation duration in frames (default: 30). */
  animationDuration?: number;
  /** Animation easing (default: easeOut). */
  animationEasing?: EasingFn;
  /** Canvas mode (default: 'braille'). */
  mode?: CanvasMode;
  /** Callback for gesture messages (for parent app integration). */
  onGesture?: (msg: ChartGestureMsg) => void;
  /** Injectable monotonic clock for deterministic gesture tests and hosts. */
  now?: () => number;
  /** Reports gesture callback failures without taking down the app loop. */
  onGestureError?: (error: unknown) => void;
}

function cloneData<D>(data: D): D {
  return (Array.isArray(data) ? [...data] : data) as D;
}

/** Result of embedding a chart — provides Elm Architecture integration functions. */
export interface EmbeddedChart<D = number[]> {
  /** Initialize chart state. Returns [model, cmd]. */
  init: () => [ChartModel<D>, Cmd<ChartMsg<D>>];
  /** Pure update function. Returns [model, cmd]. */
  update: (msg: ChartMsg<D>, model: ChartModel<D>) => [ChartModel<D>, Cmd<ChartMsg<D>>];
  /** Render the chart as a VNode. */
  view: (model: ChartModel<D>) => VNode;
  /** Produce subscriptions for the chart. */
  subscriptions: (model: ChartModel<D>) => Sub<ChartMsg<D>>;
  /** Get shaders for AppConfig.shaders. */
  shaders: (model: ChartModel<D>) => CellShader[];
  /** Derive the current interactive hit regions without mutating the model. */
  hitRegions: (model: ChartModel<D>) => HitRegion[];
}

// ── embedChart ───────────────────────────────────────────────────────────

/**
 * Create an embedded chart component with full Elm Architecture integration.
 *
 * Returns `init`, `update`, `view`, `subscriptions`, and `shaders` functions
 * that can be composed into any nebula `AppConfig`.
 */
export function embedChart<D = number[]>(config: EmbedChartConfig<D>): EmbeddedChart<D> {
  const {
    id,
    layers: layerFactory,
    initialData,
    initialSize = { width: 60, height: 10 },
    interactive = false,
    animated = false,
    animationDuration = 30,
    animationEasing = easingLib.easeOut,
    mode = 'braille',
  } = config;
  if (id.trim() === '') throw new TypeError('embedded chart id must not be empty');

  const interactiveConfig = interactive !== false ? interactive : null;
  const normalizedInitialSize = chartSize(initialSize.width, initialSize.height, 60, 10);
  const normalizedAnimationDuration = positiveNumber(animationDuration, 30);

  // ── init ───────────────────────────────────────────────────────────

  function init(): [ChartModel<D>, Cmd<ChartMsg<D>>] {
    let gesture: ChartGestureState | null = null;
    if (interactiveConfig) {
      const coordMap = createCoordinateMap(interactiveConfig.coordMapOpts);
      const gestureConfig: ChartGestureConfig = {
        ...DEFAULT_GESTURE_CONFIG,
        ...interactiveConfig.gestureConfig,
      };
      gesture = createChartGestureState(coordMap, gestureConfig);
    }

    // Respect reduced motion preference: skip animation if the user has
    // set NO_MOTION or REDUCE_MOTION environment variables.
    const animateOnInit = animated && shouldAnimate();

    const model: ChartModel<D> = {
      id,
      data: cloneData(initialData),
      size: normalizedInitialSize,
      gesture,
      animation: animateOnInit
        ? {
            active: true,
            tick: 0,
            duration: normalizedAnimationDuration,
            easing: animationEasing,
            progress: 0,
          }
        : null,
      hitRegions: [],
      shaders: [],
      mode,
    };

    return [model, CmdNS.none<ChartMsg<D>>()];
  }

  // ── update ─────────────────────────────────────────────────────────

  function update(msg: ChartMsg<D>, model: ChartModel<D>): [ChartModel<D>, Cmd<ChartMsg<D>>] {
    switch (msg.type) {
      case 'chart:setData':
        return [{ ...model, data: cloneData(msg.data) }, CmdNS.none()];

      case 'chart:resize':
        return [{ ...model, size: chartSize(msg.size.width, msg.size.height, model.size.width, model.size.height) }, CmdNS.none()];

      case 'chart:layout': {
        const rect = msg.rects.rects.get(id);
        if (rect) {
          return [{ ...model, size: chartSize(rect.width, rect.height, model.size.width, model.size.height) }, CmdNS.none()];
        }
        return [model, CmdNS.none()];
      }

      case 'chart:mouse': {
        if (!model.gesture) {
          return [model, CmdNS.none()];
        }
        let timestamp = Date.now();
        try {
          const candidate = config.now?.();
          if (candidate !== undefined && Number.isFinite(candidate)) timestamp = candidate;
        } catch {
          // A faulty injected clock falls back to the platform clock.
        }
        const result = chartGestureUpdate(model.gesture, msg.event, timestamp);
        const newModel = {
          ...model,
          gesture: result.state,
        };

        const cmds = result.messages.map((gesture) => CmdNS.msg<ChartMsg<D>>({ type: 'chart:gesture', gesture }));
        return [newModel, cmds.length > 0 ? CmdNS.batch(...cmds) : CmdNS.none()];
      }

      case 'chart:animFrame': {
        if (!model.animation?.active) {
          return [model, CmdNS.none()];
        }
        const duration = positiveNumber(model.animation.duration, 1);
        const nextTick = Math.min(duration, nonNegativeInteger(model.animation.tick, 0) + 1);
        const t = Math.min(1, nextTick / duration);
        const progress = easedProgress(model.animation.easing, t);
        const active = t < 1;

        return [
          {
            ...model,
            animation: {
              ...model.animation,
              tick: nextTick,
              progress,
              active,
            },
          },
          CmdNS.none(),
        ];
      }

      case 'chart:startAnimation': {
        // Respect reduced motion preference
        if (!shouldAnimate()) {
          return [model, CmdNS.none()];
        }
        return [
          {
            ...model,
            animation: {
              active: true,
              tick: 0,
              duration: positiveNumber(msg.duration, normalizedAnimationDuration),
              easing: msg.easing ?? animationEasing,
              progress: 0,
            },
          },
          CmdNS.none(),
        ];
      }

      case 'chart:gesture': {
        if (!config.onGesture) return [model, CmdNS.none()];
        return [
          model,
          CmdNS.perform(
            async () => {
              try {
                await config.onGesture?.(msg.gesture);
              } catch (error) {
                try {
                  config.onGestureError?.(error);
                } catch {
                  // Error reporting is isolated from the app command loop.
                }
              }
            },
            (): ChartMsg<D> => ({ type: 'chart:gestureHandled' }),
          ),
        ];
      }

      case 'chart:gestureHandled':
        return [model, CmdNS.none()];
    }
  }

  // ── view ───────────────────────────────────────────────────────────

  function view(model: ChartModel<D>): VNode {
    return composeModel(model).toVNode();
  }

  // ── subscriptions ──────────────────────────────────────────────────

  function subscriptions(model: ChartModel<D>): Sub<ChartMsg<D>> {
    const subs: Sub<ChartMsg<D>>[] = [];

    // Layout feedback for responsive sizing
    subs.push(
      SubNS.layout<ChartMsg<D>>([id], (rects) => ({
        type: 'chart:layout',
        rects,
      })),
    );

    // Mouse events for interactivity
    if (interactiveConfig && model.gesture) {
      subs.push(
        SubNS.mouse<ChartMsg<D>>((event) => ({
          type: 'chart:mouse',
          event,
        })),
      );
    }

    // Animation frame for active animations
    if (model.animation?.active) {
      subs.push(
        SubNS.animationFrame<ChartMsg<D>>((frame) => ({
          type: 'chart:animFrame',
          frame,
        })),
      );
    }

    return subs.length === 0 ? SubNS.none<ChartMsg<D>>() : SubNS.batch<ChartMsg<D>>(...subs);
  }

  // ── shaders ────────────────────────────────────────────────────────

  function shaders(model: ChartModel<D>): CellShader[] {
    return composeModel(model).shaders;
  }

  function hitRegions(model: ChartModel<D>): HitRegion[] {
    return composeModel(model).hitRegions;
  }

  function composeModel(model: ChartModel<D>) {
    const size = chartSize(model.size.width, model.size.height, 60, 10);
    return composeChart(size.width, size.height, layerFactory(model), { mode: model.mode });
  }

  return { init, update, view, subscriptions, shaders, hitRegions };
}

// ── Helper: check if a value is a ChartMsg ───────────────────────────────

/**
 * Type guard to check if a message is a chart message.
 * Useful for routing in a parent app's update function.
 */
export function isChartMsg(msg: unknown): msg is ChartMsg {
  if (typeof msg !== 'object' || msg === null) return false;
  const type = (msg as { type?: string }).type;
  return typeof type === 'string' && type.startsWith('chart:');
}

/**
 * Create a standalone `AppConfig` for a single chart.
 *
 * This is a convenience for demos/testing — wraps `embedChart()` into
 * a complete `AppConfig` ready for `app()`.
 *
 * @param config - Chart embedding configuration.
 * @returns An object matching nebula's `AppConfig<ChartModel<D>, ChartMsg<D>>`.
 */
export function chartAppConfig<D = number[]>(
  config: EmbedChartConfig<D>,
): {
  init: () => [ChartModel<D>, Cmd<ChartMsg<D>>];
  update: (msg: ChartMsg<D>, model: ChartModel<D>) => [ChartModel<D>, Cmd<ChartMsg<D>>];
  view: (model: ChartModel<D>) => VNode;
  subscriptions: (model: ChartModel<D>) => Sub<ChartMsg<D>>;
  shaders: (model: ChartModel<D>) => CellShader[];
} {
  return embedChart(config);
}
