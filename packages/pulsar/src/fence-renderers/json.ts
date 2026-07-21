/**
 * JSON smart fence renderer (B9)
 *
 * Pretty-prints JSON with indentation and basic structural coloring.
 * Falls back to syntax-highlighted source for invalid JSON.
 */

import type { FenceRenderContext } from '../types.js';
import { wrapFenceLine } from './layout.js';

export function jsonFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  try {
    const parsed = JSON.parse(token.content);
    const pretty = JSON.stringify(parsed, null, 2);
    const { theme } = ctx;
    const lines = pretty.split('\n');
    const colored = lines
      .flatMap((line) => {
        // Simple structural coloring: keys in cyan, strings in green, numbers in yellow, booleans/null in magenta
        const coloredLine = line
          .replace(/("(?:[^"\\]|\\.)*")\s*:/g, (_, key) => theme.code(key) + ':')
          .replace(/: "(?:[^"\\]|\\.)*"/g, (m) => ': ' + theme.code(m.slice(2)))
          .replace(/: \d+(\.\d+)?/g, (m) => ': ' + theme.code(m.slice(2)))
          .replace(/: (true|false|null)/g, (m) => ': ' + theme.code(m.slice(2)));
        return wrapFenceLine(coloredLine, ctx.width);
      })
      .join('\n');
    return theme.codeBlockFrame(colored, 'json', ctx.width);
  } catch {
    // Invalid JSON — fall through to spectrum's JSON highlighter
    return null;
  }
}

(jsonFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
