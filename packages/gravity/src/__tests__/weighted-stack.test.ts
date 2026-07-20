import { describe, expect, it } from 'vitest';
import { resolveWeightedStack } from '../weighted-stack.js';

describe('resolveWeightedStack', () => {
  it('distributes available size by weight and gap', () => {
    const result = resolveWeightedStack({
      size: 10,
      gap: 1,
      items: [
        { id: 'a', weight: 1 },
        { id: 'b', weight: 2 },
      ],
    });

    expect(result.entries.map((entry) => entry.size)).toEqual([3, 6]);
    expect(result.entries[1]?.start).toBe(4);
    expect(result.usedSize).toBe(10);
  });

  it('honors collapsed sizes before distributing the remainder', () => {
    const result = resolveWeightedStack({
      size: 20,
      items: [
        { id: 'rail', weight: 1, collapsed: true, collapsedSize: 3 },
        { id: 'body', weight: 1 },
      ],
    });

    expect(result.entries.map((entry) => entry.size)).toEqual([3, 17]);
  });

  it('clamps invalid scroll offsets and reports hidden ids', () => {
    const result = resolveWeightedStack({
      size: 3,
      minItemSize: 0,
      scrollOffset: 10,
      items: [
        { id: 'a', weight: 1, minSize: 1 },
        { id: 'b', weight: 1, minSize: 1 },
        { id: 'c', weight: 1, minSize: 1 },
        { id: 'd', weight: 1, minSize: 1 },
      ],
    });

    expect(result.scrollOffset).toBe(1);
    expect(result.hiddenAbove).toEqual(['a']);
    expect(result.hiddenBelow).toEqual([]);
    expect(result.visibleEntries.map((entry) => entry.id)).toEqual(['b', 'c', 'd']);
    expect(result.visibleEntries[0]?.start).toBe(0);
  });

  it('allows later oversized entries to be reached by scroll offset', () => {
    const result = resolveWeightedStack({
      size: 10,
      minItemSize: 0,
      scrollOffset: 99,
      items: [
        { id: 'a', weight: 0, minSize: 1, maxSize: 1 },
        { id: 'b', weight: 0, minSize: 1, maxSize: 1 },
        { id: 'c', weight: 1, minSize: 20 },
      ],
    });

    expect(result.scrollOffset).toBe(2);
    expect(result.hiddenAbove).toEqual(['a', 'b']);
    expect(result.hiddenBelow).toEqual([]);
    expect(result.visibleEntries.map((entry) => entry.id)).toEqual(['c']);
  });
});
