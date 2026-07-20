/**
 * ANSI-preserving word-wrap for the terminal markdown renderer.
 *
 * Tokenises plain text with explicit start positions so ANSI codes are
 * re-injected using exact character indices rather than a fragile offset
 * counter that drifts when words are separated by discarded whitespace.
 * Tracks "active" ANSI styles across word-wrap boundaries and re-applies
 * open styles at the start of each new line.
 */

import { type AnsiSpan, extractAnsiCodes, hyperlinkCloseCode } from './ansi.js';
import { visualWidth } from './width.js';

/**
 * Word-wrap text to a given width, preserving ANSI codes across line breaks.
 */
export function wrapText(text: string, width: number, prefix: string): string {
  if (width <= 0) return prefix + text;

  const { plain, spans } = extractAnsiCodes(text);
  if (visualWidth(plain) <= width) return prefix + text;

  const codesAtPos = new Map<number, AnsiSpan[]>();
  for (const span of spans) {
    const existing = codesAtPos.get(span.index) ?? [];
    existing.push(span);
    codesAtPos.set(span.index, existing);
  }

  // Tokenise into words and whitespace runs, keeping each token's start index.
  interface PlainToken {
    text: string;
    start: number;
    isSpace: boolean;
  }
  const tokens: PlainToken[] = [];
  const wordRe = /\S+/g;
  let lastEnd = 0;
  let wm: RegExpExecArray | null;
  while ((wm = wordRe.exec(plain)) !== null) {
    if (wm.index > lastEnd) {
      tokens.push({ text: plain.slice(lastEnd, wm.index), start: lastEnd, isSpace: true });
    }
    tokens.push({ text: wm[0], start: wm.index, isSpace: false });
    lastEnd = wm.index + wm[0].length;
  }
  if (lastEnd < plain.length) {
    tokens.push({ text: plain.slice(lastEnd), start: lastEnd, isSpace: true });
  }

  // Build lines as arrays of positioned segments so every character's index
  // in `plain` is always recoverable during ANSI injection.
  interface Seg {
    text: string;
    start: number;
  }
  const lineSegments: Seg[][] = [];
  let curSegs: Seg[] = [];
  let curWidth = 0;

  for (const token of tokens) {
    if (token.isSpace) {
      if (curWidth > 0) {
        const sw = visualWidth(token.text);
        if (curWidth + sw <= width) {
          curSegs.push({ text: token.text, start: token.start });
          curWidth += sw;
        }
      }
      continue;
    }

    const wordWidth = visualWidth(token.text);
    if (curWidth === 0) {
      curSegs = [{ text: token.text, start: token.start }];
      curWidth = wordWidth;
    } else if (curWidth + wordWidth <= width) {
      curSegs.push({ text: token.text, start: token.start });
      curWidth += wordWidth;
    } else {
      lineSegments.push(curSegs);
      curSegs = [{ text: token.text, start: token.start }];
      curWidth = wordWidth;
    }
  }
  if (curSegs.length > 0) lineSegments.push(curSegs);

  interface ControlState {
    activeStyles: string[];
    activeHyperlink: { open: string; close: string } | null;
  }

  function applyControlCodes(resultLine: string, controlSpans: AnsiSpan[] | undefined, state: ControlState): string {
    if (!controlSpans) return resultLine;

    for (const span of controlSpans) {
      resultLine += span.code;

      switch (span.kind) {
        case 'sgr':
          if (span.code === '\x1b[0m') {
            state.activeStyles = [];
          } else {
            state.activeStyles.push(span.code);
          }
          break;
        case 'osc-open':
          state.activeHyperlink = {
            open: span.code,
            close: hyperlinkCloseCode(span.code),
          };
          break;
        case 'osc-close':
          state.activeHyperlink = null;
          break;
        case 'osc-other':
          break;
      }
    }

    return resultLine;
  }

  const controlState: ControlState = { activeStyles: [], activeHyperlink: null };
  const wrappedLines: string[] = [];

  for (const segs of lineSegments) {
    let resultLine = '';
    if (controlState.activeHyperlink) {
      resultLine += controlState.activeHyperlink.open;
    }
    if (controlState.activeStyles.length > 0) {
      resultLine += controlState.activeStyles.join('');
    }

    for (const seg of segs) {
      for (let i = 0; i < seg.text.length; i++) {
        const plainIdx = seg.start + i;
        resultLine = applyControlCodes(resultLine, codesAtPos.get(plainIdx), controlState);
        resultLine += seg.text[i];
      }
    }

    const lastSeg = segs[segs.length - 1];
    const lineEnd = lastSeg ? lastSeg.start + lastSeg.text.length : 0;
    resultLine = applyControlCodes(resultLine, codesAtPos.get(lineEnd), controlState);

    if (controlState.activeStyles.length > 0) {
      resultLine += '\x1b[0m';
    }
    if (controlState.activeHyperlink) {
      resultLine += controlState.activeHyperlink.close;
    }

    wrappedLines.push(prefix + resultLine);
  }

  return wrappedLines.join('\n');
}
