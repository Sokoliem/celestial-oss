// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── Profiler with tracing ──────────────────────────────────────────────────

describe('profiler with tracing enabled', () => {
  it('creates a tracer when tracing option is true', () => {
    const p = createProfiler({ tracing: true });
    expect(p.tracer).not.toBeNull();
  });

  it('tracer is null when tracing option is false', () => {
    const p = createProfiler({ tracing: false });
    expect(p.tracer).toBeNull();
  });

  it('tracer is null by default', () => {
    const p = createProfiler();
    expect(p.tracer).toBeNull();
  });

  it('includes trace in frame profile when tracing', () => {
    const p = createProfiler({ tracing: true });
    p.beginFrame();
    p.tracer!.beginSpan('render');
    p.tracer!.span('view', () => {
      /* noop */
    });
    p.tracer!.span('layout', () => {
      /* noop */
    });
    p.tracer!.endSpan();
    const frame = p.endFrame();

    expect(frame.trace).toBeDefined();
    expect(frame.trace!.name).toBe('render');
    expect(frame.trace!.children).toHaveLength(2);
  });

  it('resets trace on beginFrame', () => {
    const p = createProfiler({ tracing: true });

    // First frame
    p.beginFrame();
    p.tracer!.span('old', () => {
      /* noop */
    });
    p.endFrame();

    // Second frame — trace should be fresh
    p.beginFrame();
    p.tracer!.span('new', () => {
      /* noop */
    });
    const frame = p.endFrame();

    expect(frame.trace!.name).toBe('new');
  });

  it('frame profile has no trace when tracing is disabled', () => {
    const p = createProfiler({ tracing: false });
    p.beginFrame();
    const frame = p.endFrame();
    expect(frame.trace).toBeUndefined();
  });

  it('reset clears tracer state', () => {
    const p = createProfiler({ tracing: true });
    p.beginFrame();
    p.tracer!.span('render', () => {
      /* noop */
    });
    p.endFrame();

    p.reset();
    expect(p.tracer!.getTrace()).toBeNull();
    expect(p.getFrames()).toEqual([]);
  });
});
