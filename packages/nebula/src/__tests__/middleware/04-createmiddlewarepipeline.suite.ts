// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createMiddlewarePipeline, type Middleware } from '../../middleware.js';

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

// ─── Tests: createMiddlewarePipeline ─────────────────────────────────────────

describe('createMiddlewarePipeline', () => {
  it('chains middlewares in order', () => {
    const order: string[] = [];

    const mw1: Middleware<TestModel, TestMsg> = {
      name: 'first',
      process(msg, _model) {
        order.push('first');
        return msg;
      },
    };

    const mw2: Middleware<TestModel, TestMsg> = {
      name: 'second',
      process(msg, _model) {
        order.push('second');
        return msg;
      },
    };

    const pipeline = createMiddlewarePipeline(mw1, mw2);
    const result = pipeline({ type: 'increment' }, { count: 0 });

    expect(order).toEqual(['first', 'second']);
    expect(result).toEqual([{ type: 'increment' }]);
  });

  it('middleware returning null swallows the message', () => {
    const swallower: Middleware<TestModel, TestMsg> = {
      name: 'swallower',
      process(_msg, _model) {
        return null;
      },
    };

    const afterSwallow: Middleware<TestModel, TestMsg> = {
      name: 'after',
      process(msg, _model) {
        return msg;
      },
    };

    const pipeline = createMiddlewarePipeline(swallower, afterSwallow);
    const result = pipeline({ type: 'increment' }, { count: 0 });

    expect(result).toEqual([]);
  });

  it('middleware returning array expands to multiple messages', () => {
    const expander: Middleware<TestModel, TestMsg> = {
      name: 'expander',
      process(_msg, _model) {
        return [{ type: 'increment' }, { type: 'decrement' }];
      },
    };

    const pipeline = createMiddlewarePipeline(expander);
    const result = pipeline({ type: 'set', value: 0 }, { count: 0 });

    expect(result).toEqual([{ type: 'increment' }, { type: 'decrement' }]);
  });

  it('expanded messages each pass through remaining middlewares', () => {
    const expander: Middleware<TestModel, TestMsg> = {
      name: 'expander',
      process(_msg, _model) {
        return [{ type: 'increment' }, { type: 'decrement' }];
      },
    };

    const processed: TestMsg[] = [];
    const tracker: Middleware<TestModel, TestMsg> = {
      name: 'tracker',
      process(msg, _model) {
        processed.push(msg);
        return msg;
      },
    };

    const pipeline = createMiddlewarePipeline(expander, tracker);
    const result = pipeline({ type: 'set', value: 0 }, { count: 0 });

    expect(result).toEqual([{ type: 'increment' }, { type: 'decrement' }]);
    expect(processed).toEqual([{ type: 'increment' }, { type: 'decrement' }]);
  });

  it('empty pipeline passes message through', () => {
    const pipeline = createMiddlewarePipeline<TestModel, TestMsg>();
    const msg: TestMsg = { type: 'increment' };
    const result = pipeline(msg, { count: 0 });

    expect(result).toEqual([{ type: 'increment' }]);
  });

  it('multiple null returns swallow all messages', () => {
    const expander: Middleware<TestModel, TestMsg> = {
      name: 'expander',
      process(_msg, _model) {
        return [{ type: 'increment' }, { type: 'decrement' }];
      },
    };

    const swallower: Middleware<TestModel, TestMsg> = {
      name: 'swallower',
      process(_msg, _model) {
        return null;
      },
    };

    const pipeline = createMiddlewarePipeline(expander, swallower);
    const result = pipeline({ type: 'set', value: 0 }, { count: 0 });

    expect(result).toEqual([]);
  });
});
