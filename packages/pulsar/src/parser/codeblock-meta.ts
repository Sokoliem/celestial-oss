/**
 * Fenced code-block info-string parser.
 *
 * The info string is everything after the opening ``` fence. CommonMark
 * defines only the "language" (everything after the fence, before the
 * first whitespace). Pulsar extends this with optional meta tokens:
 *
 *   ```ts {3-5,7}              → highlight lines 3–5 and 7
 *   ```ts {3-5} copy            → render a copy affordance
 *   ```ts numbers start=10      → show line numbers, first line is 10
 *   ```ts wrap                  → soft-wrap long lines
 *   ```diff                     → already a language; diff colouring is automatic
 *   ```ts diff                  → force diff colouring on a non-`diff` language
 *
 * Unrecognised tokens are silently ignored so unknown future extensions
 * never break existing documents.
 */

import type { CodeBlockMeta } from '../types.js';

interface InfoStringParseResult {
  readonly language: string;
  readonly meta?: CodeBlockMeta;
}

export function parseCodeBlockInfoString(rawInfo: string): InfoStringParseResult {
  const trimmed = rawInfo.trim();
  if (!trimmed) return { language: '' };

  // CommonMark: language is everything up to the first whitespace.
  const firstWs = trimmed.search(/\s/);
  if (firstWs === -1) return { language: trimmed };

  const language = trimmed.slice(0, firstWs);
  const rest = trimmed.slice(firstWs + 1).trim();
  if (!rest) return { language };

  const meta: Mutable<CodeBlockMeta> = {};

  // Pull out the highlight-range block first so the {…} syntax does not
  // confuse the key=value tokenizer.
  let working = rest;
  const rangeMatch = working.match(/\{([0-9,\s-]+)\}/);
  if (rangeMatch) {
    const lines = parseLineRanges(rangeMatch[1]!);
    if (lines.length > 0) meta.highlightLines = lines;
    working = (working.slice(0, rangeMatch.index!) + working.slice(rangeMatch.index! + rangeMatch[0].length)).trim();
  }

  for (const part of working.split(/\s+/).filter(Boolean)) {
    if (part.includes('=')) {
      const eq = part.indexOf('=');
      const key = part.slice(0, eq);
      const rawValue = part.slice(eq + 1);
      applyMetaKey(meta, key, parseValue(rawValue));
    } else {
      applyMetaKey(meta, part, true);
    }
  }

  const hasContent =
    meta.highlightLines !== undefined ||
    meta.showLineNumbers !== undefined ||
    meta.startLine !== undefined ||
    meta.copy !== undefined ||
    meta.wrap !== undefined ||
    meta.diff !== undefined ||
    meta.fold !== undefined;

  return { language, ...(hasContent ? { meta } : {}) };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function parseValue(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw !== '' && Number.isFinite(n)) return n;
  return raw;
}

function applyMetaKey(meta: Mutable<CodeBlockMeta>, key: string, value: boolean | number | string): void {
  switch (key) {
    case 'hl':
    case 'highlight':
      // Bare `hl` is implied by presence of {…}; explicit `hl=true|false`
      // toggles whether existing highlightLines actually render.
      if (value === false) delete meta.highlightLines;
      break;
    case 'numbers':
    case 'lines':
    case 'lineNumbers':
      if (typeof value === 'boolean') meta.showLineNumbers = value;
      break;
    case 'start':
    case 'startLine':
      if (typeof value === 'number') meta.startLine = value;
      break;
    case 'copy':
      if (typeof value === 'boolean') meta.copy = value;
      break;
    case 'wrap':
      if (typeof value === 'boolean' || value === 'soft') meta.wrap = value !== false;
      break;
    case 'diff':
      if (typeof value === 'boolean') meta.diff = value;
      break;
    case 'fold':
      if (typeof value === 'boolean' || typeof value === 'number') meta.fold = value;
      break;
    default:
      // Ignore unknown keys — see file header for rationale.
      break;
  }
}

/**
 * Expand a comma-separated list of line ranges into 1-based line numbers.
 * Examples: `"3"` → [3]; `"3-5"` → [3,4,5]; `"3-5,7"` → [3,4,5,7].
 */
function parseLineRanges(spec: string): number[] {
  const out = new Set<number>();
  for (const segment of spec.split(',')) {
    const part = segment.trim();
    if (!part) continue;
    const dash = part.indexOf('-');
    if (dash === -1) {
      const n = Number(part);
      if (Number.isInteger(n) && n > 0) out.add(n);
    } else {
      const a = Number(part.slice(0, dash));
      const b = Number(part.slice(dash + 1));
      if (Number.isInteger(a) && Number.isInteger(b) && a > 0 && b >= a) {
        for (let i = a; i <= b; i++) out.add(i);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}
