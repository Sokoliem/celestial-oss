/**
 * Extended event simulation for Telescope.
 *
 * Mouse events, terminal resize, and bracketed paste.
 */

import { keyToBuffer } from './keys.js';
import type { MockTerminal } from './mock-terminal.js';
import type { KeyModifiers, MouseEventOptions } from './types.js';

/**
 * Encode and send a mouse event to the terminal.
 * Uses SGR mouse encoding (CSI < Pb ; Px ; Py M/m).
 */
export function fireMouse(terminal: MockTerminal, options: MouseEventOptions): void {
  const { type, modifiers } = options;
  const row = mouseCoordinate(options.row, 'row');
  const col = mouseCoordinate(options.col, 'column');

  let button = 0;
  if (options.button === 'right') button = 2;
  else if (options.button === 'middle') button = 1;

  // Scroll events use button 64 (up) or 65 (down)
  if (type === 'scroll') {
    if (options.direction !== 'up' && options.direction !== 'down') {
      throw new Error('Mouse scroll events require a direction of "up" or "down".');
    }
    button = options.direction === 'down' ? 65 : 64;
  }

  // Motion flag
  if (type === 'move') {
    button = 32 + 3; // move with no button = 35
  }

  // Modifier flags
  if (modifiers?.shift) button += 4;
  if (modifiers?.alt) button += 8;
  if (modifiers?.ctrl) button += 16;

  // SGR encoding: CSI < button ; col+1 ; row+1 M (press) or m (release)
  const suffix = type === 'up' ? 'm' : 'M';
  const seq = `\x1b[<${button};${col + 1};${row + 1}${suffix}`;

  terminal.simulateInput(Buffer.from(seq, 'utf8'));
}

/**
 * Simulate a key press by sending the encoded escape sequence/input bytes.
 */
export function fireKey(terminal: MockTerminal, key: string, modifiers?: KeyModifiers): void {
  terminal.simulateInput(keyToBuffer(key, modifiers));
}

/**
 * Simulate a terminal resize event.
 */
export function fireResize(terminal: MockTerminal, cols: number, rows: number): void {
  terminal.simulateResize(cols, rows);
}

/**
 * Simulate a bracketed paste event.
 * Wraps content in the standard bracketed paste escape sequences.
 */
export function firePaste(terminal: MockTerminal, content: string): void {
  const pasteStart = '\x1b[200~';
  const pasteEnd = '\x1b[201~';
  const sequence = pasteStart + content + pasteEnd;
  terminal.simulateInput(Buffer.from(sequence, 'utf8'));
}

function mouseCoordinate(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Mouse ${label} must be a non-negative finite number.`);
  return Math.floor(value);
}
