/**
 * Diff fence side-by-side renderer (B7)
 *
 * Renders a unified diff as two columns when `meta.view === 'split'`.
 * Falls back to the standard spectrum-highlighted unified diff when:
 *   - width < 80
 *   - parallax peer is absent (optional enhancement)
 *   - diff is unparseable
 *
 * Acceptance:
 *   GIVEN diff with `view=split` and width=140, output is two columns:
 *   old | new with aligned hunks.
 */

import type { FenceRenderContext } from '../types.js';

interface DiffLine {
  readonly kind: 'context' | 'add' | 'del' | 'hunk';
  readonly text: string;
}

function parseDiffLines(source: string): DiffLine[] {
  const lines = source.split('\n');
  const out: DiffLine[] = [];
  for (const line of lines) {
    if (line.startsWith('@@')) {
      out.push({ kind: 'hunk', text: line });
    } else if (line.startsWith('+')) {
      out.push({ kind: 'add', text: line.slice(1) });
    } else if (line.startsWith('-')) {
      out.push({ kind: 'del', text: line.slice(1) });
    } else if (line.startsWith(' ')) {
      out.push({ kind: 'context', text: line.slice(1) });
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — treat as context
      out.push({ kind: 'context', text: line });
    } else {
      out.push({ kind: 'context', text: line });
    }
  }
  return out;
}

function alignHunks(lines: DiffLine[]): Array<{ old: DiffLine | null; new: DiffLine | null }> {
  const pairs: Array<{ old: DiffLine | null; new: DiffLine | null }> = [];
  const oldBuffer: DiffLine[] = [];
  const newBuffer: DiffLine[] = [];

  for (const line of lines) {
    if (line.kind === 'hunk') {
      // Flush any remaining buffered lines before the hunk header
      while (oldBuffer.length || newBuffer.length) {
        pairs.push({
          old: oldBuffer.shift() ?? null,
          new: newBuffer.shift() ?? null,
        });
      }
      pairs.push({ old: line, new: null });
      continue;
    }

    if (line.kind === 'del') {
      oldBuffer.push(line);
    } else if (line.kind === 'add') {
      newBuffer.push(line);
    } else {
      // Context line — flush buffers first, then pair the context
      while (oldBuffer.length || newBuffer.length) {
        pairs.push({
          old: oldBuffer.shift() ?? null,
          new: newBuffer.shift() ?? null,
        });
      }
      pairs.push({ old: line, new: line });
    }
  }

  // Flush remaining
  while (oldBuffer.length || newBuffer.length) {
    pairs.push({
      old: oldBuffer.shift() ?? null,
      new: newBuffer.shift() ?? null,
    });
  }

  return pairs;
}

export function diffSplitFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  if (ctx.width < 80) return null; // fall back to unified

  const lines = parseDiffLines(token.content);
  const pairs = alignHunks(lines);

  const half = Math.floor((ctx.width - 5) / 2); // 5 = gutter ' │ ' + border
  const oldWidth = half;
  const newWidth = ctx.width - half - 5;

  const { theme } = ctx;
  const out: string[] = [];

  for (const pair of pairs) {
    if (pair.old?.kind === 'hunk') {
      const hunkText = pair.old.text;
      out.push(theme.code(hunkText.padEnd(ctx.width, ' ')));
      continue;
    }

    const oldText = pair.old?.text ?? '';
    const newText = pair.new?.text ?? '';

    let oldStyled = oldText.slice(0, oldWidth).padEnd(oldWidth, ' ');
    let newStyled = newText.slice(0, newWidth).padEnd(newWidth, ' ');

    if (pair.old?.kind === 'del') {
      oldStyled = '\x1b[31m' + oldStyled + '\x1b[0m';
    }
    if (pair.new?.kind === 'add') {
      newStyled = '\x1b[32m' + newStyled + '\x1b[0m';
    }

    out.push(`  ${oldStyled} │ ${newStyled}`);
  }

  return theme.codeBlockFrame(out.join('\n'), 'diff', ctx.width);
}

(diffSplitFenceRenderer as unknown as Record<string, unknown>).mode = 'streaming';
