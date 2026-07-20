import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { masonry, setTerminalSize } from '../index.js';

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

describe('masonry', () => {
  it('places items into the shortest column', () => {
    setTerminalSize({ cols: 40, rows: 20 });

    const layout = masonry(
      [
        { kind: 'box', width: 5, height: 4, children: [{ kind: 'text', content: 'A' }] },
        { kind: 'box', width: 5, height: 2, children: [{ kind: 'text', content: 'B' }] },
        { kind: 'box', width: 5, height: 3, children: [{ kind: 'text', content: 'C' }] },
      ],
      { columns: 2, gap: 1 },
    );

    const tree = resolveTree(layout) as RowNode;
    const firstColumn = tree.children[0] as BoxNode;
    const secondColumn = tree.children[1] as BoxNode;

    expect(tree.kind).toBe('row');
    expect(firstColumn.width).toBe(19);
    expect(secondColumn.width).toBe(19);

    const firstChildren = ((firstColumn.children[0] as ColumnNode).children as BoxNode[]).map((child) => child.children[0]);
    const secondChildren = ((secondColumn.children[0] as ColumnNode).children as BoxNode[]).map((child) => child.children[0]);

    expect((firstChildren[0] as VNode).kind).toBe('box');
    expect(secondChildren).toHaveLength(2);
  });
});
