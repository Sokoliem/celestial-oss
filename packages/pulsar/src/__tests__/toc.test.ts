import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../parser/index.js';
import { extractToc, slugify, toc } from '../toc.js';

describe('slugify', () => {
  it('lowercases and dasherises whitespace', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips punctuation but keeps alphanumerics + dashes', () => {
    expect(slugify("What's New? (2026)")).toBe('whats-new-2026');
  });

  it('strips combining marks via NFKD', () => {
    expect(slugify('Café Münch')).toBe('cafe-munch');
  });

  it('falls back to "section" for empty input', () => {
    expect(slugify('   ')).toBe('section');
    expect(slugify('!!!')).toBe('section');
  });
});

describe('parseMarkdown heading anchors', () => {
  it('assigns slugs to top-level headings', () => {
    const tokens = parseMarkdown('# Hello\n\n## World');
    expect(tokens[0]).toMatchObject({ type: 'heading', id: 'hello' });
    expect(tokens[1]).toMatchObject({ type: 'heading', id: 'world' });
  });

  it('disambiguates collisions with -2, -3 suffixes', () => {
    const tokens = parseMarkdown('# Notes\n\n## Notes\n\n### Notes');
    expect(tokens[0]).toMatchObject({ id: 'notes' });
    expect(tokens[1]).toMatchObject({ id: 'notes-2' });
    expect(tokens[2]).toMatchObject({ id: 'notes-3' });
  });

  it('walks into blockquotes and admonitions', () => {
    const tokens = parseMarkdown('> [!NOTE]\n> # Inside admonition');
    expect(tokens[0]?.type).toBe('admonition');
    if (tokens[0]?.type !== 'admonition') return;
    const inner = tokens[0].content[0];
    expect(inner).toMatchObject({ type: 'heading', id: 'inside-admonition' });
  });
});

describe('extractToc', () => {
  it('returns a flat list of headings with level + slug', () => {
    const entries = extractToc('# Top\n\n## Sub\n\n### Deep\n\nBody.');
    expect(entries).toEqual([
      { level: 1, text: 'Top', slug: 'top' },
      { level: 2, text: 'Sub', slug: 'sub' },
      { level: 3, text: 'Deep', slug: 'deep' },
    ]);
  });

  it('drops formatting markup from heading text', () => {
    const entries = extractToc('## **Bold** and *italic*');
    expect(entries[0]?.text).toBe('Bold and italic');
    expect(entries[0]?.slug).toBe('bold-and-italic');
  });

  it('keeps slug stable across collisions', () => {
    const entries = extractToc('# A\n\n# A\n\n# A');
    expect(entries.map((e) => e.slug)).toEqual(['a', 'a-2', 'a-3']);
  });
});

describe('toc()', () => {
  it('builds a column of link-tagged text nodes', () => {
    const node = toc('# Top\n\n## Sub');
    expect(node.kind).toBe('column');
    expect(node.children).toHaveLength(2);
    const first = node.children[0]!;
    expect(first.kind).toBe('text');
    expect(first.href).toBe('#top');
    expect(first.data).toEqual({ kind: 'link', url: '#top', text: 'Top' });
  });

  it('honours minLevel and maxLevel filters', () => {
    const node = toc('# Top\n\n## Sub\n\n### Deep', { minLevel: 2, maxLevel: 2 });
    expect(node.children).toHaveLength(1);
    expect(node.children[0]?.data).toMatchObject({ kind: 'link', text: 'Sub' });
  });

  it('respects a custom anchorPrefix', () => {
    const node = toc('# Top', { anchorPrefix: '/docs/' });
    expect(node.children[0]?.href).toBe('/docs/top');
  });

  it('contains custom indentation callback failures', () => {
    expect(() =>
      toc('# Top', {
        indentGlyph: () => {
          throw new Error('host callback failed');
        },
      }),
    ).not.toThrow();
  });
});
