import type { BoxNode, ColumnNode, EventNode, RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { dock } from '../dock.js';
import { createSplitterController } from '../splitter.js';

function resolveTree(node: VNode, cols = 80, rows = 24): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols, rows }, available: { cols, rows }, container: { cols, rows } }), cols, rows);
  }
  return node;
}

function dim(value: BoxNode['width']): number {
  return typeof value === 'number' ? value : 0;
}

describe('dock', () => {
  it('center fills the entire container when no edges are supplied', () => {
    const node = dock({ center: { kind: 'text', content: 'center' } });
    const tree = resolveTree(node, 80, 24) as BoxNode;
    expect(tree.kind).toBe('box');
    expect(tree.width).toBe(80);
    expect(tree.height).toBe(24);
  });

  it('measures intrinsic top edge against the full container width', () => {
    const node = dock({
      top: { node: { kind: 'text', content: 'header' } },
      center: { kind: 'text', content: 'center' },
    });
    const tree = resolveTree(node, 80, 24) as ColumnNode;
    expect(tree.kind).toBe('column');
    expect(tree.children).toHaveLength(2);

    const top = tree.children[0] as BoxNode;
    const center = tree.children[1] as BoxNode;

    expect(top.height).toBe(1);
    expect(top.width).toBe(80);
    expect(center.width).toBe(80);
    expect(center.height).toBe(23);
  });

  it('reduces center by intrinsic bottom and intrinsic top together', () => {
    const node = dock({
      top: { node: { kind: 'text', content: 'tabs' } },
      bottom: { node: { kind: 'text', content: 'status' } },
      center: { kind: 'text', content: 'main' },
    });

    const tree = resolveTree(node, 80, 24) as ColumnNode;
    expect(tree.kind).toBe('column');
    expect(tree.children).toHaveLength(3);

    const top = tree.children[0] as BoxNode;
    const center = tree.children[1] as BoxNode;
    const bottom = tree.children[2] as BoxNode;

    expect(top.height).toBe(1);
    expect(bottom.height).toBe(1);
    expect(center.height).toBe(22);
  });

  it('honors a fixed-size left edge', () => {
    const node = dock({
      left: { node: { kind: 'text', content: 'rail' }, size: 8 },
      center: { kind: 'text', content: 'main' },
    });

    const tree = resolveTree(node, 80, 24) as RowNode;
    expect(tree.kind).toBe('row');
    expect(tree.children).toHaveLength(2);

    const left = tree.children[0] as BoxNode;
    const center = tree.children[1] as BoxNode;
    expect(left.width).toBe(8);
    expect(center.width).toBe(72);
    expect(left.height).toBe(24);
  });

  it('respects min on a weighted right edge', () => {
    const node = dock({
      right: { node: { kind: 'text', content: 'sidebar' }, size: { weight: 0.3, min: 30 } },
      center: { kind: 'text', content: 'main' },
    });

    const tree = resolveTree(node, 80, 24) as RowNode;
    const center = tree.children[0] as BoxNode;
    const right = tree.children[1] as BoxNode;

    expect(dim(right.width)).toBeGreaterThanOrEqual(30);
    expect(dim(center.width) + dim(right.width)).toBe(80);
  });

  it('rows are evaluated first — left/right intrinsic measure against the center row only', () => {
    // 80x24 terminal, top=1, bottom=1 → center row = 22.
    // left intrinsic (a 4x4 box) measures within that row.
    const node = dock({
      top: { node: { kind: 'text', content: 'tab' } },
      bottom: { node: { kind: 'text', content: 'foot' } },
      left: { node: { kind: 'box', width: 4, height: 4, children: [] } },
      center: { kind: 'text', content: 'main' },
    });

    const tree = resolveTree(node, 80, 24) as ColumnNode;
    const middleRow = tree.children[1] as RowNode;
    const left = middleRow.children[0] as BoxNode;
    const center = middleRow.children[1] as BoxNode;

    expect(left.width).toBe(4);
    expect(left.height).toBe(22); // takes the full center row
    expect(center.width).toBe(76);
    expect(center.height).toBe(22);
  });

  it('emits a draggable hit-region at a weighted edge when a splitter controller + id are provided', () => {
    const controller = createSplitterController({
      panes: [
        { id: 'main', child: { kind: 'empty' } },
        { id: 'side', child: { kind: 'empty' } },
      ],
    });

    const node = dock({
      right: {
        id: 'side',
        node: { kind: 'text', content: 'sidebar' },
        size: { weight: 0.3 },
        splitterController: controller,
      },
      center: { kind: 'text', content: 'main' },
    });

    const tree = resolveTree(node, 80, 24) as RowNode;
    const handle = tree.children[1] as EventNode;
    expect(handle.kind).toBe('event');
    expect(handle.id).toBe('dock:side:handle');
    expect(handle.metadata?.intent).toBe('drag');
  });
});
