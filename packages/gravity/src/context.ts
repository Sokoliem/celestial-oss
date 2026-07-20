import type { TerminalSize } from './types.js';

let overrideSize: TerminalSize | null = null;

export function getTerminalSize(): TerminalSize {
  if (overrideSize) return overrideSize;
  return {
    cols: process.stdout?.columns ?? 80,
    rows: process.stdout?.rows ?? 24,
  };
}

export function setTerminalSize(size: TerminalSize | null): void;
export function setTerminalSize(cols: number, rows: number): void;
export function setTerminalSize(sizeOrCols: TerminalSize | number | null, rows?: number): void {
  if (typeof sizeOrCols === 'number') {
    overrideSize = { cols: sizeOrCols, rows: rows ?? 24 };
    return;
  }
  overrideSize = sizeOrCols;
}
