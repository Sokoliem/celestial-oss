import type { ColumnNode, FlexNode, RowNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import type { TileLayout } from '../tile.js';
import { columns, grid, rows, tile } from '../tile.js';

function textNode(content: string): VNode {
  return { kind: 'text', content };
}

describe('tile', () => {
  describe('leaf rendering', () => {
    it('should render a single leaf as its content', () => {
      const layout: TileLayout = { kind: 'leaf', content: textNode('hello') };
      const result = tile(layout);
      expect(result).toEqual(textNode('hello'));
    });
  });

  describe('horizontal split', () => {
    it('should create a row with two panes for horizontal split', () => {
      const layout: TileLayout = {
        kind: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { kind: 'leaf', content: textNode('left') },
        second: { kind: 'leaf', content: textNode('right') },
      };

      const result = tile(layout);
      expect(result.kind).toBe('row');

      const row = result as RowNode;
      // splitPane creates: [pane, separator, pane]
      expect(row.children).toHaveLength(3);
    });
  });

  describe('vertical split', () => {
    it('should create a column with two panes for vertical split', () => {
      const layout: TileLayout = {
        kind: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { kind: 'leaf', content: textNode('top') },
        second: { kind: 'leaf', content: textNode('bottom') },
      };

      const result = tile(layout);
      expect(result.kind).toBe('column');

      const col = result as ColumnNode;
      expect(col.children).toHaveLength(3);
    });
  });

  describe('recursive nesting', () => {
    it('should handle nested splits', () => {
      const layout: TileLayout = {
        kind: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { kind: 'leaf', content: textNode('left') },
        second: {
          kind: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { kind: 'leaf', content: textNode('top-right') },
          second: { kind: 'leaf', content: textNode('bottom-right') },
        },
      };

      const result = tile(layout);

      // Top level should be a row (horizontal split)
      expect(result.kind).toBe('row');
      const row = result as RowNode;

      // The second pane (index 2) should contain a column (vertical split)
      const secondPane = row.children[2] as FlexNode;
      expect(secondPane.kind).toBe('flex');

      // The flex's child should be a box (overflow clipping) wrapping the vertical split (column)
      const innerBox = secondPane.child;
      expect(innerBox.kind).toBe('box');
      const innerContent = (innerBox as import('@celestial/core/nebula').BoxNode).children[0];
      expect(innerContent!.kind).toBe('column');
    });

    it('should handle deeply nested layouts', () => {
      const layout: TileLayout = {
        kind: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: {
          kind: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { kind: 'leaf', content: textNode('TL') },
          second: { kind: 'leaf', content: textNode('BL') },
        },
        second: {
          kind: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { kind: 'leaf', content: textNode('TR') },
          second: { kind: 'leaf', content: textNode('BR') },
        },
      };

      const result = tile(layout);

      // Should produce a valid VNode tree without errors
      expect(result.kind).toBe('row');

      // Collect all text to verify all panes are present
      const allText = collectTextContent(result);
      expect(allText).toContain('TL');
      expect(allText).toContain('BL');
      expect(allText).toContain('TR');
      expect(allText).toContain('BR');
    });
  });
});

describe('columns', () => {
  it('should return a leaf for a single pane', () => {
    const layout = columns(textNode('only'));
    expect(layout.kind).toBe('leaf');
    expect(layout.kind === 'leaf' && layout.content).toEqual(textNode('only'));
  });

  it('should create equal horizontal splits for multiple panes', () => {
    const layout = columns(textNode('a'), textNode('b'), textNode('c'));

    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('horizontal');
      // 3 panes: ratio should be 1/3 for the first
      expect(layout.ratio).toBeCloseTo(1 / 3, 5);
    }
  });

  it('should handle two panes with 50/50 split', () => {
    const layout = columns(textNode('left'), textNode('right'));

    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.ratio).toBeCloseTo(0.5, 5);
      expect(layout.direction).toBe('horizontal');
    }
  });

  it('should return an empty leaf for zero panes', () => {
    const layout = columns();
    expect(layout.kind).toBe('leaf');
    if (layout.kind === 'leaf') {
      expect(layout.content.kind).toBe('empty');
    }
  });

  it('should produce a renderable VNode via tile()', () => {
    const layout = columns(textNode('a'), textNode('b'));
    const vnode = tile(layout);
    expect(vnode.kind).toBe('row');
  });
});

describe('rows', () => {
  it('should return a leaf for a single pane', () => {
    const layout = rows(textNode('only'));
    expect(layout.kind).toBe('leaf');
  });

  it('should create equal vertical splits for multiple panes', () => {
    const layout = rows(textNode('a'), textNode('b'), textNode('c'));

    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('vertical');
      expect(layout.ratio).toBeCloseTo(1 / 3, 5);
    }
  });

  it('should return an empty leaf for zero panes', () => {
    const layout = rows();
    expect(layout.kind).toBe('leaf');
    if (layout.kind === 'leaf') {
      expect(layout.content.kind).toBe('empty');
    }
  });

  it('should produce a renderable VNode via tile()', () => {
    const layout = rows(textNode('a'), textNode('b'));
    const vnode = tile(layout);
    expect(vnode.kind).toBe('column');
  });
});

describe('grid', () => {
  it('should create a grid layout from a 2D array', () => {
    const panes = [
      [textNode('TL'), textNode('TR')],
      [textNode('BL'), textNode('BR')],
    ];

    const layout = grid(panes);

    // Top level should be a vertical split (rows)
    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('vertical');
    }
  });

  it('should render all cells in a 2x2 grid', () => {
    const panes = [
      [textNode('TL'), textNode('TR')],
      [textNode('BL'), textNode('BR')],
    ];

    const layout = grid(panes);
    const vnode = tile(layout);
    const allText = collectTextContent(vnode);

    expect(allText).toContain('TL');
    expect(allText).toContain('TR');
    expect(allText).toContain('BL');
    expect(allText).toContain('BR');
  });

  it('should handle a single-row grid', () => {
    const panes = [[textNode('a'), textNode('b'), textNode('c')]];
    const layout = grid(panes);

    // Single row: should be a horizontal split
    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('horizontal');
    }
  });

  it('should handle a single-cell grid', () => {
    const panes = [[textNode('only')]];
    const layout = grid(panes);

    expect(layout.kind).toBe('leaf');
    if (layout.kind === 'leaf') {
      expect(layout.content).toEqual(textNode('only'));
    }
  });

  it('should return an empty leaf for empty grid', () => {
    const layout = grid([]);
    expect(layout.kind).toBe('leaf');
    if (layout.kind === 'leaf') {
      expect(layout.content.kind).toBe('empty');
    }
  });

  it('should support custom row ratios', () => {
    const panes = [[textNode('top')], [textNode('bottom')]];

    const layout = grid(panes, { rows: [1, 3] });

    // The top row should get 1/4 of the space
    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('vertical');
      expect(layout.ratio).toBeCloseTo(0.25, 5);
    }
  });

  it('should support custom column ratios', () => {
    const panes = [[textNode('left'), textNode('right')]];

    const layout = grid(panes, { cols: [2, 1] });

    // Single row with column ratios
    expect(layout.kind).toBe('split');
    if (layout.kind === 'split') {
      expect(layout.direction).toBe('horizontal');
      // 2/(2+1) = 2/3
      expect(layout.ratio).toBeCloseTo(2 / 3, 5);
    }
  });
});

/** Collect all text content from a VNode tree */
function collectTextContent(node: VNode): string[] {
  const texts: string[] = [];

  function walk(n: VNode): void {
    switch (n.kind) {
      case 'text':
        texts.push(n.content);
        break;
      case 'row':
      case 'column':
        n.children.forEach(walk);
        break;
      case 'box':
        n.children.forEach(walk);
        break;
      case 'flex':
        walk(n.child);
        break;
      case 'focus':
        walk(n.child);
        break;
      case 'scroll':
        walk(n.child);
        break;
      case 'component':
        walk(n.render());
        break;
      case 'empty':
        break;
    }
  }

  walk(node);
  return texts;
}
