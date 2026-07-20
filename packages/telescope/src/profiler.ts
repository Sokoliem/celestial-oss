/**
 * Telescope profiler helper — re-exports nebula's profiler primitives so
 * telescope's public surface exposes a one-stop-shop for performance tests.
 *
 * Tests that need a wrapped AppConfig can compose them as:
 *   const profiler = createProfiler(opts);
 *   const wrapped = profilerPlugin(profiler).wrap(config);
 */

export type { FrameProfile, Profiler, ProfilerOptions, ProfilerStats, ProfileSample, RenderTracer, RenderTraceSpan } from '@celestial/core/nebula';
export { createProfiler, createRenderTracer, measureDiff, measureLayout, measureRender, profilerPlugin } from '@celestial/core/nebula';
