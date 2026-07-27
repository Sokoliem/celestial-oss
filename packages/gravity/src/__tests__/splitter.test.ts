import type { BoxNode, EventNode, RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createSplitterController, resizeSplitterSeam, splitter } from '../splitter.js';

function resolveTree(node: VNode, cols = 80, rows = 24): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols, rows }, available: { cols, rows }, container: { cols, rows } }), cols, rows);
  }
  return node;
}

function paneAt(row: RowNode, index: number): BoxNode {
  return row.children[index] as BoxNode;
}

function handleAt(row: RowNode, index: number): EventNode {
  return row.children[index] as EventNode;
}

function dim(value: BoxNode['width']): number {
  return typeof value === 'number' ? value : 0;
}

describe('splitter', () => {
  it('emits panes + a handle hit-region between adjacent panes at the geometric seam', () => {
    const node = splitter({
      direction: 'row',
      panes: [
        { id: 'left', child: { kind: 'text', content: 'L' }, weight: 1 },
        { id: 'right', child: { kind: 'text', content: 'R' }, weight: 1 },
      ],
    });

    const tree = resolveTree(node, 80, 24) as RowNode;
    expect(tree.kind).toBe('row');
    expect(tree.children).toHaveLength(3);

    const left = paneAt(tree, 0);
    const handle = handleAt(tree, 1);
    const right = paneAt(tree, 2);

    expect(left.kind).toBe('box');
    expect(handle.kind).toBe('event');
    expect(right.kind).toBe('box');

    expect(dim(left.width)).toBeGreaterThan(0);
    expect(dim(right.width)).toBeGreaterThan(0);
    expect(dim(left.width) + dim(right.width) + 1).toBe(80);

    expect(handle.id).toBe('splitter:left:handle');
    expect(handle.metadata?.intent).toBe('drag');
    expect((handle.metadata?.extra as { seamPosition: number }).seamPosition).toBe(dim(left.width));
  });

  it('renders three panes with two handles in a vertical column', () => {
    const node = splitter({
      direction: 'column',
      panes: [
        { id: 'a', child: { kind: 'text', content: 'A' } },
        { id: 'b', child: { kind: 'text', content: 'B' } },
        { id: 'c', child: { kind: 'text', content: 'C' } },
      ],
    });

    const tree = resolveTree(node, 40, 30) as RowNode;
    expect(tree.kind).toBe('column');
    expect(tree.children).toHaveLength(5);

    const handle = tree.children[1] as EventNode;
    expect(handle.kind).toBe('event');
    expect(handle.id).toBe('splitter:a:handle');
    expect((handle.metadata?.extra as { direction: string }).direction).toBe('column');
    expect((handle.metadata?.extra as { handleStyle: { idle: string } }).handleStyle.idle).toBe('─');
  });

  it('respects min/max constraints on a pane', () => {
    const controller = createSplitterController({
      panes: [
        { id: 'a', child: { kind: 'text', content: 'A' }, min: 30 },
        { id: 'b', child: { kind: 'text', content: 'B' }, min: 5 },
      ],
    });
    controller.setWeights({ a: 0.05, b: 0.95 });

    const node = splitter({
      direction: 'row',
      controller,
      panes: [
        { id: 'a', child: { kind: 'text', content: 'A' }, min: 30 },
        { id: 'b', child: { kind: 'text', content: 'B' }, min: 5 },
      ],
    });

    const tree = resolveTree(node, 80, 24) as RowNode;
    const left = paneAt(tree, 0);
    const right = paneAt(tree, 2);

    expect(dim(left.width)).toBeGreaterThanOrEqual(30);
    expect(dim(left.width) + dim(right.width) + 1).toBe(80);
  });

  it('snaps a collapsible pane closed when its weight drops below the threshold', () => {
    const controller = createSplitterController({
      panes: [
        { id: 'main', child: { kind: 'empty' }, weight: 0.7 },
        { id: 'side', child: { kind: 'empty' }, weight: 0.3, collapsible: true, collapsedSize: 0 },
      ],
      snapThreshold: 0.15,
    });

    expect(controller.isCollapsed('side')).toBe(false);
    controller.setWeight('side', 0.1);
    expect(controller.isCollapsed('side')).toBe(true);
    expect(controller.getWeight('side')).toBe(0);
    expect(controller.getWeight('main')).toBeCloseTo(1, 5);
  });

  it('round-trips through serialize / hydrate', () => {
    const controller = createSplitterController({
      panes: [
        { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
        { id: 'b', child: { kind: 'empty' }, weight: 0.5, collapsible: true },
      ],
    });
    controller.setWeights({ a: 0.8, b: 0.2 });
    controller.setCollapsed('b', true);

    const snapshot = controller.serialize();
    expect(snapshot.version).toBe(1);

    const restored = createSplitterController({
      panes: [
        { id: 'a', child: { kind: 'empty' }, weight: 0.5 },
        { id: 'b', child: { kind: 'empty' }, weight: 0.5, collapsible: true },
      ],
    });
    restored.hydrate(snapshot);

    expect(restored.isCollapsed('b')).toBe(true);
    expect(restored.getWeight('a')).toBeCloseTo(controller.getWeight('a'), 5);
    expect(restored.getWeight('b')).toBeCloseTo(controller.getWeight('b'), 5);
  });

  it('reset() returns to the initial weights', () => {
    const controller = createSplitterController({
      panes: [
        { id: 'a', child: { kind: 'empty' }, weight: 1 },
        { id: 'b', child: { kind: 'empty' }, weight: 1 },
      ],
    });
    controller.setWeight('a', 0.9);
    expect(controller.getWeight('a')).toBeCloseTo(0.9, 5);
    controller.reset();
    expect(controller.getWeight('a')).toBeCloseTo(0.5, 5);
  });

  it('feeds host-driven drag results back through setWeight (matches nexus resize-handle contract)', () => {
    // gravity stays render-pure: the host runs nexus' resizeHandleUpdate on
    // the leading pane's ResizableRect and reports the new width through the
    // controller. The controller renormalizes weights so the trailing pane
    // absorbs the inverse delta.
    const controller = createSplitterController({
      panes: [
        { id: 'left', child: { kind: 'empty' }, weight: 0.5, min: 10 },
        { id: 'right', child: { kind: 'empty' }, weight: 0.5, min: 10 },
      ],
    });

    const totalAxis = 80;
    const initialLeftWidth = Math.round(totalAxis * controller.getWeight('left'));
    expect(initialLeftWidth).toBe(40);

    // Simulate a +10 drag of the seam to the right (host's nexus reducer
    // would have produced this rect width).
    const newLeftWidth = initialLeftWidth + 10;
    controller.setWeight('left', newLeftWidth / totalAxis);

    expect(controller.getWeight('left')).toBeCloseTo(newLeftWidth / totalAxis, 5);
    expect(controller.getWeight('left') + controller.getWeight('right')).toBeCloseTo(1, 5);
  });

  it('resizes an adjacent seam while preserving pair weight and both pane constraints', () => {
    const panes = [
      { id: 'nav', child: { kind: 'empty' as const }, weight: 0.25, min: 10, max: 35 },
      { id: 'main', child: { kind: 'empty' as const }, weight: 0.5, min: 30 },
      { id: 'inspector', child: { kind: 'empty' as const }, weight: 0.25, min: 10 },
    ];
    const controller = createSplitterController({ panes });
    const originalInspector = controller.getWeight('inspector');
    const pairWeight = controller.getWeight('nav') + controller.getWeight('main');

    const expanded = resizeSplitterSeam(controller, panes, 'row', {
      leadingPaneId: 'nav',
      trailingPaneId: 'main',
      axisSize: 100,
      leadingSize: 1_000,
    });

    expect(expanded).toMatchObject({ leadingSize: 35, trailingSize: 40, cursor: 'ew-resize', changed: true });
    expect(controller.getWeight('nav') + controller.getWeight('main')).toBeCloseTo(pairWeight, 10);
    expect(controller.getWeight('inspector')).toBeCloseTo(originalInspector, 10);
  });

  it('rejects non-adjacent seams and no-ops a fully collapsed pair', () => {
    const panes = [
      { id: 'a', child: { kind: 'empty' as const }, collapsible: true },
      { id: 'b', child: { kind: 'empty' as const }, collapsible: true },
      { id: 'c', child: { kind: 'empty' as const } },
    ];
    const controller = createSplitterController({ panes });
    expect(() =>
      resizeSplitterSeam(controller, panes, 'row', {
        leadingPaneId: 'a',
        trailingPaneId: 'c',
        axisSize: 80,
        leadingSize: 20,
      }),
    ).toThrow(/adjacent/);

    controller.setCollapsed('a', true);
    controller.setCollapsed('b', true);
    expect(
      resizeSplitterSeam(controller, panes, 'column', {
        leadingPaneId: 'a',
        trailingPaneId: 'b',
        axisSize: 80,
        leadingSize: 20,
      }),
    ).toMatchObject({ changed: false, leadingSize: 0, trailingSize: 0, cursor: 'ns-resize' });
  });

  it('rejects duplicate ids and impossible pane bounds', () => {
    expect(() =>
      createSplitterController({
        panes: [
          { id: 'same', child: { kind: 'empty' } },
          { id: 'same', child: { kind: 'empty' } },
        ],
      }),
    ).toThrow(/Duplicate/);
    expect(() =>
      splitter({
        direction: 'row',
        panes: [{ id: 'broken', child: { kind: 'empty' }, min: 20, max: 10 }],
      }),
    ).toThrow(/maximum/);
  });

  it('ignores forged non-finite weights and cannot collapse a fixed pane', () => {
    const controller = createSplitterController<string>({
      panes: [
        { id: 'fixed', child: { kind: 'empty' }, weight: 0.5 },
        { id: 'flex', child: { kind: 'empty' }, weight: 0.5, collapsible: true },
      ],
    });
    controller.setWeight('fixed', Number.NaN);
    controller.setWeights({ fixed: Number.POSITIVE_INFINITY, flex: Number.NaN });
    controller.setCollapsed('fixed', true);

    expect(controller.getWeight('fixed')).toBe(0.5);
    expect(controller.getWeight('flex')).toBe(0.5);
    expect(controller.isCollapsed('fixed')).toBe(false);
  });

  it('hydrates only unique known finite panes and ignores illegal collapse flags', () => {
    const controller = createSplitterController<string>({
      panes: [
        { id: 'fixed', child: { kind: 'empty' }, weight: 0.5 },
        { id: 'flex', child: { kind: 'empty' }, weight: 0.5, collapsible: true },
      ],
    });
    controller.hydrate({
      version: 1,
      panes: [
        { id: 'fixed', weight: 0.8, collapsed: true },
        { id: 'fixed', weight: 0.1, collapsed: false },
        { id: 'unknown', weight: 1, collapsed: true },
        { id: 'flex', weight: Number.NaN, collapsed: true },
      ],
    });

    expect(controller.getWeight('fixed')).toBeCloseTo(0.8 / 1.3, 10);
    expect(controller.isCollapsed('fixed')).toBe(false);
    expect(controller.isCollapsed('flex')).toBe(false);
  });

  it('emits no handles when there is only one pane', () => {
    const node = splitter({
      direction: 'row',
      panes: [{ id: 'only', child: { kind: 'text', content: 'X' } }],
    });

    const tree = resolveTree(node, 40, 10) as RowNode;
    expect(tree.children).toHaveLength(1);
  });

  it('returns an empty node when given no panes', () => {
    const node = splitter({ direction: 'row', panes: [] });
    const tree = resolveTree(node, 40, 10);
    expect(tree.kind).toBe('empty');
  });
});
