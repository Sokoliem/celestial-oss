// @ts-nocheck
import { style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { text } from '../../elements.js';
import { measure } from '../../vdom.js';

// ─── text() ────────────────────────────────────────────────────────────────

describe('text() builder', () => {
  it('should create a TextNode with string content', () => {
    const node = text('hello');
    expect(node.kind).toBe('text');
    expect(node.content).toBe('hello');
  });

  it('should evaluate function content eagerly', () => {
    const node = text(() => 'lazy');
    expect(node.content).toBe('lazy');
  });

  it('should apply Style to style attrs', () => {
    const s = style({ bold: true });
    const node = text('bold', s);
    expect(node.style?.bold).toBe(true);
  });

  it('should pass wrap and href options', () => {
    const node = text('wrapped', undefined, { wrap: true, href: 'https://example.com' });
    expect(node.wrap).toBe(true);
    expect(node.href).toBe('https://example.com');
  });

  it('should be measurable', () => {
    const size = measure(text('abc'));
    expect(size).toEqual({ width: 3, height: 1 });
  });
});
