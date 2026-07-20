// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler } from '../../profiler.js';

// ─── reset ──────────────────────────────────────────────────────────────────

describe('profiler.reset', () => {
  it('clears all recorded data', () => {
    const p = createProfiler();

    p.beginFrame();
    p.endFrame();
    p.beginFrame();
    p.endFrame();

    p.reset();
    expect(p.getFrames()).toEqual([]);
    expect(p.getStats().totalFrames).toBe(0);
  });

  it('resets frame counter', () => {
    const p = createProfiler();

    p.beginFrame();
    p.endFrame();

    p.reset();

    p.beginFrame();
    const frame = p.endFrame();
    expect(frame.frameNumber).toBe(0);
  });
});
