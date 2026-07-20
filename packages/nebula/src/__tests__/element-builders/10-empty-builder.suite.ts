// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { empty } from '../../elements.js';

// ─── empty() ───────────────────────────────────────────────────────────────

describe('empty() builder', () => {
  it('should create an EmptyNode with no dimensions', () => {
    const node = empty();
    expect(node.kind).toBe('empty');
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
  });

  it('should accept width and height', () => {
    const node = empty(10, 5);
    expect(node.width).toBe(10);
    expect(node.height).toBe(5);
  });
});
