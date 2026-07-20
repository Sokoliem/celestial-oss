import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../parser.js';
import { clearSearch, findMatches, flattenSearchableText, initSearch, nextMatch, prevMatch } from '../search.js';

describe('flattenSearchableText', () => {
  it('returns the visible text for a paragraph', () => {
    const [token] = parseMarkdown('Hello **bold** world.');
    expect(flattenSearchableText(token!)).toBe('Hello bold world.');
  });

  it('returns the heading text without the # markers', () => {
    const [token] = parseMarkdown('## A Title');
    expect(flattenSearchableText(token!)).toBe('A Title');
  });

  it('returns the visible link text but NOT its URL', () => {
    const [token] = parseMarkdown('See [the docs](https://example.com/path) for more.');
    const text = flattenSearchableText(token!);
    expect(text).toContain('the docs');
    expect(text).not.toContain('example.com');
  });

  it('returns the alt text of an image, not the URL', () => {
    const [token] = parseMarkdown('![an alpaca](https://example.com/alpaca.png)');
    const text = flattenSearchableText(token!);
    expect(text).toBe('an alpaca');
    expect(text).not.toContain('example.com');
  });

  it('returns the full content of a code block', () => {
    const [token] = parseMarkdown('```ts\nconst x = 1;\n```');
    const text = flattenSearchableText(token!);
    expect(text).toContain('const x = 1;');
  });

  it('joins blockquote children with newlines', () => {
    const [token] = parseMarkdown('> first line\n> second line');
    const text = flattenSearchableText(token!);
    expect(text).toContain('first line');
    expect(text).toContain('second line');
  });

  it('joins list items with newlines', () => {
    const [token] = parseMarkdown('- one\n- two\n- three');
    const text = flattenSearchableText(token!);
    expect(text).toBe('one\ntwo\nthree');
  });

  it('emits horizontal rules as empty strings', () => {
    const [token] = parseMarkdown('---');
    expect(flattenSearchableText(token!)).toBe('');
  });
});

describe('findMatches', () => {
  it('returns no matches for an empty query', () => {
    const tokens = parseMarkdown('Hello world');
    expect(findMatches(tokens, '').length).toBe(0);
  });

  it('finds literal substrings', () => {
    const tokens = parseMarkdown('Hello world\n\nGoodbye world');
    const matches = findMatches(tokens, 'world');
    expect(matches.length).toBe(2);
    expect(matches[0]?.blockIndex).toBe(0);
    expect(matches[1]?.blockIndex).toBe(1);
  });

  it('uses smartcase: lowercase queries match case-insensitively', () => {
    const tokens = parseMarkdown('HELLO World');
    expect(findMatches(tokens, 'hello').length).toBe(1);
  });

  it('uses smartcase: any uppercase makes the search case-sensitive', () => {
    const tokens = parseMarkdown('Hello hello HELLO');
    expect(findMatches(tokens, 'Hello').length).toBe(1);
  });

  it('treats query as a literal substring by default (no regex surprise on $ or .)', () => {
    const tokens = parseMarkdown('cost is $5.00 and a.b match');
    expect(findMatches(tokens, '$5.00').length).toBe(1);
    expect(findMatches(tokens, 'a.b').length).toBe(1);
  });

  it('does not match across regex meta in literal mode', () => {
    const tokens = parseMarkdown('foo bar baz');
    // In literal mode, "b.r" only matches the exact string "b.r" — none here.
    expect(findMatches(tokens, 'b.r').length).toBe(0);
  });

  it('treats query as regex when mode: "regex" is set', () => {
    const tokens = parseMarkdown('foo bar baz');
    const matches = findMatches(tokens, 'b.r', { mode: 'regex' });
    expect(matches.length).toBe(1);
    expect(matches[0]?.snippet).toContain('bar');
  });

  it('falls back to literal in regex mode when the pattern is malformed', () => {
    const tokens = parseMarkdown('a [unclosed');
    expect(findMatches(tokens, '[unclosed', { mode: 'regex' }).length).toBe(1);
  });

  it('does not match against link URLs', () => {
    const tokens = parseMarkdown('Click [here](https://example.com)');
    expect(findMatches(tokens, 'example').length).toBe(0);
  });

  it('does match against code-block content', () => {
    const tokens = parseMarkdown('```ts\nconst secretValue = 42;\n```');
    const matches = findMatches(tokens, 'secretValue');
    expect(matches.length).toBe(1);
  });

  it('produces a snippet that contains the match', () => {
    const tokens = parseMarkdown('A long sentence with the word target somewhere in the middle of it.');
    const matches = findMatches(tokens, 'target');
    expect(matches[0]?.snippet).toContain('target');
  });

  it('produces an ellipsised snippet for matches deep in long text', () => {
    const text = 'a'.repeat(100) + ' target ' + 'b'.repeat(100);
    const tokens = parseMarkdown(text);
    const matches = findMatches(tokens, 'target');
    expect(matches[0]?.snippet.startsWith('…')).toBe(true);
    expect(matches[0]?.snippet.endsWith('…')).toBe(true);
  });

  it('caps retained matches at the requested boundary', () => {
    const tokens = parseMarkdown('a '.repeat(100));
    expect(findMatches(tokens, 'a', { maxMatches: 7 })).toHaveLength(7);
    expect(findMatches(tokens, 'a', { maxMatches: 0 })).toEqual([]);
  });

  it('advances zero-width Unicode regex matches by whole code points', () => {
    const tokens = parseMarkdown('😀x');
    const matches = findMatches(tokens, '(?=.)', { mode: 'regex' });
    expect(matches.map((match) => match.column)).toEqual([0, 2]);
  });

  it('terminates cyclic runtime token graphs', () => {
    const cyclic = { type: 'blockquote', content: [] } as unknown as Parameters<typeof flattenSearchableText>[0];
    (cyclic as Extract<typeof cyclic, { type: 'blockquote' }> & { content: unknown[] }).content.push(cyclic);
    expect(flattenSearchableText(cyclic)).toBe('');
  });
});

describe('initSearch / nextMatch / prevMatch / clearSearch', () => {
  it('initSearch returns a usable state with all matches', () => {
    const tokens = parseMarkdown('Hello world\n\nworld peace');
    const state = initSearch('world', tokens);
    expect(state.query).toBe('world');
    expect(state.matches.length).toBe(2);
    expect(state.currentMatchIndex).toBe(0);
  });

  it('nextMatch wraps around', () => {
    const tokens = parseMarkdown('a a a');
    let state = initSearch('a', tokens);
    expect(state.matches.length).toBe(3);
    state = nextMatch(state);
    expect(state.currentMatchIndex).toBe(1);
    state = nextMatch(state);
    expect(state.currentMatchIndex).toBe(2);
    state = nextMatch(state);
    expect(state.currentMatchIndex).toBe(0);
  });

  it('prevMatch wraps backward', () => {
    const tokens = parseMarkdown('a a a');
    let state = initSearch('a', tokens);
    state = prevMatch(state);
    expect(state.currentMatchIndex).toBe(2);
  });

  it('next/prev are no-ops when there are no matches', () => {
    const tokens = parseMarkdown('hello');
    const state = initSearch('xyz', tokens);
    expect(state.matches.length).toBe(0);
    expect(nextMatch(state).currentMatchIndex).toBe(0);
    expect(prevMatch(state).currentMatchIndex).toBe(0);
  });

  it('normalizes corrupted navigation indices', () => {
    const state = { ...initSearch('a', parseMarkdown('a a a')), currentMatchIndex: Number.NaN };
    expect(nextMatch(state).currentMatchIndex).toBe(1);
    expect(prevMatch(state).currentMatchIndex).toBe(2);
  });

  it('clearSearch returns null', () => {
    expect(clearSearch()).toBeNull();
  });
});
