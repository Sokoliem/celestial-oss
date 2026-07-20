// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── getStats ───────────────────────────────────────────────────────────────

describe('profiler.getStats', () => {
  it('returns zero stats when no frames recorded', () => {
    const p = createProfiler();
    const stats = p.getStats();
    expect(stats.totalFrames).toBe(0);
    expect(stats.averageFrameTime).toBe(0);
    expect(stats.maxFrameTime).toBe(0);
    expect(stats.minFrameTime).toBe(0);
    expect(stats.overBudgetCount).toBe(0);
    expect(stats.overBudgetPercent).toBe(0);
  });

  it('computes stats from recorded frames', () => {
    const p = createProfiler();

    // Record a few frames
    for (let i = 0; i < 5; i++) {
      p.beginFrame();
      p.endFrame();
    }

    const stats = p.getStats();
    expect(stats.totalFrames).toBe(5);
    expect(stats.averageFrameTime).toBeGreaterThanOrEqual(0);
    expect(stats.maxFrameTime).toBeGreaterThanOrEqual(stats.minFrameTime);
  });
});
