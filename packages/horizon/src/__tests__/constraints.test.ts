import type { VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import type { SizeRequest } from '../constraints.js';
import {
  applySplitConstraints,
  applyTileConstraints,
  constraintUpdate,
  createConstraintModel,
  DEFAULT_CONSTRAINT,
  getConstraint,
  isCollapsed,
  isCollapsible,
  isLocked,
  resolveConstraints,
} from '../constraints.js';
import type { SplitConfig } from '../split.js';
import type { TileLayout } from '../tile.js';

// Helper to create a simple text VNode for testing
const text = (s: string): VNode => ({ kind: 'text', content: s });

// ---------------------------------------------------------------------------
// Factory defaults
// ---------------------------------------------------------------------------

describe('createConstraintModel', () => {
  it('returns empty constraints and default snapThreshold', () => {
    const model = createConstraintModel();
    expect(model.constraints).toEqual({});
    expect(model.snapThreshold).toBe(2);
  });

  it('accepts initial constraints filling in defaults', () => {
    const model = createConstraintModel({
      constraints: { pane1: { minWidth: 10 } },
    });
    const c = model.constraints['pane1'];
    expect(c).toBeDefined();
    expect(c!.minWidth).toBe(10);
    expect(c!.locked).toBe(false);
    expect(c!.collapsible).toBe(false);
    expect(c!.collapsed).toBe(false);
    expect(c!.priority).toBe(0);
  });

  it('accepts custom snapThreshold', () => {
    const model = createConstraintModel({ snapThreshold: 5 });
    expect(model.snapThreshold).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_CONSTRAINT
// ---------------------------------------------------------------------------

describe('DEFAULT_CONSTRAINT', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONSTRAINT).toEqual({
      locked: false,
      collapsible: false,
      collapsed: false,
      priority: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// constraintUpdate reducer — all 8 message types
// ---------------------------------------------------------------------------

describe('constraintUpdate', () => {
  describe('constraint-set', () => {
    it('adds a new constraint with defaults', () => {
      const model = createConstraintModel();
      const updated = constraintUpdate({ type: 'constraint-set', paneId: 'a', constraint: { minWidth: 10 } }, model);
      expect(updated.constraints['a']).toBeDefined();
      expect(updated.constraints['a']!.minWidth).toBe(10);
      expect(updated.constraints['a']!.locked).toBe(false);
    });

    it('merges with existing constraint', () => {
      const model = createConstraintModel({
        constraints: { a: { minWidth: 10, locked: true } },
      });
      const updated = constraintUpdate({ type: 'constraint-set', paneId: 'a', constraint: { maxWidth: 50 } }, model);
      expect(updated.constraints['a']!.minWidth).toBe(10);
      expect(updated.constraints['a']!.maxWidth).toBe(50);
      expect(updated.constraints['a']!.locked).toBe(true);
    });
  });

  describe('constraint-remove', () => {
    it('removes an existing constraint', () => {
      const model = createConstraintModel({
        constraints: { a: { minWidth: 10 } },
      });
      const updated = constraintUpdate({ type: 'constraint-remove', paneId: 'a' }, model);
      expect(updated.constraints['a']).toBeUndefined();
    });

    it('is no-op for nonexistent pane', () => {
      const model = createConstraintModel();
      const updated = constraintUpdate({ type: 'constraint-remove', paneId: 'nonexistent' }, model);
      expect(updated).toEqual(model);
    });
  });

  describe('constraint-lock', () => {
    it('locks a pane with existing constraint', () => {
      const model = createConstraintModel({
        constraints: { a: {} },
      });
      const updated = constraintUpdate({ type: 'constraint-lock', paneId: 'a' }, model);
      expect(updated.constraints['a']!.locked).toBe(true);
    });

    it('creates constraint if pane has none', () => {
      const model = createConstraintModel();
      const updated = constraintUpdate({ type: 'constraint-lock', paneId: 'a' }, model);
      expect(updated.constraints['a']!.locked).toBe(true);
    });
  });

  describe('constraint-unlock', () => {
    it('unlocks a locked pane', () => {
      const model = createConstraintModel({
        constraints: { a: { locked: true } },
      });
      const updated = constraintUpdate({ type: 'constraint-unlock', paneId: 'a' }, model);
      expect(updated.constraints['a']!.locked).toBe(false);
    });
  });

  describe('constraint-collapse', () => {
    it('collapses a collapsible pane', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: true } },
      });
      const updated = constraintUpdate({ type: 'constraint-collapse', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(true);
    });

    it('is no-op when pane is not collapsible', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: false } },
      });
      const updated = constraintUpdate({ type: 'constraint-collapse', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(false);
    });

    it('is no-op when pane has no constraint', () => {
      const model = createConstraintModel();
      const updated = constraintUpdate({ type: 'constraint-collapse', paneId: 'a' }, model);
      // no constraint created for non-collapsible pane
      expect(updated.constraints['a']).toBeUndefined();
    });
  });

  describe('constraint-expand', () => {
    it('expands a collapsed pane', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: true, collapsed: true } },
      });
      const updated = constraintUpdate({ type: 'constraint-expand', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(false);
    });
  });

  describe('constraint-toggle-collapse', () => {
    it('collapses an expanded collapsible pane', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: true, collapsed: false } },
      });
      const updated = constraintUpdate({ type: 'constraint-toggle-collapse', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(true);
    });

    it('expands a collapsed collapsible pane', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: true, collapsed: true } },
      });
      const updated = constraintUpdate({ type: 'constraint-toggle-collapse', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(false);
    });

    it('is no-op for non-collapsible pane', () => {
      const model = createConstraintModel({
        constraints: { a: { collapsible: false, collapsed: false } },
      });
      const updated = constraintUpdate({ type: 'constraint-toggle-collapse', paneId: 'a' }, model);
      expect(updated.constraints['a']!.collapsed).toBe(false);
    });
  });

  describe('constraint-set-snap-threshold', () => {
    it('updates the snap threshold', () => {
      const model = createConstraintModel();
      const updated = constraintUpdate({ type: 'constraint-set-snap-threshold', threshold: 5 }, model);
      expect(updated.snapThreshold).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('constraintUpdate does not mutate the original model', () => {
    const model = createConstraintModel({
      constraints: { a: { minWidth: 10 } },
    });
    const original = JSON.parse(JSON.stringify(model));

    constraintUpdate({ type: 'constraint-set', paneId: 'a', constraint: { maxWidth: 99 } }, model);
    constraintUpdate({ type: 'constraint-lock', paneId: 'a' }, model);
    constraintUpdate({ type: 'constraint-remove', paneId: 'a' }, model);

    expect(model).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

describe('query functions', () => {
  const model = createConstraintModel({
    constraints: {
      locked: { locked: true },
      collapsible: { collapsible: true, collapsed: false },
      collapsed: { collapsible: true, collapsed: true },
      plain: {},
    },
  });

  describe('getConstraint', () => {
    it('returns the constraint for an existing pane', () => {
      const c = getConstraint(model, 'locked');
      expect(c).toBeDefined();
      expect(c!.locked).toBe(true);
    });

    it('returns undefined for a nonexistent pane', () => {
      expect(getConstraint(model, 'nope')).toBeUndefined();
    });
  });

  describe('isLocked', () => {
    it('returns true for locked pane', () => {
      expect(isLocked(model, 'locked')).toBe(true);
    });

    it('returns false for unlocked pane', () => {
      expect(isLocked(model, 'plain')).toBe(false);
    });

    it('returns false for nonexistent pane', () => {
      expect(isLocked(model, 'nope')).toBe(false);
    });
  });

  describe('isCollapsed', () => {
    it('returns true for collapsed pane', () => {
      expect(isCollapsed(model, 'collapsed')).toBe(true);
    });

    it('returns false for non-collapsed pane', () => {
      expect(isCollapsed(model, 'collapsible')).toBe(false);
    });

    it('returns false for nonexistent pane', () => {
      expect(isCollapsed(model, 'nope')).toBe(false);
    });
  });

  describe('isCollapsible', () => {
    it('returns true for collapsible pane', () => {
      expect(isCollapsible(model, 'collapsible')).toBe(true);
    });

    it('returns false for non-collapsible pane', () => {
      expect(isCollapsible(model, 'plain')).toBe(false);
    });

    it('returns false for nonexistent pane', () => {
      expect(isCollapsible(model, 'nope')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveConstraints
// ---------------------------------------------------------------------------

describe('resolveConstraints', () => {
  it('equal ratios, no constraints -> equal sizes', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.5, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.5, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes).toEqual([
      { id: 'a', size: 50 },
      { id: 'b', size: 50 },
    ]);
    expect(result.violations).toEqual([]);
  });

  it('one collapsed -> gets 0 size, other gets all', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.5, locked: false, collapsed: true, priority: 0 },
      { id: 'b', ratio: 0.5, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes).toEqual([
      { id: 'a', size: 0 },
      { id: 'b', size: 100 },
    ]);
    expect(result.violations).toEqual([]);
  });

  it('minWidth enforced -> constrained pane gets minimum', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.1, min: 30, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.9, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes[0]!.size).toBe(30);
    expect(result.sizes[1]!.size).toBe(70);
    expect(result.violations).toEqual([]);
  });

  it('maxWidth enforced -> constrained pane gets maximum', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.8, max: 40, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.2, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes[0]!.size).toBe(40);
    expect(result.sizes[1]!.size).toBe(60);
    expect(result.violations).toEqual([]);
  });

  it('two conflicting minWidths exceeding space -> both violated', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.5, min: 60, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.5, min: 60, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    // Both get scaled proportionally: 60/(60+60)*100 = 50 each
    const totalSize = result.sizes.reduce((sum, s) => sum + s.size, 0);
    expect(totalSize).toBe(100);
    // Both are violated because neither gets its min of 60
    expect(result.violations).toContain('a');
    expect(result.violations).toContain('b');
  });

  it('snap to preferredRatio when within threshold', () => {
    // Preferred ratio is 0.5, requested ratio gives 48 out of 100, threshold=2
    // 48 is within 2 of 50 (0.5*100), so snap
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.48, preferredRatio: 0.5, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.52, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes[0]!.size).toBe(50);
    expect(result.sizes[1]!.size).toBe(50);
  });

  it('does not snap when outside threshold', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.4, preferredRatio: 0.5, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.6, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    // 40 is not within 2 of 50, so no snap
    expect(result.sizes[0]!.size).toBe(40);
    expect(result.sizes[1]!.size).toBe(60);
  });

  it('locked pane maintains size', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.3, locked: true, collapsed: false, priority: 0 },
      { id: 'b', ratio: 0.7, locked: false, collapsed: false, priority: 0 },
    ];
    // Locked pane gets its exact proportional size, others fill the rest
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes[0]!.size).toBe(30);
    expect(result.sizes[1]!.size).toBe(70);
  });

  it('priority-based resolution: higher priority gets satisfied first', () => {
    // Both want min, but only 100 space. High-priority gets min first.
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.5, min: 60, locked: false, collapsed: false, priority: 10 },
      { id: 'b', ratio: 0.5, min: 60, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    // a has higher priority so it gets min of 60, b gets the remaining 40
    expect(result.sizes[0]!.size).toBe(60);
    expect(result.sizes[1]!.size).toBe(40);
    // b is violated because it wanted 60 but got 40
    expect(result.violations).toContain('b');
    expect(result.violations).not.toContain('a');
  });

  it('rounding correction: sizes sum to available space', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 1 / 3, locked: false, collapsed: false, priority: 0 },
      { id: 'b', ratio: 1 / 3, locked: false, collapsed: false, priority: 0 },
      { id: 'c', ratio: 1 / 3, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    const totalSize = result.sizes.reduce((sum, s) => sum + s.size, 0);
    expect(totalSize).toBe(100);
  });

  it('handles single pane getting all space', () => {
    const requests: SizeRequest[] = [{ id: 'a', ratio: 1.0, locked: false, collapsed: false, priority: 0 }];
    const result = resolveConstraints(requests, 80, 2);
    expect(result.sizes).toEqual([{ id: 'a', size: 80 }]);
    expect(result.violations).toEqual([]);
  });

  it('handles empty requests', () => {
    const result = resolveConstraints([], 100, 2);
    expect(result.sizes).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('all collapsed panes -> all get 0', () => {
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.5, locked: false, collapsed: true, priority: 0 },
      { id: 'b', ratio: 0.5, locked: false, collapsed: true, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    expect(result.sizes).toEqual([
      { id: 'a', size: 0 },
      { id: 'b', size: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Regression: redistribution uses stale unclampedTotal
// ---------------------------------------------------------------------------

describe('resolveConstraints — stale unclampedTotal regression', () => {
  it('should compute proportional shares before applying updates to avoid stale totals', () => {
    // Bug: In the redistribution loop (constraints.ts:371-379), unclampedTotal is computed
    // once from current sizes, but then each unclamped peer is updated sequentially.
    // The second peer's share computation reads sizes.get(ur.id)! which was already
    // modified by the first peer's update. With unequal sizes, this skews redistribution.
    //
    // Setup: 4 panes. 'a' has max=20 (priority 10), so it gets clamped from 40 to 20.
    // 'b'=30, 'c'=20, 'd'=10 are the unclamped peers (total=60).
    // Excess = 40 - 20 = 20. Distribution should be proportional to their original sizes:
    //   b gets 20 * (30/60) = 10  -> final 40
    //   c gets 20 * (20/60) = 6.67 -> final 26.67
    //   d gets 20 * (10/60) = 3.33 -> final 13.33
    //
    // With the stale-total bug, after b is updated to 40, the loop reads b=40 for
    // c's share calculation, making the shares wrong.
    const requests: SizeRequest[] = [
      { id: 'a', ratio: 0.4, max: 20, locked: false, collapsed: false, priority: 10 },
      { id: 'b', ratio: 0.3, locked: false, collapsed: false, priority: 0 },
      { id: 'c', ratio: 0.2, locked: false, collapsed: false, priority: 0 },
      { id: 'd', ratio: 0.1, locked: false, collapsed: false, priority: 0 },
    ];
    const result = resolveConstraints(requests, 100, 2);
    const sizeA = result.sizes.find((s) => s.id === 'a')!.size;
    const sizeB = result.sizes.find((s) => s.id === 'b')!.size;
    const sizeC = result.sizes.find((s) => s.id === 'c')!.size;
    const sizeD = result.sizes.find((s) => s.id === 'd')!.size;
    expect(sizeA).toBe(20);
    // The remaining 80 should be distributed proportionally to original ratios (0.3:0.2:0.1)
    // b should get 50% of 80 = 40, c should get 33.3% of 80 = 27, d should get 16.7% of 80 = 13
    // (after rounding)
    expect(sizeA + sizeB + sizeC + sizeD).toBe(100);
    // Key assertion: b/c/d should be in proportion 3:2:1 (from their original ratios)
    // Within rounding tolerance of 1
    expect(Math.abs(sizeB / sizeD - 3)).toBeLessThan(0.5);
    expect(Math.abs(sizeC / sizeD - 2)).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// applySplitConstraints
// ---------------------------------------------------------------------------

describe('applySplitConstraints', () => {
  const dummyFirst: VNode = text('first');
  const dummySecond: VNode = text('second');

  it('returns adjusted config with constrained ratio', () => {
    const config: SplitConfig = {
      direction: 'horizontal',
      ratio: 0.5,
      first: dummyFirst,
      second: dummySecond,
    };
    const constraints = createConstraintModel({
      constraints: {
        a: { minWidth: 30 },
      },
    });
    const result = applySplitConstraints(config, constraints, 'a', 'b', 100);
    expect(result.direction).toBe('horizontal');
    expect(result.ratio).toBeGreaterThanOrEqual(0.3);
    expect(result.first).toBe(dummyFirst);
    expect(result.second).toBe(dummySecond);
  });

  it('collapses first pane when collapsed', () => {
    const config: SplitConfig = {
      direction: 'horizontal',
      ratio: 0.5,
      first: dummyFirst,
      second: dummySecond,
    };
    const constraints = createConstraintModel({
      constraints: {
        a: { collapsible: true, collapsed: true },
      },
    });
    const result = applySplitConstraints(config, constraints, 'a', 'b', 100);
    expect(result.ratio).toBe(0);
  });

  it('preserves config when both panes are constrained', () => {
    const config: SplitConfig = {
      direction: 'vertical',
      ratio: 0.5,
      first: dummyFirst,
      second: dummySecond,
    };
    const constraints = createConstraintModel({
      constraints: {
        a: { minWidth: 20 },
        b: { minWidth: 20 },
      },
    });
    const result = applySplitConstraints(config, constraints, 'a', 'b', 100);
    // Both mins sum to 40, fits in 100 space
    expect(result.ratio).toBeGreaterThanOrEqual(0.2);
    expect(result.ratio).toBeLessThanOrEqual(0.8);
  });

  it('works when no constraints exist for panes', () => {
    const config: SplitConfig = {
      direction: 'horizontal',
      ratio: 0.4,
      first: dummyFirst,
      second: dummySecond,
    };
    const constraints = createConstraintModel();
    const result = applySplitConstraints(config, constraints, 'a', 'b', 100);
    expect(result.ratio).toBe(0.4);
  });
});

// ---------------------------------------------------------------------------
// applyTileConstraints
// ---------------------------------------------------------------------------

describe('applyTileConstraints', () => {
  const leaf = (name: string): VNode => ({ kind: 'text', content: name });

  const getPaneId = (layout: TileLayout): string | null => {
    if (layout.kind === 'leaf') {
      const node = layout.content as { kind: string; content?: string };
      return node.content ?? null;
    }
    return null;
  };

  it('leaf unchanged', () => {
    const layout: TileLayout = { kind: 'leaf', content: leaf('a') };
    const constraints = createConstraintModel();
    const result = applyTileConstraints(layout, constraints, 100, 50, getPaneId);
    expect(result).toEqual(layout);
  });

  it('split with constraints adjusts ratio', () => {
    const layout: TileLayout = {
      kind: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { kind: 'leaf', content: leaf('a') },
      second: { kind: 'leaf', content: leaf('b') },
    };
    const constraints = createConstraintModel({
      constraints: {
        a: { minWidth: 60 },
      },
    });
    const result = applyTileConstraints(layout, constraints, 100, 50, getPaneId);
    expect(result.kind).toBe('split');
    if (result.kind === 'split') {
      expect(result.ratio).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('nested layout applies constraints recursively', () => {
    const layout: TileLayout = {
      kind: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: { kind: 'leaf', content: leaf('a') },
      second: {
        kind: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { kind: 'leaf', content: leaf('b') },
        second: { kind: 'leaf', content: leaf('c') },
      },
    };
    const constraints = createConstraintModel({
      constraints: {
        b: { minHeight: 30 },
      },
    });
    const result = applyTileConstraints(layout, constraints, 100, 50, getPaneId);
    expect(result.kind).toBe('split');
    if (result.kind === 'split') {
      const secondChild = result.second;
      if (secondChild.kind === 'split') {
        // b has minHeight 30 out of 50 height, so ratio should be >= 0.6
        expect(secondChild.ratio).toBeGreaterThanOrEqual(0.6);
      }
    }
  });
});
