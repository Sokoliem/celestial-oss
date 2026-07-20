// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { scroll, text } from '../../elements.js';

// ─── scroll() ──────────────────────────────────────────────────────────────

describe('scroll() builder', () => {
  it('should create a ScrollNode with height', () => {
    const child = text('content');
    const node = scroll(child, { height: 10 });
    expect(node.kind).toBe('scroll');
    expect(node.height).toBe(10);
    expect(node.offset).toBe(0);
    expect(node.child).toBe(child);
  });

  it('should accept custom offset', () => {
    const node = scroll(text('x'), { height: 5, offset: 3 });
    expect(node.offset).toBe(3);
  });
});
