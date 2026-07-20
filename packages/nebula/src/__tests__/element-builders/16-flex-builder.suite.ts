// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { flex, text } from '../../elements.js';

// ─── flex() ────────────────────────────────────────────────────────────────

describe('flex() builder', () => {
  it('should create a FlexNode wrapping a child', () => {
    const child = text('stretchy');
    const node = flex(child);
    expect(node.kind).toBe('flex');
    expect(node.child).toBe(child);
  });

  it('should accept flex factor and min/max constraints', () => {
    const node = flex(text('x'), { flex: 2, minWidth: 5, maxWidth: 50, minHeight: 1, maxHeight: 10 });
    expect(node.flex).toBe(2);
    expect(node.minWidth).toBe(5);
    expect(node.maxWidth).toBe(50);
    expect(node.minHeight).toBe(1);
    expect(node.maxHeight).toBe(10);
  });

  it('should default all options to undefined', () => {
    const node = flex(text('x'));
    expect(node.flex).toBeUndefined();
    expect(node.minWidth).toBeUndefined();
  });
});
