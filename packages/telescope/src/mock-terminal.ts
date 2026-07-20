/**
 * MockTerminal — a test-friendly implementation of TerminalBackend.
 *
 * Captures all writes to a buffer and allows simulating input events
 * without a real terminal.
 */

import type { TerminalBackend } from '@celestial/core/nebula';

export interface MockTerminalOptions {
  /** Terminal width in columns (default 80) */
  cols?: number;
  /** Terminal height in rows (default 24) */
  rows?: number;
}

export class MockTerminal implements TerminalBackend {
  /** All raw output written by the app (including ANSI sequences) */
  readonly writes: string[] = [];

  private _cols: number;
  private _rows: number;
  private _rawMode = false;
  private _inputHandlers: Array<(data: Buffer) => void> = [];
  private _resizeHandlers: Array<() => void> = [];

  constructor(options?: MockTerminalOptions) {
    this._cols = options?.cols ?? 80;
    this._rows = options?.rows ?? 24;
  }

  enterRawMode(): void {
    this._rawMode = true;
  }

  exitRawMode(): void {
    this._rawMode = false;
  }

  get isRawMode(): boolean {
    return this._rawMode;
  }

  write(data: string): void {
    this.writes.push(data);
  }

  onInput(handler: (data: Buffer) => void): void {
    this._inputHandlers.push(handler);
  }

  offInput(handler: (data: Buffer) => void): void {
    const idx = this._inputHandlers.indexOf(handler);
    if (idx !== -1) {
      this._inputHandlers.splice(idx, 1);
    }
  }

  onResize(handler: () => void): void {
    this._resizeHandlers.push(handler);
  }

  offResize(handler: () => void): void {
    const idx = this._resizeHandlers.indexOf(handler);
    if (idx !== -1) {
      this._resizeHandlers.splice(idx, 1);
    }
  }

  getSize(): { cols: number; rows: number } {
    return { cols: this._cols, rows: this._rows };
  }

  // ── Test helpers ─────────────────────────────────────────────────────

  /** Simulate raw input data being received (as if typed on stdin) */
  simulateInput(data: Buffer): void {
    for (const handler of this._inputHandlers) {
      handler(data);
    }
  }

  /** Simulate a terminal resize event */
  simulateResize(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    for (const handler of this._resizeHandlers) {
      handler();
    }
  }

  /** Get all written output concatenated as a single string */
  get output(): string {
    return this.writes.join('');
  }

  /** Strip ANSI escape sequences from all output */
  get plainOutput(): string {
    return stripAnsi(this.output);
  }

  /** Clear the write buffer */
  clearOutput(): void {
    this.writes.length = 0;
  }
}

/** Strip ANSI escape sequences (SGR, CSI, OSC) from a string */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[[?][0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][AB012]/g, '');
}
