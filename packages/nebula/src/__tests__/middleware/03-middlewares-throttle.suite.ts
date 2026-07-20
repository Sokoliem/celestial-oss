// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { middlewares } from '../../middleware.js';

// ─── Test types ──────────────────────────────────────────────────────────────

type TestMsg =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'set'; value: number }
  | { type: 'keypress'; key: string }
  | { type: 'undo' }
  | { type: 'redo' };

interface TestModel {
  count: number;
}

// ─── Tests: throttle middleware ──────────────────────────────────────────────

describe('middlewares.throttle', () => {
  it('passes first matching message through', () => {
    vi.useFakeTimers();

    const throttle = middlewares.throttle<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100);

    const model: TestModel = { count: 0 };

    // First keypress passes through
    const result1 = throttle.process({ type: 'keypress', key: 'a' }, model);
    expect(result1).toEqual({ type: 'keypress', key: 'a' });

    vi.useRealTimers();
  });

  it('swallows subsequent matching messages within throttle window', () => {
    vi.useFakeTimers();

    const throttle = middlewares.throttle<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100);

    const model: TestModel = { count: 0 };

    // First passes
    throttle.process({ type: 'keypress', key: 'a' }, model);

    // Second within window is swallowed
    const result2 = throttle.process({ type: 'keypress', key: 'b' }, model);
    expect(result2).toBeNull();

    vi.useRealTimers();
  });

  it('allows message after throttle window expires', () => {
    vi.useFakeTimers();

    const throttle = middlewares.throttle<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100);

    const model: TestModel = { count: 0 };

    // First passes
    throttle.process({ type: 'keypress', key: 'a' }, model);

    // Advance past throttle window
    vi.advanceTimersByTime(101);

    // Now this should pass
    const result = throttle.process({ type: 'keypress', key: 'c' }, model);
    expect(result).toEqual({ type: 'keypress', key: 'c' });

    vi.useRealTimers();
  });

  it('passes through non-matching messages', () => {
    vi.useFakeTimers();

    const throttle = middlewares.throttle<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100);

    const model: TestModel = { count: 0 };
    const msg: TestMsg = { type: 'increment' };

    const result = throttle.process(msg, model);
    expect(result).toBe(msg);

    vi.useRealTimers();
  });

  it('has name "throttle"', () => {
    const throttle = middlewares.throttle<TestModel, TestMsg>(() => true, 100);
    expect(throttle.name).toBe('throttle');
  });
});
