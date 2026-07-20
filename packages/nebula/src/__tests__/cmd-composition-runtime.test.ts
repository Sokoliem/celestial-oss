import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

type Msg =
  | { type: 'child'; value: string }
  | { type: 'race'; index: number; result: unknown }
  | { type: 'all'; results: unknown[] }
  | { type: 'timeout' }
  | { type: 'next' };

function createMockTerminal(): TerminalBackend {
  return {
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

function run(initial: Cmd<Msg>) {
  const seen: Msg[] = [];
  const config: AppConfig<Msg[], Msg> = {
    init: () => [[], initial],
    update: (message, model) => {
      seen.push(message);
      return [[...model, message], Cmd.none()];
    },
    view: () => text('composition'),
    subscriptions: () => Sub.none(),
  };
  return { seen, handle: app(config, { terminal: createMockTerminal() }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('command composition runtime', () => {
  it('dispatches only the winning race message and aborts losing branches', async () => {
    let loserSignal: AbortSignal | undefined;
    const fast = Cmd.perform<Msg, string>(
      async () => 'fast',
      (value) => ({ type: 'child', value }),
    );
    const slow = Cmd.perform<Msg, string>(
      (signal) => {
        loserSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      },
      (value) => ({ type: 'child', value }),
    );
    const { seen, handle } = run(Cmd.race([fast, slow], ({ index, result }) => ({ type: 'race', index, result })));

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen).toEqual([{ type: 'race', index: 0, result: { type: 'child', value: 'fast' } }]);
    expect(loserSignal?.aborted).toBe(true);
    handle.stop();
  });

  it('collects all command messages in declaration order without dispatching children', async () => {
    const commands = ['first', 'second'].map((value) =>
      Cmd.perform<Msg, string>(
        async () => value,
        (result) => ({ type: 'child', value: result }),
      ),
    );
    const { seen, handle } = run(Cmd.all(commands, (results) => ({ type: 'all', results })));

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen).toEqual([
      {
        type: 'all',
        results: [
          { type: 'child', value: 'first' },
          { type: 'child', value: 'second' },
        ],
      },
    ]);
    handle.stop();
  });

  it('dispatches an empty all result immediately', async () => {
    const { seen, handle } = run(Cmd.all([], (results) => ({ type: 'all', results })));
    await vi.waitFor(() => expect(seen).toEqual([{ type: 'all', results: [] }]));
    handle.stop();
  });

  it('aborts remaining all branches when one command fails', async () => {
    let siblingSignal: AbortSignal | undefined;
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const failing = Cmd.perform<Msg, string>(
      async () => {
        throw new Error('failed branch');
      },
      (value) => ({ type: 'child', value }),
    );
    const sibling = Cmd.perform<Msg, string>(
      (signal) => {
        siblingSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      },
      (value) => ({ type: 'child', value }),
    );
    const { seen, handle } = run(Cmd.all([failing, sibling], (results) => ({ type: 'all', results })));

    await vi.waitFor(() => expect(siblingSignal?.aborted).toBe(true));
    expect(seen).toEqual([]);
    handle.stop();
    stderr.mockRestore();
  });

  it('aborts a timed-out branch and suppresses its late message', async () => {
    vi.useFakeTimers();
    let resolveInner: ((value: string) => void) | undefined;
    let innerSignal: AbortSignal | undefined;
    const inner = Cmd.perform<Msg, string>(
      (signal) => {
        innerSignal = signal;
        return new Promise((resolve) => {
          resolveInner = resolve;
        });
      },
      (value) => ({ type: 'child', value }),
    );
    const { seen, handle } = run(Cmd.timeout(inner, 25, { type: 'timeout' }));

    await vi.advanceTimersByTimeAsync(25);
    expect(seen).toEqual([{ type: 'timeout' }]);
    expect(innerSignal?.aborted).toBe(true);

    resolveInner?.('late');
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([{ type: 'timeout' }]);
    handle.stop();
  });

  it('lets a completed timeout branch dispatch normally', async () => {
    const inner = Cmd.perform<Msg, string>(
      async () => 'ready',
      (value) => ({ type: 'child', value }),
    );
    const { seen, handle } = run(Cmd.timeout(inner, 1_000, { type: 'timeout' }));

    await vi.waitFor(() => expect(seen).toEqual([{ type: 'child', value: 'ready' }]));
    handle.stop();
  });

  it('waits for every async batch child before advancing a sequence', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    let resolveSecond: ((value: string) => void) | undefined;
    const child = (capture: (resolve: (value: string) => void) => void) =>
      Cmd.perform<Msg, string>(
        () =>
          new Promise((resolve) => {
            capture(resolve);
          }),
        (result) => ({ type: 'child', value: result }),
      );
    const command = Cmd.sequence(
      Cmd.batch(
        child((resolve) => {
          resolveFirst = resolve;
        }),
        child((resolve) => {
          resolveSecond = resolve;
        }),
      ),
      Cmd.msg<Msg>({ type: 'next' }),
    );
    const { seen, handle } = run(command);

    resolveFirst?.('first');
    await Promise.resolve();
    expect(seen).toEqual([{ type: 'child', value: 'first' }]);

    resolveSecond?.('second');
    await vi.waitFor(() => expect(seen.at(-1)).toEqual({ type: 'next' }));
    expect(seen).toEqual([{ type: 'child', value: 'first' }, { type: 'child', value: 'second' }, { type: 'next' }]);
    handle.stop();
  });
});

describe('command duration validation', () => {
  it('rejects invalid durations and an empty race', () => {
    expect(() => Cmd.delay(-1, 'message')).toThrow(RangeError);
    expect(() => Cmd.debounce(Number.NaN, Cmd.none())).toThrow(RangeError);
    expect(() => Cmd.timeout(Cmd.none(), Number.POSITIVE_INFINITY, 'timeout')).toThrow(RangeError);
    expect(() => Cmd.race([], () => 'winner')).toThrow(RangeError);
  });
});
