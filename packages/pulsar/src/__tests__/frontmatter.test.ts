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

  it('uses prototype-safe records and rejects dangerous keys', () => {
    const yaml = extractFrontmatter('---\n__proto__: [polluted]\nsafe: yes\n---\nbody');
    expect(Object.getPrototypeOf(yaml.data)).toBeNull();
    expect(yaml.data).toEqual({ safe: 'yes' });

    const json = extractFrontmatter('{"__proto__":{"polluted":true},"nested":{"constructor":"nope","safe":1}}\nbody');
    expect(Object.getPrototypeOf(json.data)).toBeNull();
    expect(json.data).toEqual({ nested: { safe: 1 } });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('keeps overflowing numeric scalars as text', () => {
    const result = extractFrontmatter(`---\nvalue: ${'9'.repeat(400)}\n---\nbody`);
    expect(typeof result.data.value).toBe('string');
  });
});
