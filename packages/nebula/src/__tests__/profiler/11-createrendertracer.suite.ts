// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createRenderTracer } from '../../profiler.js';

// ─── createRenderTracer ─────────────────────────────────────────────────────

describe('createRenderTracer', () => {
  it('creates a tracer with no initial trace', () => {
    const t = createRenderTracer();
    expect(t.getTrace()).toBeNull();
  });

  it('records a single span', () => {
    const t = createRenderTracer();
    t.beginSpan('render');
    t.endSpan();
    const trace = t.getTrace();
    expect(trace).not.toBeNull();
    expect(trace!.name).toBe('render');
    expect(trace!.duration).toBeGreaterThanOrEqual(0);
    expect(trace!.children).toEqual([]);
  });

  it('records nested spans as a tree', () => {
    const t = createRenderTracer();
    t.beginSpan('render');
    t.beginSpan('view');
    t.endSpan();
    t.beginSpan('layout');
    t.endSpan();
    t.beginSpan('diff');
    t.endSpan();
    t.endSpan();

    const trace = t.getTrace();
    expect(trace!.name).toBe('render');
    expect(trace!.children).toHaveLength(3);
    expect(trace!.children[0]!.name).toBe('view');
    expect(trace!.children[1]!.name).toBe('layout');
    expect(trace!.children[2]!.name).toBe('diff');
  });

  it('records deeply nested spans', () => {
    const t = createRenderTracer();
    t.beginSpan('render');
    t.beginSpan('layout');
    t.beginSpan('planNode');
    t.endSpan();
    t.endSpan();
    t.endSpan();

    const trace = t.getTrace();
    expect(trace!.name).toBe('render');
    expect(trace!.children).toHaveLength(1);
    expect(trace!.children[0]!.name).toBe('layout');
    expect(trace!.children[0]!.children).toHaveLength(1);
    expect(trace!.children[0]!.children[0]!.name).toBe('planNode');
  });

  it('span() convenience method works', () => {
    const t = createRenderTracer();
    const result = t.span('compute', () => 42);
    expect(result).toBe(42);

    const trace = t.getTrace();
    expect(trace!.name).toBe('compute');
    expect(trace!.duration).toBeGreaterThanOrEqual(0);
  });

  it('span() nests correctly', () => {
    const t = createRenderTracer();
    t.span('render', () => {
      t.span('view', () => {
        /* noop */
      });
      t.span('layout', () => {
        /* noop */
      });
    });

    const trace = t.getTrace();
    expect(trace!.name).toBe('render');
    expect(trace!.children).toHaveLength(2);
    expect(trace!.children[0]!.name).toBe('view');
    expect(trace!.children[1]!.name).toBe('layout');
  });

  it('resetTrace clears the trace', () => {
    const t = createRenderTracer();
    t.beginSpan('render');
    t.endSpan();
    expect(t.getTrace()).not.toBeNull();

    t.resetTrace();
    expect(t.getTrace()).toBeNull();
  });
});
