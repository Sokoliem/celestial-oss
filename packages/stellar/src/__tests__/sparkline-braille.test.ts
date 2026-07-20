import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { sparkline } from '../sparkline.js';

describe('sparkline (braille)', () => {
  it('returns a SparklineResult with toString', () => {
    const result = sparkline({ data: [1, 3, 2, 5, 4] });
    expect(typeof result.toString).toBe('function');
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('reports min and max values', () => {
    const result = sparkline({ data: [3, 1, 4, 1, 5, 9, 2, 6] });
    expect(result.min).toBe(1);
    expect(result.max).toBe(9);
  });

  it('handles empty data', () => {
    const result = sparkline({ data: [] });
    expect(result.toString()).toBe('');
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
  });

  it('handles single data point', () => {
    const result = sparkline({ data: [42] });
    expect(result.toString().length).toBeGreaterThan(0);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
  });

  it('respects custom width', () => {
    const result = sparkline({ data: [1, 2, 3, 4, 5], width: 20 });
    const str = result.toString();
    const lines = str.split('\n');
    // Each line should be 20 chars wide (braille canvas width)
    expect(lines.length).toBe(1);
    // Strip ANSI codes for accurate length
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped.length).toBe(20);
  });

  it('respects custom height for multi-row sparkline', () => {
    const result = sparkline({
      data: [1, 5, 2, 8, 3],
      width: 10,
      height: 3,
    });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(3);
  });

  it('supports filled mode', () => {
    const filled = sparkline({ data: [1, 3, 2, 5, 4], filled: true });
    const line = sparkline({ data: [1, 3, 2, 5, 4], filled: false });
    // Filled should produce different output than line-only
    expect(filled.toString()).not.toBe(line.toString());
  });

  it('appends range when showRange is true', () => {
    const result = sparkline({
      data: [10, 20, 30],
      showRange: true,
    });
    const str = result.toString();
    expect(str).toContain('[10-30]');
  });

  it('works with color option', () => {
    const result = sparkline({
      data: [1, 2, 3],
      color: color.cyan,
    });
    const str = result.toString();
    // Should contain cyan ANSI code
    expect(str).toContain('\x1b[36m');
  });

  it('handles constant data', () => {
    const result = sparkline({ data: [5, 5, 5, 5] });
    expect(result.min).toBe(5);
    expect(result.max).toBe(5);
    expect(result.toString().length).toBeGreaterThan(0);
  });
});
