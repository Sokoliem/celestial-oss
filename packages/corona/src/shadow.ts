import { type Color, color as colorNs } from './color.js';
import { visualWidth } from './utils.js';

export interface ShadowOpts {
  offsetX?: number;
  offsetY?: number;
  color?: Color;
  style?: 'solid' | 'fade';
}

function clampOffset(value: number | undefined): number {
  return Math.max(0, Math.floor(value ?? 1));
}

function applyColor(char: string, color: Color): string {
  return `${color.fg()}${char}\x1b[39m`;
}

function shadowChar(depth: number, maxDepth: number, style: NonNullable<ShadowOpts['style']>): string {
  if (style === 'solid') {
    return '▒';
  }

  if (maxDepth <= 1) {
    return '▒';
  }

  const ratio = depth / maxDepth;
  if (ratio <= 0.34) return '▓';
  if (ratio <= 0.67) return '▒';
  return '░';
}

function shadowSpan(length: number, depth: number, maxDepth: number, color: Color, style: NonNullable<ShadowOpts['style']>): string {
  let result = '';
  for (let index = 0; index < length; index++) {
    result += applyColor(shadowChar(depth, maxDepth, style), color);
  }
  return result;
}

export function renderShadow(content: string, opts: ShadowOpts = {}): string {
  const offsetX = clampOffset(opts.offsetX);
  const offsetY = clampOffset(opts.offsetY);
  const shadowColor = opts.color ?? colorNs.gray;
  const style = opts.style ?? 'solid';

  if (offsetX === 0 && offsetY === 0) {
    return content;
  }

  const lines = content.split('\n');
  const width = Math.max(...lines.map((line) => visualWidth(line)));
  const maxDepth = Math.max(offsetX, offsetY, 1);
  const output: string[] = [];

  for (const line of lines) {
    const pad = Math.max(0, width - visualWidth(line));
    const rightShadow =
      offsetX > 0 ? Array.from({ length: offsetX }, (_, index) => applyColor(shadowChar(index + 1, maxDepth, style), shadowColor)).join('') : '';
    output.push(line + ' '.repeat(pad) + rightShadow);
  }

  for (let row = 0; row < offsetY; row++) {
    output.push(' '.repeat(offsetX) + shadowSpan(width, row + 1, maxDepth, shadowColor, style));
  }

  return output.join('\n');
}
