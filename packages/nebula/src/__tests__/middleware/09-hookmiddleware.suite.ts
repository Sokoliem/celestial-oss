// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { hookMiddleware } from '../../middleware.js';

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

// ─── New: hookMiddleware ────────────────────────────────────────────────────

describe('hookMiddleware', () => {
  it('calls before hook before passing message', () => {
    const beforeFn = vi.fn();
    const mw = hookMiddleware<TestModel, TestMsg>('hooks', { before: beforeFn });

    const msg: TestMsg = { type: 'increment' };
    const model: TestModel = { count: 5 };
    const result = mw.process(msg, model);

    expect(beforeFn).toHaveBeenCalledWith(msg, model);
    expect(result).toBe(msg);
  });

  it('passes message through unchanged', () => {
    const mw = hookMiddleware<TestModel, TestMsg>('hooks', {
      before: vi.fn(),
      after: vi.fn(),
    });

    const msg: TestMsg = { type: 'increment' };
    const result = mw.process(msg, { count: 0 });
    expect(result).toBe(msg);
  });

  it('has the given name', () => {
    const mw = hookMiddleware<TestModel, TestMsg>('my-hooks', {});
    expect(mw.name).toBe('my-hooks');
  });

  it('calls after hook asynchronously', async () => {
    const afterFn = vi.fn();
    const mw = hookMiddleware<TestModel, TestMsg>('hooks', { after: afterFn });

    mw.process({ type: 'increment' }, { count: 0 });

    // after fires via queueMicrotask
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(afterFn).toHaveBeenCalledOnce();
  });
});
