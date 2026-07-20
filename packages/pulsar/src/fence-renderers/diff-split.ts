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

import { padCellText } from '@celestial/rosetta';
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
      out.push(theme.diffHeader?.(padCellText(hunkText, ctx.width)) ?? theme.code(padCellText(hunkText, ctx.width)));
      continue;
    }

    const oldText = pair.old?.text ?? '';
    const newText = pair.new?.text ?? '';

    let oldStyled = padCellText(oldText, oldWidth);
    let newStyled = padCellText(newText, newWidth);

    if (pair.old?.kind === 'del') {
      oldStyled = theme.diffRemoved?.(oldStyled) ?? theme.code(oldStyled);
    } else {
      oldStyled = theme.diffContext?.(oldStyled) ?? oldStyled;
    }
    if (pair.new?.kind === 'add') {
      newStyled = theme.diffAdded?.(newStyled) ?? theme.code(newStyled);
    } else {
      newStyled = theme.diffContext?.(newStyled) ?? newStyled;
    }

    out.push(`  ${oldStyled} │ ${newStyled}`);
  }

  return theme.codeBlockFrame(out.join('\n'), 'diff', ctx.width);
}

(diffSplitFenceRenderer as unknown as Record<string, unknown>).mode = 'streaming';
