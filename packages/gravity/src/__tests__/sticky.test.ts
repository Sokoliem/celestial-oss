import type { VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { sticky } from '../index.js';

function resolveTree(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols: 20, rows: 10 }, available: { cols: 20, rows: 10 }, container: { cols: 20, rows: 10 } }));
  }
  return node;
}

describe('sticky', () => {
  it('pins to the top once the element scrolls past the threshold', () => {
    const layout = sticky({ kind: 'text', content: 'Header' }, { scrollOffset: 5, elementOffset: 2, offset: 1 });
    const tree = resolveTree(layout);

    expect(tree.kind).toBe('overlay');
    if (tree.kind === 'overlay') {
      expect(tree.y).toBe(1);
    }
  });

  it('leaves the node in flow before it reaches the sticky position', () => {
    const layout = sticky({ kind: 'text', content: 'Header' }, { scrollOffset: 0, elementOffset: 3, offset: 1 });
    const tree = resolveTree(layout);

    expect(tree.kind).toBe('text');
  });
});
