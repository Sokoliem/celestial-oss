/**
 * Nebula Performance Profiler
 *
 * Tracks render timing, diff cost, and frame budget compliance.
 * Integrates as an optional plugin via the existing plugin system.
 *
 * Includes structured render tracing: a tree of named spans capturing
 * each phase of the render pipeline (view, focus, layout, rasterize,
 * shaders, diff, write) with hierarchical timing data.
 */

import type { AppConfig } from './app.js';
import type { RenderCause } from './message-priority.js';
import type { Plugin } from './plugin.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProfileSample {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

export interface FrameProfile {
  readonly frameNumber: number;
  readonly totalDuration: number;
  readonly samples: readonly ProfileSample[];
  readonly overBudget: boolean;
  /** Structured render trace tree for this frame (when tracing is enabled). */
  readonly trace?: RenderTraceSpan;
  /** Scheduler render cause data for this frame (when scheduler is enabled). */
  readonly renderCause?: RenderCause;
}

export interface ProfilerStats {
  readonly totalFrames: number;
  readonly averageFrameTime: number;
  readonly maxFrameTime: number;
  readonly minFrameTime: number;
  readonly overBudgetCount: number;
  readonly overBudgetPercent: number;
}

export interface ProfilerOptions {
  /** Frame budget in milliseconds (default 16ms for ~60fps) */
  frameBudget?: number;
  /** Maximum number of frame profiles to retain (default 120) */
  maxFrames?: number;
  /** Callback when a frame exceeds budget */
  onOverBudget?: (frame: FrameProfile) => void;
  /** Enable structured render tracing (default false) */
  tracing?: boolean;
}

// ─── Render Trace Types ─────────────────────────────────────────────────────

/** A single span in the render trace tree. Spans can nest. */
export interface RenderTraceSpan {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly children: readonly RenderTraceSpan[];
}

/** Mutable version used during construction. */
interface MutableSpan {
  name: string;
  startTime: number;
  duration: number;
  children: MutableSpan[];
}

// ─── Render Tracer ──────────────────────────────────────────────────────────

/**
 * Structured render tracer — builds a tree of named timing spans.
 * Use `beginSpan` / `endSpan` to create a hierarchy. Spans nest:
 * calling `beginSpan('layout')` inside a `beginSpan('render')` makes
 * layout a child of render.
 */
export interface RenderTracer {
  /** Start a new span. Must be matched by a call to endSpan(). */
  beginSpan(name: string): void;
  /** End the current span and record its duration. */
  endSpan(): void;
  /** Convenience: measure a synchronous function as a span. */
  span<T>(name: string, fn: () => T): T;
  /** Get the completed trace tree for the current frame (null if no spans). */
  getTrace(): RenderTraceSpan | null;
  /** Reset the tracer for a new frame. */
  resetTrace(): void;
}

/**
 * Create a render tracer instance.
 */
export function createRenderTracer(): RenderTracer {
  let root: MutableSpan | null = null;
  const stack: MutableSpan[] = [];

  return {
    beginSpan(name: string): void {
      const span: MutableSpan = {
        name,
        startTime: performance.now(),
        duration: 0,
        children: [],
      };

      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(span);
      } else {
        root = span;
      }
      stack.push(span);
    },

    endSpan(): void {
      const span = stack.pop();
      if (span) {
        span.duration = performance.now() - span.startTime;
      }
    },

    span<T>(name: string, fn: () => T): T {
      this.beginSpan(name);
      try {
        return fn();
      } finally {
        this.endSpan();
      }
    },

    getTrace(): RenderTraceSpan | null {
      return root;
    },

    resetTrace(): void {
      root = null;
      stack.length = 0;
    },
  };
}

// ─── Profiler ───────────────────────────────────────────────────────────────

export interface Profiler {
  /** Start measuring a named operation */
  startMeasure(name: string): void;
  /** End measuring a named operation and record the sample */
  endMeasure(name: string): ProfileSample | null;
  /** Convenience: measure a synchronous function */
  measure<T>(name: string, fn: () => T): T;
  /** Mark the start of a new frame */
  beginFrame(): void;
  /** Mark the end of a frame and record the profile */
  endFrame(): FrameProfile;
  /** Get statistics for all recorded frames */
  getStats(): ProfilerStats;
  /** Get all recorded frame profiles */
  getFrames(): readonly FrameProfile[];
  /** Clear all recorded data */
  reset(): void;
  /** Get the frame budget in ms */
  readonly frameBudget: number;
  /** Structured render tracer (if enabled via options). */
  readonly tracer: RenderTracer | null;
}

/**
 * Create a performance profiler instance.
 */
export function createProfiler(options?: ProfilerOptions): Profiler {
  const frameBudget = options?.frameBudget ?? 16;
  const maxFrames = options?.maxFrames ?? 120;
  const onOverBudget = options?.onOverBudget;
  const tracer = options?.tracing ? createRenderTracer() : null;

  const frames: FrameProfile[] = [];
  const pendingMeasures = new Map<string, number>();
  let currentSamples: ProfileSample[] = [];
  let frameStart = 0;
  let frameNumber = 0;

  return {
    frameBudget,
    tracer,

    startMeasure(name: string): void {
      pendingMeasures.set(name, performance.now());
    },

    endMeasure(name: string): ProfileSample | null {
      const startTime = pendingMeasures.get(name);
      if (startTime === undefined) return null;
      pendingMeasures.delete(name);

      const duration = performance.now() - startTime;
      const sample: ProfileSample = { name, startTime, duration };
      currentSamples.push(sample);
      return sample;
    },

    measure<T>(name: string, fn: () => T): T {
      this.startMeasure(name);
      try {
        return fn();
      } finally {
        this.endMeasure(name);
      }
    },

    beginFrame(): void {
      frameStart = performance.now();
      currentSamples = [];
      pendingMeasures.clear();
      tracer?.resetTrace();
    },

    endFrame(): FrameProfile {
      const totalDuration = performance.now() - frameStart;
      const overBudget = totalDuration > frameBudget;
      const trace = tracer?.getTrace() ?? undefined;
      const profile: FrameProfile = {
        frameNumber: frameNumber++,
        totalDuration,
        samples: [...currentSamples],
        overBudget,
        trace,
      };

      frames.push(profile);
      if (frames.length > maxFrames) {
        frames.shift();
      }

      if (overBudget && onOverBudget) {
        onOverBudget(profile);
      }

      currentSamples = [];
      return profile;
    },

    getStats(): ProfilerStats {
      if (frames.length === 0) {
        return {
          totalFrames: 0,
          averageFrameTime: 0,
          maxFrameTime: 0,
          minFrameTime: 0,
          overBudgetCount: 0,
          overBudgetPercent: 0,
        };
      }

      let sum = 0;
      let max = -Infinity;
      let min = Infinity;
      let overBudgetCount = 0;

      for (const frame of frames) {
        sum += frame.totalDuration;
        if (frame.totalDuration > max) max = frame.totalDuration;
        if (frame.totalDuration < min) min = frame.totalDuration;
        if (frame.overBudget) overBudgetCount++;
      }

      return {
        totalFrames: frames.length,
        averageFrameTime: sum / frames.length,
        maxFrameTime: max,
        minFrameTime: min,
        overBudgetCount,
        overBudgetPercent: (overBudgetCount / frames.length) * 100,
      };
    },

    getFrames(): readonly FrameProfile[] {
      return [...frames];
    },

    reset(): void {
      frames.length = 0;
      currentSamples = [];
      pendingMeasures.clear();
      frameNumber = 0;
      tracer?.resetTrace();
    },
  };
}

// ─── Measurement helpers ────────────────────────────────────────────────────

/**
 * Measure render performance of a view function.
 */
export function measureRender<Model>(profiler: Profiler, viewFn: (model: Model) => unknown, model: Model): unknown {
  return profiler.measure('render', () => viewFn(model));
}

/**
 * Measure layout computation performance.
 */
export function measureLayout<T>(profiler: Profiler, layoutFn: () => T): T {
  return profiler.measure('layout', layoutFn);
}

/**
 * Measure diff computation performance.
 */
export function measureDiff<T>(profiler: Profiler, diffFn: () => T): T {
  return profiler.measure('diff', diffFn);
}

// ─── Plugin integration ─────────────────────────────────────────────────────

/**
 * Create a profiler plugin that measures update and view performance.
 * Integrates with the existing plugin system.
 *
 * When the profiler has tracing enabled, the plugin wraps update/view
 * with named spans for structured render tracing.
 */
export function profilerPlugin<Model, M>(profiler: Profiler): Plugin<Model, M> {
  return {
    name: 'profiler',
    wrap(config: AppConfig<Model, M>): AppConfig<Model, M> {
      const tracer = profiler.tracer;
      return {
        ...config,
        update(msg: M, model: Model) {
          profiler.beginFrame();
          const result = tracer ? tracer.span('update', () => config.update(msg, model)) : profiler.measure('update', () => config.update(msg, model));
          profiler.endFrame();
          return result;
        },
        view(model: Model) {
          return tracer ? tracer.span('view', () => config.view(model)) : profiler.measure('view', () => config.view(model));
        },
      };
    },
  };
}
