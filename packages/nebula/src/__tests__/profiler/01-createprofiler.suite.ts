// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── createProfiler ─────────────────────────────────────────────────────────

describe('createProfiler', () => {
  it('creates a profiler with default options', () => {
    const p = createProfiler();
    expect(p.frameBudget).toBe(16);
    expect(p.getFrames()).toEqual([]);
  });

  it('creates a profiler with custom frame budget', () => {
    const p = createProfiler({ frameBudget: 32 });
    expect(p.frameBudget).toBe(32);
  });
});
