// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { undoMiddleware } from '../../middleware.js';

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

// ─── New: undoMiddleware ────────────────────────────────────────────────────

describe('undoMiddleware', () => {
  function createUndo() {
    return undoMiddleware<TestModel, TestMsg>({
      isUndo: (msg) => msg.type === 'undo',
      isRedo: (msg) => msg.type === 'redo',
      maxHistory: 5,
    });
  }

  it('has name "undo"', () => {
    const undo = createUndo();
    expect(undo.name).toBe('undo');
  });

  it('passes normal messages through', () => {
    const undo = createUndo();
    const result = undo.process({ type: 'increment' }, { count: 0 });
    expect(result).toEqual({ type: 'increment' });
  });

  it('records model in history on normal messages', () => {
    const undo = createUndo();
    undo.process({ type: 'increment' }, { count: 0 });

    const state = undo.getUndoState();
    expect(state).not.toBeNull();
    expect(state!.past).toHaveLength(1);
    expect(state!.past[0]).toEqual({ count: 0 });
  });

  it('swallows undo messages and restores previous state', () => {
    const undo = createUndo();

    // Build up history
    undo.process({ type: 'increment' }, { count: 0 });
    undo.process({ type: 'increment' }, { count: 1 });

    // Undo
    const result = undo.process({ type: 'undo' }, { count: 2 });
    expect(result).toBeNull();

    const state = undo.getUndoState();
    expect(state!.present).toEqual({ count: 1 });
    expect(state!.future).toHaveLength(1);
  });

  it('swallows redo messages and restores next state', () => {
    const undo = createUndo();

    undo.process({ type: 'increment' }, { count: 0 });
    undo.process({ type: 'increment' }, { count: 1 });
    undo.process({ type: 'undo' }, { count: 2 });

    // Redo
    const result = undo.process({ type: 'redo' }, { count: 1 });
    expect(result).toBeNull();

    const state = undo.getUndoState();
    expect(state!.present).toEqual({ count: 2 });
    expect(state!.future).toHaveLength(0);
  });

  it('does nothing when undoing with empty history', () => {
    const undo = createUndo();

    // Initialize state
    undo.process({ type: 'increment' }, { count: 0 });
    // Undo all the way back
    undo.process({ type: 'undo' }, { count: 1 });

    // Another undo should do nothing
    const result = undo.process({ type: 'undo' }, { count: 0 });
    expect(result).toBeNull();

    const state = undo.getUndoState();
    expect(state!.past).toHaveLength(0);
  });

  it('does nothing when redoing with empty future', () => {
    const undo = createUndo();
    undo.process({ type: 'increment' }, { count: 0 });

    const result = undo.process({ type: 'redo' }, { count: 1 });
    expect(result).toBeNull();

    const state = undo.getUndoState();
    expect(state!.future).toHaveLength(0);
  });

  it('clears future on new action after undo', () => {
    const undo = createUndo();
    undo.process({ type: 'increment' }, { count: 0 });
    undo.process({ type: 'increment' }, { count: 1 });
    undo.process({ type: 'undo' }, { count: 2 });

    // New action should clear future
    undo.process({ type: 'increment' }, { count: 1 });

    const state = undo.getUndoState();
    expect(state!.future).toHaveLength(0);
  });

  it('respects maxHistory limit', () => {
    const undo = createUndo(); // maxHistory=5

    for (let i = 0; i < 10; i++) {
      undo.process({ type: 'increment' }, { count: i });
    }

    const state = undo.getUndoState();
    expect(state!.past.length).toBeLessThanOrEqual(5);
  });

  it('supports skip predicate', () => {
    const undo = undoMiddleware<TestModel, TestMsg>({
      isUndo: (msg) => msg.type === 'undo',
      isRedo: (msg) => msg.type === 'redo',
      skip: (msg) => msg.type === 'keypress',
    });

    undo.process({ type: 'increment' }, { count: 0 });
    undo.process({ type: 'keypress', key: 'a' }, { count: 1 }); // should be skipped

    const state = undo.getUndoState();
    // Only one entry in past (from the increment), keypress was skipped
    expect(state!.past).toHaveLength(1);
  });

  it('setPresent initializes undo state', () => {
    const undo = createUndo();
    undo.setPresent({ count: 42 });

    const state = undo.getUndoState();
    expect(state).not.toBeNull();
    expect(state!.present).toEqual({ count: 42 });
  });
});
