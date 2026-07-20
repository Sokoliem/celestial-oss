import { describe, expect, it, vi } from 'vitest';
import { memo } from '../elements.js';
import type { TextNode, VNode } from '../vdom.js';
import { measure, planLayout, rasterize } from '../vdom.js';

function mkText(content: string): TextNode {
  return { kind: 'text', content };
}

describe('memo() VNode', () => {
  describe('memoization', () => {
    it('should call render on first encounter', () => {
      const render = vi.fn(() => mkText('hello'));
      const node = memo(render, [1, 2]);
      measure(node, 80);
      expect(render).toHaveBeenCalledOnce();
    });

    it('should skip render when deps are unchanged', () => {
      const render = vi.fn(() => mkText('hello'));

      // First call — should execute
      const node1 = memo(render, [1, 2]);
      measure(node1, 80);
      expect(render).toHaveBeenCalledTimes(1);

      // Second call with same render fn and same deps — should skip
      const node2 = memo(render, [1, 2]);
      measure(node2, 80);
      expect(render).toHaveBeenCalledTimes(1);
    });

    it('should re-render when deps change', () => {
      const render = vi.fn(() => mkText('hello'));

      const node1 = memo(render, [1, 2]);
      measure(node1, 80);
      expect(render).toHaveBeenCalledTimes(1);

      // Different deps — should re-render
      const node2 = memo(render, [1, 3]);
      measure(node2, 80);
      expect(render).toHaveBeenCalledTimes(2);
    });

    it('should re-render when deps length changes', () => {
      const render = vi.fn(() => mkText('hello'));

      const node1 = memo(render, [1]);
      measure(node1, 80);

      const node2 = memo(render, [1, 2]);
      measure(node2, 80);
      expect(render).toHaveBeenCalledTimes(2);
    });

    it('should handle Object.is semantics for deps', () => {
      const render = vi.fn(() => mkText('hello'));

      const node1 = memo(render, [NaN, 0]);
      measure(node1, 80);

      // NaN === NaN with Object.is, 0 !== -0 with Object.is
      const node2 = memo(render, [NaN, -0]);
      measure(node2, 80);
      expect(render).toHaveBeenCalledTimes(2);
    });
  });

  describe('layout integration', () => {
    it('should measure through memo node', () => {
      const node = memo(() => mkText('hello'), []);
      const size = measure(node, 80);
      expect(size.width).toBe(5);
      expect(size.height).toBe(1);
    });

    it('should plan layout through memo node', () => {
      const node = memo(() => mkText('hello'), []);
      const plan = planLayout(node, 80, 24);
      expect(plan.root.children.length).toBe(1);
      expect(plan.root.children[0]!.node.kind).toBe('text');
    });

    it('should rasterize through memo node', () => {
      const node = memo(() => mkText('AB'), []);
      const plan = planLayout(node, 80, 24);
      const grid = rasterize(plan);
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
    });

    it('should work when nested inside a column', () => {
      const node: VNode = {
        kind: 'column',
        children: [memo(() => mkText('line1'), ['a']), memo(() => mkText('line2'), ['b'])],
      };
      const plan = planLayout(node, 80, 24);
      expect(plan.root.children.length).toBe(2);
    });
  });
});
