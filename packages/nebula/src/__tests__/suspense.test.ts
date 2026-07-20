import { describe, expect, it } from 'vitest';
import { suspense } from '../elements.js';
import { collectFocusNodes } from '../focus.js';
import type { FocusNode, VNode } from '../vdom.js';
import { measure, planLayout, rasterize } from '../vdom.js';

function mkText(content: string): VNode {
  return { kind: 'text', content };
}

function mkFocus(id: string, child: VNode): FocusNode {
  return { kind: 'focus', id, child, focused: false };
}

describe('suspense() VNode', () => {
  describe('resolved: false', () => {
    it('should render fallback content', () => {
      const node = suspense(mkText('loaded'), mkText('loading...'), false);
      const plan = planLayout(node, 80, 24);
      rasterize(plan);
      // First child in plan should be the fallback
      const textEntry = plan.root.children[0]!;
      expect(textEntry.node.kind).toBe('text');
      expect((textEntry.node as { content: string }).content).toBe('loading...');
    });

    it('should measure fallback size', () => {
      const node = suspense(mkText('loaded content'), mkText('...'), false);
      const size = measure(node, 80);
      expect(size.width).toBe(3); // '...' is 3 chars
    });

    it('should not collect focus nodes from unresolved child', () => {
      const child = mkFocus('child-focus', mkText('loaded'));
      const fallback = mkText('loading...');
      const node = suspense(child, fallback, false);
      const focusNodes = collectFocusNodes(node);
      expect(focusNodes.length).toBe(0);
    });
  });

  describe('resolved: true', () => {
    it('should render child content', () => {
      const node = suspense(mkText('loaded'), mkText('loading...'), true);
      const plan = planLayout(node, 80, 24);
      const textEntry = plan.root.children[0]!;
      expect(textEntry.node.kind).toBe('text');
      expect((textEntry.node as { content: string }).content).toBe('loaded');
    });

    it('should measure child size', () => {
      const node = suspense(mkText('loaded content'), mkText('...'), true);
      const size = measure(node, 80);
      expect(size.width).toBe(14); // 'loaded content' is 14 chars
    });

    it('should collect focus nodes from resolved child', () => {
      const child = mkFocus('child-focus', mkText('loaded'));
      const fallback = mkText('loading...');
      const node = suspense(child, fallback, true);
      const focusNodes = collectFocusNodes(node);
      expect(focusNodes.length).toBe(1);
      expect(focusNodes[0]!.id).toBe('child-focus');
    });
  });

  describe('layout integration', () => {
    it('should rasterize correctly', () => {
      const node = suspense(mkText('OK'), mkText('..'), true);
      const plan = planLayout(node, 80, 24);
      const grid = rasterize(plan);
      expect(grid.cells[0]![0]!.char).toBe('O');
      expect(grid.cells[0]![1]!.char).toBe('K');
    });

    it('should work inside a column', () => {
      const col: VNode = {
        kind: 'column',
        children: [suspense(mkText('A'), mkText('...'), true), suspense(mkText('B'), mkText('...'), false)],
      };
      const plan = planLayout(col, 80, 24);
      expect(plan.root.children.length).toBe(2);
    });

    it('nested suspense boundaries', () => {
      const inner = suspense(mkText('inner'), mkText('inner-loading'), true);
      const outer = suspense(inner, mkText('outer-loading'), true);
      const size = measure(outer, 80);
      expect(size.width).toBe(5); // 'inner'
    });
  });
});
