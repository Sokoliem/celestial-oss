import type { BoxNode, RowNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { carousel, carouselUpdate, createCarouselModel, getCarouselOffset, isCarouselAnimating } from '../index.js';

function resolveTree(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols: 30, rows: 10 }, available: { cols: 30, rows: 10 }, container: { cols: 30, rows: 10 } }));
  }
  if (node.kind === 'row') {
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

describe('carousel', () => {
  it('animates toward the requested page', () => {
    let model = createCarouselModel(0);
    model = carouselUpdate({ type: 'carousel-go-to', index: 2 }, model, 3);
    expect(isCarouselAnimating(model)).toBe(true);

    model = carouselUpdate({ type: 'carousel-tick', now: 0 }, model, 3);
    model = carouselUpdate({ type: 'carousel-tick', now: 200 }, model, 3);
    expect(getCarouselOffset(model)).toBeGreaterThan(0);
  });

  it('renders the active page with adjacent peeks', () => {
    const model = createCarouselModel(1);
    const layout = carousel({
      pages: [
        { kind: 'text', content: 'Page 1' },
        { kind: 'text', content: 'Page 2' },
        { kind: 'text', content: 'Page 3' },
      ],
      activeIndex: 1,
      peekAmount: 4,
      model,
    });

    const tree = resolveTree(layout) as RowNode;
    const center = tree.children[1] as BoxNode;

    expect(tree.children).toHaveLength(3);
    expect(center.width).toBe(22);
  });
});
