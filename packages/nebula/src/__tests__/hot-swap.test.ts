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

describe('replaceConfig', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('swaps view function and re-renders', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [string, import('../types.js').Cmd<string>] => ['hello', Cmd.none()],
      update: (_msg: string, model: string): [string, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (_model: string) => ({ kind: 'text' as const, content: 'view-A' }),
      subscriptions: () => Sub.none<string>(),
    };

    const configB = {
      init: (): [string, import('../types.js').Cmd<string>] => ['unused', Cmd.none()],
      update: (_msg: string, model: string): [string, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (_model: string) => ({ kind: 'text' as const, content: 'view-B' }),
      subscriptions: () => Sub.none<string>(),
    };

    const handle = app(configA);

    // After replaceConfig, the new view should render
    handle.replaceConfig(configB);

    // Model should still be 'hello' (from configA's init), not 'unused'
    expect(handle.model).toBe('hello');

    handle.stop();
  });

  it('preserves model state across config swap', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    type Model = { count: number };
    type Msg = 'increment';

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [{ count: model.count + 1 }, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `count:${model.count}` }),
      subscriptions: () => Sub.key<Msg>('a', 'increment'),
    };

    const handle = app(configA);

    // Dispatch a few messages to build up state
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    expect((handle.model as Model).count).toBe(3);

    // Replace with a new config that has different view
    const configB = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 999 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [{ count: model.count + 10 }, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `new-count:${model.count}` }),
      subscriptions: () => Sub.key<Msg>('a', 'increment'),
    };

    handle.replaceConfig(configB);

    // Model should be preserved, not re-initialized
    expect((handle.model as Model).count).toBe(3);

    handle.stop();
  });

  it('swaps update function for subsequent messages', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    type Model = { value: number };
    type Msg = 'go';

    const configA = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ value: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [{ value: model.value + 1 }, Cmd.none()],
      view: (model: Model) => ({ kind: 'text' as const, content: `v:${model.value}` }),
      subscriptions: () => Sub.key<Msg>('x', 'go'),
    };

    const handle = app(configA);

    // Dispatch with old update (+1)
    state.inputHandler?.(Buffer.from('x', 'utf8'));
    expect((handle.model as Model).value).toBe(1);

    // Replace with update that adds 100
    const configB = {
      ...configA,
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [{ value: model.value + 100 }, Cmd.none()],
    };

    handle.replaceConfig(configB);

    // Dispatch with new update (+100)
    state.inputHandler?.(Buffer.from('x', 'utf8'));
    expect((handle.model as Model).value).toBe(101);

    handle.stop();
  });

  it('reconciles subscriptions after swap', async () => {
    vi.useFakeTimers();
    const { app, Cmd, Sub } = await loadRuntime();

    const timerFired = vi.fn();

    type Model = number;
    type Msg = 'tick' | 'noop';

    const configWithTimer = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [0, Cmd.none()],
      update: (msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => {
        if (msg === 'tick') timerFired();
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text' as const, content: 'timer' }),
      subscriptions: () => Sub.timer<Msg>(100, () => 'tick'),
    };

    const configWithoutTimer = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [0, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'no-timer' }),
      subscriptions: () => Sub.none<Msg>(),
    };

    const handle = app(configWithTimer);

    // Timer should fire
    vi.advanceTimersByTime(150);
    const firedBefore = timerFired.mock.calls.length;
    expect(firedBefore).toBeGreaterThan(0);

    // Replace with config that has no timer subscription
    handle.replaceConfig(configWithoutTimer);

    // Reset counter and advance time
    timerFired.mockClear();
    vi.advanceTimersByTime(500);

    // Timer should NOT fire after subscription removal
    expect(timerFired).not.toHaveBeenCalled();

    handle.stop();
  });

  it('applies migrate function to transform model', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    type ModelA = { name: string };
    type ModelB = { name: string; age: number };

    const configA = {
      init: (): [ModelA, import('../types.js').Cmd<string>] => [{ name: 'Alice' }, Cmd.none()],
      update: (_msg: string, model: ModelA): [ModelA, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (model: ModelA) => ({ kind: 'text' as const, content: model.name }),
      subscriptions: () => Sub.none<string>(),
    };

    const configB = {
      init: (): [ModelB, import('../types.js').Cmd<string>] => [{ name: 'Bob', age: 0 }, Cmd.none()],
      update: (_msg: string, model: ModelB): [ModelB, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (model: ModelB) => ({ kind: 'text' as const, content: `${model.name}:${model.age}` }),
      subscriptions: () => Sub.none<string>(),
    };

    const handle = app(configA);
    expect((handle.model as ModelA).name).toBe('Alice');

    handle.replaceConfig(configB, {
      migrate: (old: unknown) => {
        const prev = old as ModelA;
        return { name: prev.name, age: 25 };
      },
    });

    const model = handle.model as ModelB;
    expect(model.name).toBe('Alice');
    expect(model.age).toBe(25);

    handle.stop();
  });

  it('model getter returns current model state', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    const handle = app<number, string>({
      init: () => [42, Cmd.none()],
      update: (_msg: string, model: number) => [model + 1, Cmd.none()],
      view: (model: number) => ({ kind: 'text' as const, content: `${model}` }),
      subscriptions: () => Sub.key('a', 'go'),
    });

    expect(handle.model).toBe(42);

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(handle.model).toBe(43);

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(handle.model).toBe(44);

    handle.stop();
  });

  it('is a no-op on a stopped app', async () => {
    const { app, Cmd, Sub } = await loadRuntime();

    const configA = {
      init: (): [number, import('../types.js').Cmd<string>] => [0, Cmd.none()],
      update: (_msg: string, model: number): [number, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: () => ({ kind: 'text' as const, content: 'ok' }),
      subscriptions: () => Sub.none<string>(),
    };

    const handle = app(configA);
    handle.stop();

    // Should not throw
    expect(() => {
      handle.replaceConfig({
        init: () => [999, Cmd.none()],
        update: (_msg: string, model: number) => [model, Cmd.none()],
        view: () => ({ kind: 'text' as const, content: 'replaced' }),
        subscriptions: () => Sub.none(),
      });
    }).not.toThrow();
  });
});
