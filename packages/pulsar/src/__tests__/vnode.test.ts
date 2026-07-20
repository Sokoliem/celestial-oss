import type { VNode as NebulaVNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { markdown } from '../vnode.js';

/** Strip ANSI codes for content assertions */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('markdown()', () => {
  it('is assignable to a nebula VNode', () => {
    const vnode: NebulaVNode = markdown('Hello world');
    expect(vnode.kind).toBe('column');
  });

  // ── Empty Input ───────────────────────────────────────────────────────

  describe('empty input', () => {
    it('returns a text VNode for empty string', () => {
      const vnode = markdown('');
      expect(vnode.kind).toBe('text');
      if (vnode.kind === 'text') {
        expect(vnode.content).toBe('');
      }
    });

    it('returns a text VNode for whitespace-only string', () => {
      const vnode = markdown('   ');
      expect(vnode.kind).toBe('text');
      if (vnode.kind === 'text') {
        expect(vnode.content).toBe('');
      }
    });
  });

  // ── Single Heading ────────────────────────────────────────────────────

  describe('single heading', () => {
    it('returns a column VNode with one child for h1', () => {
      const vnode = markdown('# Hello');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        expect(child.kind).toBe('text');
        if (child.kind === 'text') {
          expect(stripAnsi(child.content)).toContain('Hello');
        }
      }
    });
  });

  // ── Paragraph ─────────────────────────────────────────────────────────

  describe('paragraph', () => {
    it('returns a column with one text child', () => {
      const vnode = markdown('Hello world');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        expect(child.kind).toBe('text');
        if (child.kind === 'text') {
          expect(stripAnsi(child.content)).toContain('Hello world');
        }
      }
    });
  });

  // ── Multiple Blocks ───────────────────────────────────────────────────

  describe('multiple blocks', () => {
    it('returns a column with multiple children for heading + paragraph + list', () => {
      const vnode = markdown('# Title\n\nSome text.\n\n- item 1\n- item 2');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(3);
      }
    });
  });

  // ── Code Block ────────────────────────────────────────────────────────

  describe('code block', () => {
    it('returns a column with one text VNode for a code block', () => {
      const vnode = markdown('```typescript\nconst x = 1;\n```');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        expect(child.kind).toBe('text');
        if (child.kind === 'text') {
          expect(stripAnsi(child.content)).toContain('const');
        }
      }
    });
  });

  // ── List ──────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns a column containing a column of list items', () => {
      const vnode = markdown('- one\n- two\n- three');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const listNode = vnode.children[0]!;
        // List renders as a column of items
        expect(listNode.kind).toBe('column');
        if (listNode.kind === 'column') {
          expect(listNode.children).toHaveLength(3);
          // Each item is a text node with a bullet
          for (const item of listNode.children) {
            expect(item.kind).toBe('text');
          }
        }
      }
    });
  });

  // ── Blockquote ────────────────────────────────────────────────────────

  describe('blockquote', () => {
    it('returns a column containing a box for a blockquote', () => {
      const vnode = markdown('> quoted text');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        // Blockquotes are wrapped in a box
        expect(child.kind).toBe('box');
        if (child.kind === 'box') {
          expect(child.children.length).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('preserves dim styling metadata for blockquotes', () => {
      const vnode = markdown('> quoted text');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        const child = vnode.children[0]!;
        expect(child.kind).toBe('box');
        if (child.kind === 'box') {
          expect(child.style).toEqual({ dim: true });
        }
      }
    });
  });

  // ── Horizontal Rule ───────────────────────────────────────────────────

  describe('horizontal rule', () => {
    it('returns a styled text node for hr', () => {
      const vnode = markdown('---');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        expect(child.kind).toBe('text');
        if (child.kind === 'text') {
          expect(child.style).toEqual({ dim: true });
          expect(stripAnsi(child.content)).toContain('─');
        }
      }
    });
  });

  // ── Table ─────────────────────────────────────────────────────────────

  describe('table', () => {
    it('returns a column with a child containing header and body rows', () => {
      const vnode = markdown('| A | B |\n| --- | --- |\n| 1 | 2 |');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const tableNode = vnode.children[0]!;
        // Table renders as column(headerRow, ...bodyRows)
        expect(tableNode.kind).toBe('column');
        if (tableNode.kind === 'column') {
          // header row + 1 body row = 2 children
          expect(tableNode.children).toHaveLength(2);
          // Header row is a row node
          expect(tableNode.children[0]!.kind).toBe('row');
          // Body row is also a row node
          expect(tableNode.children[1]!.kind).toBe('row');
        }
      }
    });
  });

  // ── Admonition ────────────────────────────────────────────────────────

  describe('admonition', () => {
    it('returns a column with an admonition VNode (column with title + content)', () => {
      const vnode = markdown('> [!NOTE]\n> Important info');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const admonitionNode = vnode.children[0]!;
        // Admonitions render as column(title, ...content)
        expect(admonitionNode.kind).toBe('column');
        if (admonitionNode.kind === 'column') {
          // Title text + at least one content child
          expect(admonitionNode.children.length).toBeGreaterThanOrEqual(2);
          // First child is the title text node
          expect(admonitionNode.children[0]!.kind).toBe('text');
        }
      }
    });
  });

  // ── Image ─────────────────────────────────────────────────────────────

  describe('image', () => {
    it('returns a column with a text VNode containing image placeholder', () => {
      const vnode = markdown('![alt text](https://example.com/img.png)');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        expect(child.kind).toBe('text');
        if (child.kind === 'text') {
          const plain = stripAnsi(child.content);
          expect(plain).toContain('alt text');
        }
      }
    });
  });

  // ── Footnote Definition ───────────────────────────────────────────────

  describe('footnote definition', () => {
    it('returns a column with a row VNode (label + content)', () => {
      const vnode = markdown('[^1]: Some definition');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const child = vnode.children[0]!;
        // Footnote defs render as row(label, column(...content))
        expect(child.kind).toBe('row');
        if (child.kind === 'row') {
          expect(child.children).toHaveLength(2);
          // First child is the label text
          expect(child.children[0]!.kind).toBe('text');
          // Second child is the content column
          expect(child.children[1]!.kind).toBe('column');
        }
      }
    });
  });

  // ── Task List ─────────────────────────────────────────────────────────

  describe('task list', () => {
    it('returns a column with a column of task-item rows', () => {
      const vnode = markdown('- [x] Done\n- [ ] Todo');
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        expect(vnode.children).toHaveLength(1);
        const listNode = vnode.children[0]!;
        expect(listNode.kind).toBe('column');
        if (listNode.kind === 'column') {
          expect(listNode.children).toHaveLength(2);
          // Task items emit a row(checkbox, label) so the checkbox can be
          // hit-tested independently of the label text.
          for (const item of listNode.children) {
            expect(item.kind).toBe('row');
          }
        }
      }
    });

    it('tags the checkbox VNode with task-toggle data and an itemIndex', () => {
      const vnode = markdown('- [x] Done\n- [ ] Todo');
      if (vnode.kind !== 'column') throw new Error('expected column');
      const listNode = vnode.children[0]!;
      if (listNode.kind !== 'column') throw new Error('expected list column');

      const firstItem = listNode.children[0]!;
      const secondItem = listNode.children[1]!;
      if (firstItem.kind !== 'row' || secondItem.kind !== 'row') throw new Error('expected rows');

      const firstCheckbox = firstItem.children[0]!;
      const secondCheckbox = secondItem.children[0]!;
      expect(firstCheckbox.kind).toBe('text');
      if (firstCheckbox.kind === 'text') {
        expect(firstCheckbox.data).toEqual({ kind: 'task-toggle', itemIndex: 0, checked: true });
      }
      if (secondCheckbox.kind === 'text') {
        expect(secondCheckbox.data).toEqual({ kind: 'task-toggle', itemIndex: 1, checked: false });
      }
    });
  });

  // ── Interactive Inline Tokens ─────────────────────────────────────────

  describe('interactive inline tokens', () => {
    it('keeps a paragraph without interactive tokens as a single text node', () => {
      const vnode = markdown('Just plain text');
      if (vnode.kind !== 'column') throw new Error('expected column');
      const child = vnode.children[0]!;
      expect(child.kind).toBe('text');
    });

    it('splits a paragraph containing a link into a row of segments', () => {
      const vnode = markdown('Read [the docs](https://example.com) for more.');
      if (vnode.kind !== 'column') throw new Error('expected column');
      const child = vnode.children[0]!;
      expect(child.kind).toBe('row');
      if (child.kind !== 'row') return;
      // Expect at least one segment to be a link-tagged text node.
      const linkSegment = child.children.find((seg) => seg.kind === 'text' && seg.data?.kind === 'link');
      expect(linkSegment).toBeDefined();
      if (linkSegment && linkSegment.kind === 'text' && linkSegment.data?.kind === 'link') {
        expect(linkSegment.data.url).toBe('https://example.com');
        expect(linkSegment.data.text).toBe('the docs');
      }
    });

    it('emits href on link nodes when hyperlinks option is enabled', () => {
      const vnode = markdown('Visit [home](https://example.com).', { hyperlinks: true });
      if (vnode.kind !== 'column') throw new Error('expected column');
      const child = vnode.children[0]!;
      if (child.kind !== 'row') throw new Error('expected row');
      const linkSegment = child.children.find((seg) => seg.kind === 'text' && seg.data?.kind === 'link');
      if (!linkSegment || linkSegment.kind !== 'text') throw new Error('expected link segment');
      expect(linkSegment.href).toBe('https://example.com');
    });

    it('does not set href when hyperlinks option is unset', () => {
      const vnode = markdown('Visit [home](https://example.com).');
      if (vnode.kind !== 'column') throw new Error('expected column');
      const child = vnode.children[0]!;
      if (child.kind !== 'row') throw new Error('expected row');
      const linkSegment = child.children.find((seg) => seg.kind === 'text' && seg.data?.kind === 'link');
      if (!linkSegment || linkSegment.kind !== 'text') throw new Error('expected link segment');
      expect(linkSegment.href).toBeUndefined();
    });

    it('tags footnote references in a paragraph', () => {
      const vnode = markdown('See note[^1] for context.\n\n[^1]: details');
      if (vnode.kind !== 'column') throw new Error('expected column');
      const para = vnode.children[0]!;
      expect(para.kind).toBe('row');
      if (para.kind !== 'row') return;
      const refSegment = para.children.find((seg) => seg.kind === 'text' && seg.data?.kind === 'footnote-ref');
      expect(refSegment).toBeDefined();
      if (refSegment && refSegment.kind === 'text' && refSegment.data?.kind === 'footnote-ref') {
        expect(refSegment.data.label).toBe('1');
      }
    });
  });

  // ── Options Passing ───────────────────────────────────────────────────

  describe('options passing', () => {
    it('does not throw when passing width option', () => {
      expect(() => markdown('Hello', { width: 40 })).not.toThrow();
    });

    it('returns a valid VNode when options are provided', () => {
      const vnode = markdown('Hello', { width: 40 });
      expect(vnode.kind).toBe('column');
    });
  });

  // ── Complex Document ──────────────────────────────────────────────────

  describe('complex document', () => {
    it('does not throw and returns a column VNode for a full document', () => {
      const doc = [
        '# Main Title',
        '',
        'A paragraph with **bold** and *italic* text.',
        '',
        '## Section',
        '',
        '- item one',
        '- item two',
        '- item three',
        '',
        '```javascript',
        'function greet() {',
        '  return "hello";',
        '}',
        '```',
        '',
        '> A blockquote with some wisdom.',
        '',
        '| Name | Value |',
        '| ---- | ----- |',
        '| foo  | 42    |',
        '',
        '---',
        '',
        'Final paragraph.',
      ].join('\n');

      expect(() => markdown(doc)).not.toThrow();

      const vnode = markdown(doc);
      expect(vnode.kind).toBe('column');
      if (vnode.kind === 'column') {
        // heading + paragraph + heading + list + code block + blockquote + table + hr + paragraph = 9
        expect(vnode.children.length).toBeGreaterThanOrEqual(8);
        // Every child should have a valid kind
        for (const child of vnode.children) {
          expect(child.kind).toBeDefined();
          expect(typeof child.kind).toBe('string');
        }
      }
    });
  });
});
