import { toBidiVisual } from './bidi.js';
import { measureTextWidth, sliceTextByWidth, truncateText } from './grapheme.js';
import type { Direction } from './types.js';

export type CellTextAlign = 'left' | 'right' | 'center';

export interface CellTextOptions {
  ellipsis?: string;
}

export interface PadCellTextOptions extends CellTextOptions {
  align?: CellTextAlign;
}

export interface WrapCellTextOptions extends CellTextOptions {
  maxLines?: number;
  preserveWords?: boolean;
}

export interface DisplayLabelOptions extends PadCellTextOptions {
  width: number;
  baseDirection?: Direction;
  pad?: boolean;
}

export function truncateCellText(text: string, width: number, options: CellTextOptions = {}): string {
  return truncateText(text, width, options.ellipsis ?? '…');
}

export function padCellText(text: string, width: number, options: PadCellTextOptions = {}): string {
  const safeWidth = Math.max(0, Math.floor(width));
  const clipped = truncateCellText(text, safeWidth, options);
  const remaining = Math.max(0, safeWidth - measureTextWidth(clipped));

  switch (options.align ?? 'left') {
    case 'right':
      return `${' '.repeat(remaining)}${clipped}`;
    case 'center': {
      const left = Math.floor(remaining / 2);
      const right = remaining - left;
      return `${' '.repeat(left)}${clipped}${' '.repeat(right)}`;
    }
    default:
      return `${clipped}${' '.repeat(remaining)}`;
  }
}

export function centerCellText(text: string, width: number, options: CellTextOptions = {}): string {
  return padCellText(text, width, { ...options, align: 'center' });
}

function pushWrappedSegment(lines: string[], segment: string, width: number): void {
  let remaining = segment;
  while (measureTextWidth(remaining) > width) {
    const chunk = sliceTextByWidth(remaining, width);
    if (chunk.length === 0) break;
    lines.push(chunk);
    remaining = remaining.slice(chunk.length);
  }
  if (remaining.length > 0) {
    lines.push(remaining);
  }
}

export function wrapCellText(text: string, width: number, options: WrapCellTextOptions = {}): string[] {
  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth <= 0) return [];

  const preserveWords = options.preserveWords ?? true;
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    if (!preserveWords) {
      pushWrappedSegment(lines, paragraph, safeWidth);
      continue;
    }

    let current = '';
    for (const token of paragraph.match(/\S+\s*/g) ?? []) {
      const candidate = `${current}${token}`;
      if (measureTextWidth(candidate.trimEnd()) <= safeWidth) {
        current = candidate;
        continue;
      }

      if (current.trimEnd().length > 0) {
        lines.push(current.trimEnd());
        current = '';
      }

      if (measureTextWidth(token.trimEnd()) > safeWidth) {
        pushWrappedSegment(lines, token.trimEnd(), safeWidth);
      } else {
        current = token;
      }
    }

    if (current.trimEnd().length > 0) {
      lines.push(current.trimEnd());
    }
  }

  if (options.maxLines !== undefined && lines.length > options.maxLines) {
    const maxLines = Math.max(0, Math.floor(options.maxLines));
    if (maxLines === 0) return [];
    const clipped = lines.slice(0, maxLines);
    const marker = options.ellipsis ?? '…';
    clipped[maxLines - 1] = truncateCellText(`${clipped[maxLines - 1]!}${marker}`, safeWidth, options);
    return clipped;
  }

  return lines;
}

export function formatDisplayLabel(text: string, options: DisplayLabelOptions): string {
  const visual = toBidiVisual(text, options.baseDirection ?? 'auto');
  const clipped = truncateCellText(visual, options.width, options);
  return options.pad ? padCellText(clipped, options.width, options) : clipped;
}
