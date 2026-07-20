import { highlightPartial, initialState } from './highlight.js';
import { parseMarkdown } from './parser.js';
import { renderMarkdown } from './renderer.js';
import { defaultTheme } from './theme.js';
import type { MarkdownStream, MarkdownStreamSnapshot, RenderOptions } from './types.js';

function countFences(source: string): number {
  const matches = source.match(/^\s*```/gm);
  return matches ? matches.length : 0;
}

/**
 * Detect whether the source contains an unclosed admonition blockquote.
 * Admonitions start with `> [!TYPE]` and continue with `>` lines.
 */
function hasUnclosedAdmonition(source: string): boolean {
  const lines = source.split('\n');
  let inAdmonition = false;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)) {
      inAdmonition = true;
    } else if (inAdmonition && !trimmed.startsWith('>') && trimmed !== '') {
      inAdmonition = false;
    }
  }
  return inAdmonition;
}

/**
 * Detect whether source contains an unclosed footnote definition.
 *
 * A footnote definition is "unclosed" only when the most recent `[^label]:`
 * line is followed exclusively by indented continuation lines — a blank line
 * or any non-indented non-empty line closes the footnote, even if the very
 * last line of the source happens to be indented (e.g. an unrelated
 * paragraph that begins with two spaces).
 */
function hasUnclosedFootnote(source: string): boolean {
  const lines = source.split('\n');
  const lastLine = lines.at(-1) ?? '';
  if (!/^ {2}\S/.test(lastLine)) return false;

  let lastDefIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\[\^[^\]]+\]:/.test(lines[i]!)) {
      lastDefIdx = i;
      break;
    }
  }
  if (lastDefIdx === -1) return false;

  for (let i = lastDefIdx + 1; i < lines.length - 1; i++) {
    const ln = lines[i]!;
    if (ln.trim() === '') return false;
    if (!/^ {2}/.test(ln)) return false;
  }
  return true;
}

function findCommitBoundary(source: string, finalize = false, knownFenceOdd?: boolean): number {
  if (source.length === 0) return 0;

  const fenceOdd = knownFenceOdd ?? countFences(source) % 2 === 1;
  if (fenceOdd) {
    return 0;
  }

  // Don't commit while inside an unclosed admonition or footnote
  if (!finalize && (hasUnclosedAdmonition(source) || hasUnclosedFootnote(source))) {
    return 0;
  }

  if (finalize) {
    return source.length;
  }

  const paragraphBreak = source.lastIndexOf('\n\n');
  if (paragraphBreak !== -1) {
    return paragraphBreak + 2;
  }

  const trailingNewline = source.endsWith('\n');
  if (!trailingNewline) {
    return 0;
  }

  const lines = source.split('\n');
  const lastContentLine = lines.at(-2) ?? '';
  if (lastContentLine.trim() === '') {
    return source.length;
  }

  const blockComplete = /^(\s*#{1,6}\s+.+|\s*```.*|\s*>|\s*[-*]\s+.+|\s*\d+\.\s+.+|\s*\|.*\|\s*|(\s*[-*_]\s*){3,}|!\[.*\]\(.*\)|\[\^[^\]]+\]:.*)$/.test(
    lastContentLine,
  );
  return blockComplete ? source.length : 0;
}

function extractOpenFenceInfo(pendingSource: string): { language: string; content: string } | null {
  const match = pendingSource.match(/^(\s*)```(\w*)\n([\s\S]*)$/);
  if (!match) return null;
  return { language: match[2] ?? 'text', content: match[3] ?? '' };
}

function renderPartialFence(pendingSource: string, options?: RenderOptions): string {
  const info = extractOpenFenceInfo(pendingSource);
  if (!info) return '';
  const theme = options?.theme ?? defaultTheme();
  const width = options?.width ?? 80;
  const lines = info.content.split('\n');
  let state = initialState();
  const highlightedLines: string[] = [];
  for (const line of lines) {
    if (line.trim() === '' && highlightedLines.length === 0) continue;
    const result = highlightPartial(line, info.language, state, options?.highlightTheme as Parameters<typeof highlightPartial>[3]);
    highlightedLines.push('  ' + result.text);
    state = result.state;
  }
  const body = highlightedLines.join('\n');
  const styled = theme.codeBlock(body);
  return theme.codeBlockFrame(styled, info.language, width);
}

function buildSnapshot(source: string, committedSource: string, options?: RenderOptions): MarkdownStreamSnapshot {
  const tokens = committedSource.length > 0 ? parseMarkdown(committedSource) : [];
  const pendingSource = source.slice(committedSource.length);
  let rendered = committedSource.length > 0 ? renderMarkdown(committedSource, options) : '';
  if (options?.streaming?.partialHighlight && pendingSource.includes('```')) {
    const partial = renderPartialFence(pendingSource, options);
    if (partial) {
      rendered = rendered ? rendered + '\n\n' + partial : partial;
    }
  }
  return {
    source,
    committedSource,
    pendingSource,
    tokens,
    rendered,
  };
}

export function createMarkdownStream(options?: RenderOptions): MarkdownStream {
  let source = '';
  let committedSource = '';
  // Incrementally track open code fences so countFences does not re-scan the
  // entire accumulated source on every append()/snapshot() call. This avoids
  // O(n^2) regex scanning for large streaming inputs.
  let fenceCount = 0;

  const snapshot = (snapshotOptions?: { finalize?: boolean }): MarkdownStreamSnapshot => {
    const finalize = snapshotOptions?.finalize === true;
    const fenceOdd = fenceCount % 2 === 1;
    const boundary = findCommitBoundary(source, finalize, fenceOdd);
    const effectiveCommitted = boundary > 0 ? source.slice(0, boundary) : committedSource;
    return buildSnapshot(source, effectiveCommitted, options);
  };

  return {
    append(chunk: string): MarkdownStreamSnapshot {
      // Count fence markers in the new chunk only, not the full source.
      const newFences = chunk.match(/^\s*```/gm);
      fenceCount += newFences ? newFences.length : 0;
      source += chunk;
      const fenceOdd = fenceCount % 2 === 1;
      if (fenceOdd) {
        return buildSnapshot(source, committedSource, options);
      }
      const boundary = findCommitBoundary(source, false, false);
      committedSource = boundary > 0 ? source.slice(0, boundary) : committedSource;
      return snapshot();
    },
    reset(): MarkdownStreamSnapshot {
      source = '';
      committedSource = '';
      fenceCount = 0;
      return snapshot();
    },
    snapshot,
  };
}
