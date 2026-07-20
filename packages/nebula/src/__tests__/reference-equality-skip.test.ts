import { describe, expect, it } from 'vitest';
import type { TextNode, VNode } from '../vdom.js';
import { planLayout, rasterize } from '../vdom.js';

function mkText(content: string, layoutId?: string): TextNode {
  return { kind: 'text', content, layoutId };
}

describe('reference equality skip optimization', () => {
  it('should produce identical grids for same VNode tree', () => {
    const tree: VNode = {
      kind: 'column',
      children: [mkText('hello'), mkText('world')],
    };
    const plan1 = planLayout(tree, 80, 24);
    const grid1 = rasterize(plan1);
    const plan2 = planLayout(tree, 80, 24);
    const grid2 = rasterize(plan2);

    // Content should be identical
    expect(grid1.cells[0]![0]!.char).toBe(grid2.cells[0]![0]!.char);
    expect(grid1.cells[1]![0]!.char).toBe(grid2.cells[1]![0]!.char);
  });

  it('should produce different grids for different content', () => {
    const tree1: VNode = { kind: 'text', content: 'A' };
    const tree2: VNode = { kind: 'text', content: 'B' };

    const plan1 = planLayout(tree1, 80, 24);
    const grid1 = rasterize(plan1);
    const plan2 = planLayout(tree2, 80, 24);
    const grid2 = rasterize(plan2);

    expect(grid1.cells[0]![0]!.char).toBe('A');
    expect(grid2.cells[0]![0]!.char).toBe('B');
  });

  it('layout reuse with fingerprint matching skips re-planning', () => {
    const childText = mkText('stable', 'reuse-id');
    const tree: VNode = {
      kind: 'column',
      layoutId: 'root',
      children: [childText],
    };

    const plan1 = planLayout(tree, 80, 24);
    // Second plan with previousPlan should reuse matching entries
    const plan2 = planLayout(tree, 80, 24, { previousPlan: plan1 });

    // Stats should show reuse
    expect(plan2.stats!.reusedEntries).toBeGreaterThan(0);
  });

  it('layout reuse still works when only the parent has a layoutId', () => {
    const tree: VNode = {
      kind: 'column',
      layoutId: 'root',
      children: [{ kind: 'text', content: 'stable child' }],
    };

    const plan1 = planLayout(tree, 80, 24);
    const plan2 = planLayout(tree, 80, 24, { previousPlan: plan1 });

    expect(plan2.stats!.reusedEntries).toBeGreaterThan(0);
    expect(plan2.root.reused).toBe(true);
  });

  it('changed content prevents layout reuse when layoutDirty', () => {
    const tree1: VNode = {
      kind: 'column',
      layoutId: 'root',
      children: [mkText('version1', 'child-id')],
    };
    const plan1 = planLayout(tree1, 80, 24);

    // Mark the child as dirty so fingerprint comparison is skipped
    const tree2: VNode = {
      kind: 'column',
      layoutId: 'root',
      layoutDirty: true,
      children: [{ kind: 'text', content: 'version2', layoutId: 'child-id', layoutDirty: true } as VNode],
    };
    const plan2 = planLayout(tree2, 80, 24, { previousPlan: plan1 });

    const grid = rasterize(plan2);
    expect(grid.cells[0]![0]!.char).toBe('v');
    expect(grid.cells[0]![7]!.char).toBe('2');
  });
});
