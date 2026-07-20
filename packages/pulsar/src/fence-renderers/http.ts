/**
 * HTTP smart fence renderer (B9)
 *
 * Parses HTTP request/response text and renders it with structured formatting:
 *   - Status line / request line in bold
 *   - Headers as key-value pairs
 *   - Body indented and syntax-highlighted if JSON/XML
 * Falls back to plain text for malformed input.
 */

import { highlight } from '../highlight.js';
import type { FenceRenderContext } from '../types.js';
import { wrapFenceBlock, wrapFenceLine } from './layout.js';

interface ParsedHTTP {
  firstLine: string;
  headers: Array<{ name: string; value: string }>;
  headerValues: Record<string, string>;
  body: string;
}

function parseHTTP(text: string): ParsedHTTP | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed.split('\n');
  const firstLine = lines[0]?.trim() ?? '';
  if (!firstLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\s/)) {
    // Try response format
    if (!firstLine.match(/^HTTP\/\d(?:\.\d)?\s/)) return null;
  }

  const headers: Array<{ name: string; value: string }> = [];
  const headerValues = Object.create(null) as Record<string, string>;
  let bodyStart = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      if (headers.length >= 10_000) return null;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      headers.push({ name: key, value });
      headerValues[key.toLowerCase()] = value;
    }
  }

  const body = bodyStart > 0 ? lines.slice(bodyStart).join('\n').trim() : '';
  return { firstLine, headers, headerValues, body };
}

export function httpFenceRenderer(token: Extract<import('../types.js').Token, { type: 'code-block' }>, ctx: FenceRenderContext): string | null {
  const parsed = parseHTTP(token.content);
  if (!parsed) return null;

  const { theme } = ctx;
  const lines: string[] = [];

  lines.push(...wrapFenceLine(theme.bold(parsed.firstLine), ctx.width));
  lines.push('');

  for (const header of parsed.headers) {
    lines.push(...wrapFenceLine(theme.bold(header.name + ':') + ' ' + header.value, ctx.width));
  }

  if (parsed.body) {
    lines.push('');
    let body = parsed.body;
    if (parsed.headerValues['content-type']?.toLowerCase().includes('json')) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
        body = highlight(body, 'json', ctx.options.highlightTheme as Parameters<typeof highlight>[2]);
      } catch {
        // leave body as-is
      }
    } else if (parsed.headerValues['content-type']?.toLowerCase().includes('xml')) {
      body = highlight(body, 'xml', ctx.options.highlightTheme as Parameters<typeof highlight>[2]);
    }
    lines.push(...wrapFenceBlock(body, ctx.width));
  }

  return theme.codeBlockFrame(lines.join('\n'), 'http', ctx.width);
}

(httpFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';
