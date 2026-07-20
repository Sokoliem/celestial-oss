import { describe, expect, it } from 'vitest';
import { ANCHOR_SCROLL_SPRING, buildAnchorIndex, resolveAnchor, startAnchorScroll, tickAnchorScroll } from '../anchors.js';
import { parseMarkdown } from '../parser.js';

describe('buildAnchorIndex', () => {
  it('returns an empty index for a document with no headings', () => {
    const tokens = parseMarkdown('Just a paragraph.');
    expect(buildAnchorIndex(tokens).size).toBe(0);
  });

  it('indexes a single heading by its slug', () => {
    const tokens = parseMarkdown('# Hello World');
    const idx = buildAnchorIndex(tokens);
    expect(idx.size).toBe(1);
    const entry = idx.get('hello-world');
    expect(entry?.text).toBe('Hello World');
    expect(entry?.level).toBe(1);
    expect(entry?.blockIndex).toBe(0);
  });

  it('indexes multiple headings in document order', () => {
    const md = '# First\n\nbody\n\n## Second\n\nbody\n\n### Third';
    const tokens = parseMarkdown(md);
    const idx = buildAnchorIndex(tokens);
    expect(idx.size).toBe(3);
    expect(idx.get('first')?.blockIndex).toBe(0);
    expect(idx.get('second')?.blockIndex).toBeGreaterThan(0);
    expect(idx.get('third')?.blockIndex).toBeGreaterThan(idx.get('second')!.blockIndex);
  });

  it('preserves the heading id assigned by parseMarkdown', () => {
    const tokens = parseMarkdown('# Hello\n\n# Hello');
    // parseMarkdown disambiguates collisions with `-2`.
    const idx = buildAnchorIndex(tokens);
    expect(idx.has('hello')).toBe(true);
    expect(idx.has('hello-2')).toBe(true);
  });

  it('does not index headings nested inside blockquotes (top-level only)', () => {
    const tokens = parseMarkdown('> ## Quoted\n\n# Top');
    const idx = buildAnchorIndex(tokens);
    expect(idx.has('quoted')).toBe(false);
    expect(idx.has('top')).toBe(true);
  });

  it('captures the heading level', () => {
    const tokens = parseMarkdown('### Three');
    expect(buildAnchorIndex(tokens).get('three')?.level).toBe(3);
  });
});

describe('resolveAnchor', () => {
  it('returns the entry for a known slug', () => {
    const tokens = parseMarkdown('# A Section');
    const idx = buildAnchorIndex(tokens);
    const entry = resolveAnchor(idx, 'a-section');
    expect(entry).not.toBeNull();
    expect(entry?.text).toBe('A Section');
  });

  it('returns null for an unknown slug', () => {
    const tokens = parseMarkdown('# Known');
    const idx = buildAnchorIndex(tokens);
    expect(resolveAnchor(idx, 'unknown')).toBeNull();
  });
});

describe('startAnchorScroll / tickAnchorScroll', () => {
  it('returns done immediately when from === to', () => {
    const anim = startAnchorScroll(50, 50);
    expect(anim.active).toBe(false);
    const sample = tickAnchorScroll(anim, 100);
    expect(sample.value).toBe(50);
    expect(sample.done).toBe(true);
  });

  it('returns from when elapsed is 0 (or negative)', () => {
    const anim = startAnchorScroll(0, 100);
    expect(tickAnchorScroll(anim, 0).value).toBe(0);
    expect(tickAnchorScroll(anim, -5).value).toBe(0);
  });

  it('advances toward the target as elapsed increases', () => {
    const anim = startAnchorScroll(0, 100);
    const at50 = tickAnchorScroll(anim, 50).value;
    const at200 = tickAnchorScroll(anim, 200).value;
    expect(at50).toBeGreaterThan(0);
    expect(at200).toBeGreaterThan(at50);
  });

  it('eventually settles at the target value', () => {
    const anim = startAnchorScroll(0, 100);
    const settled = tickAnchorScroll(anim, 5000);
    expect(settled.done).toBe(true);
    expect(settled.value).toBeCloseTo(100, 1);
  });

  it('exposes spring parameters as an immutable constant', () => {
    expect(ANCHOR_SCROLL_SPRING.stiffness).toBe(300);
    expect(ANCHOR_SCROLL_SPRING.damping).toBe(30);
    expect(ANCHOR_SCROLL_SPRING.mass).toBe(1);
  });

  it('produces deterministic output for the same inputs', () => {
    const anim1 = startAnchorScroll(0, 200);
    const anim2 = startAnchorScroll(0, 200);
    expect(tickAnchorScroll(anim1, 100).value).toBe(tickAnchorScroll(anim2, 100).value);
  });
});
