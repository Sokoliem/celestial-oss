/**
 * Glitch transition — RGB-tear + per-row offset jitter + scanline noise.
 *
 * Aesthetic: brief moment of digital chaos (corrupted-feed look) that
 * settles into the destination content. Best used sparingly, e.g. on
 * commit/error/state-change moments where you want a punch.
 *
 * Effect anatomy at progress `p`:
 *  - chaos curve `sin(p · π)` peaks at 0.5 and zeros at the endpoints,
 *    so progress=0 returns old content unchanged and progress=1 returns
 *    new content unchanged.
 *  - per-row content choice flips deterministically based on a seeded
 *    threshold; at 0.5 about half the rows show new, half show old.
 *  - per-row horizontal jitter shifts each line by ±3 cells max,
 *    scaled by chaos.
 *  - scanline noise: a small fraction of rows (`scanlineCycle * chaos`)
 *    get a heavy-block character punched at a random column.
 *  - chromatic tint: at peak chaos, a few rows get a red or cyan overlay
 *    (chromatic-aberration ghost).
 *
 * Deterministic via golden-ratio hash (matches the `dissolve` strategy
 * convention) so the same `seed` always yields identical frames.
 */

import { clampUnit, finiteNumber } from '../validation.js';
import { padCells, renderCells, safeContent, type TerminalCell, visibleLength } from './text.js';

const RESET = '\x1b[0m';
const TINT_RED = '\x1b[31m';
const TINT_CYAN = '\x1b[36m';

export interface GlitchOpts {
  /** Overall effect strength in [0, 1]. Default `1`. Lower for subtler glitch. */
  intensity?: number;
  /** Probability per row of receiving a scanline block at peak chaos, in [0, 1]. Default `0.15`. */
  scanlineCycle?: number;
  /** Seed for the deterministic per-row hash. Default `42`. */
  seed?: number;
}

const PHI = 0.6180339887498949;

/** Map (row, channel, seed) to a stable threshold in [0, 1]. */
function rowThreshold(row: number, channel: number, seed: number): number {
  const hash = ((row * 7919 + channel * 6271 + seed * 1327) * PHI) % 1;
  return hash < 0 ? hash + 1 : hash;
}

function splitLines(content: string): string[] {
  return content === '' ? [''] : content.split('\n');
}

function applyJitter(line: TerminalCell[], offset: number, width: number): TerminalCell[] {
  const blank = padCells('', 1)[0]!;
  if (offset === 0) return [...line];
  if (offset > 0) {
    // Shift right: pad with spaces at start, truncate at end.
    return [...Array<TerminalCell>(offset).fill(blank), ...line.slice(0, Math.max(0, width - offset))];
  }
  // Shift left: drop leading chars, pad with spaces at end.
  const drop = -offset;
  return [...line.slice(drop), ...Array<TerminalCell>(drop).fill(blank)];
}

function punchAt(line: TerminalCell[], col: number, ch: string): TerminalCell[] {
  if (col < 0 || col >= line.length) return line;
  const result = [...line];
  result[col] = padCells(ch, 1)[0]!;
  return result;
}

export function glitch(oldContent: string, newContent: string, progress: number, opts?: GlitchOpts): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);
  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const intensity = clampUnit(opts?.intensity ?? 1, 'intensity');
  const scanlineCycle = clampUnit(opts?.scanlineCycle ?? 0.15, 'scanlineCycle');
  const seed = finiteNumber(opts?.seed ?? 42, 'seed');

  // Chaos peaks at p=0.5 and is zero at the endpoints — guarantees that
  // glitch artifacts (jitter, scanline punches, chromatic tint) fade
  // smoothly in and back out.
  const chaos = intensity * Math.sin(p * Math.PI);

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const rows = Math.max(oldLines.length, newLines.length);

  let width = 0;
  for (const line of oldLines) width = Math.max(width, visibleLength(line));
  for (const line of newLines) width = Math.max(width, visibleLength(line));

  const result: string[] = [];
  for (let row = 0; row < rows; row++) {
    const oldPlain = padCells(oldLines[row] ?? '', width);
    const newPlain = padCells(newLines[row] ?? '', width);

    // Per-row swap: at p > rowThreshold the row shows new content.
    const swapThreshold = rowThreshold(row, 0, seed);
    let line = p > swapThreshold ? newPlain : oldPlain;

    // Per-row horizontal jitter, ±3 cells max, scaled by chaos.
    const jitterRand = rowThreshold(row, 1, seed); // 0..1
    const maxJitter = Math.round(3 * chaos);
    const jitterAmount = Math.round((jitterRand * 2 - 1) * maxJitter);
    line = applyJitter(line, jitterAmount, width);

    // Scanline punch: with low probability, drop a heavy block at a random col.
    if (rowThreshold(row, 2, seed) < scanlineCycle * chaos) {
      const tearCol = Math.floor(rowThreshold(row, 3, seed) * Math.max(1, width));
      line = punchAt(line, tearCol, '█');
    }

    // Chromatic tint: only at peak chaos, only a small fraction of rows.
    if (chaos > 0.7 && rowThreshold(row, 4, seed) < 0.15) {
      const tint = rowThreshold(row, 5, seed) < 0.5 ? TINT_RED : TINT_CYAN;
      result.push(tint + renderCells(line) + RESET);
    } else {
      result.push(renderCells(line) + RESET);
    }
  }

  return result.join('\n');
}
