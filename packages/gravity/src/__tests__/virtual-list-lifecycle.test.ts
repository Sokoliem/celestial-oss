import { describe, expect, it } from 'vitest';
import { clearVirtualListCache, createScrollController, disposeScrollController, virtualList } from '../virtual-list.js';

describe('scroll controller lifecycle', () => {
  it('stops tracking a disposed controller', () => {
    const kept = createScrollController();
    const discarded = createScrollController();

    // Controllers were pushed to a module-level registry with no removal path,
    // so every controller ever created was retained for the process lifetime.
    disposeScrollController(discarded);

    // Repopulate *after* disposal: if the registry still held it, the
    // clear-all below would wipe this too.
    kept.cache.set('0', 10);
    discarded.cache.set('0', 20);

    clearVirtualListCache();

    // The live controller is still managed by the registry...
    expect(kept.cache.size()).toBe(0);
    // ...and the disposed one is no longer reachable from it.
    expect(discarded.cache.size()).toBe(1);
  });

  it('is safe to dispose the same controller twice', () => {
    const controller = createScrollController();
    disposeScrollController(controller);
    expect(() => disposeScrollController(controller)).not.toThrow();
  });
});

describe('virtual list spacer geometry', () => {
  /** Collect every `empty` spacer height anywhere in the rendered subtree. */
  function heightsOf(node: unknown): number[] {
    if (typeof node !== 'object' || node === null) return [];
    const record = node as { kind?: string; height?: number; child?: unknown; children?: unknown[] };
    const own = record.kind === 'empty' && typeof record.height === 'number' ? [record.height] : [];
    const nested = [...(record.children ?? []), ...(record.child === undefined ? [] : [record.child])];
    return [...own, ...nested.flatMap(heightsOf)];
  }

  it('never emits a non-finite spacer height when the visible range is empty', () => {
    // A zero-height viewport collapses the visible range to endIndex 0. The
    // below-spacer read offsets[-1] / sizes[-1] behind non-null assertions, so
    // it evaluated to NaN; `NaN > 0` is false, so the spacer was silently
    // dropped and the scroll extent was wrong rather than visibly broken.
    // `measure` forces the variable-size path (the uniform path short-circuits
    // into nebula's list and never computes a spacer), and overscan 0 lets the
    // window collapse to endIndex 0 with a zero-height viewport.
    const node = virtualList({
      items: [1, 2, 3, 4, 5],
      viewportHeight: 0,
      estimateSize: 1,
      overscan: 0,
      measure: () => 1,
      renderItem: (value: number) => ({ kind: 'text', content: String(value) }) as never,
    });

    const rendered = node.render();
    const spacers = heightsOf(rendered);

    for (const height of spacers) expect(Number.isFinite(height)).toBe(true);

    // The real symptom is an *absent* spacer, not a NaN-valued one: `NaN > 0` is
    // false, so the guard dropped it silently. With an empty window all five
    // rows sit below it, so the spacers must still account for the full content
    // height — otherwise the list reports zero scroll extent.
    expect(spacers.reduce((sum, height) => sum + height, 0)).toBe(5);
  });
});
