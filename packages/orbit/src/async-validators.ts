import type { AsyncValidationRule, ValidationResult } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const valid: ValidationResult = { valid: true };
const aborted: ValidationResult = { valid: true };

/**
 * Wrap a rule so consecutive invocations within `ms` are coalesced:
 * the last call wins, earlier in-flight rules see their AbortSignal abort.
 *
 * The returned rule always resolves — never rejects — so callers can wire
 * it into `composeAsync` without an explicit `.catch`.
 */
export function debouncedAsync<T>(rule: AsyncValidationRule<T>, ms: number): AsyncValidationRule<T> {
  if (ms <= 0) return rule;

  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((result: ValidationResult) => void) | null = null;

  return (value: T, signal: AbortSignal): Promise<ValidationResult> => {
    // Resolve any previously-suspended call with an aborted result before
    // arming a fresh timer.
    if (pendingTimer !== null) {
      clearTimeout(pendingTimer);
      pendingResolve?.(aborted);
      pendingTimer = null;
      pendingResolve = null;
    }

    return new Promise<ValidationResult>((resolve) => {
      const onSignalAbort = () => {
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
          pendingResolve = null;
        }
        resolve(aborted);
      };

      if (signal.aborted) {
        resolve(aborted);
        return;
      }

      signal.addEventListener('abort', onSignalAbort, { once: true });

      pendingResolve = resolve;
      pendingTimer = setTimeout(async () => {
        pendingTimer = null;
        pendingResolve = null;
        if (signal.aborted) {
          resolve(aborted);
          return;
        }
        try {
          const result = await rule(value, signal);
          if (signal.aborted) {
            resolve(aborted);
            return;
          }
          resolve(result);
        } catch (error) {
          // Surface unexpected errors as validation failures rather than
          // swallowing them — silent failure here is worse than a noisy
          // message because it makes the form appear valid.
          resolve({ valid: false, message: error instanceof Error ? error.message : 'Async validation failed' });
        }
      }, ms);
    });
  };
}

/**
 * Common typeahead-uniqueness pattern. The fetcher returns `true` when the
 * value is unique (passes), `false` when it collides (fails). The AbortSignal
 * is threaded so a still-running fetch is cancelled when a new keystroke
 * supersedes it.
 */
export function uniqueValue<T = string>(
  fetcher: (value: T, signal: AbortSignal) => Promise<boolean>,
  message: string = 'Value is already taken',
): AsyncValidationRule<T> {
  return async (value: T, signal: AbortSignal): Promise<ValidationResult> => {
    if (signal.aborted) return aborted;
    let isUnique: boolean;
    try {
      isUnique = await fetcher(value, signal);
    } catch (error) {
      if (signal.aborted) return aborted;
      return { valid: false, message: error instanceof Error ? error.message : 'Failed to check uniqueness' };
    }
    if (signal.aborted) return aborted;
    return isUnique ? valid : { valid: false, message };
  };
}

/**
 * Validate against a remote endpoint. Calls `fetch(endpoint, { signal,
 * method: 'POST', body: JSON.stringify(value) })` and expects either:
 *   - 200 + `{ valid: true }`
 *   - 200 + `{ valid: false, message?: string }` (preferred)
 *   - 400 status with a JSON `message` field.
 *
 * Non-conformant responses surface as a generic failure with the message
 * "Server validation failed".
 */
export function serverValidate<T = unknown>(
  endpoint: string,
  options: {
    readonly method?: 'POST' | 'PUT';
    readonly headers?: Record<string, string>;
    readonly fieldName?: string;
  } = {},
): AsyncValidationRule<T> {
  return async (value: T, signal: AbortSignal): Promise<ValidationResult> => {
    if (signal.aborted) return aborted;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: options.method ?? 'POST',
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        body: JSON.stringify(options.fieldName ? { field: options.fieldName, value } : { value }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) return aborted;
      return { valid: false, message: error instanceof Error ? error.message : 'Server unreachable' };
    }
    if (signal.aborted) return aborted;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { valid: false, message: 'Server validation failed' };
    }

    if (!payload || typeof payload !== 'object') {
      return { valid: false, message: 'Server validation failed' };
    }
    const body = payload as { valid?: unknown; message?: unknown };
    if (body.valid === true) return valid;
    return { valid: false, message: typeof body.message === 'string' ? body.message : 'Server rejected value' };
  };
}
