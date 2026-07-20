import { describe, expect, it } from 'vitest';
import { createMeasurementContext, measureNode, measureNodeWithContext, resolveMeasurementSpace } from '../index.js';
import type { VNode } from '../types.js';

describe('measureNode', () => {
  it('keeps empty nodes at 0x0 by default', () => {
    expect(measureNode({ kind: 'empty' })).toEqual({ width: 0, height: 0 });
  });

  it('measures styled box padding through nebula semantics', () => {
    const node: VNode = {
      kind: 'box',
      style: { padding: [1, 2] },
      children: [{ kind: 'text', content: 'hi' }],
    };

    expect(measureNode(node)).toEqual({ width: 6, height: 3 });
  });

  it('measures overlays as flow-neutral', () => {
    const node: VNode = {
      kind: 'overlay',
      x: 5,
      y: 5,
      child: { kind: 'text', content: 'overlay' },
    };

    expect(measureNode(node)).toEqual({ width: 0, height: 0 });
  });

  it('uses container width from explicit measurement context', () => {
    const context = createMeasurementContext({
      terminal: { cols: 120, rows: 40 },
      available: { cols: 60, rows: 20 },
      container: { cols: 24, rows: 10 },
    });

    const node: VNode = {
      kind: 'box',
      width: { xs: 5, md: 10 },
      children: [{ kind: 'text', content: 'content' }],
    };

    expect(measureNodeWithContext(node, context)).toEqual({ width: 5, height: 1 });
  });

  it('cascades terminal space into available and container defaults', () => {
    expect(createMeasurementContext({ terminal: { cols: 120, rows: 40 } })).toEqual({
      terminal: { cols: 120, rows: 40 },
      available: { cols: 120, rows: 40 },
      container: { cols: 120, rows: 40 },
    });
  });

  it('resolveMeasurementSpace aliases createMeasurementContext', () => {
    const partial = { available: { cols: 60, rows: 20 } };
    expect(resolveMeasurementSpace(partial)).toEqual(createMeasurementContext(partial));
  });

  it('measures wide characters using nebula width rules', () => {
    const node: VNode = { kind: 'text', content: '界界' };
    expect(measureNode(node).width).toBeGreaterThan(2);
  });
});
