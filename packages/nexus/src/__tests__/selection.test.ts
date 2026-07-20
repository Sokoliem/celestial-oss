import { describe, expect, it } from 'vitest';
import {
  createSelectionState,
  getSelectedText,
  isCellSelected,
  type MultiSelectState,
  mergeOverlappingRanges,
  normalizeRange,
  type SelectionRange,
  selectionUpdate,
} from '../selection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stateWith(overrides: Partial<MultiSelectState>): MultiSelectState {
  return { ...createSelectionState(), ...overrides };
}

function makeRange(anchorRow: number, anchorCol: number, focusRow: number, focusCol: number, mode: 'linear' | 'box' = 'linear'): SelectionRange {
  return {
    anchor: { row: anchorRow, col: anchorCol },
    focus: { row: focusRow, col: focusCol },
    mode,
  };
}

// ---------------------------------------------------------------------------
// createSelectionState
// ---------------------------------------------------------------------------

describe('createSelectionState', () => {
  it('returns empty initial state', () => {
    const state = createSelectionState();
    expect(state).toEqual({
      ranges: [],
      activeRange: null,
      mode: 'linear',
    });
  });
});

// ---------------------------------------------------------------------------
// selectionUpdate
// ---------------------------------------------------------------------------

describe('selectionUpdate', () => {
  describe('select-start', () => {
    it('creates new activeRange with anchor=focus', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-start', row: 3, col: 5 }, state);
      expect(next.activeRange).toEqual({
        anchor: { row: 3, col: 5 },
        focus: { row: 3, col: 5 },
        mode: 'linear',
      });
    });

    it('clears previous ranges', () => {
      const state = stateWith({
        ranges: [makeRange(0, 0, 1, 5)],
      });
      const next = selectionUpdate({ type: 'select-start', row: 2, col: 0 }, state);
      expect(next.ranges).toEqual([]);
    });

    it('uses provided mode', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-start', row: 0, col: 0, mode: 'box' }, state);
      expect(next.activeRange!.mode).toBe('box');
      expect(next.mode).toBe('box');
    });

    it('defaults to current state mode', () => {
      const state = stateWith({ mode: 'box' });
      const next = selectionUpdate({ type: 'select-start', row: 0, col: 0 }, state);
      expect(next.activeRange!.mode).toBe('box');
    });
  });

  describe('select-extend', () => {
    it('moves focus while keeping anchor fixed', () => {
      const state = stateWith({
        activeRange: makeRange(1, 2, 1, 2),
      });
      const next = selectionUpdate({ type: 'select-extend', row: 5, col: 10 }, state);
      expect(next.activeRange!.anchor).toEqual({ row: 1, col: 2 });
      expect(next.activeRange!.focus).toEqual({ row: 5, col: 10 });
    });

    it('no-ops when no activeRange', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-extend', row: 5, col: 10 }, state);
      expect(next).toBe(state);
    });
  });

  describe('select-add', () => {
    it('preserves existing ranges', () => {
      const existing = makeRange(0, 0, 0, 5);
      const state = stateWith({ ranges: [existing] });
      const next = selectionUpdate({ type: 'select-add', row: 3, col: 0 }, state);
      expect(next.ranges).toContainEqual(existing);
    });

    it('creates new activeRange for multi-select', () => {
      const state = stateWith({
        activeRange: makeRange(0, 0, 0, 5),
        ranges: [],
      });
      const next = selectionUpdate({ type: 'select-add', row: 3, col: 2 }, state);
      // Previous activeRange should be moved to ranges
      expect(next.ranges).toHaveLength(1);
      expect(next.activeRange).toEqual({
        anchor: { row: 3, col: 2 },
        focus: { row: 3, col: 2 },
        mode: 'linear',
      });
    });
  });

  describe('select-all', () => {
    it('covers entire grid', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-all', rowCount: 10, colCount: 80 }, state);
      expect(next.activeRange).toEqual({
        anchor: { row: 0, col: 0 },
        focus: { row: 9, col: 79 },
        mode: 'linear',
      });
      expect(next.ranges).toEqual([]);
    });
  });

  describe('select-word', () => {
    it('selects word range on given row', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-word', row: 2, col: 5, word: [3, 7] }, state);
      expect(next.activeRange).toEqual({
        anchor: { row: 2, col: 3 },
        focus: { row: 2, col: 7 },
        mode: 'linear',
      });
    });
  });

  describe('select-line', () => {
    it('selects entire row', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-line', row: 4, colCount: 80 }, state);
      expect(next.activeRange).toEqual({
        anchor: { row: 4, col: 0 },
        focus: { row: 4, col: 79 },
        mode: 'linear',
      });
    });
  });

  describe('select-clear', () => {
    it('resets to empty state', () => {
      const state = stateWith({
        ranges: [makeRange(0, 0, 1, 5)],
        activeRange: makeRange(3, 0, 3, 10),
        mode: 'box',
      });
      const next = selectionUpdate({ type: 'select-clear' }, state);
      expect(next).toEqual(createSelectionState());
    });
  });

  describe('select-commit', () => {
    it('moves activeRange into ranges', () => {
      const active = makeRange(1, 0, 1, 10);
      const state = stateWith({ activeRange: active, ranges: [] });
      const next = selectionUpdate({ type: 'select-commit' }, state);
      expect(next.ranges).toEqual([active]);
    });

    it('sets activeRange to null', () => {
      const state = stateWith({ activeRange: makeRange(0, 0, 0, 5) });
      const next = selectionUpdate({ type: 'select-commit' }, state);
      expect(next.activeRange).toBeNull();
    });

    it('no-ops when no activeRange', () => {
      const state = createSelectionState();
      const next = selectionUpdate({ type: 'select-commit' }, state);
      expect(next).toBe(state);
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeRange
// ---------------------------------------------------------------------------

describe('normalizeRange', () => {
  it('normalizes forward linear selection', () => {
    const range = makeRange(1, 3, 4, 7);
    const n = normalizeRange(range);
    expect(n).toEqual({
      startRow: 1,
      startCol: 3,
      endRow: 4,
      endCol: 7,
      mode: 'linear',
    });
  });

  it('normalizes backward linear selection (anchor after focus)', () => {
    const range = makeRange(4, 7, 1, 3);
    const n = normalizeRange(range);
    expect(n).toEqual({
      startRow: 1,
      startCol: 3,
      endRow: 4,
      endCol: 7,
      mode: 'linear',
    });
  });

  it('normalizes backward linear selection on same row', () => {
    const range = makeRange(2, 10, 2, 3);
    const n = normalizeRange(range);
    expect(n).toEqual({
      startRow: 2,
      startCol: 3,
      endRow: 2,
      endCol: 10,
      mode: 'linear',
    });
  });

  it('normalizes box selection with min/max', () => {
    const range = makeRange(5, 8, 2, 3, 'box');
    const n = normalizeRange(range);
    expect(n).toEqual({
      startRow: 2,
      startCol: 3,
      endRow: 5,
      endCol: 8,
      mode: 'box',
    });
  });
});

// ---------------------------------------------------------------------------
// isCellSelected
// ---------------------------------------------------------------------------

describe('isCellSelected', () => {
  it('returns true for cell in linear range', () => {
    const state = stateWith({
      ranges: [makeRange(1, 0, 3, 5)],
    });
    // Middle row — all cols selected
    expect(isCellSelected(state, 2, 50)).toBe(true);
    // Start row — at startCol
    expect(isCellSelected(state, 1, 0)).toBe(true);
    // End row — at endCol
    expect(isCellSelected(state, 3, 5)).toBe(true);
  });

  it('returns false for cell outside range', () => {
    const state = stateWith({
      ranges: [makeRange(1, 5, 1, 10)],
    });
    expect(isCellSelected(state, 1, 4)).toBe(false);
    expect(isCellSelected(state, 1, 11)).toBe(false);
    expect(isCellSelected(state, 0, 7)).toBe(false);
  });

  it('returns true for cell in box range', () => {
    const state = stateWith({
      ranges: [makeRange(1, 2, 4, 6, 'box')],
    });
    expect(isCellSelected(state, 2, 4)).toBe(true);
    expect(isCellSelected(state, 1, 2)).toBe(true);
    expect(isCellSelected(state, 4, 6)).toBe(true);
  });

  it('returns false for cell outside box range', () => {
    const state = stateWith({
      ranges: [makeRange(1, 2, 4, 6, 'box')],
    });
    // Right row but wrong col
    expect(isCellSelected(state, 2, 7)).toBe(false);
    // Right col but wrong row
    expect(isCellSelected(state, 5, 4)).toBe(false);
  });

  it('checks activeRange too', () => {
    const state = stateWith({
      activeRange: makeRange(0, 0, 0, 5),
    });
    expect(isCellSelected(state, 0, 3)).toBe(true);
    expect(isCellSelected(state, 0, 6)).toBe(false);
  });

  it('handles multi-select (multiple ranges)', () => {
    const state = stateWith({
      ranges: [makeRange(0, 0, 0, 3), makeRange(2, 0, 2, 3)],
    });
    expect(isCellSelected(state, 0, 2)).toBe(true);
    expect(isCellSelected(state, 2, 2)).toBe(true);
    expect(isCellSelected(state, 1, 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSelectedText
// ---------------------------------------------------------------------------

describe('getSelectedText', () => {
  // 5x5 grid: cell (r,c) = letter at position r*5+c
  const grid = [
    ['H', 'e', 'l', 'l', 'o'],
    ['W', 'o', 'r', 'l', 'd'],
    ['T', 'e', 's', 't', '!'],
  ];
  const getCell = (r: number, c: number): string => grid[r]?.[c] ?? '';

  it('returns text from selected cells', () => {
    const state = stateWith({
      activeRange: makeRange(0, 0, 0, 4),
    });
    expect(getSelectedText(state, getCell)).toBe('Hello');
  });

  it('joins rows with newlines', () => {
    const state = stateWith({
      activeRange: makeRange(0, 0, 1, 4),
    });
    expect(getSelectedText(state, getCell)).toBe('Hello\nWorld');
  });

  it('selects all columns on middle rows with colCount', () => {
    // 10-column grid, 3 rows. Selection from row 0 col 8 to row 2 col 1
    // Middle row (row 1) should include all 10 columns
    const wideGrid = [
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      ['x', 'y', 'z', '.', '.', '.', '.', '.', '.', '.'],
    ];
    const wideGetCell = (r: number, c: number): string => wideGrid[r]?.[c] ?? '';
    const state = stateWith({
      activeRange: makeRange(0, 8, 2, 1),
    });
    // With colCount=10, middle row 1 should get all 10 chars
    const text = getSelectedText(state, wideGetCell, 10);
    const lines = text.split('\n');
    expect(lines[0]).toBe('ij'); // row 0: cols 8-9
    expect(lines[1]).toBe('0123456789'); // row 1: all cols (middle row)
    expect(lines[2]).toBe('xy'); // row 2: cols 0-1
  });

  it('handles box selection', () => {
    const state = stateWith({
      activeRange: makeRange(0, 1, 1, 2, 'box'),
    });
    // Row 0 cols 1-2: "el", Row 1 cols 1-2: "or"
    expect(getSelectedText(state, getCell)).toBe('el\nor');
  });

  it('returns empty string when nothing selected', () => {
    const state = createSelectionState();
    expect(getSelectedText(state, getCell)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// mergeOverlappingRanges
// ---------------------------------------------------------------------------

describe('mergeOverlappingRanges', () => {
  it('merges overlapping linear ranges', () => {
    const ranges: SelectionRange[] = [makeRange(0, 0, 0, 5), makeRange(0, 3, 0, 10)];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 10 },
      }),
    );
  });

  it('leaves non-overlapping ranges unchanged', () => {
    const ranges: SelectionRange[] = [makeRange(0, 0, 0, 3), makeRange(2, 0, 2, 3)];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(mergeOverlappingRanges([])).toEqual([]);
  });

  it('handles single range', () => {
    const ranges = [makeRange(0, 0, 0, 5)];
    expect(mergeOverlappingRanges(ranges)).toEqual(ranges);
  });

  it('merges overlapping box ranges', () => {
    const ranges: SelectionRange[] = [makeRange(0, 0, 3, 5, 'box'), makeRange(2, 3, 5, 8, 'box')];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        anchor: { row: 0, col: 0 },
        focus: { row: 5, col: 8 },
      }),
    );
  });

  it('does not merge ranges of different modes', () => {
    const ranges: SelectionRange[] = [makeRange(0, 0, 2, 5, 'linear'), makeRange(1, 2, 3, 4, 'box')];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(2);
  });
});
