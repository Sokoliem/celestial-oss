// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { columnWithGap, text } from '../../elements.js';

describe('columnWithGap() builder', () => {
  it('should create a ColumnNode with gap', () => {
    const a = text('A');
    const b = text('B');
    const node = columnWithGap(1, a, b);
    expect(node.kind).toBe('column');
    expect(node.gap).toBe(1);
    expect(node.children).toEqual([a, b]);
  });
});
