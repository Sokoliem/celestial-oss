/**
 * Math Unicode Renderer (A3)
 *
 * Converts a subset of LaTeX to Unicode text.
 *
 * Supported:
 *   - \command → unicode symbol (see math-symbols.ts)
 *   - ^expr / _expr → superscripts / subscripts
 *   - \sqrt{expr} → √expr
 *   - \frac{a}{b} → a⁄b (or vulgar fraction when a,b are simple integers)
 *   - {groups}
 *
 * Returns `null` for expressions outside the supported subset.
 */

import { MATH_SYMBOLS, SUBSCRIPTS, SUPERSCRIPTS, VULGAR_FRACTIONS } from './math-symbols.js';

interface ParserState {
  s: string;
  i: number;
  depth: number;
}

function peek(st: ParserState): string {
  return st.s[st.i] ?? '\0';
}

function take(st: ParserState): string {
  const ch = st.s[st.i] ?? '\0';
  st.i++;
  return ch;
}

function parseCommand(st: ParserState): { name: string; symbol: string | null } {
  let name = '';
  while (/[a-zA-Z]/.test(peek(st))) {
    name += take(st);
  }
  if (name === '') {
    const ch = take(st);
    if (ch === ' ' || ch === ',' || ch === ';') return { name: ch, symbol: ' ' };
    return { name: ch, symbol: null };
  }
  return { name, symbol: MATH_SYMBOLS[name] ?? null };
}

function parseGroup(st: ParserState): string | null {
  if (peek(st) !== '{') return null;
  take(st); // '{'
  const out = parseExpr(st);
  if (peek(st) !== '}') return null;
  take(st); // '}'
  return out;
}

function parseSupSub(st: ParserState, map: Record<string, string>, kind: '^' | '_'): string | null {
  take(st); // '^' or '_'
  const group = parseGroup(st);
  if (group === null) {
    // Single char
    const ch = take(st);
    if (ch === '\0') return null;
    return map[ch] ?? (kind === '^' ? ch : ch); // best-effort fallback
  }
  let result = '';
  for (const ch of group) {
    result += map[ch] ?? ch;
  }
  return result;
}

function parseSqrt(st: ParserState): string | null {
  // Already consumed \sqrt
  const arg = parseGroup(st);
  if (arg === null) return null;
  return '√' + arg;
}

function parseFrac(st: ParserState): string | null {
  // Already consumed \frac
  const num = parseGroup(st);
  const den = parseGroup(st);
  if (num === null || den === null) return null;
  const vulgar = VULGAR_FRACTIONS[`${num}/${den}`];
  if (vulgar) return vulgar;
  // Inline fraction slash
  return num + '⁄' + den;
}

function parseAtom(st: ParserState): string | null {
  const ch = peek(st);
  if (ch === '\0') return '';

  if (ch === '\\') {
    take(st);
    const cmd = parseCommand(st);
    if (cmd.symbol === null) {
      if (cmd.name === 'sqrt') {
        const sqrt = parseSqrt(st);
        if (sqrt !== null) return sqrt;
        return '√';
      }
      if (cmd.name === 'frac') {
        const frac = parseFrac(st);
        if (frac !== null) return frac;
        return null;
      }
      return null;
    }
    if (cmd.symbol === '√') {
      const sqrt = parseSqrt(st);
      if (sqrt !== null) return sqrt;
      return '√';
    }
    return cmd.symbol;
  }

  if (ch === '^') {
    return parseSupSub(st, SUPERSCRIPTS, '^');
  }

  if (ch === '_') {
    return parseSupSub(st, SUBSCRIPTS, '_');
  }

  if (ch === '{') {
    return parseGroup(st);
  }

  // Space / tab skip
  if (ch === ' ' || ch === '\t') {
    take(st);
    return ' ';
  }

  // Ordinary character
  take(st);
  return ch;
}

function parseExpr(st: ParserState): string | null {
  if (st.depth > 2) {
    // Flatten beyond depth 2 (per PRD F3)
    let flat = '';
    while (peek(st) !== '}' && peek(st) !== '\0') {
      flat += take(st);
    }
    return flat;
  }

  st.depth++;
  let out = '';
  while (peek(st) !== '}' && peek(st) !== '\0') {
    const atom = parseAtom(st);
    if (atom === null) {
      st.depth--;
      return null;
    }
    out += atom;
  }
  st.depth--;
  return out;
}

/**
 * Convert a LaTeX math expression to Unicode.
 *
 * Returns `null` when the expression contains unsupported constructs
 * (environments, matrices, accents, etc.) so the caller can fall back to
 * `[math: source]`.
 */
export function mathToUnicode(latex: string): string | null {
  // Reject known unsupported constructs quickly.
  if (/\\(begin|end|left|right|overline|underline|hat|tilde|vec|matrix|align)/.test(latex)) {
    return null;
  }
  // Reject unbalanced braces.
  let braceCount = 0;
  for (const ch of latex) {
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (braceCount < 0) return null;
  }
  if (braceCount !== 0) return null;

  const st: ParserState = { s: latex.trim(), i: 0, depth: 0 };
  const result = parseExpr(st);
  if (result === null) return null;
  // After parsing, we should have consumed the whole string (or hit '}' which is fine for nested calls).
  return result;
}
