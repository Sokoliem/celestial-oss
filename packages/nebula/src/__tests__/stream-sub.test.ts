import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StreamSource } from '../types.js';

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

  vi.resetModules();
  vi.doMock('../terminal.js', async () => {
    const actual = await vi.importActual<typeof import('../terminal.js')>('../terminal.js');
    return {
      ...actual,
      createTerminal: () => ({
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

describe('Sub.stream', () => {
  it('creates a stream sub with the correct kind', async () => {
    const { Sub } = await loadRuntime();
    const setup = (): StreamSource => ({
      onData: () => {},
      teardown: () => {},
    });
    const toMsg = (data: unknown) => ({ type: 'data' as const, payload: data });
    const sub = Sub.stream({ id: 'test-stream', setup, toMsg });

    expect(sub._tag).toBe('sub');
    expect(sub._kind).toMatchObject({ kind: 'stream', id: 'test-stream' });
  });

  it('sets up stream source when subscription first appears', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const setupCalls: string[] = [];
    let dataCallback: ((data: unknown) => void) | null = null;

    const setup = (): StreamSource => {
      setupCalls.push('setup');
      return {
        onData: (cb) => {
          dataCallback = cb;
        },
        teardown: () => {
          setupCalls.push('teardown');
        },
      };
    };

    type Msg = { type: 'stream-data'; payload: unknown };

    const handle = app<Record<string, never>, Msg>({
      init: () => [{}, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.stream<Msg>({
          id: 'my-stream',
          setup,
          toMsg: (data) => ({ type: 'stream-data', payload: data }),
        }),
    });

    // Wait for initial reconciliation
    await vi.waitFor(() => {
      expect(setupCalls).toContain('setup');
    });

    expect(setupCalls).toEqual(['setup']);
    expect(dataCallback).not.toBeNull();

    handle.stop();
  });

  it('delivers stream data as messages to the update function', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    let dataCallback: ((data: unknown) => void) | null = null;
    const received: unknown[] = [];

    const setup = (): StreamSource => ({
      onData: (cb) => {
        dataCallback = cb;
      },
      teardown: () => {},
    });

    type Msg = { type: 'data'; payload: unknown };

    const handle = app<{ items: unknown[] }, Msg>({
      init: () => [{ items: [] }, Cmd.none()],
      update: (msg, model) => {
        received.push(msg.payload);
        return [{ items: [...model.items, msg.payload] }, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.stream<Msg>({
          id: 'data-stream',
          setup,
          toMsg: (data) => ({ type: 'data', payload: data }),
        }),
    });

    await vi.waitFor(() => {
      expect(dataCallback).not.toBeNull();
    });

    // Emit data through the stream
    dataCallback!({ tool: 'Read', file: 'index.ts' });
    dataCallback!({ tool: 'Edit', file: 'app.ts' });

    await vi.waitFor(() => {
      expect(received.length).toBeGreaterThanOrEqual(2);
    });

    expect(received[0]).toEqual({ tool: 'Read', file: 'index.ts' });
    expect(received[1]).toEqual({ tool: 'Edit', file: 'app.ts' });

    handle.stop();
  });

  it('tears down stream source when subscription is removed', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const lifecycle: string[] = [];

    const setup = (): StreamSource => {
      lifecycle.push('setup');
      return {
        onData: () => {},
        teardown: () => {
          lifecycle.push('teardown');
        },
      };
    };

    type Msg = { type: 'disable' } | { type: 'stream-data'; payload: unknown };

    const handle = app<{ enabled: boolean }, Msg>({
      init: () => [{ enabled: true }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'disable') return [{ enabled: false }, Cmd.none()];
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        model.enabled
          ? Sub.batch<Msg>(
              Sub.key('d', { type: 'disable' }),
              Sub.stream({
                id: 'teardown-stream',
                setup,
                toMsg: (data) => ({ type: 'stream-data', payload: data }),
              }),
            )
          : Sub.key('d', { type: 'disable' }),
    });

    await vi.waitFor(() => {
      expect(lifecycle).toContain('setup');
    });

    // Simulate pressing 'd' to disable the stream subscription
    state.inputHandler!(Buffer.from('d'));

    await vi.waitFor(() => {
      expect(lifecycle).toContain('teardown');
    });

    expect(lifecycle).toEqual(['setup', 'teardown']);

    handle.stop();
  });

  it('tears down all streams on app shutdown', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const lifecycle: string[] = [];

    const makeSetup = (label: string) => (): StreamSource => {
      lifecycle.push(`setup:${label}`);
      return {
        onData: () => {},
        teardown: () => {
          lifecycle.push(`teardown:${label}`);
        },
      };
    };

    type Msg = { type: 'data'; payload: unknown };

    const handle = app<Record<string, never>, Msg>({
      init: () => [{}, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.stream({ id: 'a', setup: makeSetup('a'), toMsg: (d) => ({ type: 'data', payload: d }) }),
          Sub.stream({ id: 'b', setup: makeSetup('b'), toMsg: (d) => ({ type: 'data', payload: d }) }),
        ),
    });

    await vi.waitFor(() => {
      expect(lifecycle.filter((e) => e.startsWith('setup:'))).toHaveLength(2);
    });

    handle.stop();

    expect(lifecycle).toContain('teardown:a');
    expect(lifecycle).toContain('teardown:b');
  });

  it('does not re-setup a stream that already exists', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    let setupCount = 0;

    const setup = (): StreamSource => {
      setupCount++;
      return {
        onData: () => {},
        teardown: () => {},
      };
    };

    type Msg = { type: 'tick' } | { type: 'data'; payload: unknown };

    const handle = app<{ count: number }, Msg>({
      init: () => [{ count: 0 }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'tick') return [{ count: model.count + 1 }, Cmd.none()];
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.key('t', { type: 'tick' }),
          Sub.stream({
            id: 'stable-stream',
            setup,
            toMsg: (d) => ({ type: 'data', payload: d }),
          }),
        ),
    });

    await vi.waitFor(() => {
      expect(setupCount).toBe(1);
    });

    // Trigger a state change — subscription reconciliation runs again
    state.inputHandler!(Buffer.from('t'));
    state.inputHandler!(Buffer.from('t'));

    // Give reconciliation time to run
    await new Promise((r) => setTimeout(r, 50));

    // Stream should only be set up once — not re-created on each reconciliation
    expect(setupCount).toBe(1);

    handle.stop();
  });

  it('uses the latest message mapper without restarting a stable stream', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    let dataCallback: ((data: unknown) => void) | null = null;
    let setupCount = 0;
    const received: string[] = [];
    const setup = (): StreamSource => {
      setupCount++;
      return {
        onData: (callback) => {
          dataCallback = callback;
        },
        teardown: () => {},
      };
    };

    type Msg = { type: 'increment' } | { type: 'data'; payload: string };
    const handle = app<{ version: number }, Msg>({
      init: () => [{ version: 0 }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'increment') return [{ version: model.version + 1 }, Cmd.none()];
        received.push(message.payload);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        Sub.batch(
          Sub.key('i', { type: 'increment' as const }),
          Sub.stream<Msg>({
            id: 'latest-mapper',
            setup,
            toMsg: (data) => ({ type: 'data', payload: `${model.version}:${String(data)}` }),
          }),
        ),
    });

    state.inputHandler?.(Buffer.from('i'));
    (dataCallback as ((data: unknown) => void) | null)?.('event');

    expect(setupCount).toBe(1);
    expect(received).toEqual(['1:event']);
    handle.stop();
  });

  it('restarts on restartKey changes and suppresses stale source callbacks', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const callbacks: Array<(data: unknown) => void> = [];
    const lifecycle: string[] = [];
    const received: string[] = [];
    let setupIndex = 0;
    const setup = (): StreamSource => {
      const index = setupIndex++;
      lifecycle.push(`setup:${index}`);
      return {
        onData: (callback) => callbacks.push(callback),
        teardown: () => lifecycle.push(`teardown:${index}`),
      };
    };

    type Msg = { type: 'restart' } | { type: 'data'; payload: string };
    const handle = app<{ version: number }, Msg>({
      init: () => [{ version: 0 }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'restart') return [{ version: model.version + 1 }, Cmd.none()];
        received.push(message.payload);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        Sub.batch(
          Sub.key('r', { type: 'restart' as const }),
          Sub.stream<Msg>({
            id: 'restartable',
            setup,
            restartKey: model.version,
            toMsg: (data) => ({ type: 'data', payload: `${model.version}:${String(data)}` }),
          }),
        ),
    });

    state.inputHandler?.(Buffer.from('r'));
    expect(lifecycle).toEqual(['setup:0', 'teardown:0', 'setup:1']);

    callbacks[0]?.('stale');
    callbacks[1]?.('fresh');
    expect(received).toEqual(['1:fresh']);
    handle.stop();
  });

  it('works with Sub.map (structural)', async () => {
    const { Sub } = await loadRuntime();

    type Inner = { type: 'inner'; data: unknown };
    type Outer = { type: 'wrapped'; inner: Inner };

    const setup = (): StreamSource => ({
      onData: () => {},
      teardown: () => {},
    });

    const inner = Sub.stream<Inner>({
      id: 'mapped',
      setup,
      toMsg: (data) => ({ type: 'inner', data }),
    });

    const outer: typeof inner extends infer _ ? unknown : never = Sub.map(inner, (msg: Inner): Outer => ({ type: 'wrapped', inner: msg }));

    expect(outer).toBeDefined();
  });

  it('delivers data through Sub.map(Sub.stream(...)) at runtime', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    let dataCallback: ((data: unknown) => void) | null = null;
    const received: unknown[] = [];

    const setup = (): StreamSource => ({
      onData: (cb) => {
        dataCallback = cb;
      },
      teardown: () => {},
    });

    type Inner = { type: 'stream-data'; payload: unknown };
    type Outer = { type: 'wrapped'; inner: Inner };

    const handle = app<Record<string, never>, Outer>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        received.push(msg);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.map(
          Sub.stream<Inner>({
            id: 'mapped-runtime',
            setup,
            toMsg: (data) => ({ type: 'stream-data', payload: data }),
          }),
          (inner: Inner): Outer => ({ type: 'wrapped', inner }),
        ),
    });

    await vi.waitFor(() => {
      expect(dataCallback).not.toBeNull();
    });

    dataCallback!({ value: 42 });

    await vi.waitFor(() => {
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    expect(received[0]).toEqual({
      type: 'wrapped',
      inner: { type: 'stream-data', payload: { value: 42 } },
    });

    handle.stop();
  });
});
