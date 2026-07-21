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
  if (!Number.isFinite(ms)) throw new RangeError('orbit/debouncedAsync: delay must be a finite number');
  if (ms <= 0) return rule;
  const delay = Math.floor(ms);

  interface Invocation {
    timer: ReturnType<typeof setTimeout> | null;
    resolve: (result: ValidationResult) => void;
    controller: AbortController;
    externalSignal: AbortSignal;
    onExternalAbort: () => void;
    settled: boolean;
  }

  let active: Invocation | null = null;

  function settle(invocation: Invocation, result: ValidationResult): void {
    if (invocation.settled) return;
    invocation.settled = true;
    if (invocation.timer !== null) clearTimeout(invocation.timer);
    invocation.timer = null;
    invocation.externalSignal.removeEventListener('abort', invocation.onExternalAbort);
    if (active === invocation) active = null;
    invocation.resolve(result);
  }

  return (value: T, signal: AbortSignal): Promise<ValidationResult> => {
    if (active) {
      const superseded = active;
      superseded.controller.abort();
      settle(superseded, aborted);
    }

    return new Promise<ValidationResult>((resolve) => {
      const controller = new AbortController();
      const invocation: Invocation = {
        timer: null,
        resolve,
        controller,
        externalSignal: signal,
        onExternalAbort: () => {
          controller.abort();
          settle(invocation, aborted);
        },
        settled: false,
      };

      if (signal.aborted) {
        settle(invocation, aborted);
        return;
      }

      active = invocation;
      signal.addEventListener('abort', invocation.onExternalAbort, { once: true });

      invocation.timer = setTimeout(async () => {
        invocation.timer = null;
        if (invocation.settled || controller.signal.aborted) {
          settle(invocation, aborted);
          return;
        }
        try {
          const result = await rule(value, controller.signal);
          settle(invocation, controller.signal.aborted ? aborted : result);
        } catch (error) {
          settle(
            invocation,
            controller.signal.aborted ? aborted : { valid: false, message: error instanceof Error ? error.message : 'Async validation failed' },
          );
        }
      }, delay);
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
    return isUnique === true ? valid : { valid: false, message };
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
  const method = options.method ?? 'POST';
  const fieldName = options.fieldName;
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  return async (value: T, signal: AbortSignal): Promise<ValidationResult> => {
    if (signal.aborted) return aborted;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify(fieldName ? { field: fieldName, value } : { value }),
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
    if (response.ok && body.valid === true) return valid;
    return {
      valid: false,
      message: typeof body.message === 'string' && body.message.length > 0 ? body.message : response.ok ? 'Server rejected value' : 'Server validation failed',
    };
  };
}
