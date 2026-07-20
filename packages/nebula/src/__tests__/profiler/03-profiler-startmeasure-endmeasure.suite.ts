// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── startMeasure / endMeasure ──────────────────────────────────────────────

describe('profiler.startMeasure / endMeasure', () => {
  it('records a sample between start and end', () => {
    const p = createProfiler();
    p.beginFrame();
    p.startMeasure('op');
    const sample = p.endMeasure('op');
    expect(sample).not.toBeNull();
    expect(sample!.name).toBe('op');
    expect(sample!.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns null when endMeasure called without startMeasure', () => {
    const p = createProfiler();
    const sample = p.endMeasure('nonexistent');
    expect(sample).toBeNull();
  });
});
