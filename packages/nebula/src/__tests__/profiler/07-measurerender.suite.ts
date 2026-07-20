// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { text } from '../../elements.js';
import { createProfiler, measureRender } from '../../profiler.js';

// ─── Measurement helpers ────────────────────────────────────────────────────

describe('measureRender', () => {
  it('measures render function execution', () => {
    const p = createProfiler();
    p.beginFrame();
    const result = measureRender(p, (model: { count: number }) => text(`Count: ${model.count}`), { count: 5 });
    const frame = p.endFrame();

    expect((result as { content: string }).content).toBe('Count: 5');
    expect(frame.samples.some((s) => s.name === 'render')).toBe(true);
  });
});
