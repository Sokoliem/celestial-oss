// ---------------------------------------------------------------------------
// Nebula Signal System — fine-grained reactivity for partial view re-execution
// ---------------------------------------------------------------------------

import { createBatchFn, createComputedFn, createEffectFn, createSignalFn } from './signals/builders.js';
import { createContextState, type Signal } from './signals/state.js';

export { createSignalContext } from './signals/builders.js';
export type { Signal, SignalContext } from './signals/state.js';

const defaultCtx = createContextState();

/**
 * Creates a reactive signal with the given initial value.
 * Returns a tuple of `[getter, setter]`.
 */
export const signal = createSignalFn(defaultCtx);

/**
 * Creates a computed (derived) signal.
 * The function `fn` is executed lazily and its dependencies are
 * automatically tracked.
 */
export const computed = createComputedFn(defaultCtx);

/**
 * Creates a reactive effect.
 * The function `fn` runs immediately and re-runs whenever its
 * tracked dependencies change. `fn` may return a cleanup function
 * which is called before re-running or on dispose.
 *
 * Returns a dispose function to stop the effect.
 */
export const effect = createEffectFn(defaultCtx);

/**
 * Groups multiple signal writes so that dependents only re-evaluate
 * once at the end.
 */
export const batch = createBatchFn(defaultCtx);

/** Convenience wrapper for one-source computed transforms. */
export function derived<T, U>(source: Signal<T>, fn: (value: T) => U): Signal<U> {
  return computed(() => fn(source()));
}

/** Track the previous observed value of a signal. */
export function previous<T>(source: Signal<T>): Signal<T | undefined> {
  const initial = source();
  let current = initial;
  const [prev, setPrev] = signal<T | undefined>(undefined);

  effect(() => {
    const next = source();
    if (!Object.is(current, next)) {
      setPrev(current);
      current = next;
    }
  });

  return prev;
}

/** Keep a rolling history of observed signal values, most recent first. */
export function history<T>(source: Signal<T>, maxLength = 10): Signal<readonly T[]> {
  const limit = Math.max(1, Math.floor(maxLength));
  const initial = source();
  let current = initial;
  let values: readonly T[] = [initial];
  const [historySignal, setHistory] = signal<readonly T[]>(values);

  effect(() => {
    const next = source();
    if (!Object.is(current, next)) {
      current = next;
      values = [next, ...values].slice(0, limit);
      setHistory(values);
    }
  });

  return historySignal;
}
