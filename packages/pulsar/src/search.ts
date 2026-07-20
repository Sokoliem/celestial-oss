/**
 * Markdown In-Document Search
 *
 * Find and navigate matches across a parsed markdown document.
 *
 * Searches against the *rendered* visible text of each block — link
 * URLs, raw HTML, and footnote definition labels are excluded so the
 * match results align with what the reader sees on screen, not the
 * source markup.
 *
 * Mirrors `@celestial/parallax`'s `search.ts` API (`initSearch`,
 * `findMatches`, `nextMatch`, `prevMatch`, `clearSearch`) so consumers
 * can wire identical key handlers across the two packages.
 */

import type { InlineToken, ListItem, MarkdownSearchMatch, MarkdownSearchState, Token } from './types.js';

// ── Public API ──────────────────────────────────────────────────────────

/** Try to compile the user's query as a regex. */
function tryRegex(query: string): RegExp | null {
  try {
    return new RegExp(query, 'g');
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the visible (rendered) text from a single block token.
 * Skips link URLs, image URLs, and raw markup; preserves the text
 * the reader actually sees. Code-block content is searchable in full
 * (including syntax — that's intentional, since search-in-code is a
 * common use case).
 */
export function flattenSearchableText(token: Token): string {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return inlineText(token.content);
    case 'code-block':
      return token.content;
    case 'blockquote':
      return token.content.map(flattenSearchableText).join('\n');
    case 'list':
      return token.items.map(listItemText).join('\n');
    case 'hr':
      return '';
    case 'table': {
      const headerRow = token.headers.map(inlineText).join(' | ');
      const bodyRows = token.rows.map((row) => row.map(inlineText).join(' | ')).join('\n');
      return `${headerRow}\n${bodyRows}`;
    }
    case 'admonition':
      return `${token.title}\n${token.content.map(flattenSearchableText).join('\n')}`;
    case 'footnote-def':
      return `${token.label}\n${token.content.map(flattenSearchableText).join('\n')}`;
    case 'image':
      return token.alt;
    case 'definition-list':
      return token.items.map((item) => `${inlineText(item.term)}\n${item.descriptions.map((d) => inlineText(d)).join('\n')}`).join('\n');
    case 'math-block':
      return token.content;
    case 'details':
      return `${inlineText(token.summary)}\n${token.content.map(flattenSearchableText).join('\n')}`;
    case 'frontmatter':
      return '';
    case 'wiki-link-block':
      return token.alias ?? token.target;
    case 'live-exec':
      return token.source;
  }
}

function inlineText(tokens: readonly InlineToken[]): string {
  let out = '';
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        out += t.content;
        break;
      case 'bold':
      case 'italic':
      case 'strikethrough':
      case 'mark':
      case 'sup':
      case 'sub':
        out += inlineText(t.content);
        break;
      case 'code':
        out += t.content;
        break;
      case 'link':
        // Visible link text only; the URL is excluded so users searching
        // for prose don't get false hits on URLs.
        out += t.text;
        break;
      case 'footnote-ref':
        out += `[^${t.label}]`;
        break;
      case 'emoji':
        out += `:${t.name}:`;
        break;
      case 'math-inline':
        out += t.content;
        break;
      case 'wiki-link':
        out += t.alias ?? t.target;
        break;
      case 'image-inline':
        out += t.alt;
        break;
      case 'hard-break':
        out += '\n';
        break;
    }
  }
  return out;
}

function listItemText(item: ListItem): string {
  const head = inlineText(item.content);
  const children = item.children ? item.children.map(flattenSearchableText).join('\n') : '';
  return children ? `${head}\n${children}` : head;
}

// ── Match finding ───────────────────────────────────────────────────────

export interface FindMatchesOptions {
  /**
   * Match mode. `'literal'` (default) treats the query as a plain
   * substring — `$`, `.`, `(` and other regex metacharacters match
   * themselves. `'regex'` treats the query as a JavaScript regex; an
   * invalid pattern falls back to literal matching.
   */
  readonly mode?: 'literal' | 'regex';
}

/**
 * Find every match of `query` in the document. The search is
 * case-sensitive when the query contains uppercase, case-insensitive
 * otherwise (a "smartcase" convention familiar from Vim).
 *
 * Default mode is `'literal'` — the query is treated as a plain
 * substring so the common case "search for a literal $ or ." works
 * without escaping. Pass `{ mode: 'regex' }` to opt into regex
 * matching.
 */
export function findMatches(tokens: readonly Token[], query: string, opts?: FindMatchesOptions): readonly MarkdownSearchMatch[] {
  if (!query) return [];
  const flags = query === query.toLowerCase() ? 'gi' : 'g';
  const mode = opts?.mode ?? 'literal';
  const regex = mode === 'regex' ? (tryRegex(query) ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags)) : new RegExp(escapeRegex(query), flags);

  const matches: MarkdownSearchMatch[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const flat = flattenSearchableText(tokens[i]!);
    if (flat.length === 0) continue;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(flat)) !== null) {
      matches.push({
        blockIndex: i,
        column: m.index,
        length: m[0].length,
        snippet: extractSnippet(flat, m.index, m[0].length),
      });
      if (m[0].length === 0) regex.lastIndex++;
    }
  }

  return matches;
}

function extractSnippet(text: string, column: number, length: number): string {
  const before = Math.max(0, column - 30);
  const after = Math.min(text.length, column + length + 30);
  let s = text.slice(before, after);
  if (before > 0) s = '…' + s;
  if (after < text.length) s = s + '…';
  // Newlines collapse to spaces in the preview snippet.
  return s.replace(/\s+/g, ' ').trim();
}

// ── State / navigation ──────────────────────────────────────────────────

export function initSearch(query: string, tokens: readonly Token[], opts?: FindMatchesOptions): MarkdownSearchState {
  return {
    query,
    regex: opts?.mode === 'regex' ? tryRegex(query) : null,
    matches: findMatches(tokens, query, opts),
    currentMatchIndex: 0,
    inputActive: false,
  };
}

export function nextMatch(state: MarkdownSearchState): MarkdownSearchState {
  if (state.matches.length === 0) return state;
  return { ...state, currentMatchIndex: (state.currentMatchIndex + 1) % state.matches.length };
}

export function prevMatch(state: MarkdownSearchState): MarkdownSearchState {
  if (state.matches.length === 0) return state;
  return { ...state, currentMatchIndex: (state.currentMatchIndex - 1 + state.matches.length) % state.matches.length };
}

export function clearSearch(): null {
  return null;
}
