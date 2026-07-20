// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app as createApp } from '../../../app.js';
import type { TerminalBackend } from '../../../terminal.js';
import { Cmd, type Result, Sub } from '../../../types.js';

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
}

async function loadRuntime() {
  const state: RuntimeState = {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
  };

  const terminal: TerminalBackend = {
    enterRawMode() {},
    exitRawMode() {},
    write(data: string) {
      state.writes.push(data);
    },
    onInput(handler: (data: Buffer) => void) {
      state.inputHandler = handler;
    },
    offInput(handler: (data: Buffer) => void) {
      if (state.inputHandler === handler) state.inputHandler = null;
    },
    onResize(handler: () => void) {
      state.resizeHandler = handler;
    },
    offResize(handler: () => void) {
      if (state.resizeHandler === handler) state.resizeHandler = null;
    },
    getSize() {
      return state.size;
    },
  };

  return {
    state,
    app<Model, M>(config: AppConfig<Model, M>) {
      return createApp(config, { terminal, disableCrashRecovery: true });
    },
    Cmd,
    Sub,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * GAP-F-NEB-01 regression — Cmd.attempt must convert thrown errors from the
 * task to a Result.err message regardless of throw timing:
 *  1. Synchronous throw before returning a Promise.
 *  2. Returned Promise that rejects.
 *  3. Async function that throws (semantically case 2).
 *
 * Per packages/nebula/src/app/commands.ts case 'attempt', the task is invoked
 * synchronously and its return value chained via .then/.catch — a sync throw
 * must not escape the dispatch loop.
 */
describe('Cmd.attempt error handling regression', () => {
  it('catches a synchronous throw from the task and dispatches Result.err', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<{ type: 'got'; result: Result<number> }> = [];

    type Msg = { type: 'got'; result: Result<number> };

    const handle = app<number, Msg>({
      init: () => [
        0,
        Cmd.attempt<Msg, number>(
          // Non-async function that throws before producing a Promise:
          () => {
            throw new Error('sync-boom');
          },
          (result) => ({ type: 'got', result }),
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    // Allow the microtask queue + any deferred dispatch to settle.
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.type).toBe('got');
    expect(dispatched[0]!.result.ok).toBe(false);
    if (!dispatched[0]!.result.ok) {
      expect(dispatched[0]!.result.error).toBeInstanceOf(Error);
      expect((dispatched[0]!.result.error as Error).message).toBe('sync-boom');
    }

    handle.stop();
  });

  it('catches a Promise rejection and dispatches Result.err', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<{ type: 'got'; result: Result<number> }> = [];

    type Msg = { type: 'got'; result: Result<number> };

    const handle = app<number, Msg>({
      init: () => [
        0,
        Cmd.attempt<Msg, number>(
          () => Promise.reject(new Error('async-boom')),
          (result) => ({ type: 'got', result }),
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.result.ok).toBe(false);
    if (!dispatched[0]!.result.ok) {
      expect((dispatched[0]!.result.error as Error).message).toBe('async-boom');
    }

    handle.stop();
  });

  it('catches an async-function throw and dispatches Result.err', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<{ type: 'got'; result: Result<number> }> = [];

    type Msg = { type: 'got'; result: Result<number> };

    const handle = app<number, Msg>({
      init: () => [
        0,
        Cmd.attempt<Msg, number>(
          async () => {
            throw new Error('async-fn-boom');
          },
          (result) => ({ type: 'got', result }),
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.result.ok).toBe(false);
    if (!dispatched[0]!.result.ok) {
      expect((dispatched[0]!.result.error as Error).message).toBe('async-fn-boom');
    }

    handle.stop();
  });

  it('wraps non-Error throws into Error objects in the Result.err payload', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<{ type: 'got'; result: Result<number> }> = [];

    type Msg = { type: 'got'; result: Result<number> };

    const handle = app<number, Msg>({
      init: () => [
        0,
        Cmd.attempt<Msg, number>(
          () => {
            // Throw a non-Error value to exercise the `err instanceof Error` branch.
            throw 'string-boom';
          },
          (result) => ({ type: 'got', result }),
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.result.ok).toBe(false);
    if (!dispatched[0]!.result.ok) {
      expect(dispatched[0]!.result.error).toBeInstanceOf(Error);
      expect((dispatched[0]!.result.error as Error).message).toBe('string-boom');
    }

    handle.stop();
  });
});

/**
 * GAP-F-NEB-01 sibling regression — Cmd.perform shares the same sync-throw
 * vulnerability that attempt had. perform has no Result.err callback, so the
 * contract is: a sync-throwing task must not crash the dispatch loop, must
 * stderr-log the failure, and must not dispatch any spurious message.
 */
describe('Cmd.perform error handling regression', () => {
  it('does not crash the dispatch loop when the task throws synchronously', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<number> = [];

    const handle = app<number, number>({
      init: () => [
        0,
        Cmd.perform<number, number>(
          () => {
            throw new Error('perform-sync-boom');
          },
          (value) => value,
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    // perform has no error-msg callback; nothing should be dispatched.
    expect(dispatched).toHaveLength(0);
    // The framework should log the failure to stderr.
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Cmd.perform failed'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('perform-sync-boom'));

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('does not crash the dispatch loop when the task is an async fn that throws', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { app, Cmd, Sub } = await loadRuntime();
    const dispatched: Array<number> = [];

    const handle = app<number, number>({
      init: () => [
        0,
        Cmd.perform<number, number>(
          async () => {
            throw new Error('perform-async-fn-boom');
          },
          (value) => value,
        ),
      ],
      update: (msg, model) => {
        dispatched.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(dispatched).toHaveLength(0);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('perform-async-fn-boom'));

    handle.stop();
    stderrSpy.mockRestore();
  });
});
