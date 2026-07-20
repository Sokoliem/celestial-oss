import { describe, expect, it } from 'vitest';
import { applyTabMoveEffect, type TabGroup } from '../tabs.js';

describe('applyTabMoveEffect', () => {
  it('moves a tab within the same group', () => {
    const groups: TabGroup<string>[] = [{ id: 'g1', tabs: ['A', 'B', 'C'], activeIndex: 0 }];

    const result = applyTabMoveEffect(groups, {
      effect: 'move-tab',
      sourceTabbedId: 'g1',
      sourceIndex: 0,
      targetTabbedId: 'g1',
      targetIndex: 2,
    });

    expect(result[0]?.tabs).toEqual(['B', 'C', 'A']);
    // 'A' was active, moved to index 2, so activeIndex should now be 2
    expect(result[0]?.activeIndex).toBe(2);
  });

  it('moves a tab between groups', () => {
    const groups: TabGroup<string>[] = [
      { id: 'g1', tabs: ['A', 'B'], activeIndex: 0 },
      { id: 'g2', tabs: ['C', 'D'], activeIndex: 0 },
    ];

    const result = applyTabMoveEffect(groups, {
      effect: 'move-tab',
      sourceTabbedId: 'g1',
      sourceIndex: 1,
      targetTabbedId: 'g2',
      targetIndex: 1,
    });

    expect(result[0]?.tabs).toEqual(['A']);
    expect(result[0]?.activeIndex).toBe(0);
    expect(result[1]?.tabs).toEqual(['C', 'B', 'D']);
  });

  it('moves a tab to a new pane', () => {
    const groups: TabGroup<string>[] = [{ id: 'g1', tabs: ['A', 'B'], activeIndex: 0 }];

    const result = applyTabMoveEffect(groups, {
      effect: 'move-tab-to-pane',
      sourceTabbedId: 'g1',
      sourceIndex: 1,
      targetPaneId: 'new-pane',
    });

    expect(result[0]?.tabs).toEqual(['A']);
    expect(result[1]?.id).toBe('new-pane');
    expect(result[1]?.tabs).toEqual(['B']);
    expect(result[1]?.activeIndex).toBe(0);
  });
});
