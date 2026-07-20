import type { BoxNode, ColumnNode, FocusNode, LayoutEntry, LayoutPlan, LayoutRect, VNode } from '@celestial/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { assignLayoutIds, installDefaultLayoutCompositor, layoutTransition, registerLayoutTransitions, setActiveLayoutCompositor } from '../index.js';

afterEach(() => {
  setActiveLayoutCompositor(null);
});

function entry(id: string, rect: LayoutRect, node: VNode, children: LayoutEntry[] = []): LayoutEntry {
  return { id, node, rect, children };
}

function plan(root: LayoutEntry, width = 30, height = 10): LayoutPlan {
  const index = new Map<string, LayoutEntry>();
  const visit = (e: LayoutEntry) => {
    index.set(e.id, e);
    for (const c of e.children) visit(c);
  };
  visit(root);
  return { root, index, width, height, overlays: [] };
}

describe('layoutTransition', () => {
  it('returns child untouched when reduceMotion is on', () => {
    const child: VNode = { kind: 'text', content: 'hi' };
    const result = layoutTransition({ child, reduceMotion: true });
    expect(result).toBe(child);
  });

  it('assigns layoutIds from FocusNode.id', () => {
    const focus: FocusNode = {
      kind: 'focus',
      id: 'sidebar',
      focused: false,
      child: { kind: 'text', content: 'panel' },
    };
    const tree: ColumnNode = { kind: 'column', children: [focus] };
    const assigned = assignLayoutIds(tree) as ColumnNode;
    const focusAssigned = assigned.children[0] as FocusNode;
    expect(focusAssigned.layoutId).toBe('focus:sidebar');
  });

  it('preserves an existing layoutId', () => {
    const box: BoxNode = { kind: 'box', children: [], layoutId: 'manual-id' };
    const assigned = assignLayoutIds(box) as BoxNode;
    expect(assigned.layoutId).toBe('manual-id');
  });

  it('passes through subtrees without layoutIds', () => {
    const tree: VNode = { kind: 'box', children: [{ kind: 'text', content: 'no id' }] };
    const assigned = assignLayoutIds(tree);
    expect(assigned).toEqual(tree);
  });

  it('interpolates rects on the active compositor across two passes', () => {
    const compositor = installDefaultLayoutCompositor({
      duration: 200,
      spring: { stiffness: 200, damping: 25 },
    });
    const baseNode: BoxNode = { kind: 'box', children: [], layoutId: 'item-a' };

    const planA = plan(entry('item-a', { x: 0, y: 0, width: 10, height: 1 }, baseNode));
    compositor.update(planA, 0);

    const planB = plan(entry('item-a', { x: 30, y: 0, width: 10, height: 1 }, baseNode));
    const interpolated = compositor.update(planB, 32);
    const rect = interpolated.index.get('item-a')!.rect;
    // Spring delta should fall strictly between source (0) and target (30)
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.x).toBeLessThan(30);
  });

  it('registers per-id transition overrides on the active compositor', () => {
    installDefaultLayoutCompositor({ duration: 100 });
    registerLayoutTransitions({
      'item-a': { duration: 999 },
    });
    const tree: BoxNode = { kind: 'box', children: [], layoutId: 'item-a' };
    const wrapped = layoutTransition({
      child: tree,
      transitions: { 'item-a': { duration: 999 } },
    });
    expect(wrapped).not.toBe(tree);
  });
});
