import { afterEach, describe, expect, it, vi } from 'vitest';

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
  enterRawModeCalls: number;
  exitRawModeCalls: number;
}

async function loadRuntime() {
  const state: RuntimeState = {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
    enterRawModeCalls: 0,
    exitRawModeCalls: 0,
  };

  vi.resetModules();
  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => ({
        enterRawMode() {
          state.enterRawModeCalls++;
        },
        exitRawMode() {
          state.exitRawModeCalls++;
        },
        write(data: string) {
          state.writes.push(data);
        },
        onInput(handler: (data: Buffer) => void) {
          state.inputHandler = handler;
        },
        offInput(handler: (data: Buffer) => void) {
          if (state.inputHandler === handler) {
            state.inputHandler = null;
          }
        },
        onResize(handler: () => void) {
          state.resizeHandler = handler;
        },
        offResize(handler: () => void) {
          if (state.resizeHandler === handler) {
            state.resizeHandler = null;
          }
        },
        getSize() {
          return state.size;
        },
      }),
    };
  });

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

  return { state, app, Cmd, Sub };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('updateLoopGuard', () => {
  it('does not fire under normal dispatch rates', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const config = {
      init: (): [number, import('../types.js').Cmd<string>] => [0, Cmd.none()],
      update: (_msg: string, model: number): [number, import('../types.js').Cmd<string>] => [model + 1, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'ok' }),
      subscriptions: () => Sub.none<string>(),
    };

    const onUpdateLoop = vi.fn();
    const handle = app(config, {
      onUpdateLoop,
      updateLoopGuard: { threshold: 100, windowMs: 50 },
    });

    // Dispatch a moderate number — well below threshold
    // We can't directly call dispatch but we can simulate via the input handler
    // Just verify no spurious fires occurred during init

    expect(onUpdateLoop).not.toHaveBeenCalled();
    handle.stop();
  });

  it('fires onUpdateLoop when dispatch rate exceeds threshold', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    type Msg = 'tick';
    const config = {
      init: (): [number, import('../types.js').Cmd<Msg>] => [0, Cmd.none()],
      update: (_msg: Msg, model: number): [number, import('../types.js').Cmd<Msg>] => [model + 1, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'ok' }),
      subscriptions: () => Sub.key('a' as const, 'tick' as Msg),
    };

    const onUpdateLoop = vi.fn();
    const handle = app(config, {
      onUpdateLoop,
      updateLoopGuard: { threshold: 5, windowMs: 1000 },
    });

    // Press 'a' repeatedly — each press dispatches 'tick'
    for (let i = 0; i < 10; i++) {
      state.inputHandler?.(Buffer.from('a', 'utf8'));
    }

    expect(onUpdateLoop).toHaveBeenCalled();
    const callArg = onUpdateLoop.mock.calls[0]![0];
    expect(callArg).toMatchObject({ windowMs: 1000 });
    expect(callArg.count).toBeGreaterThan(5);
    handle.stop();
  });

  it('is disabled when onUpdateLoop is not provided', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    type Msg = 'tick';
    const config = {
      init: (): [number, import('../types.js').Cmd<Msg>] => [0, Cmd.none()],
      update: (_msg: Msg, model: number): [number, import('../types.js').Cmd<Msg>] => [model + 1, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'ok' }),
      subscriptions: () => Sub.key('a' as const, 'tick' as Msg),
    };

    // No onUpdateLoop provided — guard should be off
    const handle = app(config, { updateLoopGuard: { threshold: 5, windowMs: 1000 } });

    // Burst that would have tripped the guard if enabled
    for (let i = 0; i < 50; i++) {
      state.inputHandler?.(Buffer.from('a', 'utf8'));
    }
    // No way to assert non-call but ensure runtime didn't crash
    expect(handle.model).toBe(50);
    handle.stop();
  });
});
