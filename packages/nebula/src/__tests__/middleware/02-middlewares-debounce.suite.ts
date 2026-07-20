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

// ─── Tests: debounce middleware ──────────────────────────────────────────────

describe('middlewares.debounce', () => {
  it('swallows matching messages within debounce window', () => {
    vi.useFakeTimers();

    const redispatch = vi.fn();
    const debounce = middlewares.debounce<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100, redispatch);

    const model: TestModel = { count: 0 };

    // First keypress is swallowed (debounce waits)
    const result1 = debounce.process({ type: 'keypress', key: 'a' }, model);
    expect(result1).toBeNull();

    // Second keypress within window also swallowed
    const result2 = debounce.process({ type: 'keypress', key: 'b' }, model);
    expect(result2).toBeNull();

    vi.useRealTimers();
  });

  it('passes through non-matching messages immediately', () => {
    vi.useFakeTimers();

    const redispatch = vi.fn();
    const debounce = middlewares.debounce<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100, redispatch);

    const model: TestModel = { count: 0 };
    const msg: TestMsg = { type: 'increment' };

    const result = debounce.process(msg, model);
    expect(result).toBe(msg);

    vi.useRealTimers();
  });

  it('has name "debounce"', () => {
    const redispatch = vi.fn();
    const debounce = middlewares.debounce<TestModel, TestMsg>(() => true, 100, redispatch);
    expect(debounce.name).toBe('debounce');
  });

  it('redispatches the last message after the debounce delay', () => {
    vi.useFakeTimers();

    const redispatch = vi.fn();
    const debounce = middlewares.debounce<TestModel, TestMsg>((msg) => msg.type === 'keypress', 100, redispatch);

    const model: TestModel = { count: 0 };

    // Send two keypresses quickly
    debounce.process({ type: 'keypress', key: 'a' }, model);
    debounce.process({ type: 'keypress', key: 'b' }, model);

    // Not yet fired
    expect(redispatch).not.toHaveBeenCalled();

    // Advance past debounce window
    vi.advanceTimersByTime(101);

    // Only the last message should be redispatched
    expect(redispatch).toHaveBeenCalledTimes(1);
    expect(redispatch).toHaveBeenCalledWith({ type: 'keypress', key: 'b' });

    vi.useRealTimers();
  });
});
