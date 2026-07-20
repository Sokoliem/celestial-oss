// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { logMiddleware } from '../../middleware.js';

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

// ─── New: logMiddleware ─────────────────────────────────────────────────────

describe('logMiddleware', () => {
  it('has name "log"', () => {
    const mw = logMiddleware<TestModel, TestMsg>();
    expect(mw.name).toBe('log');
  });

  it('records timestamped entries', () => {
    const mw = logMiddleware<TestModel, TestMsg>();
    const before = Date.now();
    mw.process({ type: 'increment' }, { count: 0 });
    const after = Date.now();

    const log = mw.getLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.msg).toEqual({ type: 'increment' });
    expect(log[0]!.model).toEqual({ count: 0 });
    expect(log[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(log[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  it('respects filter', () => {
    const mw = logMiddleware<TestModel, TestMsg>({
      filter: (msg) => msg.type === 'increment',
    });

    mw.process({ type: 'increment' }, { count: 0 });
    mw.process({ type: 'decrement' }, { count: 1 });
    mw.process({ type: 'increment' }, { count: 0 });

    expect(mw.getLog()).toHaveLength(2);
  });

  it('respects maxEntries', () => {
    const mw = logMiddleware<TestModel, TestMsg>({ maxEntries: 3 });

    for (let i = 0; i < 5; i++) {
      mw.process({ type: 'increment' }, { count: i });
    }

    expect(mw.getLog()).toHaveLength(3);
  });

  it('clearLog empties the log', () => {
    const mw = logMiddleware<TestModel, TestMsg>();
    mw.process({ type: 'increment' }, { count: 0 });
    mw.clearLog();
    expect(mw.getLog()).toHaveLength(0);
  });

  it('passes messages through unchanged', () => {
    const mw = logMiddleware<TestModel, TestMsg>();
    const msg: TestMsg = { type: 'increment' };
    const result = mw.process(msg, { count: 0 });
    expect(result).toBe(msg);
  });
});
