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

// ─── Tests: logger middleware ────────────────────────────────────────────────

describe('middlewares.logger', () => {
  it('passes through message unchanged', () => {
    const logFn = vi.fn();
    const logger = middlewares.logger<TestModel, TestMsg>(logFn);

    const msg: TestMsg = { type: 'increment' };
    const model: TestModel = { count: 0 };

    const result = logger.process(msg, model);
    expect(result).toBe(msg);
    expect(logFn).toHaveBeenCalledWith(msg);
  });

  it('has name "logger"', () => {
    const logger = middlewares.logger<TestModel, TestMsg>();
    expect(logger.name).toBe('logger');
  });

  it('works without custom log function', () => {
    const logger = middlewares.logger<TestModel, TestMsg>();
    const msg: TestMsg = { type: 'increment' };
    const model: TestModel = { count: 0 };

    // Should not throw and should pass through
    const result = logger.process(msg, model);
    expect(result).toBe(msg);
  });
});
