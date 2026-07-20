/**
 * Corona Terminal Detection
 *
 * Utilities for detecting terminal capabilities: background color (dark/light),
 * color support, TTY status, and terminal dimensions.
 */

import * as process from 'node:process';
import * as tty from 'node:tty';

export type BackgroundMode = 'dark' | 'light' | 'unknown';

/**
 * Detect whether the terminal has a dark or light background.
 *
 * Uses multiple heuristics:
 * 1. COLORFGBG environment variable (e.g., "15;0" means light fg on dark bg)
 * 2. TERMINAL_EMULATOR / TERM_PROGRAM hints
 * 3. Falls back to 'dark' as the most common default
 *
 * Note: OSC 11 query requires async terminal I/O and is best done at app startup.
 * This synchronous version uses environment heuristics only.
 */
export function detectBackground(): BackgroundMode {
  // COLORFGBG is set by some terminals (rxvt, etc.)
  // Format: "fg;bg" where bg < 7 typically means dark
  const colorfgbg = process.env['COLORFGBG'];
  if (colorfgbg) {
    const parts = colorfgbg.split(';');
    const bg = parseInt(parts[parts.length - 1] ?? '', 10);
    if (!Number.isNaN(bg)) {
      return bg < 7 ? 'dark' : 'light';
    }
  }

  // Some terminals set this
  if (process.env['TERMINAL_DARK'] === '1') return 'dark';
  if (process.env['TERMINAL_DARK'] === '0') return 'light';

  return 'unknown';
}

/**
 * Async terminal background detection using OSC 11.
 *
 * Sends the OSC 11 query escape sequence to the terminal and parses
 * the response to determine background luminance.
 * Falls back to heuristic detection on timeout or error.
 */
export function detectBackgroundAsync(timeoutMs: number = 200): Promise<BackgroundMode> {
  // First try sync detection
  const sync = detectBackground();
  if (sync !== 'unknown') return Promise.resolve(sync);

  // Only attempt OSC 11 if we have a TTY
  if (!isTTY()) return Promise.resolve('unknown');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve('unknown');
    }, timeoutMs);

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    function cleanup() {
      clearTimeout(timeout);
      stdin.removeListener('data', onData);
      if (stdin.isTTY && wasRaw !== undefined) {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
    }

    function onData(data: Buffer) {
      const str = data.toString();
      // OSC 11 response: \x1b]11;rgb:RRRR/GGGG/BBBB\x1b\\
      const match = str.match(/\x1b\]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i);
      if (match) {
        const r = parseInt(match[1]!.slice(0, 2), 16);
        const g = parseInt(match[2]!.slice(0, 2), 16);
        const b = parseInt(match[3]!.slice(0, 2), 16);
        // Calculate perceived luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        cleanup();
        resolve(luminance < 128 ? 'dark' : 'light');
      }
    }

    try {
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.on('data', onData);
      // Send OSC 11 query
      process.stdout.write('\x1b]11;?\x07');
    } catch {
      cleanup();
      resolve('unknown');
    }
  });
}

/**
 * Whether color output is supported.
 * Respects NO_COLOR (https://no-color.org/) and FORCE_COLOR.
 */
export function supportsColor(): boolean {
  // NO_COLOR takes precedence (https://no-color.org/)
  if ('NO_COLOR' in process.env) return false;

  // FORCE_COLOR forces color on
  if ('FORCE_COLOR' in process.env) {
    const val = process.env['FORCE_COLOR'];
    return val !== '0';
  }

  // Check if stdout is a TTY
  if (!isTTY()) return false;

  // Check TERM
  const term = process.env['TERM'] ?? '';
  if (term === 'dumb') return false;

  return true;
}

/** Whether stdout is connected to a TTY */
export function isTTY(): boolean {
  return tty.isatty(1);
}

/** Get the terminal width in columns (default: 80) */
export function terminalWidth(): number {
  if (process.stdout.columns) return process.stdout.columns;
  return 80;
}

/** Get the terminal height in rows (default: 24) */
export function terminalHeight(): number {
  if (process.stdout.rows) return process.stdout.rows;
  return 24;
}
