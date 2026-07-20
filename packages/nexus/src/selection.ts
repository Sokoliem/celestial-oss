// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectionMode = 'linear' | 'box';

export interface SelectionAnchor {
  row: number;
  col: number;
}

export interface SelectionRange {
  anchor: SelectionAnchor;
  focus: SelectionAnchor;
  mode: SelectionMode;
}

export interface NormalizedRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  mode: SelectionMode;
}

export interface MultiSelectState {
  ranges: SelectionRange[];
  activeRange: SelectionRange | null;
  mode: SelectionMode;
}

export type SelectionMsg =
  | { type: 'select-start'; row: number; col: number; mode?: SelectionMode }
  | { type: 'select-extend'; row: number; col: number }
  | { type: 'select-add'; row: number; col: number }
  | { type: 'select-all'; rowCount: number; colCount: number }
  | { type: 'select-word'; row: number; col: number; word: [number, number] }
  | { type: 'select-line'; row: number; colCount: number }
  | { type: 'select-clear' }
  | { type: 'select-commit' };

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSelectionState(): MultiSelectState {
  return { ranges: [], activeRange: null, mode: 'linear' };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function selectionUpdate(msg: SelectionMsg, state: MultiSelectState): MultiSelectState {
  switch (msg.type) {
    case 'select-start': {
      const mode = msg.mode ?? state.mode;
      return {
        ...state,
        ranges: [],
        mode,
        activeRange: {
          anchor: { row: msg.row, col: msg.col },
          focus: { row: msg.row, col: msg.col },
          mode,
        },
      };
    }

    case 'select-extend': {
      if (!state.activeRange) return state;
      return {
        ...state,
        activeRange: {
          ...state.activeRange,
          focus: { row: msg.row, col: msg.col },
        },
      };
    }

    case 'select-add': {
      const ranges = state.activeRange ? [...state.ranges, state.activeRange] : state.ranges;
      return {
        ...state,
        ranges,
        activeRange: {
          anchor: { row: msg.row, col: msg.col },
          focus: { row: msg.row, col: msg.col },
          mode: state.mode,
        },
      };
    }

    case 'select-all': {
      return {
        ...state,
        ranges: [],
        activeRange: {
          anchor: { row: 0, col: 0 },
          focus: { row: msg.rowCount - 1, col: msg.colCount - 1 },
          mode: state.mode,
        },
      };
    }

    case 'select-word': {
      return {
        ...state,
        ranges: [],
        activeRange: {
          anchor: { row: msg.row, col: msg.word[0] },
          focus: { row: msg.row, col: msg.word[1] },
          mode: 'linear',
        },
      };
    }

    case 'select-line': {
      return {
        ...state,
        ranges: [],
        activeRange: {
          anchor: { row: msg.row, col: 0 },
          focus: { row: msg.row, col: msg.colCount - 1 },
          mode: 'linear',
        },
      };
    }

    case 'select-clear': {
      return createSelectionState();
    }

    case 'select-commit': {
      if (!state.activeRange) return state;
      return {
        ...state,
        ranges: [...state.ranges, state.activeRange],
        activeRange: null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeRange(range: SelectionRange): NormalizedRange {
  const { anchor, focus, mode } = range;

  if (mode === 'box') {
    return {
      startRow: Math.min(anchor.row, focus.row),
      startCol: Math.min(anchor.col, focus.col),
      endRow: Math.max(anchor.row, focus.row),
      endCol: Math.max(anchor.col, focus.col),
      mode,
    };
  }

  // Linear mode: swap if anchor is after focus
  const anchorAfterFocus = anchor.row > focus.row || (anchor.row === focus.row && anchor.col > focus.col);

  if (anchorAfterFocus) {
    return {
      startRow: focus.row,
      startCol: focus.col,
      endRow: anchor.row,
      endCol: anchor.col,
      mode,
    };
  }

  return {
    startRow: anchor.row,
    startCol: anchor.col,
    endRow: focus.row,
    endCol: focus.col,
    mode,
  };
}

// ---------------------------------------------------------------------------
// Cell Selection Test
// ---------------------------------------------------------------------------

function isCellInNormalized(n: NormalizedRange, row: number, col: number): boolean {
  if (n.mode === 'box') {
    return row >= n.startRow && row <= n.endRow && col >= n.startCol && col <= n.endCol;
  }

  // Linear mode: cell is between start and end inclusive
  if (row < n.startRow || row > n.endRow) return false;
  if (n.startRow === n.endRow) {
    return col >= n.startCol && col <= n.endCol;
  }
  if (row === n.startRow) return col >= n.startCol;
  if (row === n.endRow) return col <= n.endCol;
  return true; // middle row — all cols selected
}

export function isCellSelected(state: MultiSelectState, row: number, col: number): boolean {
  for (const range of state.ranges) {
    if (isCellInNormalized(normalizeRange(range), row, col)) return true;
  }
  if (state.activeRange) {
    if (isCellInNormalized(normalizeRange(state.activeRange), row, col)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Text Extraction
// ---------------------------------------------------------------------------

export function getSelectedText(state: MultiSelectState, getCell: (row: number, col: number) => string, colCount?: number): string {
  const allRanges = state.activeRange ? [...state.ranges, state.activeRange] : [...state.ranges];

  if (allRanges.length === 0) return '';

  const rows: string[] = [];

  for (const range of allRanges) {
    const n = normalizeRange(range);
    for (let r = n.startRow; r <= n.endRow; r++) {
      const cols: string[] = [];
      if (n.mode === 'box') {
        for (let c = n.startCol; c <= n.endCol; c++) {
          cols.push(getCell(r, c));
        }
      } else {
        // Linear
        const cStart = r === n.startRow ? n.startCol : 0;
        // For middle rows (not start, not end), select all columns.
        // Use colCount if provided; otherwise fall back to a scan approach.
        let cEnd: number;
        if (r === n.endRow) {
          cEnd = n.endCol;
        } else if (colCount !== undefined) {
          cEnd = colCount - 1;
        } else {
          // Scan: iterate until getCell returns '' for 2 consecutive empty cells
          // past the max known column bound
          cEnd = Math.max(n.startCol, n.endCol);
          while (getCell(r, cEnd + 1) !== '') {
            cEnd++;
          }
        }
        for (let c = cStart; c <= cEnd; c++) {
          cols.push(getCell(r, c));
        }
      }
      rows.push(cols.join(''));
    }
  }

  return rows.join('\n');
}

// ---------------------------------------------------------------------------
// Merge Overlapping Ranges
// ---------------------------------------------------------------------------

export function mergeOverlappingRanges(ranges: SelectionRange[]): SelectionRange[] {
  if (ranges.length <= 1) return ranges;

  const normalized = ranges.map((r, i) => ({ idx: i, range: r, norm: normalizeRange(r) }));

  // Group by mode — only merge ranges of the same mode
  const linearRanges = normalized.filter((r) => r.norm.mode === 'linear');
  const boxRanges = normalized.filter((r) => r.norm.mode === 'box');

  const mergedLinear = mergeLinearRanges(linearRanges.map((r) => r.norm));
  const mergedBox = mergeBoxRanges(boxRanges.map((r) => r.norm));

  const result: SelectionRange[] = [];

  for (const n of mergedLinear) {
    result.push({
      anchor: { row: n.startRow, col: n.startCol },
      focus: { row: n.endRow, col: n.endCol },
      mode: 'linear',
    });
  }

  for (const n of mergedBox) {
    result.push({
      anchor: { row: n.startRow, col: n.startCol },
      focus: { row: n.endRow, col: n.endCol },
      mode: 'box',
    });
  }

  return result;
}

function mergeLinearRanges(ranges: NormalizedRange[]): NormalizedRange[] {
  if (ranges.length <= 1) return ranges;

  // Sort by startRow, then startCol
  const sorted = [...ranges].sort((a, b) => (a.startRow !== b.startRow ? a.startRow - b.startRow : a.startCol - b.startCol));

  const merged: NormalizedRange[] = [{ ...sorted[0]! }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;

    // Check if ranges overlap or are adjacent
    const lastIsBeforeCurrent = last.endRow < current.startRow || (last.endRow === current.startRow && last.endCol < current.startCol - 1);

    if (lastIsBeforeCurrent) {
      merged.push({ ...current });
    } else {
      // Merge: extend last to cover current (immutable — replace in array)
      if (current.endRow > last.endRow || (current.endRow === last.endRow && current.endCol > last.endCol)) {
        merged[merged.length - 1] = { ...last, endRow: current.endRow, endCol: current.endCol };
      }
    }
  }

  return merged;
}

function mergeBoxRanges(ranges: NormalizedRange[]): NormalizedRange[] {
  if (ranges.length <= 1) return ranges;

  // For box ranges, merge if they overlap in both dimensions
  const merged: NormalizedRange[] = [{ ...ranges[0]! }];

  for (let i = 1; i < ranges.length; i++) {
    const current = ranges[i]!;
    let didMerge = false;

    for (const existing of merged) {
      const rowOverlap = current.startRow <= existing.endRow && current.endRow >= existing.startRow;
      const colOverlap = current.startCol <= existing.endCol && current.endCol >= existing.startCol;

      if (rowOverlap && colOverlap) {
        existing.startRow = Math.min(existing.startRow, current.startRow);
        existing.startCol = Math.min(existing.startCol, current.startCol);
        existing.endRow = Math.max(existing.endRow, current.endRow);
        existing.endCol = Math.max(existing.endCol, current.endCol);
        didMerge = true;
        break;
      }
    }

    if (!didMerge) {
      merged.push({ ...current });
    }
  }

  return merged;
}
