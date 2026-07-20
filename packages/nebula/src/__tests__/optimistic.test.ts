import { describe, expect, it } from 'vitest';
import { applyOptimistic, clearResolved, confirmOptimistic, createOptimisticState, getOp, getPendingCount, rejectOptimistic } from '../optimistic.js';

// ─── createOptimisticState ──────────────────────────────────────────────────

describe('createOptimisticState', () => {
  it('creates state with empty ops', () => {
    const state = createOptimisticState<string>();
    expect(state.ops.size).toBe(0);
  });
});

// ─── applyOptimistic ────────────────────────────────────────────────────────

describe('applyOptimistic', () => {
  it('adds a pending op', () => {
    const state = createOptimisticState<string>();
    const updated = applyOptimistic(state, 'op1', 'value1');

    const op = updated.ops.get('op1');
    expect(op).toBeDefined();
    expect(op!.id).toBe('op1');
    expect(op!.optimisticValue).toBe('value1');
    expect(op!.pending).toBe(true);
    expect(op!.confirmedValue).toBeUndefined();
    expect(op!.error).toBeUndefined();
  });

  it('replaces an existing op', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'value1');
    state = applyOptimistic(state, 'op1', 'value2');

    expect(state.ops.size).toBe(1);
    const op = state.ops.get('op1');
    expect(op!.optimisticValue).toBe('value2');
    expect(op!.pending).toBe(true);
  });

  it('does not mutate the original state', () => {
    const state = createOptimisticState<string>();
    const updated = applyOptimistic(state, 'op1', 'value1');

    expect(state.ops.size).toBe(0);
    expect(updated.ops.size).toBe(1);
  });
});

// ─── confirmOptimistic ──────────────────────────────────────────────────────

describe('confirmOptimistic', () => {
  it('sets pending to false and stores confirmedValue', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'optimistic');
    const updated = confirmOptimistic(state, 'op1', 'confirmed');

    const op = updated.ops.get('op1');
    expect(op!.pending).toBe(false);
    expect(op!.confirmedValue).toBe('confirmed');
    expect(op!.error).toBeUndefined();
  });

  it('does not mutate the original state', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'optimistic');
    const updated = confirmOptimistic(state, 'op1', 'confirmed');

    expect(state.ops.get('op1')!.pending).toBe(true);
    expect(updated.ops.get('op1')!.pending).toBe(false);
  });
});

// ─── rejectOptimistic ───────────────────────────────────────────────────────

describe('rejectOptimistic', () => {
  it('sets pending to false and stores error', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'optimistic');
    const err = new Error('network failure');
    const updated = rejectOptimistic(state, 'op1', err);

    const op = updated.ops.get('op1');
    expect(op!.pending).toBe(false);
    expect(op!.error).toBe(err);
    expect(op!.confirmedValue).toBeUndefined();
  });

  it('does not mutate the original state', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'optimistic');
    const updated = rejectOptimistic(state, 'op1', new Error('fail'));

    expect(state.ops.get('op1')!.pending).toBe(true);
    expect(updated.ops.get('op1')!.pending).toBe(false);
  });
});

// ─── clearResolved ──────────────────────────────────────────────────────────

describe('clearResolved', () => {
  it('removes all non-pending ops', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'v1');
    state = applyOptimistic(state, 'op2', 'v2');
    state = applyOptimistic(state, 'op3', 'v3');
    // Confirm op1, reject op2, leave op3 pending
    state = confirmOptimistic(state, 'op1', 'confirmed1');
    state = rejectOptimistic(state, 'op2', new Error('fail'));

    const cleared = clearResolved(state);
    expect(cleared.ops.size).toBe(1);
    expect(cleared.ops.has('op3')).toBe(true);
    expect(cleared.ops.has('op1')).toBe(false);
    expect(cleared.ops.has('op2')).toBe(false);
  });

  it('does not mutate the original state', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'v1');
    state = confirmOptimistic(state, 'op1', 'confirmed');

    const cleared = clearResolved(state);
    expect(state.ops.size).toBe(1);
    expect(cleared.ops.size).toBe(0);
  });
});

// ─── getPendingCount ────────────────────────────────────────────────────────

describe('getPendingCount', () => {
  it('returns 0 for empty state', () => {
    const state = createOptimisticState<string>();
    expect(getPendingCount(state)).toBe(0);
  });

  it('counts only pending ops', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'v1');
    state = applyOptimistic(state, 'op2', 'v2');
    state = applyOptimistic(state, 'op3', 'v3');
    state = confirmOptimistic(state, 'op1', 'confirmed');

    expect(getPendingCount(state)).toBe(2);
  });
});

// ─── Multiple ops ───────────────────────────────────────────────────────────

describe('multiple ops tracked independently', () => {
  it('tracks multiple ops independently', () => {
    let state = createOptimisticState<number>();
    state = applyOptimistic(state, 'a', 1);
    state = applyOptimistic(state, 'b', 2);
    state = applyOptimistic(state, 'c', 3);

    expect(state.ops.size).toBe(3);
    expect(state.ops.get('a')!.optimisticValue).toBe(1);
    expect(state.ops.get('b')!.optimisticValue).toBe(2);
    expect(state.ops.get('c')!.optimisticValue).toBe(3);
  });

  it('confirming one op does not affect others', () => {
    let state = createOptimisticState<number>();
    state = applyOptimistic(state, 'a', 1);
    state = applyOptimistic(state, 'b', 2);
    state = confirmOptimistic(state, 'a', 10);

    expect(state.ops.get('a')!.pending).toBe(false);
    expect(state.ops.get('b')!.pending).toBe(true);
  });
});

// ─── getOp ──────────────────────────────────────────────────────────────────

describe('getOp', () => {
  it('returns the op when it exists', () => {
    let state = createOptimisticState<string>();
    state = applyOptimistic(state, 'op1', 'value1');

    const op = getOp(state, 'op1');
    expect(op).toBeDefined();
    expect(op!.id).toBe('op1');
    expect(op!.optimisticValue).toBe('value1');
  });

  it('returns undefined when op does not exist', () => {
    const state = createOptimisticState<string>();
    const op = getOp(state, 'nonexistent');
    expect(op).toBeUndefined();
  });
});
