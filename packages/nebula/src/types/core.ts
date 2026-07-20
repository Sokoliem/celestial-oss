import type { LayoutRect } from '../vdom.js';

/**
 * An external event source that pushes data into the Elm update loop.
 * Returned by the `setup` function passed to `Sub.stream()`.
 */
export interface StreamSource {
  /** Register a callback to receive data from this source. Called once by the runtime. */
  onData: (cb: (data: unknown) => void) => void;
  /** Clean up resources. Called when the subscription is removed or the app shuts down. */
  teardown: () => void;
}

/** Computed layout rects delivered by Sub.layout from the previous frame */
export interface LayoutRects {
  readonly rects: ReadonlyMap<string, LayoutRect>;
}

/**
 * A discriminated union representing success or failure.
 * Used by Cmd.attempt to deliver async outcomes to the update function.
 */
export type Result<T, E = Error> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const Result = {
  /** Build a successful result. */
  ok<T>(value: T): Result<T, never> {
    return { ok: true, value };
  },

  /** Build a failed result. */
  err<E>(error: E): Result<never, E> {
    return { ok: false, error };
  },

  /** Type guard — narrows to the `ok: true` branch. */
  isOk<T, E>(r: Result<T, E>): r is { readonly ok: true; readonly value: T } {
    return r.ok;
  },

  /** Type guard — narrows to the `ok: false` branch. */
  isErr<T, E>(r: Result<T, E>): r is { readonly ok: false; readonly error: E } {
    return !r.ok;
  },

  /** Map the success value, leaving an error unchanged. */
  map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
    return r.ok ? { ok: true, value: fn(r.value) } : r;
  },

  /** Map the error value, leaving a success unchanged. */
  mapErr<T, E, F>(r: Result<T, E>, fn: (e: E) => F): Result<T, F> {
    return r.ok ? r : { ok: false, error: fn(r.error) };
  },

  /** Return the success value or `fallback` when the result is an error. */
  unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
    return r.ok ? r.value : fallback;
  },

  /** Pattern-match on a result and return whichever branch fires. */
  match<T, E, A>(r: Result<T, E>, on: { ok: (v: T) => A; err: (e: E) => A }): A {
    return r.ok ? on.ok(r.value) : on.err(r.error);
  },
} as const;

/**
 * Message helper type for building discriminated unions.
 *
 * With no payload:  Msg<'quit'>        => { readonly type: 'quit' }
 * With payload:     Msg<'set', {v: 1}> => { readonly type: 'set'; v: 1 }
 */
export type Msg<T extends string, P = void> = P extends void ? { readonly type: T } : { readonly type: T } & P;
