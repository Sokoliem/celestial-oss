import type { KeyEvent } from '@celestial/core/nebula';
import { measureGraphemeWidth, segmentGraphemes } from '@celestial/rosetta';

export interface EditableTextState {
  readonly value: string;
  readonly cursor: number;
  readonly selectionAnchor?: number;
}

export interface EditableTextResult {
  readonly state: EditableTextState;
  readonly changed: boolean;
  readonly submit: boolean;
}

export function graphemes(value: string): string[] {
  return segmentGraphemes(value);
}

export function clampCursor(value: string, cursor: number): number {
  return Math.max(0, Math.min(Math.trunc(cursor), graphemes(value).length));
}

export function selectionRange(state: EditableTextState): readonly [number, number] | null {
  if (state.selectionAnchor === undefined || state.selectionAnchor === state.cursor) return null;
  return state.selectionAnchor < state.cursor ? [state.selectionAnchor, state.cursor] : [state.cursor, state.selectionAnchor];
}

export function replaceSelection(state: EditableTextState, replacement: string): EditableTextState {
  const parts = graphemes(state.value);
  const range = selectionRange(state) ?? [state.cursor, state.cursor];
  const before = parts.slice(0, range[0]).join('');
  const after = parts.slice(range[1]).join('');
  const value = `${before}${replacement}${after}`;
  const cursor = graphemes(`${before}${replacement}`).length;
  return { value, cursor };
}

export function deleteBackward(state: EditableTextState): EditableTextState {
  if (selectionRange(state)) return replaceSelection(state, '');
  if (state.cursor <= 0) return { ...state, selectionAnchor: undefined };
  return replaceSelection({ ...state, selectionAnchor: state.cursor - 1 }, '');
}

export function deleteForward(state: EditableTextState): EditableTextState {
  if (selectionRange(state)) return replaceSelection(state, '');
  const length = graphemes(state.value).length;
  if (state.cursor >= length) return { ...state, selectionAnchor: undefined };
  return replaceSelection({ ...state, selectionAnchor: state.cursor + 1 }, '');
}

function wordBoundaryLeft(value: string, cursor: number): number {
  const parts = graphemes(value);
  let next = Math.max(0, Math.min(cursor, parts.length));
  while (next > 0 && /^\s$/u.test(parts[next - 1]!)) next--;
  while (next > 0 && !/^\s$/u.test(parts[next - 1]!)) next--;
  return next;
}

function wordBoundaryRight(value: string, cursor: number): number {
  const parts = graphemes(value);
  let next = Math.max(0, Math.min(cursor, parts.length));
  while (next < parts.length && /^\s$/u.test(parts[next]!)) next++;
  while (next < parts.length && !/^\s$/u.test(parts[next]!)) next++;
  return next;
}

function moveCursor(state: EditableTextState, cursor: number, extend: boolean): EditableTextState {
  const nextCursor = clampCursor(state.value, cursor);
  return {
    value: state.value,
    cursor: nextCursor,
    selectionAnchor: extend ? (state.selectionAnchor ?? state.cursor) : undefined,
  };
}

export function applySingleLineKey(state: EditableTextState, event: KeyEvent): EditableTextResult {
  const unchanged = (next: EditableTextState, submit = false): EditableTextResult => ({ state: next, changed: false, submit });
  const changed = (next: EditableTextState): EditableTextResult => ({ state: next, changed: next.value !== state.value, submit: false });

  if (event.ctrl && !event.alt && event.key.toLowerCase() === 'a') {
    return unchanged({ value: state.value, cursor: graphemes(state.value).length, selectionAnchor: 0 });
  }
  if (event.key === 'enter' && !event.alt) return unchanged(state, true);
  if (event.char && !event.ctrl && !event.alt) return changed(replaceSelection(state, event.char.replace(/[\r\n]+/g, ' ')));

  switch (event.key) {
    case 'left':
      return unchanged(moveCursor(state, event.ctrl ? wordBoundaryLeft(state.value, state.cursor) : state.cursor - 1, event.shift));
    case 'right':
      return unchanged(moveCursor(state, event.ctrl ? wordBoundaryRight(state.value, state.cursor) : state.cursor + 1, event.shift));
    case 'home':
      return unchanged(moveCursor(state, 0, event.shift));
    case 'end':
      return unchanged(moveCursor(state, graphemes(state.value).length, event.shift));
    case 'backspace':
      if (event.ctrl && !selectionRange(state)) {
        return changed(replaceSelection({ ...state, selectionAnchor: wordBoundaryLeft(state.value, state.cursor) }, ''));
      }
      return changed(deleteBackward(state));
    case 'delete':
      if (event.ctrl && !selectionRange(state)) {
        return changed(replaceSelection({ ...state, selectionAnchor: wordBoundaryRight(state.value, state.cursor) }, ''));
      }
      return changed(deleteForward(state));
    default:
      return unchanged(state);
  }
}

export function insertSingleLinePaste(state: EditableTextState, value: string): EditableTextState {
  return replaceSelection(state, value.replace(/\r\n?|\n/g, ' '));
}

export function graphemeIndexAtCell(value: string, cellOffset: number): number {
  const target = Math.max(0, cellOffset);
  const parts = graphemes(value);
  let cells = 0;
  for (let index = 0; index < parts.length; index++) {
    const width = Math.max(1, measureGraphemeWidth(parts[index]!));
    if (target < cells + width) return target - cells < width / 2 ? index : index + 1;
    cells += width;
  }
  return parts.length;
}
