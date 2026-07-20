import { describe, expect, it } from 'vitest';
import type { BoxNode, RowNode, VNode } from '../vdom.js';
import { measure, planLayout, rasterize } from '../vdom.js';

function mkBox(child: VNode, opts?: Partial<BoxNode>): BoxNode {
  return {
    kind: 'box',
    children: [child],
    ...opts,
  } as BoxNode;
}

function mkText(content: string): VNode {
  return { kind: 'text', content };
}

describe('BoxNode layout constraints', () => {
  describe('measure()', () => {
    it('should clamp width upward with minWidth', () => {
      const node = mkBox(mkText('hi'), { minWidth: 10 });
      const size = measure(node, 80);
      expect(size.width).toBeGreaterThanOrEqual(10);
    });

    it('should clamp width downward with maxWidth', () => {
      const node = mkBox(mkText('hello world this is a long line'), { maxWidth: 5 });
      const size = measure(node, 80);
      expect(size.width).toBeLessThanOrEqual(5);
    });

    it('should clamp height upward with minHeight', () => {
      const node = mkBox(mkText('x'), { minHeight: 5 });
      const size = measure(node, 80);
      expect(size.height).toBeGreaterThanOrEqual(5);
    });

    it('should clamp height downward with maxHeight', () => {
      const node = mkBox(mkText('line1\nline2\nline3\nline4\nline5'), { maxHeight: 2 });
      const size = measure(node, 80);
      expect(size.height).toBeLessThanOrEqual(2);
    });

    it('should handle both min and max together', () => {
      const node = mkBox(mkText('x'), { minWidth: 10, maxWidth: 20, minHeight: 3, maxHeight: 8 });
      const size = measure(node, 80);
      expect(size.width).toBeGreaterThanOrEqual(10);
      expect(size.width).toBeLessThanOrEqual(20);
      expect(size.height).toBeGreaterThanOrEqual(3);
      expect(size.height).toBeLessThanOrEqual(8);
    });
  });

  describe('planLayout()', () => {
    it('should apply minWidth in planBox', () => {
      const node = mkBox(mkText('hi'), { minWidth: 15 });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.rect.width).toBeGreaterThanOrEqual(15);
    });

    it('should apply maxWidth in planBox', () => {
      const node = mkBox(mkText('hi'), { maxWidth: 5 });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.rect.width).toBeLessThanOrEqual(5);
    });

    it('should apply minHeight in planBox', () => {
      const node = mkBox(mkText('x'), { minHeight: 10 });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.rect.height).toBeGreaterThanOrEqual(10);
    });

    it('should apply maxHeight in planBox', () => {
      const node = mkBox(mkText('x'), { maxHeight: 1 });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.rect.height).toBeLessThanOrEqual(1);
    });

    it('should compose constraints with border', () => {
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
      const node = mkBox(mkText('hi'), { minWidth: 10, border });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.rect.width).toBeGreaterThanOrEqual(10);
    });

    it('box with constraints inside a row gets correct width', () => {
      const row: RowNode = {
        kind: 'row',
        children: [mkBox(mkText('left'), { maxWidth: 10 }), mkText('right')],
      };
      const plan = planLayout(row, 80, 24);
      const leftBox = plan.root.children[0]!;
      expect(leftBox.rect.width).toBeLessThanOrEqual(10);
    });

    it('renders correctly after constraint clamping', () => {
      const node = mkBox(mkText('AB'), { minWidth: 10, minHeight: 3 });
      const plan = planLayout(node, 80, 24);
      const grid = rasterize(plan);
      expect(grid.width).toBe(80);
      expect(grid.height).toBe(24);
    });
  });
});
