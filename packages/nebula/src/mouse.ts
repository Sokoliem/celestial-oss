/**
 * Mouse event parsing for terminal mouse protocols.
 *
 * Supports two protocols:
 * - SGR 1006 extended: ESC [ < Cb ; Cx ; Cy M/m  (preferred, used on Linux/macOS)
 * - X11 normal:        ESC [ M Cb Cx Cy           (fallback, used on Windows Terminal)
 *
 * Windows Terminal does not support SGR 1006, but does support X11 normal
 * mouse encoding (mode 1000). The enable sequence adapts based on platform.
 */

import type { MouseEventData } from './types.js';
import type { MouseHandler } from './vdom.js';

/**
 * Parse a mouse escape sequence from stdin data.
 * Tries SGR 1006 first (ASCII-safe), falls back to X11 normal encoding.
 */
export function parseMouseInput(data: string): MouseEventData | null {
  return parseSGR1006(data) ?? parseX11Normal(data);
}

/**
 * Parse mouse input from a raw Buffer.
 * Tries SGR 1006 from the string representation (all ASCII, UTF-8 safe),
 * then falls back to X11 normal from raw bytes (avoids UTF-8 corruption
 * of coordinates > 94 which encode as bytes > 127).
 */
export function parseMouseInputFromBuffer(data: Buffer): MouseEventData | null {
  // SGR 1006 is all ASCII — safe to parse from UTF-8 string
  const str = data.toString('utf8');
  const sgr = parseSGR1006(str);
  if (sgr) return sgr;

  // X11 normal: parse from raw buffer bytes to avoid UTF-8 corruption
  return parseX11NormalFromBuffer(data);
}

/** Parse SGR 1006 extended mouse: ESC [ < Cb ; Cx ; Cy M/m */
function parseSGR1006(data: string): MouseEventData | null {
  const match = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(data);
  if (!match) return null;

  const rawButton = parseInt(match[1]!, 10);
  const rawX = parseInt(match[2]!, 10);
  const rawY = parseInt(match[3]!, 10);
  const suffix = match[4]!;

  if (Number.isNaN(rawButton) || Number.isNaN(rawX) || Number.isNaN(rawY)) return null;

  return decodeMouseButton(rawButton, rawX - 1, rawY - 1, suffix === 'm');
}

/**
 * Parse X11 normal mouse encoding: ESC [ M Cb Cx Cy
 * Each of Cb, Cx, Cy is a single byte with value = 32 + actual_value.
 * This is the format Windows Terminal sends with mode 1000.
 */
function parseX11Normal(data: string): MouseEventData | null {
  // Look for ESC [ M followed by exactly 3 bytes
  const idx = data.indexOf('\x1b[M');
  if (idx === -1) return null;
  if (idx + 6 > data.length) return null;

  const cb = data.charCodeAt(idx + 3) - 32;
  const cx = data.charCodeAt(idx + 4) - 32;
  const cy = data.charCodeAt(idx + 5) - 32;

  if (Number.isNaN(cb) || Number.isNaN(cx) || Number.isNaN(cy)) return null;

  // X11 normal encoding: release is indicated by button code 3
  const isRelease = (cb & 3) === 3 && (cb & 64) === 0 && (cb & 32) === 0;

  return decodeMouseButton(cb, cx - 1, cy - 1, isRelease);
}

/**
 * Parse X11 normal mouse encoding from raw Buffer bytes.
 * Avoids UTF-8 corruption: reads coordinate bytes directly from the buffer
 * instead of going through string conversion which mangles bytes > 127.
 */
function parseX11NormalFromBuffer(data: Buffer): MouseEventData | null {
  // Look for ESC [ M (0x1b 0x5b 0x4d) followed by 3 bytes
  for (let i = 0; i <= data.length - 6; i++) {
    if (data[i] === 0x1b && data[i + 1] === 0x5b && data[i + 2] === 0x4d) {
      const cb = data[i + 3]! - 32;
      const cx = data[i + 4]! - 32;
      const cy = data[i + 5]! - 32;

      const isRelease = (cb & 3) === 3 && (cb & 64) === 0 && (cb & 32) === 0;
      return decodeMouseButton(cb, cx - 1, cy - 1, isRelease);
    }
  }
  return null;
}

/** Shared button/modifier decoding for both protocols */
function decodeMouseButton(rawButton: number, x: number, y: number, isRelease: boolean): MouseEventData {
  const shift = (rawButton & 4) !== 0;
  const alt = (rawButton & 8) !== 0;
  const ctrl = (rawButton & 16) !== 0;
  const baseButton = rawButton & ~(4 | 8 | 16);

  let type: MouseEventData['type'];
  let button: MouseEventData['button'];

  if (baseButton === 64) {
    type = 'scroll-up';
    button = 'none';
  } else if (baseButton === 65) {
    type = 'scroll-down';
    button = 'none';
  } else if (baseButton >= 32 && baseButton <= 35) {
    type = 'move';
    button = baseButton === 35 ? 'none' : ((baseButton - 32) as 0 | 1 | 2);
  } else if (baseButton === 3) {
    // X11 normal: button 3 = release (no button info)
    type = 'release';
    button = 0;
  } else if (baseButton >= 0 && baseButton <= 2) {
    type = isRelease ? 'release' : 'press';
    button = baseButton as 0 | 1 | 2;
  } else {
    type = 'press';
    button = 0;
  }

  return { type, button, x, y, ctrl, alt, shift };
}

/**
 * Mouse enable/disable sequences.
 *
 * SGR 1006 provides extended ASCII-based coordinates with no column limit.
 * X11 normal encoding (without 1006) limits coordinates to ~222 columns.
 *
 * Modern Windows Terminal supports SGR 1006, so we enable it everywhere.
 * The parser tries SGR 1006 first, then falls back to X11 normal from
 * raw buffer bytes for terminals that don't support SGR 1006.
 */

export const MOUSE_ENABLE = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';

export const MOUSE_DISABLE = '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l';

/**
 * Resolve a `MouseHandler` to the message tag that should fire for a given
 * mouse event. A plain `string` handler is treated as the `default` variant
 * (modifier-agnostic), preserving backwards compatibility for components
 * that don't care about Shift/Ctrl/Alt. Modifier-aware handlers are mapped
 * to their most specific matching variant; if none is declared the resolver
 * falls back to `default` so missing modifier wiring degrades to the base
 * action rather than silently dropping the click.
 */
export function resolveMouseHandler(handler: MouseHandler | undefined, ev: Pick<MouseEventData, 'shift' | 'ctrl' | 'alt'>): string | undefined {
  if (!handler) return undefined;
  if (typeof handler === 'string') return handler;
  if (ev.shift && ev.ctrl && ev.alt && handler.shiftCtrlAlt) return handler.shiftCtrlAlt;
  if (ev.shift && ev.ctrl && handler.shiftCtrl) return handler.shiftCtrl;
  if (ev.shift && ev.alt && handler.shiftAlt) return handler.shiftAlt;
  if (ev.ctrl && ev.alt && handler.ctrlAlt) return handler.ctrlAlt;
  if (ev.shift && handler.shift) return handler.shift;
  if (ev.ctrl && handler.ctrl) return handler.ctrl;
  if (ev.alt && handler.alt) return handler.alt;
  return handler.default;
}
