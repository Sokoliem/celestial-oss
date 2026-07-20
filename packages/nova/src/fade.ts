/**
 * True color text fading utilities.
 *
 * Provides smooth per-character opacity simulation using 24-bit ANSI
 * true color codes. Unlike the binary DIM attribute (\x1b[2m), this
 * interpolates each character's brightness continuously from fully
 * visible (opacity=1) to invisible (opacity=0, black on black).
 *
 * Color-aware utilities (parseStyledChars, fadeStyledChar) preserve
 * existing ANSI color codes by parsing them per character and modulating
 * the original RGB values rather than replacing them with grayscale.
 */

import { sanitizeTerminalText, stripAnsi as stripTerminalFormatting, tokenizeTerminalText } from '@celestial/corona';
import { segmentGraphemes } from '@celestial/rosetta';

const RESET = '\x1b[0m';

/** Strip all ANSI escape sequences from a string */
function stripAnsi(str: string): string {
  return stripTerminalFormatting(sanitizeTerminalText(str, { allowSgr: true, allowHyperlinks: false, controlPolicy: 'strip' }));
}

/**
 * A character with its associated ANSI styling prefix preserved.
 * `ansi` is the accumulated ANSI codes preceding this character (may be empty).
 * `char` is the visible character itself.
 * `plain` is just the character (same as `char`), for easy comparison.
 */
export interface StyledChar {
  ansi: string;
  char: string;
  plain: string;
}

/**
 * Parse a styled string into an array of StyledChar, one per visible character.
 * ANSI escape sequences are accumulated and attached to the next visible character.
 * This preserves color information so it can be modulated rather than destroyed.
 */
export function parseStyledChars(text: string): StyledChar[] {
  const result: StyledChar[] = [];
  let pendingAnsi = '';

  const safeText = sanitizeTerminalText(text, { allowSgr: true, allowHyperlinks: false, controlPolicy: 'strip' });
  for (const token of tokenizeTerminalText(safeText)) {
    if (token.kind === 'sgr') {
      pendingAnsi += token.value;
      continue;
    }
    if (token.kind !== 'text') continue;
    for (const ch of segmentGraphemes(token.value)) {
      result.push({ ansi: pendingAnsi, char: ch, plain: ch });
      pendingAnsi = '';
    }
  }

  return result;
}

/**
 * Extract the RGB values from a true color ANSI foreground code.
 * Matches \x1b[38;2;R;G;Bm. Returns null if not found.
 */
function extractTrueColorFg(ansi: string): { r: number; g: number; b: number } | null {
  // eslint-disable-next-line no-control-regex
  const m = ansi.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  if (!m) return null;
  return { r: parseInt(m[1]!, 10), g: parseInt(m[2]!, 10), b: parseInt(m[3]!, 10) };
}

/**
 * Extract the 256-color ANSI foreground code value.
 * Matches \x1b[38;5;Nm. Returns null if not found.
 */
function extract256ColorFg(ansi: string): number | null {
  // eslint-disable-next-line no-control-regex
  const m = ansi.match(/\x1b\[38;5;(\d+)m/);
  if (!m) return null;
  return parseInt(m[1]!, 10);
}

/**
 * Convert a 256-color index to approximate RGB.
 */
function color256ToRgb(n: number): { r: number; g: number; b: number } {
  if (n < 16) {
    // Standard colors — approximate
    const table: [number, number, number][] = [
      [0, 0, 0],
      [128, 0, 0],
      [0, 128, 0],
      [128, 128, 0],
      [0, 0, 128],
      [128, 0, 128],
      [0, 128, 128],
      [192, 192, 192],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [255, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 255],
    ];
    const [r, g, b] = table[n] ?? [200, 200, 200];
    return { r, g, b };
  }
  if (n < 232) {
    // 216-color cube: 6x6x6
    const idx = n - 16;
    const b = (idx % 6) * 51;
    const g = (Math.floor(idx / 6) % 6) * 51;
    const r = Math.floor(idx / 36) * 51;
    return { r, g, b };
  }
  // Grayscale ramp: 232-255 → 8-238
  const gray = 8 + (n - 232) * 10;
  return { r: gray, g: gray, b: gray };
}

/**
 * Extract basic ANSI foreground color (30-37, 90-97) as approximate RGB.
 */
function extractBasicFg(ansi: string): { r: number; g: number; b: number } | null {
  // eslint-disable-next-line no-control-regex
  const m = ansi.match(/\x1b\[(3[0-7]|9[0-7])m/);
  if (!m) return null;
  const code = parseInt(m[1]!, 10);
  // Map to 256-color index: 30-37 → 0-7, 90-97 → 8-15
  const idx = code >= 90 ? code - 90 + 8 : code - 30;
  return color256ToRgb(idx);
}

/**
 * Best-effort extraction of the foreground color from an ANSI string.
 * Tries true color first, then 256-color, then basic color codes.
 * Returns null if no foreground color is found.
 */
function extractFgColor(ansi: string): { r: number; g: number; b: number } | null {
  return (
    extractTrueColorFg(ansi) ??
    (() => {
      const n = extract256ColorFg(ansi);
      if (n !== null) return color256ToRgb(n);
      return extractBasicFg(ansi);
    })()
  );
}

/**
 * Fade a styled character by modulating its original color with an opacity.
 *
 * Unlike `fadeChar`, this preserves the character's original hue. At opacity=1,
 * the original color is passed through unchanged. At opacity=0, the color
 * becomes black (invisible on dark terminals). In between, each RGB channel
 * is scaled proportionally.
 *
 * If the character has no detectable color, falls back to grayscale (matching
 * the original `fadeChar` behavior).
 *
 * At opacity=1 with styling present, returns the character with its original
 * ANSI codes completely unchanged (no re-encoding).
 */
export function fadeStyledChar(sc: StyledChar, opacity: number): string {
  if (sc.char === ' ' || sc.char === '') return sc.char;

  const clamped = Math.max(0, Math.min(1, opacity));

  // At full opacity, pass through the original styling unchanged
  if (clamped >= 1) {
    return sc.ansi ? sc.ansi + sc.char : sc.char;
  }

  // Try to extract the original foreground color from the ANSI prefix
  const fg = sc.ansi ? extractFgColor(sc.ansi) : null;

  if (fg) {
    // Modulate the original color channels by opacity
    const r = Math.round(fg.r * clamped);
    const g = Math.round(fg.g * clamped);
    const b = Math.round(fg.b * clamped);
    return `\x1b[38;2;${r};${g};${b}m${sc.char}`;
  }

  // No color found — fall back to grayscale (default terminal foreground)
  const brightness = Math.round(clamped * 200);
  return `\x1b[38;2;${brightness};${brightness};${brightness}m${sc.char}`;
}

/**
 * Apply opacity to a single character, returning it with a true color
 * foreground code. opacity=1 is full brightness (gray 200), opacity=0
 * is black (invisible on dark terminals).
 *
 * NOTE: This strips all existing color information. For color-preserving
 * fades, use `fadeStyledChar` with `parseStyledChars` instead.
 */
export function fadeChar(char: string, opacity: number): string {
  if (char === ' ' || char === '') return char;
  const clamped = Math.max(0, Math.min(1, opacity));
  const brightness = Math.round(clamped * 200);
  return `\x1b[38;2;${brightness};${brightness};${brightness}m${char}`;
}

/**
 * Apply opacity fade to an entire text string (supports multi-line).
 * Strips all existing ANSI codes and re-applies per-character true color
 * based on the opacity value.
 *
 * @param text - Text to fade (may contain ANSI codes and newlines)
 * @param opacity - 0.0 (invisible) to 1.0 (full brightness)
 * @returns Faded text with true color ANSI codes + reset at end
 */
export function fadeText(text: string, opacity: number): string {
  if (opacity >= 1) {
    // Full brightness — return with a neutral bright color to override any existing styling
    const plain = stripAnsi(text);
    const brightness = 200;
    return `\x1b[38;2;${brightness};${brightness};${brightness}m${plain}${RESET}`;
  }
  if (opacity <= 0) {
    // Fully invisible — all characters become black
    const plain = stripAnsi(text);
    let result = '';
    for (const ch of segmentGraphemes(plain)) {
      result += ch === '\n' ? '\n' : '\x1b[38;2;0;0;0m' + ch;
    }
    return result + RESET;
  }

  const plain = stripAnsi(text);
  let result = '';
  const brightness = Math.round(Math.max(0, Math.min(1, opacity)) * 200);
  const colorCode = `\x1b[38;2;${brightness};${brightness};${brightness}m`;

  for (const ch of segmentGraphemes(plain)) {
    if (ch === '\n') {
      result += '\n';
    } else {
      result += colorCode + ch;
    }
  }

  return result + RESET;
}

/**
 * Apply per-character fade to a line where each character can have a
 * different opacity. Used for feathered wipe edges.
 *
 * @param line - Single line of text (no newlines)
 * @param opacities - Array of opacity values, one per visible character
 * @returns Faded line with per-character true color codes
 */
export function fadeLinePerChar(line: string, opacities: number[]): string {
  const plain = stripAnsi(line);
  const chars = segmentGraphemes(plain);
  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const opacity = opacities[i] ?? 1;
    result += fadeChar(ch, opacity);
  }
  return result + RESET;
}

export { stripAnsi };
