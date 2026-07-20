import type { TerminalSize } from './types.js';

const DEFAULT_SIZE: TerminalSize = { cols: 80, rows: 24 };
let sizeOverride: TerminalSize | null = null;

export function getTerminalSize(): TerminalSize {
  if (sizeOverride) return sizeOverride;
  const stdout = typeof process !== 'undefined' ? process.stdout : undefined;
  return {
    cols: stdout?.columns ?? DEFAULT_SIZE.cols,
    rows: stdout?.rows ?? DEFAULT_SIZE.rows,
  };
}

export function setTerminalSizeOverride(size: TerminalSize | null): void {
  sizeOverride = size;
}

export function onResize(cb: (size: TerminalSize) => void): () => void {
  const handler = (): void => {
    cb(getTerminalSize());
  };
  const stdout = typeof process !== 'undefined' ? process.stdout : undefined;
  stdout?.on?.('resize', handler);
  return () => {
    stdout?.removeListener?.('resize', handler);
  };
}
