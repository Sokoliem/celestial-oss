// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { column, text } from '../../elements.js';

// ─── column() ──────────────────────────────────────────────────────────────

describe('column() builder', () => {
  it('should create a ColumnNode with spread children', () => {
    const a = text('A');
    const b = text('B');
    const node = column(a, b);
    expect(node.kind).toBe('column');
    expect(node.children).toEqual([a, b]);
  });
});
