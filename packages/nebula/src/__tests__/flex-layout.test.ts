import { describe, expect, it } from 'vitest';
import { flex, row, text } from '../elements.js';
import type { ColumnNode, FlexNode, RowNode, TextNode, VNode } from '../vdom.js';
import { layout, measure, planLayout } from '../vdom.js';

describe('FlexNode layout', () => {
  it('single flex child fills remaining space in row', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [{ kind: 'text', content: 'AB' } as TextNode, { kind: 'flex', child: { kind: 'text', content: 'X' } as TextNode } as FlexNode],
    };
    const plan = planLayout(tree, 10, 1);

    // 'AB' takes 2 cols, flex child should get remaining 8
    expect(plan.root.children.length).toBe(2);
    expect(plan.root.children[0]!.rect).toEqual({ x: 0, y: 0, width: 2, height: 1 });
    expect(plan.root.children[1]!.rect.x).toBe(2);
    expect(plan.root.children[1]!.rect.width).toBe(8);
  });

  it('multiple flex children distribute proportionally', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [
        { kind: 'flex', child: { kind: 'text', content: 'A' } as TextNode, flex: 1 } as FlexNode,
        { kind: 'flex', child: { kind: 'text', content: 'B' } as TextNode, flex: 2 } as FlexNode,
      ],
    };
    const plan = planLayout(tree, 9, 1);

    // flex:1 gets 3, flex:2 gets 6
    expect(plan.root.children[0]!.rect.width).toBe(3);
    expect(plan.root.children[0]!.rect.x).toBe(0);
    expect(plan.root.children[1]!.rect.width).toBe(6);
    expect(plan.root.children[1]!.rect.x).toBe(3);
  });

  it('flex in column distributes height', () => {
    const tree: ColumnNode = {
      kind: 'column',
      children: [{ kind: 'text', content: 'top' } as TextNode, { kind: 'flex', child: { kind: 'text', content: 'bot' } as TextNode } as FlexNode],
    };
    const plan = planLayout(tree, 10, 10);

    // 'top' takes 1 row, flex child gets remaining 9
    expect(plan.root.children[0]!.rect).toEqual({ x: 0, y: 0, width: 3, height: 1 });
    expect(plan.root.children[1]!.rect.y).toBe(1);
    expect(plan.root.children[1]!.rect.height).toBe(9);
  });

  it('min/max constraints respected', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [
        { kind: 'flex', child: { kind: 'text', content: 'X' } as TextNode, flex: 1, maxWidth: 5 } as FlexNode,
        { kind: 'flex', child: { kind: 'text', content: 'Y' } as TextNode, flex: 1 } as FlexNode,
      ],
    };
    const plan = planLayout(tree, 20, 1);

    // First constrained to max 5, second gets remaining 15
    expect(plan.root.children[0]!.rect.width).toBe(5);
    expect(plan.root.children[1]!.rect.width).toBe(15);
  });

  it('mixed fixed + flex children', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [
        { kind: 'text', content: 'fixed' } as TextNode,
        { kind: 'flex', child: { kind: 'text', content: 'grow' } as TextNode, flex: 1 } as FlexNode,
        { kind: 'text', content: 'end' } as TextNode,
      ],
    };
    const plan = planLayout(tree, 20, 1);

    // 'fixed' = 5 cols, 'end' = 3 cols, flex gets 20-5-3 = 12
    expect(plan.root.children[0]!.rect).toEqual({ x: 0, y: 0, width: 5, height: 1 });
    expect(plan.root.children[1]!.rect.x).toBe(5);
    expect(plan.root.children[1]!.rect.width).toBe(12);
    expect(plan.root.children[2]!.rect.x).toBe(17);
    expect(plan.root.children[2]!.rect.width).toBe(3);
  });

  it('FlexNode measure delegates to child', () => {
    const flexNode: FlexNode = {
      kind: 'flex',
      child: { kind: 'text', content: 'hello' } as TextNode,
    };
    const size = measure(flexNode as VNode);
    expect(size).toEqual({ width: 5, height: 1 });
  });

  it('default flex weight is 1 — equal distribution', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [
        { kind: 'flex', child: { kind: 'text', content: 'A' } as TextNode } as FlexNode,
        { kind: 'flex', child: { kind: 'text', content: 'B' } as TextNode } as FlexNode,
      ],
    };
    const plan = planLayout(tree, 10, 1);

    // Both default to flex:1 → equal split: 5 each
    expect(plan.root.children[0]!.rect.width).toBe(5);
    expect(plan.root.children[1]!.rect.width).toBe(5);
  });

  it('flex node outside row/column uses available space', () => {
    const flexNode: FlexNode = {
      kind: 'flex',
      child: { kind: 'text', content: 'hello' } as TextNode,
    };
    const plan = planLayout(flexNode as VNode, 20, 5);

    // Not inside a row/column, so it plans its child with available space
    expect(plan.root.rect.x).toBe(0);
    expect(plan.root.rect.y).toBe(0);
  });

  it('flex with minWidth constraint prevents shrinking below minimum', () => {
    const tree: RowNode = {
      kind: 'row',
      children: [
        { kind: 'flex', child: { kind: 'text', content: 'A' } as TextNode, flex: 1, minWidth: 8 } as FlexNode,
        { kind: 'flex', child: { kind: 'text', content: 'B' } as TextNode, flex: 1 } as FlexNode,
      ],
    };
    const plan = planLayout(tree, 10, 1);

    // Without min, each would get 5. With minWidth 8, first gets 8, second gets 2
    expect(plan.root.children[0]!.rect.width).toBe(8);
    expect(plan.root.children[1]!.rect.width).toBe(2);
  });

  it('flex in column respects minHeight/maxHeight', () => {
    const tree: ColumnNode = {
      kind: 'column',
      children: [
        { kind: 'flex', child: { kind: 'text', content: 'A' } as TextNode, flex: 1, maxHeight: 3 } as FlexNode,
        { kind: 'flex', child: { kind: 'text', content: 'B' } as TextNode, flex: 1 } as FlexNode,
      ],
    };
    const plan = planLayout(tree, 10, 10);

    // Without max, each would get 5. With maxHeight 3, first gets 3, second gets 7
    expect(plan.root.children[0]!.rect.height).toBe(3);
    expect(plan.root.children[1]!.rect.height).toBe(7);
  });

  it('flex child rasterizes correctly', () => {
    const tree = row(text('AB'), flex(text('XY')));
    const grid = layout(tree, 10, 1);

    // AB at cols 0-1, XY at col 2 (flex fills remaining 8 cols)
    expect(grid.cells[0]![0]!.char).toBe('A');
    expect(grid.cells[0]![1]!.char).toBe('B');
    expect(grid.cells[0]![2]!.char).toBe('X');
    expect(grid.cells[0]![3]!.char).toBe('Y');
  });

  it('uses element constructor correctly', () => {
    const node = flex(text('hello'), { flex: 2, minWidth: 5, maxWidth: 20 });
    expect(node.kind).toBe('flex');
    expect(node.flex).toBe(2);
    expect(node.minWidth).toBe(5);
    expect(node.maxWidth).toBe(20);
    expect(node.child.kind).toBe('text');
  });

  it('row with gap and flex children', () => {
    const tree: RowNode = {
      kind: 'row',
      gap: 1,
      children: [{ kind: 'text', content: 'AB' } as TextNode, { kind: 'flex', child: { kind: 'text', content: 'X' } as TextNode } as FlexNode],
    };
    const plan = planLayout(tree, 10, 1);

    // 'AB' takes 2, gap takes 1, flex gets remaining 7
    expect(plan.root.children[0]!.rect.width).toBe(2);
    expect(plan.root.children[1]!.rect.x).toBe(3); // 2 + 1 gap
    expect(plan.root.children[1]!.rect.width).toBe(7);
  });
});
