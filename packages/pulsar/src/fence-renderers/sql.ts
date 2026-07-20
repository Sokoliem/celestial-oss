/**
 * SQL smart fence renderer (B9)
 *
 * Formats SQL with basic indentation and highlighting.
 * Falls back to spectrum-highlighted source for complex/unparseable SQL.
 */

import { highlight } from '../highlight.js';
import type { FenceRenderContext } from '../types.js';
import { wrapFenceBlock } from './layout.js';

function formatSQL(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let indent = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
      indent = 0;
    } else if (
      upper.startsWith('FROM') ||
      upper.startsWith('WHERE') ||
      upper.startsWith('GROUP') ||
      upper.startsWith('ORDER') ||
      upper.startsWith('HAVING') ||
      upper.startsWith('LIMIT') ||
      upper.startsWith('OFFSET')
    ) {
      indent = 1;
    } else if (upper.startsWith('AND') || upper.startsWith('OR')) {
      indent = 2;
    }
    out.push('  '.repeat(indent) + trimmed);
  }
  return out.join('\n');
}

export function sqlFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  const formatted = formatSQL(token.content);
  const highlighted = highlight(formatted, 'sql', ctx.options.highlightTheme as Parameters<typeof highlight>[2]);
  const { theme } = ctx;
  return theme.codeBlockFrame(wrapFenceBlock(highlighted, ctx.width).join('\n'), 'sql', ctx.width);
}

(sqlFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
