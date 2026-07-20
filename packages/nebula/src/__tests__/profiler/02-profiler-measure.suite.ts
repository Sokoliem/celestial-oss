// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── measure ────────────────────────────────────────────────────────────────

describe('profiler.measure', () => {
  it('measures a synchronous function and returns its result', () => {
    const p = createProfiler();
    const result = p.measure('test', () => 42);
    expect(result).toBe(42);
  });

  it('records a sample for the measured operation', () => {
    const p = createProfiler();
    p.beginFrame();
    p.measure('test-op', () => {
      // simulate work
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
      return sum;
    });
    const frame = p.endFrame();
    expect(frame.samples).toHaveLength(1);
    expect(frame.samples[0]!.name).toBe('test-op');
    expect(frame.samples[0]!.duration).toBeGreaterThanOrEqual(0);
  });
});
