/**
 * Bracket pair colorization — depth-cycled coloring for matching brackets.
 *
 * Walks a tokenized document, tracks bracket nesting depth, and returns
 * a per-line index of every bracket character with its 0-based nesting
 * depth. Pure data — consumers (the `highlight()` renderer, custom
 * VNode pipelines) overlay colors using their own palette.
 *
 * The bracket walker honours the same string/comment exclusion rules
 * as `findMatchingBracket` and the angle-bracket adjacency heuristic
 * (so `Array<T>` is treated as nesting but `a < b` is not).
 */

import type { TokenCategory, TokenizedDocument, TokenizedLine } from './types.js';

// ── Public types ────────────────────────────────────────────────────────

export type Bracket = '(' | '[' | '{' | '<' | ')' | ']' | '}' | '>';

export interface BracketDepth {
  /** 0-based source line. */
  readonly line: number;
  /** 0-based column where the bracket character starts. */
  readonly column: number;
  /** The bracket character itself. */
  readonly bracket: Bracket;
  /**
   * 0-based nesting depth. The outermost pair is depth 0; nested pairs
   * increment by one. Unmatched brackets receive a depth equal to the
   * stack height at the time they were encountered.
   */
  readonly depth: number;
  /**
   * `true` if this bracket has no partner in the document. Renderers
   * typically style unmatched brackets with a dedicated error color
   * instead of the depth palette.
   */
  readonly unmatched: boolean;
}

/**
 * Map keyed by 0-based line number → bracket depths on that line, in
 * left-to-right column order. Lines with no brackets are omitted.
 */
export type BracketDepthMap = ReadonlyMap<number, readonly BracketDepth[]>;

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Compute bracket nesting depths for every bracket in a tokenized
 * document. Returns a flat array in source order — use
 * `groupBracketDepthsByLine` if you need a per-line index.
 */
export function bracketPairColors(doc: TokenizedDocument | readonly TokenizedLine[]): readonly BracketDepth[] {
  const lines = Array.isArray(doc) ? doc : (doc as TokenizedDocument).lines;
  const entries = collectEntries(lines);
  return assignDepths(entries);
}

/**
 * Group a flat depth array into a `Map<line, BracketDepth[]>`. Useful
 * for renderers that walk a document line-by-line.
 */
export function groupBracketDepthsByLine(depths: readonly BracketDepth[]): BracketDepthMap {
  const map = new Map<number, BracketDepth[]>();
  for (const d of depths) {
    const list = map.get(d.line);
    if (list) list.push(d);
    else map.set(d.line, [d]);
  }
  return map;
}

// ── Internal walker ─────────────────────────────────────────────────────

interface BracketEntry {
  readonly bracket: Bracket;
  readonly line: number;
  readonly column: number;
}

function isBracketCategory(category: TokenCategory): boolean {
  return category !== 'comment' && category !== 'string';
}

/**
 * Mirror of `document.ts`'s angle-bracket heuristic. Treat `<` as
 * a nesting bracket only when immediately adjacent to a preceding
 * identifier-like token or closing bracket. This avoids treating
 * `a < b` (comparison) as a bracket.
 */
function isLikelyAngleBracket(line: TokenizedLine, charColumn: number): boolean {
  if (charColumn === 0) return false;
  let col = 0;
  let prevCategory: TokenCategory | null = null;
  let prevText = '';
  let prevEnd = 0;
  for (const token of line.tokens) {
    const end = col + token.text.length;
    if (end <= charColumn) {
      prevCategory = token.category;
      prevText = token.text;
      prevEnd = end;
    }
    col = end;
  }
  if (!prevCategory) return false;
  if (prevEnd !== charColumn) return false;
  if (prevCategory === 'type' || prevCategory === 'function') return true;
  if (prevText.endsWith(')') || prevText.endsWith(']') || prevText.endsWith('>')) return true;
  return false;
}

function collectEntries(lines: readonly TokenizedLine[]): BracketEntry[] {
  const entries: BracketEntry[] = [];
  let angleDepth = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    let column = 0;
    for (const token of line.tokens) {
      if (!isBracketCategory(token.category)) {
        column += token.text.length;
        continue;
      }
      const text = token.text;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        const at = column + i;
        if ('()[]{}'.includes(ch)) {
          entries.push({ bracket: ch as Bracket, line: lineIndex, column: at });
        } else if (ch === '<') {
          if (isLikelyAngleBracket(line, at)) {
            entries.push({ bracket: '<', line: lineIndex, column: at });
            angleDepth++;
          }
        } else if (ch === '>') {
          if (angleDepth > 0) {
            entries.push({ bracket: '>', line: lineIndex, column: at });
            angleDepth--;
          }
        }
      }
      column += text.length;
    }
  }

  return entries;
}

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
const CLOSE_TO_OPEN: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

function assignDepths(entries: readonly BracketEntry[]): BracketDepth[] {
  const result: BracketDepth[] = [];
  // Stack of indices into `result` for currently open brackets.
  const stack: number[] = [];

  for (const entry of entries) {
    if (entry.bracket in OPEN_TO_CLOSE) {
      const depth = stack.length;
      const idx = result.length;
      result.push({
        line: entry.line,
        column: entry.column,
        bracket: entry.bracket,
        depth,
        unmatched: true, // optimistic; flipped to false when matched
      });
      stack.push(idx);
      continue;
    }

    const expectedOpen = CLOSE_TO_OPEN[entry.bracket];
    // Search the stack from the top for a matching open bracket. Mismatched
    // closers (e.g. `(]`) leave the open on the stack as unmatched.
    let matchedStackIndex = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      const openIdx = stack[i]!;
      if (result[openIdx]!.bracket === expectedOpen) {
        matchedStackIndex = i;
        break;
      }
    }

    if (matchedStackIndex === -1) {
      // No matching opener — this closer is unmatched at the *current*
      // stack depth (which is its visual nesting at this point in source).
      result.push({
        line: entry.line,
        column: entry.column,
        bracket: entry.bracket,
        depth: stack.length,
        unmatched: true,
      });
      continue;
    }

    // Pop everything above the matched opener (they remain unmatched).
    while (stack.length - 1 > matchedStackIndex) stack.pop();

    const openIdx = stack.pop()!;
    const opener = result[openIdx]!;
    // Mark both the opener and this closer as matched, sharing depth.
    result[openIdx] = { ...opener, unmatched: false };
    result.push({
      line: entry.line,
      column: entry.column,
      bracket: entry.bracket,
      depth: opener.depth,
      unmatched: false,
    });
  }

  return result;
}
