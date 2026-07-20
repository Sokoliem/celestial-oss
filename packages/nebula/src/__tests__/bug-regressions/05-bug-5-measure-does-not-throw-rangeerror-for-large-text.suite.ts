// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { type ColumnNode, measure, type RowNode, type TextNode } from '../../vdom.js';

// ─── Bug #5: Math.max(...spread) RangeError for large arrays ────────────────

describe('Bug #5: measure does not throw RangeError for large text', () => {
  it('should handle text with many lines without throwing RangeError', () => {
    // Math.max(...array) causes "Maximum call stack size exceeded" for
    // large arrays because it spreads all elements as function arguments.
    // Node.js V8 typically fails around 125K-200K arguments.
    const manyLines = Array.from({ length: 200_000 }, (_, i) => `line ${i}`).join('\n');
    const node: TextNode = { kind: 'text', content: manyLines };

    // Before fix: throws RangeError: Maximum call stack size exceeded
    // After fix: works correctly with reduce
    expect(() => measure(node)).not.toThrow();

    const result = measure(node);
    expect(result.height).toBe(200_000);
    expect(result.width).toBeGreaterThan(0);
  });

  it('should handle row with many children without throwing RangeError', () => {
    const children: TextNode[] = Array.from({ length: 200_000 }, (_, i) => ({
      kind: 'text' as const,
      content: `c${i}`,
    }));
    const node: RowNode = { kind: 'row', children };

    expect(() => measure(node)).not.toThrow();
    const result = measure(node);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should handle column with many children without throwing RangeError', () => {
    const children: TextNode[] = Array.from({ length: 200_000 }, (_, i) => ({
      kind: 'text' as const,
      content: `c${i}`,
    }));
    const node: ColumnNode = { kind: 'column', children };

    expect(() => measure(node)).not.toThrow();
    const result = measure(node);
    expect(result.width).toBeGreaterThan(0);
  });

  it('should still measure normally for small text', () => {
    const node: TextNode = { kind: 'text', content: 'hello\nworld' };
    const result = measure(node);
    expect(result).toEqual({ width: 5, height: 2 });
  });
});
