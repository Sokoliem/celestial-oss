import { color } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { arcGauge, barGauge } from '../gauge.js';

// ── arcGauge ─────────────────────────────────────────────────────────────

describe('arcGauge', () => {
  it('returns GaugeResult with toString and toVNode', () => {
    const result = arcGauge({ value: 75 });
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('computes correct normalized value', () => {
    expect(arcGauge({ value: 50, min: 0, max: 100 }).normalized).toBeCloseTo(0.5);
    expect(arcGauge({ value: 0, min: 0, max: 100 }).normalized).toBeCloseTo(0);
    expect(arcGauge({ value: 100, min: 0, max: 100 }).normalized).toBeCloseTo(1);
  });

  it('clamps normalized to 0-1', () => {
    expect(arcGauge({ value: -50, min: 0, max: 100 }).normalized).toBe(0);
    expect(arcGauge({ value: 200, min: 0, max: 100 }).normalized).toBe(1);
  });

  it('shows value by default', () => {
    const result = arcGauge({ value: 42 });
    expect(result.toString()).toContain('42');
  });

  it('hides value when showValue is false', () => {
    const result = arcGauge({ value: 42, showValue: false });
    expect(result.toString()).not.toContain('42');
  });

  it('uses custom format', () => {
    const result = arcGauge({
      value: 75,
      format: (v) => `${v}%`,
    });
    expect(result.toString()).toContain('75%');
  });

  it('toVNode returns TextNode', () => {
    const result = arcGauge({ value: 50 });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });

  it('respects custom dimensions', () => {
    const result = arcGauge({ value: 50, width: 30, height: 10 });
    const lines = result.toString().split('\n');
    // Canvas lines + value line
    expect(lines.length).toBeGreaterThan(5);
  });

  it('fill arc should not be overwritten by background arc', () => {
    // When bgColor is set, the background should not overpaint the fill region.
    // The fill color should be visible for a gauge at 50%.
    const fillColor = color.red;
    const bgColor = color.gray;
    const result = arcGauge({
      value: 50,
      min: 0,
      max: 100,
      color: fillColor,
      bgColor,
      width: 20,
      height: 6,
    });
    const output = result.toString();
    // The output should contain the fill color (red) ANSI code
    // Red is \x1b[31m
    expect(output).toContain('\x1b[31m');
  });
});

// ── barGauge ─────────────────────────────────────────────────────────────

describe('barGauge', () => {
  it('returns GaugeResult with toString and toVNode', () => {
    const result = barGauge({ value: 50 });
    expect(typeof result.toString).toBe('function');
    expect(typeof result.toVNode).toBe('function');
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('computes correct normalized value', () => {
    expect(barGauge({ value: 25, min: 0, max: 100 }).normalized).toBeCloseTo(0.25);
    expect(barGauge({ value: 75, min: 0, max: 100 }).normalized).toBeCloseTo(0.75);
  });

  it('shows value by default', () => {
    const result = barGauge({ value: 42 });
    expect(result.toString()).toContain('42');
  });

  it('hides value when showValue is false', () => {
    const result = barGauge({ value: 42, showValue: false });
    // The value should not appear anywhere in the output
    // (strip ANSI to check)
    const stripped = result.toString().replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).not.toContain('42');
  });

  it('uses custom format', () => {
    const result = barGauge({
      value: 75,
      format: (v) => `${v}%`,
    });
    expect(result.toString()).toContain('75%');
  });

  it('includes color codes', () => {
    const result = barGauge({
      value: 50,
      color: color.green,
    });
    const str = result.toString();
    expect(str).toContain('\x1b[32m'); // green fg
  });

  it('renders wider bars with more width', () => {
    const narrow = barGauge({ value: 50, width: 10 }).toString();
    const wide = barGauge({ value: 50, width: 40 }).toString();
    // Strip ANSI for length comparison
    const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(strip(wide).length).toBeGreaterThan(strip(narrow).length);
  });

  it('toVNode returns TextNode', () => {
    const result = barGauge({ value: 50 });
    const vnode = result.toVNode();
    expect(['text', 'column']).toContain(vnode.kind);
  });

  it('handles zero value', () => {
    const result = barGauge({ value: 0 });
    expect(result.normalized).toBe(0);
    expect(result.toString().length).toBeGreaterThan(0);
  });

  it('handles max value', () => {
    const result = barGauge({ value: 100 });
    expect(result.normalized).toBe(1);
    expect(result.toString().length).toBeGreaterThan(0);
  });
});

describe('gauge numeric hardening', () => {
  it('normalizes values across the full finite range', () => {
    expect(arcGauge({ value: 0, min: -Number.MAX_VALUE, max: Number.MAX_VALUE }).normalized).toBeCloseTo(0.5);
    expect(barGauge({ value: 0, min: -Number.MAX_VALUE, max: Number.MAX_VALUE }).normalized).toBeCloseTo(0.5);
  });

  it('strips formatter controls and preserves terminal-cell width', () => {
    const output = barGauge({ value: 1, width: 8, format: () => '界\x1b[2J' }).toString();
    expect(output).toContain('界');
    expect(output).not.toContain('\x1b[2J');
  });
});
