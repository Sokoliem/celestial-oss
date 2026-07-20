/**
 * @celestial/rosetta — Unicode Bidirectional Algorithm (UAX #9)
 *
 * Implements levels 1-3 of the Unicode Bidi Algorithm:
 * 1. Paragraph level detection (P1-P3)
 * 2. Explicit embedding levels (X1-X8)
 * 3. Weak type resolution (W1-W7)
 * 4. Neutral type resolution (N1-N2)
 * 5. Implicit level resolution (I1-I2)
 * 6. Reordering (L1-L4)
 */

import { detectDirection, getCharBidiType } from './detect.js';
import { measureGraphemeWidth, segmentGraphemes } from './grapheme.js';
import type { BidiCharType, BidiRun, Direction } from './types.js';

// ── Internal types ──────────────────────────────────────────────────────

interface BidiChar {
  cp: number;
  origType: BidiCharType;
  type: BidiCharType;
  level: number;
  index: number;
}

// Max nesting depth per UAX #9
const MAX_DEPTH = 125;

// ── Paragraph level (P1-P3) ─────────────────────────────────────────────

function resolveParagraphLevel(text: string, baseDir?: Direction): number {
  if (baseDir === 'ltr') return 0;
  if (baseDir === 'rtl') return 1;
  return detectDirection(text) === 'rtl' ? 1 : 0;
}

// ── Explicit levels (X1-X8, simplified) ─────────────────────────────────

function resolveExplicitLevels(chars: BidiChar[], paraLevel: number): void {
  const stack: Array<{ level: number; override: BidiCharType | null; isolate: boolean }> = [];
  let currentLevel = paraLevel;
  let currentOverride: BidiCharType | null = null;
  let overflowIsolateCount = 0;
  let overflowEmbeddingCount = 0;
  let validIsolateCount = 0;

  for (const ch of chars) {
    const type = ch.origType;

    // X2: RLE
    if (type === 'RLE') {
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 1 : currentLevel + 2;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: false });
        currentLevel = newLevel;
        currentOverride = null;
      } else if (overflowIsolateCount === 0) {
        overflowEmbeddingCount++;
      }
      ch.level = currentLevel;
      ch.type = 'BN';
      continue;
    }

    // X3: LRE
    if (type === 'LRE') {
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 2 : currentLevel + 1;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: false });
        currentLevel = newLevel;
        currentOverride = null;
      } else if (overflowIsolateCount === 0) {
        overflowEmbeddingCount++;
      }
      ch.level = currentLevel;
      ch.type = 'BN';
      continue;
    }

    // X4: RLO
    if (type === 'RLO') {
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 1 : currentLevel + 2;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: false });
        currentLevel = newLevel;
        currentOverride = 'R';
      } else if (overflowIsolateCount === 0) {
        overflowEmbeddingCount++;
      }
      ch.level = currentLevel;
      ch.type = 'BN';
      continue;
    }

    // X5: LRO
    if (type === 'LRO') {
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 2 : currentLevel + 1;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: false });
        currentLevel = newLevel;
        currentOverride = 'L';
      } else if (overflowIsolateCount === 0) {
        overflowEmbeddingCount++;
      }
      ch.level = currentLevel;
      ch.type = 'BN';
      continue;
    }

    // X5a: RLI
    if (type === 'RLI') {
      ch.level = currentLevel;
      if (currentOverride) ch.type = currentOverride;
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 1 : currentLevel + 2;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: true });
        currentLevel = newLevel;
        currentOverride = null;
        validIsolateCount++;
      } else {
        overflowIsolateCount++;
      }
      continue;
    }

    // X5b: LRI
    if (type === 'LRI') {
      ch.level = currentLevel;
      if (currentOverride) ch.type = currentOverride;
      const newLevel = currentLevel % 2 === 0 ? currentLevel + 2 : currentLevel + 1;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: true });
        currentLevel = newLevel;
        currentOverride = null;
        validIsolateCount++;
      } else {
        overflowIsolateCount++;
      }
      continue;
    }

    // X5c: FSI — behave as RLI or LRI depending on text after
    if (type === 'FSI') {
      ch.level = currentLevel;
      if (currentOverride) ch.type = currentOverride;
      // Simplified: treat like the detected direction
      const innerDir = detectDirection(String.fromCodePoint(...chars.filter((c) => c.index > ch.index).map((c) => c.cp)));
      const asRtl = innerDir === 'rtl';
      const newLevel = asRtl ? (currentLevel % 2 === 0 ? currentLevel + 1 : currentLevel + 2) : currentLevel % 2 === 0 ? currentLevel + 2 : currentLevel + 1;
      if (newLevel <= MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
        stack.push({ level: currentLevel, override: currentOverride, isolate: true });
        currentLevel = newLevel;
        currentOverride = null;
        validIsolateCount++;
      } else {
        overflowIsolateCount++;
      }
      continue;
    }

    // X6a: PDI
    if (type === 'PDI') {
      if (overflowIsolateCount > 0) {
        overflowIsolateCount--;
      } else if (validIsolateCount > 0) {
        overflowEmbeddingCount = 0;
        // Pop stack until we find an isolate entry
        while (stack.length > 0) {
          const entry = stack.pop()!;
          if (entry.isolate) {
            currentLevel = entry.level;
            currentOverride = entry.override;
            validIsolateCount--;
            break;
          }
        }
      }
      ch.level = currentLevel;
      ch.type = currentOverride ?? ch.type;
      continue;
    }

    // X7: PDF
    if (type === 'PDF') {
      if (overflowIsolateCount > 0) {
        // Do nothing
      } else if (overflowEmbeddingCount > 0) {
        overflowEmbeddingCount--;
      } else if (stack.length > 0 && !stack[stack.length - 1]!.isolate) {
        const entry = stack.pop()!;
        currentLevel = entry.level;
        currentOverride = entry.override;
      }
      ch.level = currentLevel;
      ch.type = 'BN';
      continue;
    }

    // X6: All other characters
    ch.level = currentLevel;
    if (currentOverride) {
      ch.type = currentOverride;
    }
  }
}

// ── Weak types (W1-W7) ─────────────────────────────────────────────────

function resolveWeakTypes(chars: BidiChar[], paraLevel: number): void {
  const len = chars.length;

  // W1: NSM → type of previous character (or paragraph direction type)
  for (let i = 0; i < len; i++) {
    if (chars[i]!.type === 'NSM') {
      if (i === 0) {
        chars[i]!.type = paraLevel % 2 === 0 ? 'L' : 'R';
      } else {
        const prev = chars[i - 1]!.type;
        if (prev === 'LRI' || prev === 'RLI' || prev === 'FSI' || prev === 'PDI') {
          chars[i]!.type = 'ON';
        } else {
          chars[i]!.type = prev;
        }
      }
    }
  }

  // W2: EN after AL → AN
  for (let i = 0; i < len; i++) {
    if (chars[i]!.type === 'EN') {
      for (let j = i - 1; j >= 0; j--) {
        const t = chars[j]!.type;
        if (t === 'AL') {
          chars[i]!.type = 'AN';
          break;
        }
        if (t === 'L' || t === 'R') break;
      }
    }
  }

  // W3: AL → R
  for (let i = 0; i < len; i++) {
    if (chars[i]!.type === 'AL') chars[i]!.type = 'R';
  }

  // W4: Single ES between EN → EN; single CS between EN → EN; single CS between AN → AN
  for (let i = 1; i < len - 1; i++) {
    const t = chars[i]!.type;
    if (t === 'ES' && chars[i - 1]!.type === 'EN' && chars[i + 1]!.type === 'EN') {
      chars[i]!.type = 'EN';
    }
    if (t === 'CS') {
      if (chars[i - 1]!.type === 'EN' && chars[i + 1]!.type === 'EN') {
        chars[i]!.type = 'EN';
      } else if (chars[i - 1]!.type === 'AN' && chars[i + 1]!.type === 'AN') {
        chars[i]!.type = 'AN';
      }
    }
  }

  // W5: Sequences of ET adjacent to EN → EN
  for (let i = 0; i < len; i++) {
    if (chars[i]!.type === 'ET') {
      // Look backward for EN
      let hasEN = false;
      for (let j = i - 1; j >= 0 && (chars[j]!.type === 'ET' || chars[j]!.type === 'EN'); j--) {
        if (chars[j]!.type === 'EN') {
          hasEN = true;
          break;
        }
      }
      // Look forward for EN
      if (!hasEN) {
        for (let j = i + 1; j < len && (chars[j]!.type === 'ET' || chars[j]!.type === 'EN'); j++) {
          if (chars[j]!.type === 'EN') {
            hasEN = true;
            break;
          }
        }
      }
      if (hasEN) chars[i]!.type = 'EN';
    }
  }

  // W6: Remaining ES, ET, CS → ON
  for (let i = 0; i < len; i++) {
    const t = chars[i]!.type;
    if (t === 'ES' || t === 'ET' || t === 'CS') {
      chars[i]!.type = 'ON';
    }
  }

  // W7: EN with LTR context (previous strong type is L) → L
  for (let i = 0; i < len; i++) {
    if (chars[i]!.type === 'EN') {
      let prevStrong: BidiCharType = paraLevel % 2 === 0 ? 'L' : 'R';
      for (let j = i - 1; j >= 0; j--) {
        if (chars[j]!.type === 'L' || chars[j]!.type === 'R') {
          prevStrong = chars[j]!.type;
          break;
        }
      }
      if (prevStrong === 'L') chars[i]!.type = 'L';
    }
  }
}

// ── Neutral types (N1-N2) ───────────────────────────────────────────────

function resolveNeutralTypes(chars: BidiChar[], paraLevel: number): void {
  const len = chars.length;
  const sor = paraLevel % 2 === 0 ? 'L' : 'R';

  for (let i = 0; i < len; i++) {
    const t = chars[i]!.type;
    if (t === 'ON' || t === 'WS' || t === 'S' || t === 'B' || t === 'BN') {
      // Find the boundaries: previous strong and next strong
      let prevStrong: BidiCharType = sor;
      for (let j = i - 1; j >= 0; j--) {
        const pt = chars[j]!.type;
        if (pt === 'L' || pt === 'R' || pt === 'EN' || pt === 'AN') {
          prevStrong = pt === 'EN' || pt === 'AN' ? 'R' : pt;
          break;
        }
      }

      let nextStrong: BidiCharType = sor;
      for (let j = i + 1; j < len; j++) {
        const nt = chars[j]!.type;
        if (nt === 'L' || nt === 'R' || nt === 'EN' || nt === 'AN') {
          nextStrong = nt === 'EN' || nt === 'AN' ? 'R' : nt;
          break;
        }
      }

      // N1: If both sides are the same strong type, neutral takes that type
      // N2: Otherwise, neutral gets the embedding direction
      if (prevStrong === nextStrong) {
        chars[i]!.type = prevStrong;
      } else {
        chars[i]!.type = chars[i]!.level % 2 === 0 ? 'L' : 'R';
      }
    }
  }
}

// ── Implicit levels (I1-I2) ─────────────────────────────────────────────

function resolveImplicitLevels(chars: BidiChar[]): void {
  for (const ch of chars) {
    // I1: For even levels, R → level+1, AN/EN → level+2
    if (ch.level % 2 === 0) {
      if (ch.type === 'R') ch.level += 1;
      else if (ch.type === 'AN' || ch.type === 'EN') ch.level += 2;
    } else {
      // I2: For odd levels, L/EN/AN → level+1
      if (ch.type === 'L' || ch.type === 'EN' || ch.type === 'AN') {
        ch.level += 1;
      }
    }
  }
}

// ── Reorder (L1-L4) ────────────────────────────────────────────────────

function reorderLine(chars: BidiChar[]): BidiChar[] {
  if (chars.length === 0) return [];

  // L1: Reset trailing whitespace / isolate markers to paragraph level
  // (Simplified: we leave levels as-is for terminal display)

  // Find the maximum level
  let maxLevel = 0;
  for (const ch of chars) {
    if (ch.level > maxLevel) maxLevel = ch.level;
  }

  // L2: Reverse each subsequence at level >= l, from maxLevel down to 1
  const result = [...chars];
  for (let level = maxLevel; level >= 1; level--) {
    let i = 0;
    while (i < result.length) {
      if (result[i]!.level >= level) {
        const start = i;
        while (i < result.length && result[i]!.level >= level) i++;
        // Reverse the subsequence [start, i)
        let lo = start;
        let hi = i - 1;
        while (lo < hi) {
          const tmp = result[lo]!;
          result[lo] = result[hi]!;
          result[hi] = tmp;
          lo++;
          hi--;
        }
      } else {
        i++;
      }
    }
  }

  return result;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Run the Unicode Bidi Algorithm on the given text, returning an array
 * of BidiRuns with resolved embedding levels and logical positions.
 */
export function reorderBidi(text: string, baseDirection?: Direction): BidiRun[] {
  if (text.length === 0) return [];

  const paraLevel = resolveParagraphLevel(text, baseDirection);

  // Build character array
  const codePoints: number[] = [];
  for (const ch of text) {
    codePoints.push(ch.codePointAt(0)!);
  }

  const chars: BidiChar[] = codePoints.map((cp, i) => {
    const type = getCharBidiType(cp);
    return { cp, origType: type, type, level: paraLevel, index: i };
  });

  // Run algorithm steps
  resolveExplicitLevels(chars, paraLevel);
  resolveWeakTypes(chars, paraLevel);
  resolveNeutralTypes(chars, paraLevel);
  resolveImplicitLevels(chars);

  // Reorder
  const reordered = reorderLine(chars);

  // Collapse into runs of same level
  const runs: BidiRun[] = [];
  let runStart = 0;
  for (let i = 1; i <= reordered.length; i++) {
    if (i === reordered.length || reordered[i]!.level !== reordered[i - 1]!.level) {
      const runChars = reordered.slice(runStart, i);
      const text = String.fromCodePoint(...runChars.map((c) => c.cp));
      runs.push({
        text,
        level: runChars[0]!.level,
        start: runChars[0]!.index,
        end: runChars[runChars.length - 1]!.index,
      });
      runStart = i;
    }
  }

  return runs;
}

/**
 * Convert logical-order text to visual-order text for terminal display.
 * Applies the full Unicode Bidi Algorithm and returns the reordered string.
 */
export function toBidiVisual(text: string, baseDirection?: Direction): string {
  const runs = reorderBidi(text, baseDirection);
  return runs.map((r) => r.text).join('');
}

/**
 * Wrap logical-order text into width-constrained visual lines.
 *
 * The line-breaking pass is grapheme-aware so combining marks and emoji
 * clusters are not split across lines. Each wrapped line is then reordered
 * visually using the bidi algorithm.
 */
export function wrapBidi(text: string, width: number, baseDirection: Direction = 'auto'): string[] {
  if (width <= 0) {
    return [];
  }

  const logicalLines = text.split('\n');
  const wrapped: string[] = [];

  for (const logicalLine of logicalLines) {
    for (const line of wrapLogicalLine(logicalLine, width)) {
      wrapped.push(toBidiVisual(line, baseDirection));
    }
  }

  return wrapped.length > 0 ? wrapped : [''];
}

function wrapLogicalLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [''];
  }

  const graphemes = segmentGraphemes(line);
  const lines: string[] = [];
  let start = 0;

  while (start < graphemes.length) {
    let currentWidth = 0;
    let end = start;
    let lastBreak = -1;

    while (end < graphemes.length) {
      const grapheme = graphemes[end]!;
      const nextWidth = currentWidth + measureGraphemeWidth(grapheme);

      if (nextWidth > width) {
        break;
      }

      currentWidth = nextWidth;
      if (isWrapWhitespace(grapheme)) {
        lastBreak = end;
      }
      end++;
    }

    if (end === graphemes.length) {
      lines.push(graphemes.slice(start, end).join('').trimEnd());
      break;
    }

    let sliceEnd = lastBreak >= start ? lastBreak : end;
    if (sliceEnd <= start) {
      sliceEnd = Math.min(start + 1, graphemes.length);
    }

    lines.push(graphemes.slice(start, sliceEnd).join('').trimEnd());
    start = sliceEnd;

    while (start < graphemes.length && isWrapWhitespace(graphemes[start]!)) {
      start++;
    }
  }

  return lines;
}

function isWrapWhitespace(grapheme: string): boolean {
  return grapheme.trim().length === 0;
}
