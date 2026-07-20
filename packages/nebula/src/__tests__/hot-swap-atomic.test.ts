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

type Model = { count: number };
type Msg = 'inc';

describe('replaceConfig({ validate: true }) atomicity', () => {
  it('throws and preserves old config when migrate throws', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 5 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `A:${model.count}` }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const configB = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `B:${model.count}` }),
      subscriptions: () => Sub.none<Msg>(),
    };

    const errors: unknown[] = [];
    const handle = app(configA, { onRenderError: (e) => errors.push(e) });

    expect(() => {
      handle.replaceConfig(configB, {
        validate: true,
        migrate: () => {
          throw new Error('migrate failed');
        },
      });
    }).toThrow('migrate failed');

    // Original model preserved — view of configA still works
    expect(handle.model).toEqual({ count: 5 });

    handle.stop();
  });

  it('throws and preserves old config when new view throws on migrated model', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 1 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `A:${model.count}` }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const brokenConfig = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (_m: Model) => {
        throw new TypeError('view broken');
      },
      subscriptions: () => Sub.none<Msg>(),
    };

    const handle = app(configA);

    expect(() => {
      handle.replaceConfig(brokenConfig, { validate: true });
    }).toThrow('view broken');

    // Model untouched
    expect(handle.model).toEqual({ count: 1 });

    handle.stop();
  });

  it('commits successfully when validate passes', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    let viewBCalls = 0;
    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 7 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `A:${model.count}` }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const configB = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (model: Model) => {
        viewBCalls++;
        return { kind: 'text' as const, content: `B:${model.count}` };
      },
      subscriptions: () => Sub.none<Msg>(),
    };

    const handle = app(configA);

    expect(() => {
      handle.replaceConfig(configB, { validate: true });
    }).not.toThrow();

    // configB.view was called at least once: dry-validate + post-commit render
    expect(viewBCalls).toBeGreaterThanOrEqual(2);
    expect(handle.model).toEqual({ count: 7 });
    handle.stop();
  });

  it('throws when subscriptions throw on the migrated model', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const brokenSubsConfig = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'B' }),
      subscriptions: () => {
        throw new Error('subs broken');
      },
    };

    const handle = app(configA);

    expect(() => {
      handle.replaceConfig(brokenSubsConfig, { validate: true });
    }).toThrow('subs broken');

    handle.stop();
  });

  it('legacy path (validate=false) still swallows errors via onRenderError', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'A' }),
      subscriptions: () => Sub.none<Msg>(),
    };
    const brokenConfig = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: (_m: Model) => {
        throw new TypeError('legacy broken');
      },
      subscriptions: () => Sub.none<Msg>(),
    };

    const errors: unknown[] = [];
    const handle = app(configA, { onRenderError: (e) => errors.push(e) });

    expect(() => {
      handle.replaceConfig(brokenConfig); // no validate flag — legacy path
    }).not.toThrow();

    expect(errors).toHaveLength(1);
    handle.stop();
  });
});
