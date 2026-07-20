// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler, measureLayout } from '../../profiler.js';

describe('measureLayout', () => {
  it('measures layout function execution', () => {
    const p = createProfiler();
    p.beginFrame();
    const result = measureLayout(p, () => ({ width: 80, height: 24 }));
    const frame = p.endFrame();

    expect(result).toEqual({ width: 80, height: 24 });
    expect(frame.samples.some((s) => s.name === 'layout')).toBe(true);
  });
});
