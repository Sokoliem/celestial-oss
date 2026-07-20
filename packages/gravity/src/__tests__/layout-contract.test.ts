import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMeasurementContext, flex, flexItem, grid, gridItem, measureNode, measureNodeWithContext, responsive, setTerminalSize } from '../index.js';

function resolveTree(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render());
  }
  if (node.kind === 'row' || node.kind === 'column') {
    return {
      ...node,
      children: node.children.map(resolveTree),
    };
  }
  if (node.kind === 'box') {
    return {
      ...node,
      children: node.children.map(resolveTree),
    };
  }
  return node;
}

describe('gravity layout contract', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 120, rows: 40 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('treats overlay nodes as flow-neutral during intrinsic measurement', () => {
    expect(
      measureNode({
        kind: 'overlay',
        x: 4,
        y: 2,
        child: { kind: 'text', content: 'overlay' },
      }),
    ).toEqual({ width: 0, height: 0 });
  });

  it('distributes remaining flex space after honoring basis and gap rules', () => {
    const tree = resolveTree(
      flex({
        direction: 'row',
        gap: 2,
        children: [flexItem({ kind: 'text', content: 'Sidebar' }, { basis: 30 }), flexItem({ kind: 'text', content: 'Main' }, { basis: 30, grow: 1 })],
      }),
    ) as RowNode;

    expect((tree.children[0] as BoxNode).width).toBe(30);
    expect((tree.children[1] as BoxNode).width).toBe(88);
  });

  it('counts interior gaps inside grid spans', () => {
    const tree = resolveTree(
      grid({
        cols: 4,
        gap: 4,
        children: [
          gridItem({ kind: 'text', content: 'Header' }, { col: 0, row: 0, colSpan: 4 }),
          gridItem({ kind: 'text', content: 'Sidebar' }, { col: 0, row: 1 }),
          gridItem({ kind: 'text', content: 'Content' }, { col: 1, row: 1, colSpan: 3 }),
        ],
      }),
    ) as ColumnNode;

    const header = (tree.children[0] as RowNode).children[0] as BoxNode;
    const content = (tree.children[1] as RowNode).children[1] as BoxNode;

    expect(header.width).toBe(120);
    expect(content.width).toBe(89);
  });

  it('recomputes responsive branches from the active terminal context', () => {
    const compact: VNode = { kind: 'text', content: 'compact' };
    const wide: VNode = { kind: 'text', content: 'wide' };
    const branch = responsive({ compact, wide });

    setTerminalSize({ cols: 150, rows: 24 });
    expect(branch.render()).toBe(wide);

    setTerminalSize({ cols: 30, rows: 24 });
    expect(branch.render()).toBe(compact);
  });

  it('keeps measurement context container bounds available to callers without inventing responsive width', () => {
    const context = createMeasurementContext({
      terminal: { cols: 120, rows: 40 },
      available: { cols: 60, rows: 20 },
      container: { cols: 24, rows: 10 },
    });

    expect(
      measureNodeWithContext(
        {
          kind: 'box',
          children: [{ kind: 'text', content: 'content' }],
        },
        context,
      ),
    ).toEqual({ width: 7, height: 1 });
  });
});
