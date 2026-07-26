import { describe, expect, it } from 'vitest';
import {
  buildNotificationGeometry,
  clampNotificationOffset,
  ensureNotificationVisible,
  moveNotificationSelectionByViewportRows,
  selectNotificationWindow,
} from '../notification-geometry.js';

describe('notification geometry', () => {
  it('builds immutable prefix geometry and snapshots caller-owned measurements', () => {
    const measurements: Array<{ id: number; height: number }> = [
      { id: 101, height: 2 },
      { id: 205, height: 4 },
      { id: 999, height: 1 },
    ];
    const geometry = buildNotificationGeometry(measurements);

    expect(geometry).toEqual({
      rows: [
        { id: 101, top: 0, height: 2, bottom: 2 },
        { id: 205, top: 2, height: 4, bottom: 6 },
        { id: 999, top: 6, height: 1, bottom: 7 },
      ],
      totalHeight: 7,
    });
    expect(Object.isFrozen(geometry)).toBe(true);
    expect(Object.isFrozen(geometry.rows)).toBe(true);
    expect(geometry.rows.every(Object.isFrozen)).toBe(true);

    measurements[1]!.height = 40;
    measurements.push({ id: 1, height: 8 });
    expect(geometry.totalHeight).toBe(7);
    expect(geometry.rows[1]).toEqual({ id: 205, top: 2, height: 4, bottom: 6 });
  });

  it('rebuilds exact offsets when expansion or wrapping changes measured heights', () => {
    const collapsed = buildNotificationGeometry([
      { id: 1, height: 2 },
      { id: 2, height: 2 },
      { id: 3, height: 2 },
    ]);
    const expanded = buildNotificationGeometry([
      { id: 1, height: 2 },
      { id: 2, height: 6 },
      { id: 3, height: 2 },
    ]);

    expect(collapsed.rows[2]).toMatchObject({ top: 4, bottom: 6 });
    expect(expanded.rows[2]).toMatchObject({ top: 8, bottom: 10 });
    expect(selectNotificationWindow(expanded, 2, 3)).toMatchObject({
      startIndex: 1,
      endIndex: 2,
      spacerAbove: 2,
      spacerBelow: 2,
    });
  });

  it('uses newly supplied reflow measurements without mutating the old width snapshot', () => {
    const narrow = buildNotificationGeometry([
      { id: 10, height: 4 },
      { id: 20, height: 3 },
      { id: 30, height: 5 },
    ]);
    const wide = buildNotificationGeometry([
      { id: 10, height: 2 },
      { id: 20, height: 1 },
      { id: 30, height: 2 },
    ]);

    expect(narrow.totalHeight).toBe(12);
    expect(wide.totalHeight).toBe(5);
    expect(narrow.rows[2]).toMatchObject({ top: 7, height: 5 });
    expect(wide.rows[2]).toMatchObject({ top: 3, height: 2 });
  });

  it('clamps offsets and returns exact cell spacers for a visible and overscanned window', () => {
    const geometry = buildNotificationGeometry([
      { id: 1, height: 2 },
      { id: 2, height: 3 },
      { id: 3, height: 4 },
      { id: 4, height: 2 },
    ]);

    expect(clampNotificationOffset(geometry, -20, 4)).toBe(0);
    expect(clampNotificationOffset(geometry, 200, 4)).toBe(7);
    expect(selectNotificationWindow(geometry, 4, 3)).toEqual({
      startIndex: 1,
      endIndex: 3,
      rows: [
        { id: 2, top: 2, height: 3, bottom: 5 },
        { id: 3, top: 5, height: 4, bottom: 9 },
      ],
      spacerAbove: 2,
      spacerBelow: 2,
      scrollOffset: 4,
    });
    expect(selectNotificationWindow(geometry, 5, 3, 2)).toMatchObject({
      startIndex: 1,
      endIndex: 4,
      spacerAbove: 2,
      spacerBelow: 0,
    });
  });

  it('top-aligns a row taller than the viewport and keeps the following row reachable', () => {
    const geometry = buildNotificationGeometry([
      { id: 11, height: 2 },
      { id: 22, height: 8 },
      { id: 33, height: 1 },
    ]);

    expect(ensureNotificationVisible(geometry, 22, 5, 3)).toBe(2);
    expect(selectNotificationWindow(geometry, 2, 3).rows.map((row) => row.id)).toEqual([22]);
    expect(moveNotificationSelectionByViewportRows(geometry, 22, 'down', 3)).toBe(33);
    expect(ensureNotificationVisible(geometry, 33, 2, 3)).toBe(8);
    expect(selectNotificationWindow(geometry, 8, 3).rows.map((row) => row.id)).toEqual([22, 33]);
  });

  it('moves by viewport cells for unit-height rows and reaches both ends', () => {
    const geometry = buildNotificationGeometry(
      [10, 20, 30, 40, 50].map((id) => ({ id, height: 1 })),
    );

    // Mutation guard: replacing the viewport-row target with index/height 1
    // would select 20 rather than 40 here.
    expect(moveNotificationSelectionByViewportRows(geometry, 10, 'down', 3)).toBe(40);
    expect(moveNotificationSelectionByViewportRows(geometry, 40, 'down', 3)).toBe(50);
    expect(moveNotificationSelectionByViewportRows(geometry, 50, 'up', 3)).toBe(20);
    expect(moveNotificationSelectionByViewportRows(geometry, 20, 'up', 3)).toBe(10);
    expect(moveNotificationSelectionByViewportRows(geometry, 50, 'down', 3)).toBe(50);
    expect(moveNotificationSelectionByViewportRows(geometry, 10, 'up', 3)).toBe(10);
  });

  it('makes every variable-height item visible from hostile but finite offsets', () => {
    const geometry = buildNotificationGeometry([
      { id: 7, height: 1 },
      { id: 8, height: 5 },
      { id: 9, height: 2 },
      { id: 10, height: 7 },
      { id: 11, height: 1 },
    ]);

    for (const row of geometry.rows) {
      const offset = ensureNotificationVisible(geometry, row.id, Number.MAX_SAFE_INTEGER, 4);
      const visibleIds = selectNotificationWindow(geometry, offset, 4).rows.map(({ id }) => id);
      expect(visibleIds).toContain(row.id);
      if (row.height > 4) expect(offset).toBe(row.top);
    }
  });

  it('keeps empty geometry stable', () => {
    const geometry = buildNotificationGeometry([]);

    expect(geometry).toEqual({ rows: [], totalHeight: 0 });
    expect(clampNotificationOffset(geometry, 99, 4)).toBe(0);
    expect(selectNotificationWindow(geometry, 99, 4, 2)).toEqual({
      startIndex: 0,
      endIndex: 0,
      rows: [],
      spacerAbove: 0,
      spacerBelow: 0,
      scrollOffset: 0,
    });
    expect(moveNotificationSelectionByViewportRows(geometry, undefined, 'down', 4)).toBeUndefined();
    expect(moveNotificationSelectionByViewportRows(geometry, undefined, 'up', 4)).toBeUndefined();
    expect(() => ensureNotificationVisible(geometry, 1, 0, 4)).toThrow(/unknown notification id/i);
  });

  it('rejects duplicate or malformed IDs, heights, and overflowing prefix geometry', () => {
    expect(() => buildNotificationGeometry([{ id: Number.NaN, height: 1 }])).toThrow(/finite safe integer/i);
    expect(() => buildNotificationGeometry([{ id: Number.POSITIVE_INFINITY, height: 1 }])).toThrow(/finite safe integer/i);
    expect(() => buildNotificationGeometry([{ id: 1.5, height: 1 }])).toThrow(/finite safe integer/i);
    expect(() => buildNotificationGeometry([{ id: 1, height: 0 }])).toThrow(/positive integer/i);
    expect(() => buildNotificationGeometry([{ id: 1, height: Number.NaN }])).toThrow(/finite safe integer/i);
    expect(() => buildNotificationGeometry([{ id: 1, height: 1.5 }])).toThrow(/finite safe integer/i);
    expect(() =>
      buildNotificationGeometry([
        { id: 1, height: 1 },
        { id: 1, height: 2 },
      ]),
    ).toThrow(/unique/i);
    expect(() =>
      buildNotificationGeometry([
        { id: 1, height: Number.MAX_SAFE_INTEGER },
        { id: 2, height: 1 },
      ]),
    ).toThrow(/total height/i);
  });

  it('rejects malformed viewport, offset, overscan, direction, and selection values', () => {
    const geometry = buildNotificationGeometry([{ id: 1, height: 2 }]);

    for (const viewport of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => clampNotificationOffset(geometry, 0, viewport)).toThrow(/viewport height/i);
      expect(() => moveNotificationSelectionByViewportRows(geometry, 1, 'down', viewport)).toThrow(/viewport height/i);
    }
    for (const offset of [1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(() => clampNotificationOffset(geometry, offset, 1)).toThrow(/scroll offset/i);
    }
    for (const overscan of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => selectNotificationWindow(geometry, 0, 1, overscan)).toThrow(/overscan rows/i);
    }
    expect(() => ensureNotificationVisible(geometry, 99, 0, 1)).toThrow(/unknown notification id/i);
    expect(() => ensureNotificationVisible(geometry, Number.NaN, 0, 1)).toThrow(/notification id/i);
    expect(() => moveNotificationSelectionByViewportRows(geometry, 1, 'sideways' as never, 1)).toThrow(/direction/i);
  });
});
