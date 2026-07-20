import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debouncedAsync, serverValidate, uniqueValue } from '../async-validators.js';
import { composeAsync, runRulesAsync } from '../validation.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debouncedAsync', () => {
  it('returns the original rule when ms <= 0', async () => {
    const inner = vi.fn(async () => ({ valid: true as const }));
    const wrapped = debouncedAsync(inner, 0);
    const ctrl = new AbortController();
    await wrapped('x', ctrl.signal);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('coalesces consecutive calls so only the last one runs', async () => {
    const inner = vi.fn(async (value: string) => ({ valid: true as const, message: value }));
    const wrapped = debouncedAsync(inner, 50);

    const ctrl1 = new AbortController();
    const ctrl2 = new AbortController();
    const p1 = wrapped('first', ctrl1.signal);
    const p2 = wrapped('second', ctrl2.signal);

    await vi.advanceTimersByTimeAsync(50);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.valid).toBe(true); // first was cancelled, returns valid (aborted)
    expect(r2.valid).toBe(true);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenLastCalledWith('second', expect.any(Object));
  });

  it('resolves with a valid result when the signal aborts mid-wait', async () => {
    const inner = vi.fn(async () => ({ valid: false as const, message: 'should not run' }));
    const wrapped = debouncedAsync(inner, 100);
    const ctrl = new AbortController();
    const promise = wrapped('value', ctrl.signal);
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result).toEqual({ valid: true });
    expect(inner).not.toHaveBeenCalled();
  });

  it('reports rule errors as validation failures rather than throwing', async () => {
    const wrapped = debouncedAsync(async () => {
      throw new Error('boom');
    }, 10);
    const ctrl = new AbortController();
    const promise = wrapped('value', ctrl.signal);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result).toEqual({ valid: false, message: 'boom' });
  });
});

describe('uniqueValue', () => {
  it('passes when the fetcher reports unique', async () => {
    const rule = uniqueValue(async () => true);
    const ctrl = new AbortController();
    const result = await rule('alice', ctrl.signal);
    expect(result).toEqual({ valid: true });
  });

  it('fails with the configured message when the fetcher reports duplicate', async () => {
    const rule = uniqueValue(async () => false, 'Taken');
    const ctrl = new AbortController();
    const result = await rule('alice', ctrl.signal);
    expect(result).toEqual({ valid: false, message: 'Taken' });
  });

  it('treats a thrown fetcher as a failure with the error message', async () => {
    const rule = uniqueValue(async () => {
      throw new Error('network down');
    });
    const ctrl = new AbortController();
    const result = await rule('alice', ctrl.signal);
    expect(result).toEqual({ valid: false, message: 'network down' });
  });

  it('returns a valid result when the signal is already aborted', async () => {
    const fetcher = vi.fn(async () => false);
    const rule = uniqueValue(fetcher);
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await rule('alice', ctrl.signal);
    expect(result).toEqual({ valid: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('serverValidate', () => {
  it('returns valid when the endpoint returns { valid: true }', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ valid: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const rule = serverValidate('https://api.example.com/check');
    const ctrl = new AbortController();
    const result = await rule('value', ctrl.signal);
    expect(result).toEqual({ valid: true });
  });

  it('returns the server-provided message when valid is false', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ valid: false, message: 'taken' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const rule = serverValidate('https://api.example.com/check', { fieldName: 'username' });
    const ctrl = new AbortController();
    const result = await rule('alice', ctrl.signal);
    expect(result).toEqual({ valid: false, message: 'taken' });
  });

  it('returns a valid result when the signal aborts during fetch', async () => {
    const fetchMock = vi.fn((_input: string, init?: RequestInit) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        return Promise.reject(new Error('aborted'));
      }
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const rule = serverValidate('https://api.example.com/check');
    const ctrl = new AbortController();
    const promise = rule('value', ctrl.signal);
    ctrl.abort();
    const result = await promise;
    expect(result).toEqual({ valid: true });
  });
});

describe('composeAsync threads the signal through every rule', () => {
  it('honours an aborted signal mid-sequence', async () => {
    const earlyRule = vi.fn(async (_value: string, _signal: AbortSignal) => ({ valid: true as const }));
    const lateRule = vi.fn(async () => ({ valid: false as const, message: 'should not run' }));
    const composed = composeAsync(earlyRule, lateRule);

    const ctrl = new AbortController();
    ctrl.abort();
    const result = await composed('value', ctrl.signal);
    expect(result).toEqual({ valid: true });
    expect(earlyRule).not.toHaveBeenCalled();
    expect(lateRule).not.toHaveBeenCalled();
  });

  it('passes the same signal to sync rules transparently (they ignore it)', async () => {
    const composed = composeAsync<string>((value) => (value.length > 0 ? { valid: true } : { valid: false, message: 'empty' }));
    const ctrl = new AbortController();
    expect(await composed('hi', ctrl.signal)).toEqual({ valid: true });
    expect(await composed('', ctrl.signal)).toEqual({ valid: false, message: 'empty' });
  });
});

describe('runRulesAsync accepts an AbortSignal', () => {
  it('stops iteration when the signal aborts', async () => {
    const earlyRule = vi.fn(async () => ({ valid: false as const, message: 'first' }));
    const lateRule = vi.fn(async () => ({ valid: false as const, message: 'second' }));
    const ctrl = new AbortController();
    ctrl.abort();
    const errors = await runRulesAsync([earlyRule, lateRule], 'value', ctrl.signal);
    expect(errors).toEqual([]);
    expect(earlyRule).not.toHaveBeenCalled();
  });

  it('works without an explicit signal for backward compatibility', async () => {
    const rule = vi.fn(async () => ({ valid: false as const, message: 'nope' }));
    const errors = await runRulesAsync([rule], 'value');
    expect(errors).toEqual(['nope']);
  });
});
