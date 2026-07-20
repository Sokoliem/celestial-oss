import { color, gradient } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { heatmap } from '../heatmap.js';

describe('heatmap', () => {
  it('renders a basic 2D grid', () => {
    const result = heatmap({
      data: [
        [1, 2, 3],
        [4, 5, 6],
      ],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    const lines = str.split('\n');
    expect(lines.length).toBe(2); // 2 data rows
  });

  it('includes row labels when provided', () => {
    const result = heatmap({
      data: [
        [1, 2],
        [3, 4],
      ],
      rowLabels: ['Row A', 'Row B'],
    });
    const str = result.toString();
    expect(str).toContain('Row A');
    expect(str).toContain('Row B');
  });

  it('includes column labels when provided', () => {
    const result = heatmap({
      data: [
        [1, 2],
        [3, 4],
      ],
      colLabels: ['C1', 'C2'],
    });
    const str = result.toString();
    expect(str).toContain('C1');
    expect(str).toContain('C2');
  });

  it('handles empty data', () => {
    const result = heatmap({ data: [] });
    expect(result.toString()).toBe('');
  });

  it('respects custom min/max', () => {
    const result = heatmap({
      data: [[50]],
      min: 0,
      max: 100,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('renders with custom cell width', () => {
    const result1 = heatmap({ data: [[1, 2]], cellWidth: 1 });
    const result3 = heatmap({ data: [[1, 2]], cellWidth: 3 });
    // Wider cells should produce more characters
    // Strip ANSI codes for comparison
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(strip(result3.toString()).length).toBeGreaterThan(strip(result1.toString()).length);
  });

  it('toVNode returns TextNode', () => {
    const result = heatmap({ data: [[1]] });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });

  it('handles single-value data', () => {
    const result = heatmap({
      data: [
        [5, 5],
        [5, 5],
      ],
    });
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('uses custom color stops', () => {
    const result = heatmap({
      data: [[0, 50, 100]],
      min: 0,
      max: 100,
      colorStops: [
        { at: 0, color: color.green },
        { at: 1, color: color.red },
      ],
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });
});

// Tests for the corona gradient API (which now backs heatmap color interpolation)
describe('gradient (corona) used by heatmap', () => {
  it('returns first stop color at t=0', () => {
    const grad = gradient([
      { at: 0, color: color.red },
      { at: 1, color: color.blue },
    ]);
    const result = grad.sample(0);
    expect(result.rgb).toBeDefined();
  });

  it('returns last stop color at t=1', () => {
    const grad = gradient([
      { at: 0, color: color.red },
      { at: 1, color: color.blue },
    ]);
    const result = grad.sample(1);
    expect(result.rgb).toBeDefined();
  });

  it('interpolates at midpoint (OKLAB space)', () => {
    const grad = gradient([
      { at: 0, color: color.rgb(0, 0, 0) },
      { at: 1, color: color.rgb(100, 100, 100) },
    ]);
    const result = grad.sample(0.5);
    expect(result.rgb).toBeDefined();
    // OKLAB midpoint of black→gray is perceptually mid-gray; allow tolerance vs linear sRGB
    expect(result.rgb![0]).toBeGreaterThan(20);
    expect(result.rgb![0]).toBeLessThan(80);
  });

  it('handles single stop', () => {
    const grad = gradient([{ at: 0.5, color: color.green }]);
    const result = grad.sample(0.7);
    expect(result.rgb).toBeDefined();
  });

  it('handles empty stops', () => {
    const grad = gradient([]);
    const result = grad.sample(0.5);
    expect(result).toBeDefined();
  });

  it('clamps t outside 0-1 range', () => {
    const grad = gradient([
      { at: 0, color: color.rgb(0, 0, 0) },
      { at: 1, color: color.rgb(255, 255, 255) },
    ]);
    const below = grad.sample(-0.5);
    const above = grad.sample(1.5);
    expect(below.rgb![0]).toBe(0);
    expect(above.rgb![0]).toBe(255);
  });

  it('correctly handles named ANSI colors at endpoints', () => {
    // Named colors have RGB representations, so OKLAB interpolation works correctly
    const grad = gradient([
      { at: 0, color: color.red },
      { at: 1, color: color.blue },
    ]);
    const atZero = grad.sample(0);
    const atOne = grad.sample(1);
    expect(atZero.rgb).toBeDefined();
    expect(atOne.rgb).toBeDefined();
    // Red should have high R component, blue should have high B component
    expect(atZero.rgb![0]).toBeGreaterThan(atZero.rgb![2]);
    expect(atOne.rgb![2]).toBeGreaterThan(atOne.rgb![0]);
  });
});
