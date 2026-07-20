/**
 * Frontmatter tests (A4)
 */

import { describe, expect, it } from 'vitest';
import { extractFrontmatter } from '../frontmatter.js';

describe('extractFrontmatter', () => {
  it('returns empty data when no frontmatter present', () => {
    const result = extractFrontmatter('# Hello\n\nBody');
    expect(result.data).toEqual({});
    expect(result.body).toBe('# Hello\n\nBody');
  });

  it('parses YAML frontmatter', () => {
    const input = '---\ntitle: foo\n---\n# body';
    const result = extractFrontmatter(input);
    expect(result.data).toEqual({ title: 'foo' });
    expect(result.body).toBe('# body');
  });

  it('parses TOML frontmatter', () => {
    const input = '+++\ntitle="foo"\n+++\n# body';
    const result = extractFrontmatter(input);
    expect(result.data).toEqual({ title: 'foo' });
    expect(result.body).toBe('# body');
  });

  it('parses JSON frontmatter', () => {
    const input = '{"title":"foo"}\n# body';
    const result = extractFrontmatter(input);
    expect(result.data).toEqual({ title: 'foo' });
    expect(result.body).toBe('# body');
  });

  it('rejects YAML with !! tags', () => {
    const input = '---\n!!python/object:Foo\n---\n# body';
    const result = extractFrontmatter(input);
    expect(result.data).toEqual({});
  });
});
