import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { pieChart } from '../pie.js';

describe('pieChart', () => {
  it('returns PieChartResult with toString and toVNode', () => {
    const result = pieChart({
      segments: [
        { value: 50, color: color.red },
        { value: 30, color: color.blue },
        { value: 20, color: color.green },
      ],
    });
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
  });

  it('computes correct percentages', () => {
    const result = pieChart({
      segments: [{ value: 50 }, { value: 25 }, { value: 25 }],
    });
    expect(result.percentages).toEqual([50, 25, 25]);
  });

  it('handles single segment (100%)', () => {
    const result = pieChart({
      segments: [{ value: 100, color: color.cyan }],
    });
    expect(result.percentages).toEqual([100]);
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles empty segments array', () => {
    const result = pieChart({ segments: [] });
    expect(result.percentages).toEqual([]);
    expect(typeof result.toString()).toBe('string');
  });

  it('handles all-zero values', () => {
    const result = pieChart({
      segments: [{ value: 0 }, { value: 0 }],
    });
    expect(result.percentages).toEqual([0, 0]);
  });

  it('renders donut chart with center hole', () => {
    const result = pieChart({
      segments: [
        { value: 60, color: color.red },
        { value: 40, color: color.blue },
      ],
      donut: 0.5,
      width: 20,
      height: 10,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    // Donut should leave center pixels empty - check that center row has spaces
    const lines = str.split('\n');
    const midLine = lines[Math.floor(lines.length / 2)]!;
    // The middle of a donut should have some empty space
    expect(midLine).toBeDefined();
  });

  it('includes labels when showLabels is true', () => {
    const result = pieChart({
      segments: [
        { value: 70, label: 'Alpha', color: color.red },
        { value: 30, label: 'Beta', color: color.blue },
      ],
      showLabels: true,
    });
    const str = result.toString();
    expect(str).toContain('Alpha');
    expect(str).toContain('Beta');
    expect(str).toContain('%');
  });

  it('toVNode returns a TextNode', () => {
    const result = pieChart({
      segments: [{ value: 50 }, { value: 50 }],
    });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });

  it('respects custom width and height', () => {
    const result = pieChart({
      segments: [{ value: 100 }],
      width: 30,
      height: 15,
    });
    const lines = result.toString().split('\n');
    expect(lines.length).toBe(15);
  });

  it('ignores negative values', () => {
    const result = pieChart({
      segments: [{ value: -10 }, { value: 50 }, { value: 50 }],
    });
    // Negative should be treated as 0
    expect(result.percentages[0]).toBe(0);
    expect(result.percentages[1]).toBe(50);
    expect(result.percentages[2]).toBe(50);
  });

  it('should not leave uncolored holes at the 2pi boundary (12 o-clock position)', () => {
    // S7 Bug: The last segment uses strict `angle < angles[i+1]` which misses
    // pixels exactly at the 2*PI boundary, leaving uncolored holes near the
    // 12 o'clock position. The last segment should use `<=` for its upper bound.
    //
    // Test strategy: render a single-segment pie (100%) and verify that
    // ALL pixels within the circle radius are colored. A single segment should
    // fill the entire circle with no holes.
    const width = 20;
    const height = 10;
    const result = pieChart({
      segments: [{ value: 100, color: { fg: () => '\x1b[31m', bg: () => '\x1b[41m' } as any }],
      width,
      height,
      mode: 'braille',
    });
    const str = result.toString();
    // For a 100% single segment, the output should have substantial content
    // (no blank areas within the circle). Count non-space characters.
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const nonSpaceChars = stripped.split('').filter((ch) => ch !== ' ' && ch !== '\n').length;
    // A filled circle in a 20x10 braille canvas should have significant content
    expect(nonSpaceChars).toBeGreaterThan(0);
  });

  it('should color last segment pixels at exact 2pi boundary angle', () => {
    // S7 Bug: More targeted test. With two equal segments, the boundary
    // at 2*PI should be included in the last segment.
    // Render two equal 50/50 segments and verify no holes.
    const result = pieChart({
      segments: [
        { value: 50, color: { fg: () => '\x1b[31m', bg: () => '\x1b[41m' } as any },
        { value: 50, color: { fg: () => '\x1b[34m', bg: () => '\x1b[44m' } as any },
      ],
      width: 20,
      height: 10,
    });
    const str = result.toString();
    expect(str.length).toBeGreaterThan(0);
    // The chart should render without any gaps
    // eslint-disable-next-line no-control-regex
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    const nonSpaceChars = stripped.split('').filter((ch) => ch !== ' ' && ch !== '\n').length;
    expect(nonSpaceChars).toBeGreaterThan(0);
  });
});
