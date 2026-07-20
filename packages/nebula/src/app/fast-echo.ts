import type { FocusNodeInfo } from '../focus.js';
import type { KeyEvent } from '../terminal.js';
import type { CellGrid, LayoutEntry, LayoutPlan, ResolvedStyleAttrs } from '../vdom.js';

interface EchoPatch {
  readonly row: number;
  readonly col: number;
  readonly char: string;
  readonly style: ResolvedStyleAttrs;
}

function cloneGrid(grid: CellGrid): CellGrid {
  return {
    ...grid,
    cells: grid.cells.map((row) => row.map((cell) => ({ ...cell, style: { ...cell.style } }))),
    rawBlobs: grid.rawBlobs ? new Map(grid.rawBlobs) : undefined,
  };
}

function findFocusedEntry(entry: LayoutEntry, focusedId: string): LayoutEntry | null {
  if (entry.node.kind === 'focus' && entry.node.id === focusedId) {
    return entry;
  }
  for (const child of entry.children) {
    const match = findFocusedEntry(child, focusedId);
    if (match) return match;
  }
  return null;
}

function textLength(str: string): number {
  return Array.from(str).length;
}

interface EchoPreview {
  readonly chars: readonly string[];
  readonly cursor: number;
}

function buildEchoPreview(value: string, cursor: number, mask?: string): EchoPreview {
  const valueChars = Array.from(value);
  const maskedChars = mask ? valueChars.map(() => mask) : valueChars;
  const chars = cursor < maskedChars.length ? maskedChars : [...maskedChars, ' '];
  return { chars, cursor };
}

function applyTextInputEchoEvent(value: string, cursor: number, event: KeyEvent): { value: string; cursor: number } | null {
  const chars = Array.from(value);

  if (event.char && event.char.length > 0) {
    const nextValue = `${chars.slice(0, cursor).join('')}${event.char}${chars.slice(cursor).join('')}`;
    return { value: nextValue, cursor: cursor + textLength(event.char) };
  }

  if (event.key === 'backspace') {
    if (cursor === 0) return null;
    return {
      value: `${chars.slice(0, cursor - 1).join('')}${chars.slice(cursor).join('')}`,
      cursor: cursor - 1,
    };
  }

  if (event.key === 'delete') {
    if (cursor >= chars.length) return null;
    return {
      value: `${chars.slice(0, cursor).join('')}${chars.slice(cursor + 1).join('')}`,
      cursor,
    };
  }

  return null;
}

function pickPlainEchoStyle(row: CellGrid['cells'][number], baseCol: number, cursorCol: number): ResolvedStyleAttrs {
  for (let i = 0; baseCol + i < row.length; i++) {
    if (baseCol + i === cursorCol) continue;
    if (row[baseCol + i]) {
      return row[baseCol + i]!.style ?? {};
    }
  }
  return row[cursorCol]?.style ?? {};
}

export function buildFastEchoPatches(
  focusedId: string | null,
  focusNodes: readonly FocusNodeInfo[],
  plan: LayoutPlan | null,
  grid: CellGrid | null,
  event: KeyEvent,
): EchoPatch[] | null {
  if (!focusedId || !plan || !grid) return null;

  const focusedNode = focusNodes.find((node) => node.id === focusedId);
  const hint = focusedNode?.echoHint;
  if (!hint || hint.kind !== 'text-input') return null;
  if (event.ctrl || event.alt) return null;
  // Fast echo patches one terminal cell per character. Defer Unicode,
  // combining, wide, and multi-cell input to the normal grapheme-aware render.
  if (
    !/^[\x20-\x7e]*$/.test(hint.value) ||
    (event.char !== undefined && !/^[\x20-\x7e]$/.test(event.char)) ||
    (hint.mask && !/^[\x20-\x7e]$/.test(hint.mask))
  ) {
    return null;
  }

  const focusEntry = findFocusedEntry(plan.root, focusedId);
  if (!focusEntry) return null;
  const baseRow = focusEntry.rect.y;
  const baseCol = focusEntry.rect.x;
  const row = grid.cells[baseRow];
  if (!row) return null;

  const nextState = applyTextInputEchoEvent(hint.value, hint.cursor, event);
  if (!nextState) return null;

  const previousPreview = buildEchoPreview(hint.value, hint.cursor, hint.mask);
  const nextPreview = buildEchoPreview(nextState.value, nextState.cursor, hint.mask);
  const patchWidth = Math.max(previousPreview.chars.length, nextPreview.chars.length);
  const previousCursorCol = baseCol + previousPreview.cursor;
  const nextCursorCol = baseCol + nextPreview.cursor;
  const cursorStyle = row[previousCursorCol]?.style ?? {};
  const plainStyle = pickPlainEchoStyle(row, baseCol, previousCursorCol);
  const patches: EchoPatch[] = [];

  for (let i = 0; i < patchWidth; i++) {
    const col = baseCol + i;
    if (col >= grid.width || !row[col]) break;
    patches.push({
      row: baseRow,
      col,
      char: nextPreview.chars[i] ?? ' ',
      style: col === nextCursorCol ? cursorStyle : plainStyle,
    });
  }

  return patches;
}

export function applyFastEchoPatches(grid: CellGrid, patches: readonly EchoPatch[]): CellGrid {
  const nextGrid = cloneGrid(grid);
  for (const patch of patches) {
    const row = nextGrid.cells[patch.row];
    if (!row?.[patch.col]) continue;
    row[patch.col] = { ...row[patch.col]!, char: patch.char, style: patch.style };
  }
  return nextGrid;
}
