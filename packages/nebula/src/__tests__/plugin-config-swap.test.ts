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

  const [{ app }, { Cmd, Sub }, { withPlugins }] = await Promise.all([import('../app.js'), import('../types.js'), import('../plugin.js')]);

  return { state, app, Cmd, Sub, withPlugins };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Plugin.onConfigSwap', () => {
  type Model = { count: number };
  type Msg = 'inc';

  it('fires on each replaceConfig swap with prev/next config + version tokens', async () => {
    const { app, Cmd, Sub, withPlugins } = await loadRuntime();

    const swapCalls: Array<{ prevVersion: number; nextVersion: number }> = [];
    const cleanupPlugin = {
      name: 'cleanup',
      onConfigSwap(info: { prev: unknown; next: unknown; prevVersion: number; nextVersion: number }) {
        swapCalls.push({ prevVersion: info.prevVersion, nextVersion: info.nextVersion });
      },
    };

    const baseConfigA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const baseConfigB = {
      ...baseConfigA,
      view: () => ({ kind: 'text' as const, content: 'B' }),
    };

    const configA = withPlugins(baseConfigA, [cleanupPlugin]);
    const configB = withPlugins(baseConfigB, [cleanupPlugin]);

    const handle = app(configA);
    expect(swapCalls).toHaveLength(0);

    handle.replaceConfig(configB, { validate: true });

    expect(swapCalls).toHaveLength(1);
    expect(swapCalls[0]).toEqual({ prevVersion: 0, nextVersion: 1 });

    handle.replaceConfig(configA, { validate: true });
    expect(swapCalls).toHaveLength(2);
    expect(swapCalls[1]).toEqual({ prevVersion: 1, nextVersion: 2 });

    handle.stop();
  });

  it('errors thrown from onConfigSwap do not abort the swap', async () => {
    const { app, Cmd, Sub, withPlugins } = await loadRuntime();

    const errors: unknown[] = [];
    const buggy = {
      name: 'buggy',
      onConfigSwap() {
        throw new Error('boom');
      },
    };

    const baseA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const baseB = { ...baseA, view: () => ({ kind: 'text' as const, content: 'B' }) };
    const configA = withPlugins(baseA, [buggy]);
    const configB = withPlugins(baseB, [buggy]);

    const handle = app(configA, { onRenderError: (e) => errors.push(e) });

    expect(() => handle.replaceConfig(configB, { validate: true })).not.toThrow();
    // The buggy plugin's error is surfaced via onRenderError.
    expect(errors.length).toBeGreaterThanOrEqual(1);
    handle.stop();
  });

  it('de-dupes plugins present on both prev and next config', async () => {
    const { app, Cmd, Sub, withPlugins } = await loadRuntime();

    const calls = vi.fn();
    const shared = {
      name: 'shared',
      onConfigSwap: calls,
    };

    const baseA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const baseB = { ...baseA, view: () => ({ kind: 'text' as const, content: 'B' }) };

    const configA = withPlugins(baseA, [shared]);
    const configB = withPlugins(baseB, [shared]);

    const handle = app(configA);
    handle.replaceConfig(configB, { validate: true });

    // Even though `shared` appears in both prev and next plugin lists,
    // onConfigSwap is invoked exactly once per swap.
    expect(calls).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it('plugin removed from next config still gets a final teardown notification', async () => {
    const { app, Cmd, Sub, withPlugins } = await loadRuntime();

    const teardown = vi.fn();
    const removable = { name: 'removable', onConfigSwap: teardown };

    const baseA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const baseB = { ...baseA, view: () => ({ kind: 'text' as const, content: 'B' }) };

    const configA = withPlugins(baseA, [removable]);
    const configB = withPlugins(baseB, []); // No plugins on next

    const handle = app(configA);
    handle.replaceConfig(configB, { validate: true });

    expect(teardown).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});
