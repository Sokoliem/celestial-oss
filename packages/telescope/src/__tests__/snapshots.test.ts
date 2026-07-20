import { column, row, text, type VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { normalizeSnapshot, renderToSnapshot } from '../snapshots.js';

describe('snapshots', () => {
  // ── renderToSnapshot ───────────────────────────────────────────────

  describe('renderToSnapshot', () => {
    it('renders a text node to a snapshot string', () => {
      const vnode: VNode = text('Hello World');
      const snap = renderToSnapshot(vnode, { width: 20, height: 1 });
      expect(snap).toContain('Hello World');
    });

    it('renders a column layout to a snapshot', () => {
      const vnode: VNode = column(text('Line 1'), text('Line 2'));
      const snap = renderToSnapshot(vnode, { width: 20, height: 3 });
      expect(snap).toContain('Line 1');
      expect(snap).toContain('Line 2');
    });

    it('renders a row layout to a snapshot', () => {
      const vnode: VNode = row(text('Left'), text('Right'));
      const snap = renderToSnapshot(vnode, { width: 20, height: 1 });
      expect(snap).toContain('Left');
      expect(snap).toContain('Right');
    });

    it('preserves styles without duplicating wide-grapheme continuation cells', () => {
      const vnode: VNode = { kind: 'text', content: '界🙂Z', style: { fg: '\x1b[31m', bold: true } };
      const snap = renderToSnapshot(vnode, { width: 5, height: 1, preserveColors: true });

      expect(snap).toContain('\x1b[31m');
      expect(normalizeSnapshot(snap)).toBe('界🙂Z');
    });
  });

  // ── normalizeSnapshot ──────────────────────────────────────────────

  describe('normalizeSnapshot', () => {
    it('strips ANSI escape sequences', () => {
      const input = '\x1b[31mred text\x1b[0m';
      const normalized = normalizeSnapshot(input);
      expect(normalized).toBe('red text');
    });

    it('trims trailing whitespace from each line', () => {
      const input = 'Hello   \nWorld   ';
      const normalized = normalizeSnapshot(input);
      expect(normalized).toBe('Hello\nWorld');
    });

    it('removes trailing empty lines', () => {
      const input = 'Hello\n\n\n';
      const normalized = normalizeSnapshot(input);
      expect(normalized).toBe('Hello');
    });

    it('strips cursor positioning sequences', () => {
      const input = '\x1b[1;1HHello\x1b[2;1HWorld';
      const normalized = normalizeSnapshot(input);
      expect(normalized).not.toContain('\x1b[');
      expect(normalized).toContain('Hello');
    });
  });
});
