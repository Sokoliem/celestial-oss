// @ts-nocheck
import { style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { link } from '../../elements.js';

// ─── link() ────────────────────────────────────────────────────────────────

describe('link() builder', () => {
  it('should create a TextNode with href set to the URL', () => {
    const node = link('https://example.com', 'Click');
    expect(node.kind).toBe('text');
    expect(node.content).toBe('Click');
    expect(node.href).toBe('https://example.com');
  });

  it('should accept raw StyleAttrs', () => {
    const node = link('url', 'label', { bold: true });
    expect(node.style?.bold).toBe(true);
  });

  it('should accept a Corona Style object', () => {
    const s = style({ italic: true });
    const node = link('url', 'label', s);
    expect(node.style?.italic).toBe(true);
  });
});
