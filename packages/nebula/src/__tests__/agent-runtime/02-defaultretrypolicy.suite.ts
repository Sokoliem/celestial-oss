import { describe, expect, it } from 'vitest';
import { defaultRetryPolicy } from '../../agent-runtime.js';

// ─── defaultRetryPolicy ─────────────────────────────────────────────────────

describe('defaultRetryPolicy', () => {
  it('has expected default values', () => {
    expect(defaultRetryPolicy).toEqual({
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      backoffFactor: 2,
    });
  });
});
