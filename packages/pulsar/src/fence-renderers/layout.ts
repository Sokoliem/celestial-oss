import { visualWidth } from '../renderer/width.js';
import { wrapText } from '../renderer/wrap.js';

export function normalizeFenceWidth(width: number): number {
  return Number.isFinite(width) ? Math.max(1, Math.min(100_000, Math.floor(width))) : 80;
}

export function wrapFenceLine(line: string, width: number, prefix = '  '): string[] {
  const safeWidth = normalizeFenceWidth(width);
  const safePrefix = visualWidth(prefix) < safeWidth ? prefix : '';
  const contentWidth = Math.max(1, safeWidth - visualWidth(safePrefix));
  return wrapText(line, contentWidth, safePrefix).split('\n');
}

export function wrapFenceBlock(block: string, width: number, prefix = '  '): string[] {
  return block.split('\n').flatMap((line) => wrapFenceLine(line, width, prefix));
}
