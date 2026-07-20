/**
 * Spatial morphing text transition.
 *
 * Transforms one string into another by treating shared (kept) characters as
 * stable anchors that slide from their old position to their new position,
 * while removed characters shrink away and added characters grow in —
 * all simultaneously with overlapping timing.
 *
 * Algorithm:
 *   1. LCS alignment produces keep / remove / add operations.
 *   2. Each op gets an old-column and new-column assignment.
 *   3. At each progress tick, kept chars interpolate their column position,
 *      removed chars shrink their occupied width from 1→0 and fade out,
 *      added chars grow their width from 0→1 and fade in.
 *   4. Characters are placed into a column buffer at their interpolated
 *      positions, producing smooth spatial reorganization.
 *
 * Timing (overlapping, not two-phase):
 *   - Removed chars: opacity 1→0 over [0.0, 0.6]
 *   - Added chars:   opacity 0→1 over [0.4, 1.0]
 *   - Overlap zone [0.4, 0.6]: both fading simultaneously, no dead spot
 *   - Kept chars: always full opacity
 *
 * Color-aware: preserves existing ANSI color codes by using parseStyledChars
 * and fadeStyledChar so that colored text retains its hue during the
 * morph animation rather than being replaced with grayscale.
 */

import { cellWidth } from '@celestial/corona';
import { fadeStyledChar, parseStyledChars, type StyledChar } from './fade.js';
import { safeContent } from './strategies/text.js';
import { clampUnit, easedProgress, finiteNumber, nonNegativeNumber } from './validation.js';

const RESET = '\x1b[0m';

export type MorphOp = { type: 'keep'; oldIdx: number; newIdx: number } | { type: 'remove'; oldIdx: number } | { type: 'add'; newIdx: number };

export interface MorphOpts {
  tick: number;
  duration: number;
  startTick?: number;
  easing?: (t: number) => number;
  /**
   * Alignment granularity. Default `'char'` (current behaviour: per-character
   * LCS, so individual letters can be kept across words). `'word'` runs LCS
   * over whitespace-separated tokens — much better for prose (whole words
   * fade in/out as units, kept words slide as units), where char-level
   * alignment otherwise spuriously preserves stray characters that happen
   * to coincide between unrelated words.
   */
  granularity?: 'char' | 'word';
}

/**
 * Compute the LCS table for two character arrays.
 * Returns a 2D array where dp[i][j] = length of LCS of old[0..i-1] and new[0..j-1].
 */
function lcsTable(oldChars: StyledChar[], newChars: StyledChar[]): number[][] {
  const m = oldChars.length;
  const n = newChars.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    const row = dp[i]!;
    const prevRow = dp[i - 1]!;
    for (let j = 1; j <= n; j++) {
      if (oldChars[i - 1]!.plain === newChars[j - 1]!.plain) {
        row[j] = prevRow[j - 1]! + 1;
      } else {
        row[j] = Math.max(prevRow[j]!, row[j - 1]!);
      }
    }
  }

  return dp;
}

/**
 * Compute morph operations by aligning old and new character arrays using LCS.
 *
 * Backtracks through the LCS table to produce an ordered list of keep/remove/add
 * operations that describe how to transform oldChars into newChars.
 */
export function computeMorphOps(oldChars: StyledChar[], newChars: StyledChar[]): MorphOp[] {
  const dp = lcsTable(oldChars, newChars);
  const ops: MorphOp[] = [];
  let i = oldChars.length;
  let j = newChars.length;

  // Backtrack through the DP table to build ops in reverse
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldChars[i - 1]!.plain === newChars[j - 1]!.plain) {
      ops.push({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      ops.push({ type: 'add', newIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: 'remove', oldIdx: i - 1 });
      i--;
    }
  }

  ops.reverse();
  return ops;
}

/**
 * Tokenize a StyledChar[] into runs of whitespace vs non-whitespace,
 * preserving each char's original position. Used by word-granularity morph.
 */
interface MorphToken {
  /** The chars in this token. */
  chars: StyledChar[];
  /** True if this token is a whitespace run (space, tab, etc.). */
  isWs: boolean;
  /** Start index in the original chars array. */
  startIdx: number;
}

function tokenizeChars(chars: StyledChar[]): MorphToken[] {
  if (chars.length === 0) return [];
  const tokens: MorphToken[] = [];
  let current: StyledChar[] = [chars[0]!];
  let isWs = /\s/.test(chars[0]!.plain);
  let startIdx = 0;
  for (let i = 1; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const chIsWs = /\s/.test(ch.plain);
    if (chIsWs === isWs) {
      current.push(ch);
    } else {
      tokens.push({ chars: current, isWs, startIdx });
      current = [ch];
      isWs = chIsWs;
      startIdx = i;
    }
  }
  tokens.push({ chars: current, isWs, startIdx });
  return tokens;
}

function tokenKey(token: MorphToken): string {
  let out = '';
  for (const c of token.chars) out += c.plain;
  return out;
}

/** Token-level LCS that returns a flat sequence of char-level MorphOps. */
function computeWordMorphOps(oldChars: StyledChar[], newChars: StyledChar[]): MorphOp[] {
  const oldTokens = tokenizeChars(oldChars);
  const newTokens = tokenizeChars(newChars);

  // LCS table over token keys.
  const m = oldTokens.length;
  const n = newTokens.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    for (let j = 1; j <= n; j += 1) {
      if (tokenKey(oldTokens[i - 1]!) === tokenKey(newTokens[j - 1]!)) {
        row[j] = prev[j - 1]! + 1;
      } else {
        row[j] = Math.max(prev[j]!, row[j - 1]!);
      }
    }
  }

  // Backtrack to produce token-level ops.
  type TokenOp = { type: 'keep'; oldIdx: number; newIdx: number } | { type: 'remove'; oldIdx: number } | { type: 'add'; newIdx: number };
  const tokenOps: TokenOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokenKey(oldTokens[i - 1]!) === tokenKey(newTokens[j - 1]!)) {
      tokenOps.push({ type: 'keep', oldIdx: i - 1, newIdx: j - 1 });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      tokenOps.push({ type: 'add', newIdx: j - 1 });
      j -= 1;
    } else {
      tokenOps.push({ type: 'remove', oldIdx: i - 1 });
      i -= 1;
    }
  }
  tokenOps.reverse();

  // Expand token ops into char-level ops so the existing renderer works
  // unchanged. Whole-token operations naturally produce the "word fades
  // / slides as a unit" behaviour.
  const charOps: MorphOp[] = [];
  for (const op of tokenOps) {
    if (op.type === 'keep') {
      const oldTok = oldTokens[op.oldIdx]!;
      const newTok = newTokens[op.newIdx]!;
      // Token contents match by construction, so chars line up 1:1.
      for (let k = 0; k < oldTok.chars.length; k += 1) {
        charOps.push({ type: 'keep', oldIdx: oldTok.startIdx + k, newIdx: newTok.startIdx + k });
      }
    } else if (op.type === 'remove') {
      const tok = oldTokens[op.oldIdx]!;
      for (let k = 0; k < tok.chars.length; k += 1) {
        charOps.push({ type: 'remove', oldIdx: tok.startIdx + k });
      }
    } else {
      const tok = newTokens[op.newIdx]!;
      for (let k = 0; k < tok.chars.length; k += 1) {
        charOps.push({ type: 'add', newIdx: tok.startIdx + k });
      }
    }
  }
  return charOps;
}

/**
 * Memoize morph ops: if old/new text + granularity are the same as the last
 * call, return the cached result instead of recomputing the expensive LCS.
 */
let lastOld = '';
let lastNew = '';
let lastGranularity: 'char' | 'word' = 'char';
let lastOps: MorphOp[] = [];
function cachedMorphOps(oldText: string, newText: string, oldChars: StyledChar[], newChars: StyledChar[], granularity: 'char' | 'word'): MorphOp[] {
  if (oldText === lastOld && newText === lastNew && granularity === lastGranularity) return lastOps;
  lastOps = granularity === 'word' ? computeWordMorphOps(oldChars, newChars) : computeMorphOps(oldChars, newChars);
  lastOld = oldText;
  lastNew = newText;
  lastGranularity = granularity;
  return lastOps;
}

// -- Timing constants for overlapping fades --
// Removed chars fade out over [0, REMOVE_END]
const REMOVE_END = 0.6;
// Added chars fade in over [ADD_START, 1]
const ADD_START = 0.4;

/**
 * Compute the opacity of a removed character at the given progress.
 * Fades from 1→0 over [0, REMOVE_END], then 0 afterward.
 */
function removeOpacity(progress: number): number {
  if (progress >= REMOVE_END) return 0;
  return 1.0 - progress / REMOVE_END;
}

/**
 * Compute the opacity of an added character at the given progress.
 * 0 before ADD_START, then fades from 0→1 over [ADD_START, 1].
 */
function addOpacity(progress: number): number {
  if (progress <= ADD_START) return 0;
  return (progress - ADD_START) / (1.0 - ADD_START);
}

/**
 * Layout slot: a character placed at a fractional column position with
 * a fractional width and an opacity.
 */
interface LayoutSlot {
  sc: StyledChar;
  col: number; // fractional column position
  width: number; // fractional width (0..1), for spatial interpolation
  opacity: number;
}

/**
 * Compute an interpolated column for each slot, accounting for the fact
 * that remove slots shrink and add slots grow. This ensures the total
 * layout width smoothly transitions from oldLen to newLen.
 *
 * We recalculate actual positions by walking slots in op-order and
 * accumulating fractional widths, which produces smooth sliding.
 */
function resolvePositions(ops: MorphOp[], oldChars: StyledChar[], newChars: StyledChar[], progress: number): LayoutSlot[] {
  const slots: LayoutSlot[] = [];
  let cursor = 0;

  for (const op of ops) {
    switch (op.type) {
      case 'keep': {
        const glyphWidth = Math.max(1, cellWidth(newChars[op.newIdx]!.plain));
        slots.push({
          sc: newChars[op.newIdx]!,
          col: cursor,
          width: glyphWidth,
          opacity: 1,
        });
        cursor += glyphWidth;
        break;
      }

      case 'remove': {
        const opacity = removeOpacity(progress);
        const glyphWidth = Math.max(1, cellWidth(oldChars[op.oldIdx]!.plain));
        // Width shrinks linearly: 1 at progress=0, 0 at progress=1
        const width = glyphWidth * (1.0 - progress);
        if (opacity > 0) {
          slots.push({
            sc: oldChars[op.oldIdx]!,
            col: cursor,
            width,
            opacity,
          });
        }
        cursor += width;
        break;
      }

      case 'add': {
        const opacity = addOpacity(progress);
        const glyphWidth = Math.max(1, cellWidth(newChars[op.newIdx]!.plain));
        // Width grows linearly: 0 at progress=0, 1 at progress=1
        const width = glyphWidth * progress;
        if (opacity > 0) {
          slots.push({
            sc: newChars[op.newIdx]!,
            col: cursor,
            width,
            opacity,
          });
        }
        cursor += width;
        break;
      }
    }
  }

  return slots;
}

/**
 * Render layout slots into a string.
 *
 * Slots are placed into a character buffer at their rounded column positions.
 * When multiple slots compete for the same column, the one with higher opacity
 * wins. This ensures clean output without overlapping artifacts.
 */
function renderSlots(slots: LayoutSlot[], totalWidth: number): string {
  // Buffer: each cell holds a rendered character string (with ANSI codes)
  const buffer: string[] = new Array<string>(totalWidth).fill(' ');
  // Priority: track the opacity of the character currently in each cell
  const priority: number[] = new Array<number>(totalWidth).fill(-1);

  for (const slot of slots) {
    // Round to nearest integer column, clamped to buffer bounds
    const col = Math.round(slot.col);
    const glyphWidth = Math.max(1, cellWidth(slot.sc.plain));
    if (col < 0 || col + glyphWidth > totalWidth) continue;

    // Only place if this character has higher or equal opacity
    if (slot.opacity > priority[col]!) {
      buffer[col] = fadeStyledChar(slot.sc, slot.opacity);
      priority[col] = slot.opacity;
      for (let offset = 1; offset < glyphWidth; offset += 1) {
        if (slot.opacity > priority[col + offset]!) {
          buffer[col + offset] = '';
          priority[col + offset] = slot.opacity;
        }
      }
    }
  }

  return buffer.join('');
}

/**
 * Morph one text string into another over time with spatial interpolation.
 *
 * At progress 0 returns oldText. At progress 1 returns newText.
 * In between, characters smoothly slide from their old positions to their
 * new positions. Removed characters shrink and fade out, added characters
 * grow and fade in, and kept characters serve as stable anchors that
 * glide to their final positions.
 *
 * Handles multi-line text by morphing each line independently.
 */
export function morph(oldText: string, newText: string, opts: MorphOpts): string {
  const safeOldText = safeContent(oldText);
  const safeNewText = safeContent(newText);
  // Fast path: identical text needs no transition
  if (safeOldText === safeNewText) {
    return safeOldText;
  }

  const { tick, duration, startTick = 0, easing, granularity = 'char' } = opts;

  // Compute raw progress and clamp to [0, 1]
  const durationTicks = nonNegativeNumber(duration, 'duration');
  const rawProgress = durationTicks === 0 ? 1 : (finiteNumber(tick, 'tick') - finiteNumber(startTick, 'startTick')) / durationTicks;
  const progress = easedProgress(easing, clampUnit(rawProgress));

  // Boundary fast paths
  if (progress <= 0) {
    return safeOldText;
  }
  if (progress >= 1) {
    return safeNewText;
  }

  // Handle multi-line text: morph each line independently
  const oldLines = safeOldText.split('\n');
  const newLines = safeNewText.split('\n');

  if (oldLines.length > 1 || newLines.length > 1) {
    return morphMultiLine(oldLines, newLines, progress, granularity);
  }

  // Single-line morph
  return morphLine(safeOldText, safeNewText, progress, granularity);
}

/**
 * Morph a single line of text with spatial interpolation.
 */
function morphLine(oldText: string, newText: string, progress: number, granularity: 'char' | 'word'): string {
  const oldChars = parseStyledChars(oldText);
  const newChars = parseStyledChars(newText);
  const ops = cachedMorphOps(oldText, newText, oldChars, newChars, granularity);

  // Compute the total output width at this progress.
  // It interpolates smoothly from oldLen to newLen.
  const oldWidth = oldChars.reduce((sum, char) => sum + Math.max(1, cellWidth(char.plain)), 0);
  const newWidth = newChars.reduce((sum, char) => sum + Math.max(1, cellWidth(char.plain)), 0);
  const totalWidth = Math.round(oldWidth + (newWidth - oldWidth) * progress);

  // Build spatially-resolved slots
  const slots = resolvePositions(ops, oldChars, newChars, progress);

  // Render to a fixed-width buffer
  return renderSlots(slots, Math.max(totalWidth, 1)) + RESET;
}

/**
 * Morph multiple lines by padding line counts and morphing each pair.
 *
 * If line counts differ, missing lines are treated as empty strings so
 * excess lines smoothly fade in or out.
 */
function morphMultiLine(oldLines: string[], newLines: string[], progress: number, granularity: 'char' | 'word'): string {
  const lineCount = Math.max(oldLines.length, newLines.length);
  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[i] ?? '';

    if (oldLine === newLine) {
      resultLines.push(oldLine);
    } else {
      resultLines.push(morphLine(oldLine, newLine, progress, granularity));
    }
  }

  return resultLines.join('\n');
}
