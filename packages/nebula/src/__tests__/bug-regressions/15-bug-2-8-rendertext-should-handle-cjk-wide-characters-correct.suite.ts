// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';
import { planLayout, rasterize, type TextNode } from '../../vdom.js';

// ─── Bug 2.8: renderText uses code-unit index as column, corrupting CJK ─────

describe('Bug 2.8: renderText should handle CJK wide characters correctly', () => {
  it('should place CJK characters at correct column offsets', () => {
    // CJK characters take 2 terminal columns each
    const text: TextNode = { kind: 'text', content: '\u4F60\u597D' }; // "nihao" in Chinese

    const plan = planLayout(text, 20, 1);
    const grid = rasterize(plan);

    // First CJK char at col 0, second at col 2 (each takes 2 cells)
    expect(grid.cells[0]![0]!.char).toBe('\u4F60');
    expect(grid.cells[0]![2]!.char).toBe('\u597D');
  });

  it('should handle mixed ASCII and CJK text', () => {
    // 'A' (1 col) + CJK (2 cols) + 'B' (1 col) = 4 cols
    const text: TextNode = { kind: 'text', content: 'A\u4F60B' };

    const plan = planLayout(text, 20, 1);
    const grid = rasterize(plan);

    expect(grid.cells[0]![0]!.char).toBe('A'); // col 0
    expect(grid.cells[0]![1]!.char).toBe('\u4F60'); // col 1 (wide char)
    expect(grid.cells[0]![3]!.char).toBe('B'); // col 3 (after 2-col wide char)
  });

  it('should preserve surrogate-pair emoji as a single glyph', () => {
    const text: TextNode = { kind: 'text', content: '🦙X' };

    const plan = planLayout(text, 20, 1);
    const grid = rasterize(plan);

    expect(grid.cells[0]![0]!.char).toBe('🦙');
    expect(grid.cells[0]![2]!.char).toBe('X');
  });

  it('should preserve ANSI-styled surrogate-pair emoji as a single glyph', () => {
    const text: TextNode = { kind: 'text', content: '\x1b[33m🦙\x1b[0mX' };

    const plan = planLayout(text, 20, 1);
    const grid = rasterize(plan);

    expect(grid.cells[0]![0]!.char).toBe('🦙');
    expect(grid.cells[0]![2]!.char).toBe('X');
  });
});
