import { graphemeLength, graphemeSlice, segmentGraphemes } from '@celestial/rosetta';
import { stripAnsi } from '../fade.js';

export function plainGraphemes(content: string): string[] {
  return segmentGraphemes(stripAnsi(content));
}

export function visibleLength(content: string): number {
  return graphemeLength(stripAnsi(content));
}

export function padGraphemes(content: string, width: number): string[] {
  const chars = plainGraphemes(content).slice(0, width);
  while (chars.length < width) chars.push(' ');
  return chars;
}

export function padPlain(content: string, width: number): string {
  return padGraphemes(content, width).join('');
}

export function slicePlain(content: string, start: number, end?: number): string {
  return graphemeSlice(stripAnsi(content), start, end);
}
