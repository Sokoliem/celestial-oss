/**
 * Blur transition — progressive defocus using Unicode block elements.
 *
 * Simulates a depth-of-field / focus-shift effect in the terminal by
 * replacing characters with progressively denser Unicode block chars
 * (░ → ▒ → ▓ → █) while desaturating color toward gray.
 *
 * Phases:
 *   [0, 0.5)  — Old content blurs out (sharp → full block)
 *   [0.5, 1]  — New content de-blurs (full block → sharp)
 *
 * At progress 0: returns oldContent unchanged.
 * At progress 1: returns newContent unchanged.
 */

import { clampUnit } from '../validation.js';
import { padCells, renderCells, safeContent, visibleLength } from './text.js';

const RESET = '\x1b[0m';

// Unicode block elements in ascending density order
const BLOCK_CHARS = [' ', '░', '▒', '▓', '█'];

/**
 * Map a blur level (0 = sharp, 1 = fully blurred) to a block character.
 * Returns the original character when blur is 0, and progressively
 * denser block characters as blur approaches 1.
 */
function blurChar(ch: string, blur: number): string {
  if (ch === ' ' || ch === '' || ch === '\n') return ch;
  if (blur <= 0) return ch;
  if (blur >= 1) return BLOCK_CHARS[4]!;

  // Map blur [0,1] to block index [0,4]
  // 0.0-0.2: original char
  // 0.2-0.4: ░
  // 0.4-0.6: ▒
  // 0.6-0.8: ▓
  // 0.8-1.0: █
  const idx = Math.min(4, Math.floor(blur * 5));
  if (idx === 0) return ch;
  return BLOCK_CHARS[idx]!;
}

/**
 * Apply blur to a character with a desaturated gray color.
 * As blur increases, the character approaches a mid-gray block.
 */
function blurCharWithColor(ch: string, blur: number, baseBrightness: number): string {
  if (ch === ' ' || ch === '' || ch === '\n') return ch;

  const blurred = blurChar(ch, blur);

  // Interpolate brightness toward a mid-gray as blur increases
  const midGray = 100;
  const brightness = Math.round(baseBrightness + (midGray - baseBrightness) * blur);

  return `\x1b[38;2;${brightness};${brightness};${brightness}m${blurred}`;
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

export function blur(oldContent: string, newContent: string, progress: number): string {
  const safeOldContent = safeContent(oldContent);
  const safeNewContent = safeContent(newContent);
  const p = clampUnit(progress);

  if (p <= 0) return safeOldContent;
  if (p >= 1) return safeNewContent;

  const oldLines = splitLines(safeOldContent);
  const newLines = splitLines(safeNewContent);
  const lineCount = Math.max(oldLines.length, newLines.length);

  const resultLines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const oldLine = oldLines[i] ?? '';
    const newLine = newLines[i] ?? '';
    const width = Math.max(visibleLength(oldLine), visibleLength(newLine));
    const oldPadded = padCells(oldLine, width);
    const newPadded = padCells(newLine, width);
    let line: string;

    if (p < 0.5) {
      // Old content blurring out: blur goes 0 → 1 over [0, 0.5]
      const blurAmount = p / 0.5;
      const brightness = Math.round(200 * (1 - blurAmount * 0.5));
      line = renderCells(oldPadded, (text) => blurCharWithColor(text, blurAmount, brightness));
    } else {
      // New content de-blurring: blur goes 1 → 0 over [0.5, 1]
      const blurAmount = 1 - (p - 0.5) / 0.5;
      const brightness = Math.round(200 * (1 - blurAmount * 0.5));
      line = renderCells(newPadded, (text) => blurCharWithColor(text, blurAmount, brightness));
    }

    resultLines.push(line + RESET);
  }

  return resultLines.join('\n');
}
