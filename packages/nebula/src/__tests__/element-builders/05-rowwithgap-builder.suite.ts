// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { rowWithGap, text } from '../../elements.js';

// ─── rowWithGap() / columnWithGap() ────────────────────────────────────────

describe('rowWithGap() builder', () => {
  it('should create a RowNode with gap', () => {
    const a = text('A');
    const b = text('B');
    const node = rowWithGap(2, a, b);
    expect(node.kind).toBe('row');
    expect(node.gap).toBe(2);
    expect(node.children).toEqual([a, b]);
  });
});
