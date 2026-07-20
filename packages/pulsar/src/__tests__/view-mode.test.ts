import { describe, expect, it } from 'vitest';
import { markdownView } from '../view-mode.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('markdownView', () => {
  const source = `# Heading 1\n\nFirst paragraph.\n\n## Heading 2\n\nSecond paragraph.\n\n- list item\n\n### Heading 3\n\nThird paragraph.`;

  it('full mode renders everything', () => {
    const vnode = markdownView(source, 'full');
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    expect(vnode.children.length).toBeGreaterThan(3);
  });

  it('outline mode renders only headings', () => {
    const vnode = markdownView(source, 'outline');
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    const plain = stripAnsi(vnode.children.map((c) => (c.kind === 'text' ? c.content : '')).join('\n'));
    expect(plain).toContain('Heading 1');
    expect(plain).toContain('Heading 2');
    expect(plain).toContain('Heading 3');
    expect(plain).not.toContain('First paragraph');
    expect(plain).not.toContain('list item');
  });

  it('summary mode renders headings + first paragraph', () => {
    const vnode = markdownView(source, 'summary');
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    const plain = stripAnsi(vnode.children.map((c) => (c.kind === 'text' ? c.content : '')).join('\n'));
    expect(plain).toContain('Heading 1');
    expect(plain).toContain('First paragraph');
    expect(plain).toContain('Heading 2');
    expect(plain).toContain('Second paragraph');
    expect(plain).not.toContain('list item');
  });

  it('falls back to full for empty source', () => {
    const vnode = markdownView('', 'outline');
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('');
    }
  });

  it('summary mode with heading having no following paragraph', () => {
    const src = `# Title\n\n## Subtitle`;
    const vnode = markdownView(src, 'summary');
    expect(vnode.kind).toBe('column');
    if (vnode.kind !== 'column') return;
    const plain = stripAnsi(vnode.children.map((c) => (c.kind === 'text' ? c.content : '')).join('\n'));
    expect(plain).toContain('Title');
    expect(plain).toContain('Subtitle');
  });
});
