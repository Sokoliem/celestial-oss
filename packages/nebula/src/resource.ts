/**
 * Resource<T> — A discriminated union for async data states.
 *
 * Useful alongside Cmd.fetch / Cmd.attempt to model the lifecycle
 * of a remote data request: idle → loading → success | error.
 */

// ─── Type ───────────────────────────────────────────────────────────────────

export type Resource<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: Error };

// ─── Constructors ───────────────────────────────────────────────────────────

/** Create a Resource in the idle state (no request made yet). */
export function idle<T>(): Resource<T> {
  return { status: 'idle' };
}

/** Create a Resource in the loading state (request in flight). */
export function loading<T>(): Resource<T> {
  return { status: 'loading' };
}

/** Create a Resource in the success state with data. */
export function success<T>(data: T): Resource<T> {
  return { status: 'success', data };
}

/** Create a Resource in the error state. */
export function error<T>(err: Error): Resource<T> {
  return { status: 'error', error: err };
}

// ─── Combinators ────────────────────────────────────────────────────────────

/** Map over a successful resource, leaving other states unchanged. */
export function mapResource<T, U>(resource: Resource<T>, fn: (data: T) => U): Resource<U> {
  if (resource.status === 'success') {
    return { status: 'success', data: fn(resource.data) };
  }
  // idle, loading, and error states carry no T-typed data, so the cast is safe
  return resource as unknown as Resource<U>;
}

/** Get the data from a successful resource, or return a default. */
export function unwrapOr<T>(resource: Resource<T>, defaultValue: T): T {
  if (resource.status === 'success') {
    return resource.data;
  }
  return defaultValue;
}
