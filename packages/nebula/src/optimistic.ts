/**
 * Optimistic Updates — Pure state for optimistic UI patterns.
 *
 * Tracks pending operations that have been optimistically applied
 * to the UI before server confirmation. Each operation can be
 * confirmed or rejected independently. All functions are pure
 * and return new state objects (immutable).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OptimisticOp<T = unknown> {
  readonly id: string;
  readonly optimisticValue: T;
  readonly pending: boolean;
  readonly confirmedValue?: T;
  readonly error?: Error;
}

export interface OptimisticState<T = unknown> {
  readonly ops: ReadonlyMap<string, OptimisticOp<T>>;
}

// ─── Constructor ────────────────────────────────────────────────────────────

/** Create an empty optimistic state with no tracked operations. */
export function createOptimisticState<T>(): OptimisticState<T> {
  return { ops: new Map() };
}

// ─── Operations ─────────────────────────────────────────────────────────────

/** Add or replace an optimistic operation, marking it as pending. */
export function applyOptimistic<T>(state: OptimisticState<T>, id: string, value: T): OptimisticState<T> {
  const next = new Map(state.ops);
  next.set(id, {
    id,
    optimisticValue: value,
    pending: true,
  });
  return { ops: next };
}

/** Confirm an operation: set pending=false, store the confirmed value. */
export function confirmOptimistic<T>(state: OptimisticState<T>, id: string, confirmed: T): OptimisticState<T> {
  const existing = state.ops.get(id);
  if (!existing) return state;

  const next = new Map(state.ops);
  next.set(id, {
    ...existing,
    pending: false,
    confirmedValue: confirmed,
  });
  return { ops: next };
}

/** Reject an operation: set pending=false, store the error. */
export function rejectOptimistic<T>(state: OptimisticState<T>, id: string, error: Error): OptimisticState<T> {
  const existing = state.ops.get(id);
  if (!existing) return state;

  const next = new Map(state.ops);
  next.set(id, {
    ...existing,
    pending: false,
    error,
  });
  return { ops: next };
}

/** Remove all resolved (non-pending) operations from the state. */
export function clearResolved<T>(state: OptimisticState<T>): OptimisticState<T> {
  const next = new Map<string, OptimisticOp<T>>();
  for (const [key, op] of state.ops) {
    if (op.pending) {
      next.set(key, op);
    }
  }
  return { ops: next };
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Count the number of operations that are still pending. */
export function getPendingCount<T>(state: OptimisticState<T>): number {
  let count = 0;
  for (const op of state.ops.values()) {
    if (op.pending) count++;
  }
  return count;
}

/** Get a specific operation by id, or undefined if it doesn't exist. */
export function getOp<T>(state: OptimisticState<T>, id: string): OptimisticOp<T> | undefined {
  return state.ops.get(id);
}
