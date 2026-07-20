import type { TerminalSize } from './types.js';

let overrideSize: TerminalSize | null = null;

function normalizeDimension(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return Math.max(0, Math.floor(value));
}

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
    overrideSize = { cols: normalizeDimension(sizeOrCols, 'cols'), rows: normalizeDimension(rows ?? 24, 'rows') };
    return;
  }
  overrideSize = sizeOrCols ? { cols: normalizeDimension(sizeOrCols.cols, 'cols'), rows: normalizeDimension(sizeOrCols.rows, 'rows') } : null;
}
