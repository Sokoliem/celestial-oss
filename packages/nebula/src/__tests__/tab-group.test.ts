import { describe, expect, it } from 'vitest';
import { tabGroup } from '../elements.js';
import { collectFocusNodes } from '../focus.js';
import type { FocusNode, VNode } from '../vdom.js';
import { measure, planLayout, rasterize } from '../vdom.js';

function mkText(content: string): VNode {
  return { kind: 'text', content };
}

function mkFocus(id: string, child: VNode): FocusNode {
  return { kind: 'focus', id, child, focused: false };
}

describe('tabGroup() VNode', () => {
  describe('measure()', () => {
    it('horizontal: sums widths, max height', () => {
      const node = tabGroup('tg1', [mkText('AB'), mkText('CD')], { orientation: 'horizontal' });
      const size = measure(node, 80);
      expect(size.width).toBe(4); // 2+2
      expect(size.height).toBe(1);
    });

    it('vertical: max width, sums heights', () => {
      const node = tabGroup('tg1', [mkText('AB'), mkText('CD')], { orientation: 'vertical' });
      const size = measure(node, 80);
      expect(size.width).toBe(2);
      expect(size.height).toBe(2); // 1+1
    });
  });

  describe('planLayout()', () => {
    it('horizontal layout: children side by side', () => {
      const node = tabGroup('tg1', [mkText('AA'), mkText('BB')], { orientation: 'horizontal' });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.children.length).toBe(2);
      expect(plan.root.children[0]!.rect.x).toBe(0);
      expect(plan.root.children[1]!.rect.x).toBe(2);
    });

    it('vertical layout: children stacked', () => {
      const node = tabGroup('tg1', [mkText('AA'), mkText('BB')], { orientation: 'vertical' });
      const plan = planLayout(node, 80, 24);
      expect(plan.root.children.length).toBe(2);
      expect(plan.root.children[0]!.rect.y).toBe(0);
      expect(plan.root.children[1]!.rect.y).toBe(1);
    });

    it('rasterizes children correctly', () => {
      const node = tabGroup('tg1', [mkText('AB'), mkText('CD')], { orientation: 'horizontal' });
      const plan = planLayout(node, 80, 24);
      const grid = rasterize(plan);
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[0]![2]!.char).toBe('C');
      expect(grid.cells[0]![3]!.char).toBe('D');
    });
  });

  describe('focus collection', () => {
    it('should collect focus nodes from children', () => {
      const node = tabGroup('tg1', [mkFocus('btn-1', mkText('One')), mkFocus('btn-2', mkText('Two')), mkFocus('btn-3', mkText('Three'))]);
      const focusNodes = collectFocusNodes(node);
      expect(focusNodes.length).toBe(3);
      expect(focusNodes.map((n) => n.id)).toEqual(['btn-1', 'btn-2', 'btn-3']);
    });
  });

  describe('configuration', () => {
    it('defaults to horizontal orientation', () => {
      const node = tabGroup('tg1', [mkText('A')]);
      expect(node.orientation).toBe('horizontal');
    });

    it('defaults activeIndex to 0', () => {
      const node = tabGroup('tg1', [mkText('A')]);
      expect(node.activeIndex).toBe(0);
    });

    it('accepts wrap option', () => {
      const node = tabGroup('tg1', [mkText('A')], { wrap: true });
      expect(node.wrap).toBe(true);
    });
  });
});
