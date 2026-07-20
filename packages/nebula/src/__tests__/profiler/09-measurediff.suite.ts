// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createProfiler, measureDiff } from '../../profiler.js';

describe('measureDiff', () => {
  it('measures diff function execution', () => {
    const p = createProfiler();
    p.beginFrame();
    const result = measureDiff(p, () => [{ row: 0, col: 0, char: 'x' }]);
    const frame = p.endFrame();

    expect(result).toHaveLength(1);
    expect(frame.samples.some((s) => s.name === 'diff')).toBe(true);
  });
});
