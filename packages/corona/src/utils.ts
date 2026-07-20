/**
 * Corona Shared Utilities
 *
 * Canonical implementations of stripAnsi and visualWidth used across
 * style.ts, layout.ts, and border.ts. Having a single source of truth
 * prevents divergent ANSI-stripping behavior.
 */

import { stringWidth } from './unicode-width.js';

/** Strip ANSI escape sequences (all CSI sequences, all OSC sequences) */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // All OSC sequences
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); // All CSI sequences
}

/** Measure visual width of string (ignoring ANSI codes) */
export function visualWidth(str: string): number {
  return stringWidth(stripAnsi(str));
}
