import type { BoxNode, OverlayNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { overflow } from '../index.js';

function resolveTree(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols: 20, rows: 5 }, available: { cols: 20, rows: 5 }, container: { cols: 20, rows: 5 } }));
  }
  if (node.kind === 'box') {
    return {
      ...node,
      children: node.children.map(resolveTree),
    };
  }
  return node;
}

describe('overflow', () => {
  it('adds an ellipsis indicator when content exceeds the available size', () => {
    const layout = overflow(
      { kind: 'box', width: 12, height: 3, children: [{ kind: 'text', content: 'content' }] },
      { maxWidth: 8, maxHeight: 2, mode: 'ellipsis' },
    );
    const tree = resolveTree(layout) as BoxNode;

    expect(tree.width).toBe(8);
    expect(tree.height).toBe(2);
    const indicator = tree.children[1] as OverlayNode;
    expect(indicator.kind).toBe('overlay');
    expect((indicator.child as VNode).kind).toBe('text');
  });

  it('renders a badge indicator with the hidden count', () => {
    const layout = overflow({ kind: 'box', width: 10, height: 6, children: [{ kind: 'text', content: 'details' }] }, { maxHeight: 3, mode: 'badge' });
    const tree = resolveTree(layout) as BoxNode;
    const indicator = tree.children[1] as OverlayNode;

    expect((indicator.child as any).content).toContain('+');
  });
});
