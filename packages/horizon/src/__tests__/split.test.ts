import type { BoxNode, ColumnNode, FlexNode, RowNode, TextNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { splitPane } from '../split.js';

function textNode(content: string): VNode {
  return { kind: 'text', content };
}

describe('splitPane', () => {
  describe('horizontal split', () => {
    it('should create a row with separator for horizontal split', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
      });

      expect(result.kind).toBe('row');
      const row = result as RowNode;
      // Should have 3 children: first pane, separator, second pane
      expect(row.children).toHaveLength(3);
    });

    it('should use default vertical separator character for horizontal split', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
      });

      const row = result as RowNode;
      const separator = row.children[1] as TextNode;
      expect(separator.kind).toBe('text');
      expect(separator.content).toBe('│');
    });

    it('should use custom separator character', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
        separator: '|',
      });

      const row = result as RowNode;
      const separator = row.children[1] as TextNode;
      expect(separator.kind).toBe('text');
      expect(separator.content).toBe('|');
    });

    it('should wrap panes in flex nodes with overflow-clipping box', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
      });

      const row = result as RowNode;
      const firstPane = row.children[0] as FlexNode;
      const secondPane = row.children[2] as FlexNode;

      expect(firstPane.kind).toBe('flex');
      expect(secondPane.kind).toBe('flex');

      // Child should be a box with overflow: 'hidden' wrapping the content
      const firstBox = firstPane.child as BoxNode;
      const secondBox = secondPane.child as BoxNode;
      expect(firstBox.kind).toBe('box');
      expect(firstBox.overflow).toBe('hidden');
      expect(firstBox.children[0]).toEqual(textNode('left'));
      expect(secondBox.kind).toBe('box');
      expect(secondBox.overflow).toBe('hidden');
      expect(secondBox.children[0]).toEqual(textNode('right'));
    });
  });

  describe('vertical split', () => {
    it('should create a column with separator for vertical split', () => {
      const result = splitPane({
        direction: 'vertical',
        ratio: 0.5,
        first: textNode('top'),
        second: textNode('bottom'),
      });

      expect(result.kind).toBe('column');
      const col = result as ColumnNode;
      // Should have 3 children: first pane, separator, second pane
      expect(col.children).toHaveLength(3);
    });

    it('should use default horizontal separator character for vertical split', () => {
      const result = splitPane({
        direction: 'vertical',
        ratio: 0.5,
        first: textNode('top'),
        second: textNode('bottom'),
      });

      const col = result as ColumnNode;
      const separator = col.children[1] as TextNode;
      expect(separator.kind).toBe('text');
      expect(separator.content).toBe('─');
    });

    it('should wrap panes in flex nodes with overflow-clipping box', () => {
      const result = splitPane({
        direction: 'vertical',
        ratio: 0.5,
        first: textNode('top'),
        second: textNode('bottom'),
      });

      const col = result as ColumnNode;
      const firstPane = col.children[0] as FlexNode;
      const secondPane = col.children[2] as FlexNode;

      expect(firstPane.kind).toBe('flex');
      expect(secondPane.kind).toBe('flex');

      const firstBox = firstPane.child as BoxNode;
      const secondBox = secondPane.child as BoxNode;
      expect(firstBox.kind).toBe('box');
      expect(firstBox.overflow).toBe('hidden');
      expect(firstBox.children[0]).toEqual(textNode('top'));
      expect(secondBox.kind).toBe('box');
      expect(secondBox.overflow).toBe('hidden');
      expect(secondBox.children[0]).toEqual(textNode('bottom'));
    });
  });

  describe('ratio handling', () => {
    it('should produce a 30/70 split with ratio 0.3', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.3,
        first: textNode('left'),
        second: textNode('right'),
      });

      const row = result as RowNode;
      const firstPane = row.children[0] as FlexNode;
      const secondPane = row.children[2] as FlexNode;

      // First pane should be smaller than second pane
      expect(firstPane.flex as number).toBeLessThan(secondPane.flex as number);
    });

    it('should clamp ratio to 0-1 range', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 1.5, // Should clamp to 1.0
        first: textNode('left'),
        second: textNode('right'),
      });

      const row = result as RowNode;
      const firstPane = row.children[0] as FlexNode;
      // With ratio clamped to 1.0, first pane gets 100 flex
      expect(firstPane.flex).toBe(100);
    });
  });

  describe('minSize', () => {
    it('should default minSize to 3', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
      });

      const row = result as RowNode;
      const firstPane = row.children[0] as FlexNode;
      expect(firstPane.minWidth).toBe(3);
    });

    it('should respect custom minSize', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('left'),
        second: textNode('right'),
        minSize: 10,
      });

      const row = result as RowNode;
      const firstPane = row.children[0] as FlexNode;
      expect(firstPane.minWidth).toBe(10);
    });
  });

  describe('default separator characters', () => {
    it('should default to vertical bar for horizontal splits', () => {
      const result = splitPane({
        direction: 'horizontal',
        ratio: 0.5,
        first: textNode('a'),
        second: textNode('b'),
      });
      const row = result as RowNode;
      const sep = row.children[1] as TextNode;
      expect(sep.kind).toBe('text');
      expect(sep.content).toBe('│');
    });

    it('should default to horizontal bar for vertical splits', () => {
      const result = splitPane({
        direction: 'vertical',
        ratio: 0.5,
        first: textNode('a'),
        second: textNode('b'),
      });
      const col = result as ColumnNode;
      const sep = col.children[1] as TextNode;
      expect(sep.kind).toBe('text');
      expect(sep.content).toBe('─');
    });
  });
});
