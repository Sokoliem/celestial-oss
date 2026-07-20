import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cmd, cmdKind, Sub, subKind } from '../types.js';

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

  const [{ app }, { Cmd: RuntimeCmd, Sub: RuntimeSub }] = await Promise.all([import('../app.js'), import('../types.js')]);
  return { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Cmd.delay', () => {
  it('wraps a delayed message as a perform command', async () => {
    vi.useFakeTimers();
    const cmd = Cmd.delay(100, { type: 'done' as const });
    const kind = cmdKind(cmd);

    expect(kind.kind).toBe('perform');
    if (kind.kind === 'perform') {
      const promise = kind.task(new AbortController().signal);
      await vi.advanceTimersByTimeAsync(100);
      await expect(promise).resolves.toBeUndefined();
      expect(kind.toMsg(undefined)).toEqual({ type: 'done' });
    }
  });
});

describe('Cmd.debounce', () => {
  it('supersedes pending commands with the same key at runtime', async () => {
    vi.useFakeTimers();
    const { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub } = await loadRuntime();
    const seen: number[] = [];

    type Msg = { type: 'schedule'; value: number } | { type: 'commit'; value: number };

    const handle = app<{ pending: number | null }, Msg>({
      init: () => [{ pending: null }, RuntimeCmd.none()],
      update: (msg) => {
        if (msg.type === 'schedule') {
          return [
            { pending: msg.value },
            RuntimeCmd.debounce(
              100,
              RuntimeCmd.perform(
                async () => msg.value,
                (value) => ({ type: 'commit', value }),
              ),
              'search',
            ),
          ];
        }

        seen.push(msg.value);
        return [{ pending: null }, RuntimeCmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => RuntimeSub.batch<Msg>(RuntimeSub.key('a', { type: 'schedule', value: 1 }), RuntimeSub.key('b', { type: 'schedule', value: 2 })),
    });

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    await vi.advanceTimersByTimeAsync(50);
    state.inputHandler?.(Buffer.from('b', 'utf8'));
    await vi.advanceTimersByTimeAsync(100);

    expect(seen).toEqual([2]);
    handle.stop();
  });
});

describe('Sub.windowFocus and Sub.idle', () => {
  it('exposes the new sub kinds', () => {
    expect(subKind(Sub.windowFocus((focused) => ({ type: 'focus', focused }))).kind).toBe('windowFocus');
    expect(subKind(Sub.idle(250, { type: 'idle' })).kind).toBe('idle');
  });

  it('dispatches terminal focus events and enables mode 1004', async () => {
    const { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub } = await loadRuntime();
    const seen: boolean[] = [];

    type Msg = { type: 'focus'; focused: boolean };

    const handle = app<number, Msg>({
      init: () => [0, RuntimeCmd.none()],
      update: (msg, model) => {
        seen.push(msg.focused);
        return [model, RuntimeCmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => RuntimeSub.windowFocus((focused) => ({ type: 'focus', focused })),
    });

    expect(state.writes.join('')).toContain('\x1b[?1004h');

    state.inputHandler?.(Buffer.from('\x1b[I', 'utf8'));
    state.inputHandler?.(Buffer.from('\x1b[O', 'utf8'));

    expect(seen).toEqual([true, false]);
    handle.stop();
  });

  it('does not leak focus control sequences into key subscriptions', async () => {
    const { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub } = await loadRuntime();
    const focusSeen: boolean[] = [];
    const keySeen: string[] = [];

    type Msg = { type: 'focus'; focused: boolean } | { type: 'key'; key: string };

    const handle = app<number, Msg>({
      init: () => [0, RuntimeCmd.none()],
      update: (msg, model) => {
        if (msg.type === 'focus') {
          focusSeen.push(msg.focused);
        } else {
          keySeen.push(msg.key);
        }
        return [model, RuntimeCmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        RuntimeSub.batch<Msg>(
          RuntimeSub.windowFocus((focused) => ({ type: 'focus', focused })),
          RuntimeSub.keyEvent((event) => ({ type: 'key', key: event.key })),
        ),
    });

    state.inputHandler?.(Buffer.from('\x1b[Ia', 'utf8'));

    expect(focusSeen).toEqual([true]);
    expect(keySeen).toEqual(['a']);
    handle.stop();
  });

  it('fires idle once per quiet window and resets on input', async () => {
    vi.useFakeTimers();
    const { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub } = await loadRuntime();
    const seen: string[] = [];

    type Msg = { type: 'idle' } | { type: 'poke' };

    const handle = app<number, Msg>({
      init: () => [0, RuntimeCmd.none()],
      update: (msg, model) => {
        seen.push(msg.type);
        return [model, RuntimeCmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => RuntimeSub.batch<Msg>(RuntimeSub.idle(100, { type: 'idle' }), RuntimeSub.key('x', { type: 'poke' })),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual(['idle']);

    await vi.advanceTimersByTimeAsync(200);
    expect(seen).toEqual(['idle']);

    state.inputHandler?.(Buffer.from('x', 'utf8'));
    expect(seen).toEqual(['idle', 'poke']);

    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual(['idle', 'poke', 'idle']);

    handle.stop();
  });

  it('uses the latest idle message when the model changes without changing the timeout', async () => {
    vi.useFakeTimers();
    const { state, app, Cmd: RuntimeCmd, Sub: RuntimeSub } = await loadRuntime();
    const seen: number[] = [];

    type Msg = { type: 'idle'; value: number } | { type: 'inc' };

    const handle = app<number, Msg>({
      init: () => [0, RuntimeCmd.none()],
      update: (msg, model) => {
        if (msg.type === 'inc') {
          return [model + 1, RuntimeCmd.none()];
        }
        seen.push(msg.value);
        return [model, RuntimeCmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) => RuntimeSub.batch<Msg>(RuntimeSub.idle(100, { type: 'idle', value: model }), RuntimeSub.key('x', { type: 'inc' })),
    });

    await vi.advanceTimersByTimeAsync(50);
    state.inputHandler?.(Buffer.from('x', 'utf8'));
    await vi.advanceTimersByTimeAsync(100);

    expect(seen).toEqual([1]);
    handle.stop();
  });
});
