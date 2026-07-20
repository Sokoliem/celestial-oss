// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { composeMiddleware, type Middleware } from '../../middleware.js';

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

// ─── New: composeMiddleware ─────────────────────────────────────────────────

describe('composeMiddleware', () => {
  it('composes multiple middlewares into one', () => {
    const order: string[] = [];

    const mw1: Middleware<TestModel, TestMsg> = {
      name: 'a',
      process(msg) {
        order.push('a');
        return msg;
      },
    };
    const mw2: Middleware<TestModel, TestMsg> = {
      name: 'b',
      process(msg) {
        order.push('b');
        return msg;
      },
    };

    const composed = composeMiddleware(mw1, mw2);
    const result = composed.process({ type: 'increment' }, { count: 0 });

    expect(order).toEqual(['a', 'b']);
    expect(result).toEqual({ type: 'increment' });
  });

  it('has a descriptive name', () => {
    const mw1: Middleware<TestModel, TestMsg> = { name: 'a', process: (msg) => msg };
    const mw2: Middleware<TestModel, TestMsg> = { name: 'b', process: (msg) => msg };

    const composed = composeMiddleware(mw1, mw2);
    expect(composed.name).toBe('composed(a, b)');
  });

  it('returns null when inner pipeline swallows all messages', () => {
    const swallower: Middleware<TestModel, TestMsg> = {
      name: 'swallow',
      process() {
        return null;
      },
    };

    const composed = composeMiddleware(swallower);
    const result = composed.process({ type: 'increment' }, { count: 0 });
    expect(result).toBeNull();
  });

  it('returns array when inner pipeline expands messages', () => {
    const expander: Middleware<TestModel, TestMsg> = {
      name: 'expand',
      process() {
        return [{ type: 'increment' }, { type: 'decrement' }];
      },
    };

    const composed = composeMiddleware(expander);
    const result = composed.process({ type: 'set', value: 0 }, { count: 0 });
    expect(result).toEqual([{ type: 'increment' }, { type: 'decrement' }]);
  });
});
