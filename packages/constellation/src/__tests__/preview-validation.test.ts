import { describe, expect, it } from 'vitest';
import { maxLength, minLength, pattern } from '../validation.js';

describe('validation hardening', () => {
  it('normalizes malformed length constraints', () => {
    expect(minLength(Number.NaN)('').valid).toBe(true);
    expect(maxLength(Number.POSITIVE_INFINITY)('value').valid).toBe(true);
    expect(maxLength(-10)('x').valid).toBe(false);
  });

  it('makes global and sticky patterns deterministic across calls', () => {
    const global = pattern(/^ok$/g);
    expect(global('ok').valid).toBe(true);
    expect(global('ok').valid).toBe(true);
    expect(global('no').valid).toBe(false);
  });
});
