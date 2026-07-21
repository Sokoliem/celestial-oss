import { describe, expect, it } from 'vitest';
import { markdownWithSearch } from '../markdown-with-search.js';
import { renderMarkdown } from '../renderer.js';
import { createTheme } from '../theme.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('markdownWithSearch', () => {
  it('returns a VNode and search state', () => {
    const { vnode, state } = markdownWithSearch('Hello world', 'world');
    expect(vnode.kind).toBe('column');
    expect(state.query).toBe('world');
    expect(state.matches.length).toBe(1);
  });

  it('marks the current match block with a border indicator in VNode mode', () => {
    const { vnode } = markdownWithSearch('Hello world\n\nGoodbye world', 'world');
    expect(vnode.kind).toBe('column');
    // First match is current (index 0) → first block should have a border row
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    const firstChild = vnode.children[0];
    expect(firstChild?.kind).toBe('row');
    if (firstChild?.kind === 'row') {
      expect(firstChild.children[0]?.kind).toBe('text');
      const borderNode = firstChild.children[0];
      if (borderNode?.kind === 'text') {
        expect(borderNode.content).toBe('▎ ');
      }
    }
    // Second block should NOT have a border (it's not the current match)
    const secondChild = vnode.children[1];
    expect(secondChild?.kind).not.toBe('row');
  });

  it('marks non-current matching blocks without the current marker in VNode mode', () => {
    const theme = createTheme({ mark: (text) => `<<${text}>>` });
    const { vnode } = markdownWithSearch('alpha\n\nbeta\n\nalpha', 'alpha', { theme });
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    // First match is current → border
    const firstChild = vnode.children[0];
    expect(firstChild?.kind).toBe('row');
    // Third match is not current → no border
    const thirdChild = vnode.children[2];
    expect(thirdChild?.kind).not.toBe('row');
    expect(thirdChild).toMatchObject({ kind: 'text', content: '<<alpha>>' });
  });
});

describe('renderMarkdown search highlights', () => {
  it('wraps matching blocks with mark style in string mode', () => {
    const out = renderMarkdown('Hello world', {
      searchHighlights: [{ blockIndex: 0, column: 6, length: 5, snippet: 'world' }],
    });
    const plain = stripAnsi(out);
    expect(plain).toContain('Hello world');
  });

  it('adds a border prefix to the current match block', () => {
    const out = renderMarkdown('Hello world', {
      searchHighlights: [{ blockIndex: 0, column: 6, length: 5, snippet: 'world' }],
      currentMatchIndex: 0,
    });
    const plain = stripAnsi(out);
    expect(plain.startsWith('▎ ')).toBe(true);
    expect(plain).toContain('Hello world');
  });

  it('does not modify blocks without matches', () => {
    const out = renderMarkdown('Hello world\n\nNo match here', {
      searchHighlights: [{ blockIndex: 0, column: 6, length: 5, snippet: 'world' }],
    });
    const lines = out.split('\n\n');
    const plainSecond = stripAnsi(lines[1]!);
    expect(plainSecond).toBe('No match here');
  });
});
