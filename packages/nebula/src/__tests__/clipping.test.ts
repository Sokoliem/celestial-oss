import { describe, expect, it } from 'vitest';
import { type BoxNode, layout, type TextNode } from '../vdom.js';

describe('clipping / overflow', () => {
  const border = {
    topLeft: '+',
    top: '-',
    topRight: '+',
    left: '|',
    right: '|',
    bottomLeft: '+',
    bottom: '-',
    bottomRight: '+',
  };

  describe('overflow:hidden clips content to box bounds', () => {
    it('should clip text wider than box', () => {
      // Box is 6 wide (4 inner with border), text is 10 chars
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'ABCDEFGHIJ' } as TextNode],
        border,
        width: 6,
        height: 3,
        overflow: 'hidden',
      };
      const grid = layout(node, 10, 5);

      // Border row 0: + - - - - +
      expect(grid.cells[0]![0]!.char).toBe('+');
      expect(grid.cells[0]![5]!.char).toBe('+');

      // Inner row 1: | A B C D |
      expect(grid.cells[1]![0]!.char).toBe('|');
      expect(grid.cells[1]![1]!.char).toBe('A');
      expect(grid.cells[1]![2]!.char).toBe('B');
      expect(grid.cells[1]![3]!.char).toBe('C');
      expect(grid.cells[1]![4]!.char).toBe('D');
      expect(grid.cells[1]![5]!.char).toBe('|');

      // Border row 2: + - - - - +
      expect(grid.cells[2]![0]!.char).toBe('+');
      expect(grid.cells[2]![5]!.char).toBe('+');

      // Outside the box should be spaces
      expect(grid.cells[1]![6]!.char).toBe(' ');
    });

    it('should clip text taller than box', () => {
      // Box has inner height 2 (total 4 with border), text has 5 lines
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'A\nB\nC\nD\nE' } as TextNode],
        border,
        width: 3,
        height: 4,
        overflow: 'hidden',
      };
      const grid = layout(node, 10, 10);

      // Row 0: border top
      expect(grid.cells[0]![0]!.char).toBe('+');
      // Row 1: inner content line 1 'A'
      expect(grid.cells[1]![1]!.char).toBe('A');
      // Row 2: inner content line 2 'B'
      expect(grid.cells[2]![1]!.char).toBe('B');
      // Row 3: border bottom
      expect(grid.cells[3]![0]!.char).toBe('+');

      // Lines C, D, E should NOT appear anywhere in the grid
      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          expect(grid.cells[r]![c]!.char).not.toBe('C');
          expect(grid.cells[r]![c]!.char).not.toBe('D');
          expect(grid.cells[r]![c]!.char).not.toBe('E');
        }
      }
    });
  });

  describe('border renders normally with overflow:hidden', () => {
    it('should render border intact when content is clipped', () => {
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'ABCDEFGHIJ' } as TextNode],
        border,
        width: 5,
        height: 3,
        overflow: 'hidden',
      };
      const grid = layout(node, 10, 5);

      // Top row
      expect(grid.cells[0]![0]!.char).toBe('+');
      expect(grid.cells[0]![1]!.char).toBe('-');
      expect(grid.cells[0]![2]!.char).toBe('-');
      expect(grid.cells[0]![3]!.char).toBe('-');
      expect(grid.cells[0]![4]!.char).toBe('+');
      // Sides
      expect(grid.cells[1]![0]!.char).toBe('|');
      expect(grid.cells[1]![4]!.char).toBe('|');
      // Bottom row
      expect(grid.cells[2]![0]!.char).toBe('+');
      expect(grid.cells[2]![1]!.char).toBe('-');
      expect(grid.cells[2]![2]!.char).toBe('-');
      expect(grid.cells[2]![3]!.char).toBe('-');
      expect(grid.cells[2]![4]!.char).toBe('+');

      // Inner content should be clipped to 3 chars
      expect(grid.cells[1]![1]!.char).toBe('A');
      expect(grid.cells[1]![2]!.char).toBe('B');
      expect(grid.cells[1]![3]!.char).toBe('C');
    });
  });

  describe('nested clipping contexts', () => {
    it('should clip to inner box bounds when nested', () => {
      const innerBox: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'ABCDEFGHIJ' } as TextNode],
        border,
        width: 4,
        height: 3,
        overflow: 'hidden',
      };
      const outerBox: BoxNode = {
        kind: 'box',
        children: [innerBox],
        border,
        width: 8,
        height: 5,
      };
      const grid = layout(outerBox, 10, 8);

      // Outer box border
      expect(grid.cells[0]![0]!.char).toBe('+');

      // Inner box top-left border at (1,1) and top-right at (1,4)
      expect(grid.cells[1]![1]!.char).toBe('+');
      expect(grid.cells[1]![4]!.char).toBe('+');

      // Inner content: only first 2 chars visible due to overflow:hidden (width 4 - 2 border = 2)
      expect(grid.cells[2]![2]!.char).toBe('A');
      expect(grid.cells[2]![3]!.char).toBe('B');
      expect(grid.cells[2]![4]!.char).toBe('|');

      // 'C' should NOT appear anywhere — clipped by overflow:hidden
      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          expect(grid.cells[r]![c]!.char).not.toBe('C');
        }
      }
    });
  });

  describe('overflow:hidden without border', () => {
    it('should clip content even without a border', () => {
      const node: BoxNode = {
        kind: 'box',
        children: [{ kind: 'text', content: 'ABCDEFGHIJ' } as TextNode],
        width: 3,
        height: 1,
        overflow: 'hidden',
      };
      const grid = layout(node, 5, 3);

      // First 3 chars should be visible
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[0]![2]!.char).toBe('C');

      // Chars beyond width=3 should not appear
      for (let r = 0; r < grid.height; r++) {
        for (let c = 0; c < grid.width; c++) {
          expect(grid.cells[r]![c]!.char).not.toBe('D');
          expect(grid.cells[r]![c]!.char).not.toBe('E');
        }
      }
    });
  });
});
