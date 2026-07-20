// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { type PersistStorage, persistMiddleware } from '../../middleware.js';

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

// ─── New: persistMiddleware ─────────────────────────────────────────────────

describe('persistMiddleware', () => {
  function createMemoryStore(): PersistStorage {
    const store = new Map<string, string>();
    return {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    };
  }

  it('has name "persist"', () => {
    const mw = persistMiddleware<TestModel, TestMsg>('test-key');
    expect(mw.name).toBe('persist');
  });

  it('passes messages through', () => {
    const mw = persistMiddleware<TestModel, TestMsg>('test-key');
    const result = mw.process({ type: 'increment' }, { count: 5 });
    expect(result).toEqual({ type: 'increment' });
  });

  it('saves model on each message', () => {
    const storage = createMemoryStore();
    const mw = persistMiddleware<TestModel, TestMsg>('test-key', storage);

    mw.process({ type: 'increment' }, { count: 5 });

    const saved = mw.loadState();
    expect(saved).toEqual({ count: 5 });
  });

  it('loads previously saved state', () => {
    const storage = createMemoryStore();
    storage.setItem('test-key', JSON.stringify({ count: 42 }));

    const mw = persistMiddleware<TestModel, TestMsg>('test-key', storage);
    expect(mw.loadState()).toEqual({ count: 42 });
  });

  it('returns null when no state saved', () => {
    const storage = createMemoryStore();
    const mw = persistMiddleware<TestModel, TestMsg>('test-key', storage);
    expect(mw.loadState()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const storage = createMemoryStore();
    storage.setItem('test-key', 'not-json');

    const mw = persistMiddleware<TestModel, TestMsg>('test-key', storage);
    expect(mw.loadState()).toBeNull();
  });

  it('saveNow saves immediately', () => {
    const storage = createMemoryStore();
    const mw = persistMiddleware<TestModel, TestMsg>('test-key', storage);

    mw.saveNow({ count: 99 });
    expect(mw.loadState()).toEqual({ count: 99 });
  });

  it('uses built-in memory storage when none provided', () => {
    const mw = persistMiddleware<TestModel, TestMsg>('test-key');
    mw.process({ type: 'increment' }, { count: 7 });
    expect(mw.loadState()).toEqual({ count: 7 });
  });
});
