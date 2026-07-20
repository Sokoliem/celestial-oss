import { padPlain, slicePlain, visibleLength } from './text.js';

export type FlipAxis = 'horizontal' | 'vertical';

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function splitLines(content: string): string[] {
  if (content === '') return [''];
  return content.split('\n');
}

function blankLine(width: number): string {
  return ' '.repeat(Math.max(0, width));
}

function centerSlice(line: string, visibleWidth: number, totalWidth: number): string {
  const start = Math.max(0, Math.floor((totalWidth - visibleWidth) / 2));
  const end = start + visibleWidth;
  return blankLine(start) + slicePlain(line, start, end) + blankLine(Math.max(0, totalWidth - end));
}

function edgeFrameHorizontal(lines: string[], width: number): string {
  const center = Math.max(0, Math.floor(width / 2));
  return lines
    .map(() => {
      if (width <= 0) return '│';
      return blankLine(center) + '│' + blankLine(Math.max(0, width - center - 1));
    })
    .join('\n');
}

function edgeFrameVertical(height: number, width: number): string {
  const centerRow = Math.max(0, Math.floor(height / 2));
  const edge = width > 0 ? '─'.repeat(width) : '─';

  return Array.from({ length: height }, (_, index) => (index === centerRow ? edge : blankLine(Math.max(1, width)))).join('\n');
}

function flipHorizontal(oldContent: string, newContent: string, progress: number): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const lineCount = Math.max(oldLines.length, newLines.length);
  const width = Math.max(
    ...Array.from({ length: lineCount }, (_, index) => Math.max(visibleLength(oldLines[index] ?? ''), visibleLength(newLines[index] ?? ''))),
  );

  if (Math.abs(progress - 0.5) < 1e-9) {
    return edgeFrameHorizontal(
      Array.from({ length: lineCount }, () => ''),
      Math.max(1, width),
    );
  }

  const showingOld = progress < 0.5;
  const visibleFraction = showingOld ? 1 - progress * 2 : (progress - 0.5) * 2;
  const visibleWidth = Math.max(1, Math.round(Math.max(1, width) * visibleFraction));
  const sourceLines = showingOld ? oldLines : newLines;

  return Array.from({ length: lineCount }, (_, index) => {
    const plain = padPlain(sourceLines[index] ?? '', width);
    return centerSlice(plain, Math.min(width, visibleWidth), width);
  }).join('\n');
}

function flipVertical(oldContent: string, newContent: string, progress: number): string {
  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  const height = Math.max(oldLines.length, newLines.length);
  const width = Math.max(...Array.from({ length: height }, (_, index) => Math.max(visibleLength(oldLines[index] ?? ''), visibleLength(newLines[index] ?? ''))));

  if (Math.abs(progress - 0.5) < 1e-9) {
    return edgeFrameVertical(Math.max(1, height), Math.max(1, width));
  }

  const showingOld = progress < 0.5;
  const visibleFraction = showingOld ? 1 - progress * 2 : (progress - 0.5) * 2;
  const visibleHeight = Math.max(1, Math.round(Math.max(1, height) * visibleFraction));
  const sourceLines = showingOld ? oldLines : newLines;
  const output = Array.from({ length: height }, () => blankLine(width));
  const start = Math.max(0, Math.floor((height - visibleHeight) / 2));

  for (let row = 0; row < visibleHeight; row++) {
    output[start + row] = padPlain(sourceLines[start + row] ?? '', width);
  }

  return output.join('\n');
}

export function flip(oldContent: string, newContent: string, progress: number, axis: FlipAxis = 'horizontal'): string {
  const p = clamp(progress);

  if (p <= 0) return oldContent;
  if (p >= 1) return newContent;

  if (axis === 'vertical') {
    return flipVertical(oldContent, newContent, p);
  }

  return flipHorizontal(oldContent, newContent, p);
}
