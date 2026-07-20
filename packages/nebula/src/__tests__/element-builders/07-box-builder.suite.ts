// @ts-nocheck
import { border, style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { box, text } from '../../elements.js';

// ─── box() ─────────────────────────────────────────────────────────────────

describe('box() builder', () => {
  it('should wrap a child in a BoxNode', () => {
    const child = text('inside');
    const node = box(child);
    expect(node.kind).toBe('box');
    expect(node.children).toEqual([child]);
  });

  it('should extract border chars from Corona Border', () => {
    const s = style({ border: border.rounded });
    const node = box(text('hi'), s);
    expect(node.border).toBeDefined();
    expect(node.border!.topLeft).toBe(border.rounded.chars.topLeft);
  });

  it('should apply width/height/overflow from options', () => {
    const node = box(text('x'), undefined, { width: 20, height: 10, overflow: 'hidden' });
    expect(node.width).toBe(20);
    expect(node.height).toBe(10);
    expect(node.overflow).toBe('hidden');
  });

  it('should default scrollOffset from options', () => {
    const node = box(text('x'), undefined, { scrollOffset: 5 });
    expect(node.scrollOffset).toBe(5);
  });
});
