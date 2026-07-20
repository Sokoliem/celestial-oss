import type { TextNode, VNode } from '@celestial/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { describe, expect, it } from 'vitest';
import { divider } from '../divider.js';

function isTextNode(node: VNode): node is TextNode {
  return node.kind === 'text';
}

describe('divider', () => {
  // ── basic rendering ─────────────────────────────────────────────────────

  it('returns a VNode directly (pure function)', () => {
    const result = divider();
    expect(result).toBeDefined();
    expect(result).toHaveProperty('kind');
    expect((result as any).init).toBeUndefined();
  });

  it('renders as a text node', () => {
    const result = divider();
    expect(isTextNode(result)).toBe(true);
  });

  it('renders horizontal line without label', () => {
    const result = divider({ width: 20 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      // Should contain repeated dash characters (or theme glyph)
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  // ── with label ──────────────────────────────────────────────────────────

  it('renders label in center by default', () => {
    const result = divider({ label: 'OR', width: 40 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content).toContain('OR');
    }
  });

  it('renders label aligned left', () => {
    const result = divider({ label: 'Section', width: 40, align: 'left' });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content).toContain('Section');
    }
  });

  it('renders label aligned right', () => {
    const result = divider({ label: 'End', width: 40, align: 'right' });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content).toContain('End');
    }
  });

  // ── custom char ─────────────────────────────────────────────────────────

  it('uses custom character', () => {
    const result = divider({ char: '=', width: 20 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content).toContain('=');
    }
  });

  it('truncates char to single character', () => {
    const result = divider({ char: '---', width: 20 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      // The implementation slices to 1 char
      // So the line should only contain '-' repeats, not '---' repeats
      expect(result.content.replace(/[- ]/g, '').length).toBe(0);
    }
  });

  // ── width ───────────────────────────────────────────────────────────────

  it('respects width config', () => {
    const narrow = divider({ width: 10 });
    const wide = divider({ width: 50 });
    if (isTextNode(narrow) && isTextNode(wide)) {
      expect(wide.content.length).toBeGreaterThan(narrow.content.length);
    }
  });

  it('clamps width to minimum 1', () => {
    const result = divider({ width: 0 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  // ── inset ───────────────────────────────────────────────────────────────

  it('applies inset padding', () => {
    const result = divider({ width: 20, inset: 2 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      // Should start with spaces from inset
      expect(result.content.startsWith('  ')).toBe(true);
    }
  });

  // ── tone ────────────────────────────────────────────────────────────────

  it('accepts tone config', () => {
    const result = divider({ tone: 'accent' });
    expect(result).toBeDefined();
  });

  it('accepts neutral tone', () => {
    const result = divider({ tone: 'neutral' });
    expect(result).toBeDefined();
  });

  // ── label overflow ──────────────────────────────────────────────────────

  it('handles label longer than usable width', () => {
    const result = divider({ label: 'Very Long Label That Exceeds Width', width: 10 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  it('keeps wide labels within the requested cell width without splitting graphemes', () => {
    const result = divider({ label: '界界界界', width: 10 });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) {
      expect(measureTextWidth(result.content)).toBe(10);
      expect(result.content).not.toContain('\ud83d');
    }
  });

  it('normalizes non-finite widths and insets', () => {
    const result = divider({ width: Number.POSITIVE_INFINITY, inset: Number.NaN });
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) expect(measureTextWidth(result.content)).toBe(40);
  });

  it('falls back safely from invalid runtime style values', () => {
    const result = divider({ width: 12, label: 'Safe', size: 'invalid', tone: 'invalid', align: 'invalid' } as unknown as Parameters<typeof divider>[0]);
    expect(isTextNode(result)).toBe(true);
    if (isTextNode(result)) expect(measureTextWidth(result.content)).toBe(12);
  });
});
