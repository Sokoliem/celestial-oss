// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { row, text } from '../../elements.js';

// ─── row() ─────────────────────────────────────────────────────────────────

describe('row() builder', () => {
  it('should create a RowNode with spread children', () => {
    const a = text('A');
    const b = text('B');
    const node = row(a, b);
    expect(node.kind).toBe('row');
    expect(node.children).toEqual([a, b]);
  });

  it('should handle zero children', () => {
    const node = row();
    expect(node.children).toEqual([]);
  });
});
