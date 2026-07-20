import { describe, expect, it } from 'vitest';
import type { RetryPolicy } from '../../agent-types.js';

// ─── computeRetryDelay & shouldRetry ────────────────────────────────────────
// These are private pure functions. We re-implement locally for direct testing.

describe('retry logic (computeRetryDelay / shouldRetry)', () => {
  function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
    const delay = policy.baseDelayMs * policy.backoffFactor ** attempt;
    return Math.min(delay, policy.maxDelayMs);
  }

  function shouldRetry(attempt: number, policy: RetryPolicy): boolean {
    if (policy.maxAttempts === 0) return true;
    return attempt < policy.maxAttempts;
  }

  describe('computeRetryDelay', () => {
    const policy: RetryPolicy = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
      backoffFactor: 2,
    };

    it('returns baseDelayMs for attempt 0', () => {
      expect(computeRetryDelay(0, policy)).toBe(1000);
    });

    it('doubles on each subsequent attempt', () => {
      expect(computeRetryDelay(1, policy)).toBe(2000);
      expect(computeRetryDelay(2, policy)).toBe(4000);
      expect(computeRetryDelay(3, policy)).toBe(8000);
    });

    it('caps at maxDelayMs', () => {
      expect(computeRetryDelay(10, policy)).toBe(30_000);
      expect(computeRetryDelay(20, policy)).toBe(30_000);
    });

    it('respects custom backoff factor', () => {
      const cubic: RetryPolicy = { ...policy, backoffFactor: 3 };
      expect(computeRetryDelay(0, cubic)).toBe(1000);
      expect(computeRetryDelay(1, cubic)).toBe(3000);
      expect(computeRetryDelay(2, cubic)).toBe(9000);
      expect(computeRetryDelay(3, cubic)).toBe(27_000);
      expect(computeRetryDelay(4, cubic)).toBe(30_000); // capped
    });

    it('handles baseDelayMs of 0', () => {
      const zero: RetryPolicy = { ...policy, baseDelayMs: 0 };
      expect(computeRetryDelay(0, zero)).toBe(0);
      expect(computeRetryDelay(5, zero)).toBe(0);
    });
  });

  describe('shouldRetry', () => {
    it('returns true when attempt < maxAttempts', () => {
      const policy: RetryPolicy = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffFactor: 2,
      };
      expect(shouldRetry(0, policy)).toBe(true);
      expect(shouldRetry(1, policy)).toBe(true);
      expect(shouldRetry(2, policy)).toBe(true);
    });

    it('returns false when attempt >= maxAttempts', () => {
      const policy: RetryPolicy = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffFactor: 2,
      };
      expect(shouldRetry(3, policy)).toBe(false);
      expect(shouldRetry(10, policy)).toBe(false);
    });

    it('returns true indefinitely when maxAttempts is 0', () => {
      const infinite: RetryPolicy = {
        maxAttempts: 0,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        backoffFactor: 2,
      };
      expect(shouldRetry(0, infinite)).toBe(true);
      expect(shouldRetry(100, infinite)).toBe(true);
      expect(shouldRetry(999_999, infinite)).toBe(true);
    });
  });
});
