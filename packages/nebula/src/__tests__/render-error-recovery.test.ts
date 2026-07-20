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

describe('render error recovery', () => {
  it('catches view errors and calls onRenderError', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const errors: unknown[] = [];
    let shouldThrow = false;

    const config = {
      init: (): [string, import('../types.js').Cmd<string>] => ['hello', Cmd.none()],
      update: (_msg: string, model: string): [string, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (_model: string) => {
        if (shouldThrow) throw new ReferenceError('SOME_CONSTANT is not defined');
        return { kind: 'text' as const, content: 'ok' };
      },
      subscriptions: () => Sub.none<string>(),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, {
      onRenderError: (err) => errors.push(err),
    });

    // Initial render should succeed
    expect(errors).toHaveLength(0);

    // Trigger a broken render via replaceConfig (simulates hot-reload with broken code)
    shouldThrow = true;
    const brokenConfig = { ...config };
    handle.replaceConfig(brokenConfig);

    // Error should be caught and reported, not thrown
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ReferenceError);
    expect((errors[0] as ReferenceError).message).toBe('SOME_CONSTANT is not defined');

    // App should still be running — recovery render should work
    shouldThrow = false;
    const fixedConfig = {
      ...config,
      view: () => ({ kind: 'text' as const, content: 'recovered' }),
    };
    handle.replaceConfig(fixedConfig);

    // No new errors after recovery
    expect(errors).toHaveLength(1);

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('preserves model after render error', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    let shouldThrow = false;

    type Model = { count: number };
    type Msg = 'inc';

    const config = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => [{ count: model.count + 1 }, Cmd.none()],
      view: (model: Model) => {
        if (shouldThrow) throw new Error('broken view');
        return { kind: 'text' as const, content: `count:${model.count}` };
      },
      subscriptions: () => Sub.key<Msg>('a', 'inc' as const),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, { onRenderError: () => {} });

    // Build up state
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect((handle.model as Model).count).toBe(2);

    // Simulate broken hot-reload
    shouldThrow = true;
    handle.replaceConfig({ ...config });

    // Model should be preserved
    expect((handle.model as Model).count).toBe(2);

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('recovers on next successful render after error', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const errors: unknown[] = [];
    let throwCount = 0;

    const config = {
      init: (): [string, import('../types.js').Cmd<string>] => ['ok', Cmd.none()],
      update: (_msg: string, model: string): [string, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (_model: string) => {
        if (throwCount > 0) {
          throwCount--;
          throw new Error('transient error');
        }
        return { kind: 'text' as const, content: 'rendered' };
      },
      subscriptions: () => Sub.none<string>(),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, {
      onRenderError: (err) => errors.push(err),
    });

    // Break for one render cycle
    throwCount = 1;
    handle.replaceConfig({ ...config });
    expect(errors).toHaveLength(1);

    // Next replaceConfig should succeed (throwCount is now 0)
    handle.replaceConfig({ ...config });
    expect(errors).toHaveLength(1); // No new errors

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('catches update errors and preserves model', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const errors: unknown[] = [];
    let shouldThrow = false;

    type Model = { count: number };
    type Msg = 'inc';

    const config = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, model: Model): [Model, import('../types.js').Cmd<Msg>] => {
        if (shouldThrow) throw new ReferenceError('SOME_CONSTANT is not defined');
        return [{ count: model.count + 1 }, Cmd.none()];
      },
      view: (model: Model) => ({ kind: 'text' as const, content: `count:${model.count}` }),
      subscriptions: () => Sub.key<Msg>('a', 'inc' as const),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, {
      onRenderError: (err) => errors.push(err),
    });

    // Normal update works
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect((handle.model as Model).count).toBe(1);

    // Break the update path
    shouldThrow = true;
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    // Error caught, model preserved at previous value
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ReferenceError);
    expect((handle.model as Model).count).toBe(1); // NOT incremented

    // Recovery after fix
    shouldThrow = false;
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect((handle.model as Model).count).toBe(2);
    expect(errors).toHaveLength(1); // No new errors

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('deduplicates repeated errors from the same cause', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const errors: unknown[] = [];

    type Model = { count: number };
    type Msg = 'inc';

    const config = {
      init: (): [Model, import('../types.js').Cmd<Msg>] => [{ count: 0 }, Cmd.none()],
      update: (_msg: Msg, _model: Model): [Model, import('../types.js').Cmd<Msg>] => {
        throw new ReferenceError('BROKEN_CONST is not defined');
      },
      view: (model: Model) => ({ kind: 'text' as const, content: `count:${model.count}` }),
      subscriptions: () => Sub.key<Msg>('a', 'inc' as const),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, {
      onRenderError: (err) => errors.push(err),
    });

    // Dispatch the same error multiple times
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    // Should only fire once despite 5 dispatches
    expect(errors).toHaveLength(1);
    expect((errors[0] as ReferenceError).message).toBe('BROKEN_CONST is not defined');

    handle.stop();
    stderrSpy.mockRestore();
  });

  it('fires onRenderRecovery after error then successful render', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    let recoveryCount = 0;
    let shouldThrow = false;

    const config = {
      init: (): [string, import('../types.js').Cmd<string>] => ['ok', Cmd.none()],
      update: (_msg: string, model: string): [string, import('../types.js').Cmd<string>] => [model, Cmd.none()],
      view: (_model: string) => {
        if (shouldThrow) throw new Error('broken');
        return { kind: 'text' as const, content: 'ok' };
      },
      subscriptions: () => Sub.none<string>(),
    };

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handle = app(config, {
      onRenderError: () => {},
      onRenderRecovery: () => {
        recoveryCount++;
      },
    });

    // No recovery at start
    expect(recoveryCount).toBe(0);

    // Break it
    shouldThrow = true;
    handle.replaceConfig({ ...config });
    expect(recoveryCount).toBe(0); // Still broken

    // Fix it
    shouldThrow = false;
    handle.replaceConfig({ ...config });
    expect(recoveryCount).toBe(1); // Recovered!

    // Another successful render should NOT fire recovery again
    handle.replaceConfig({ ...config });
    expect(recoveryCount).toBe(1);

    handle.stop();
    stderrSpy.mockRestore();
  });
});
