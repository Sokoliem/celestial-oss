/**
 * ANSI-preserving, grapheme-aware word wrapping for terminal Markdown.
 *
 * Text is laid out in terminal cells while source offsets remain UTF-16
 * indices, matching the positions returned by `extractAnsiCodes`. Long words
 * are split only at grapheme boundaries, so a narrow resize cannot drop the
 * final character or bisect an emoji/combining sequence.
 */

import { segmentGraphemes } from '@celestial/rosetta';
import { type AnsiSpan, extractAnsiCodes, hyperlinkCloseCode } from './ansi.js';
import { visualWidth } from './width.js';

interface Segment {
  readonly text: string;
  readonly start: number;
}

interface ControlState {
  readonly activeStyles: Map<string, string>;
  activeHyperlink: { open: string; close: string } | null;
  readonly pendingControls: string[];
}

const MAX_WRAP_WIDTH = 1_000_000;

function normalizeWidth(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  return Math.min(MAX_WRAP_WIDTH, Math.max(1, Math.floor(width)));
}

function splitWord(segment: Segment, width: number): Segment[] {
  const chunks: Segment[] = [];
  let text = '';
  let start = segment.start;
  let sourceOffset = segment.start;
  let cellWidth = 0;

  for (const grapheme of segmentGraphemes(segment.text)) {
    const graphemeWidth = visualWidth(grapheme);
    if (text.length > 0 && cellWidth + graphemeWidth > width) {
      chunks.push({ text, start });
      text = '';
      start = sourceOffset;
      cellWidth = 0;
    }

    text += grapheme;
    sourceOffset += grapheme.length;
    cellWidth += graphemeWidth;

    // A single wide grapheme may exceed an extremely narrow budget. It is
    // indivisible, so emit it intact on its own line.
    if (cellWidth >= width) {
      chunks.push({ text, start });
      text = '';
      start = sourceOffset;
      cellWidth = 0;
    }
  }

  if (text.length > 0) chunks.push({ text, start });
  return chunks;
}

function layoutLines(plain: string, width: number): Segment[][] {
  const lines: Segment[][] = [];
  let current: Segment[] = [];
  let currentWidth = 0;
  let pendingSpace: Segment | null = null;

  const flush = (): void => {
    if (current.length > 0) lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const match of plain.matchAll(/\s+|\S+/gu)) {
    const segment: Segment = { text: match[0], start: match.index };
    if (/^\s+$/u.test(segment.text)) {
      if (current.length > 0) pendingSpace = segment;
      continue;
    }

    const wordWidth = visualWidth(segment.text);
    const spaceWidth = pendingSpace ? visualWidth(pendingSpace.text) : 0;
    if (wordWidth <= width) {
      if (current.length > 0 && currentWidth + spaceWidth + wordWidth > width) flush();
      if (current.length > 0 && pendingSpace) {
        current.push(pendingSpace);
        currentWidth += spaceWidth;
      }
      current.push(segment);
      currentWidth += wordWidth;
      pendingSpace = null;
      continue;
    }

    flush();
    const chunks = splitWord(segment, width);
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      if (index < chunks.length - 1) {
        lines.push([chunk]);
      } else {
        current = [chunk];
        currentWidth = visualWidth(chunk.text);
      }
    }
    pendingSpace = null;
  }

  flush();
  return lines;
}

function updateSgrState(code: string, state: ControlState): void {
  const raw = code.slice(2, -1);
  const params = (raw.length === 0 ? [0] : raw.split(';').map(Number)).map((value) => (Number.isFinite(value) ? value : 0));

  const set = (key: string, values: readonly number[]): void => {
    state.activeStyles.set(key, `\x1b[${values.join(';')}m`);
  };

  for (let index = 0; index < params.length; index++) {
    const value = params[index]!;
    if (value === 0) {
      state.activeStyles.clear();
    } else if (value === 1) {
      set('bold', [value]);
    } else if (value === 2) {
      set('dim', [value]);
    } else if (value === 22) {
      state.activeStyles.delete('bold');
      state.activeStyles.delete('dim');
    } else if (value === 3 || value === 23) {
      value === 3 ? set('italic', [value]) : state.activeStyles.delete('italic');
    } else if (value === 4 || value === 21) {
      set('underline', [value]);
    } else if (value === 24) {
      state.activeStyles.delete('underline');
    } else if (value === 5 || value === 6) {
      set('blink', [value]);
    } else if (value === 25) {
      state.activeStyles.delete('blink');
    } else if (value === 7 || value === 27) {
      value === 7 ? set('inverse', [value]) : state.activeStyles.delete('inverse');
    } else if (value === 8 || value === 28) {
      value === 8 ? set('hidden', [value]) : state.activeStyles.delete('hidden');
    } else if (value === 9 || value === 29) {
      value === 9 ? set('strike', [value]) : state.activeStyles.delete('strike');
    } else if ((value >= 30 && value <= 37) || (value >= 90 && value <= 97)) {
      set('foreground', [value]);
    } else if (value === 39) {
      state.activeStyles.delete('foreground');
    } else if ((value >= 40 && value <= 47) || (value >= 100 && value <= 107)) {
      set('background', [value]);
    } else if (value === 49) {
      state.activeStyles.delete('background');
    } else if (value === 38 || value === 48 || value === 58) {
      const mode = params[index + 1];
      const count = mode === 2 ? 5 : mode === 5 ? 3 : 1;
      const values = params.slice(index, index + count);
      set(value === 38 ? 'foreground' : value === 48 ? 'background' : 'underline-color', values);
      index += Math.max(0, values.length - 1);
    } else if (value === 59) {
      state.activeStyles.delete('underline-color');
    } else if (value === 53 || value === 55) {
      value === 53 ? set('overline', [value]) : state.activeStyles.delete('overline');
    } else {
      set(`sgr-${value}`, [value]);
    }
  }
}

function applyControlSpan(result: string, span: AnsiSpan, state: ControlState, emit: boolean): string {
  if (emit) result += span.code;
  switch (span.kind) {
    case 'sgr':
      updateSgrState(span.code, state);
      break;
    case 'osc-open':
      state.activeHyperlink = { open: span.code, close: hyperlinkCloseCode(span.code) };
      break;
    case 'osc-close':
      state.activeHyperlink = null;
      break;
    case 'osc-other':
    default:
      if (!emit) state.pendingControls.push(span.code);
      break;
  }
  return result;
}

/** Word-wrap text to a given cell width while preserving ANSI state. */
export function wrapText(text: string, width: number, prefix: string): string {
  const safeWidth = normalizeWidth(width);
  if (safeWidth === null) return prefix + text;

  const { plain, spans } = extractAnsiCodes(text);
  if (visualWidth(plain) <= safeWidth) return prefix + text;

  const lines = layoutLines(plain, safeWidth);
  if (lines.length === 0) return prefix;

  const state: ControlState = { activeStyles: new Map(), activeHyperlink: null, pendingControls: [] };
  const wrapped: string[] = [];
  let spanIndex = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const segments = lines[lineIndex]!;
    const firstStart = segments[0]!.start;
    while (spanIndex < spans.length && spans[spanIndex]!.index < firstStart) {
      applyControlSpan('', spans[spanIndex]!, state, false);
      spanIndex++;
    }

    let output = state.pendingControls.splice(0).join('');
    if (state.activeHyperlink) output += state.activeHyperlink.open;
    output += [...state.activeStyles.values()].join('');

    let lineEnd = firstStart;
    for (const segment of segments) {
      let sourceOffset = segment.start;
      for (const grapheme of segmentGraphemes(segment.text)) {
        while (spanIndex < spans.length && spans[spanIndex]!.index === sourceOffset) {
          output = applyControlSpan(output, spans[spanIndex]!, state, true);
          spanIndex++;
        }
        output += grapheme;
        sourceOffset += grapheme.length;
      }
      lineEnd = sourceOffset;
    }

    const nextStart = lines[lineIndex + 1]?.[0]?.start;
    if (nextStart === undefined) {
      while (spanIndex < spans.length && spans[spanIndex]!.index === lineEnd) {
        output = applyControlSpan(output, spans[spanIndex]!, state, true);
        spanIndex++;
      }
    }

    if (state.activeStyles.size > 0) output += '\x1b[0m';
    if (state.activeHyperlink) output += state.activeHyperlink.close;
    wrapped.push(prefix + output);
  }

  return wrapped.join('\n');
}
