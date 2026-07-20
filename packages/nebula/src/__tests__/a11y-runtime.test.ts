import { afterEach, describe, expect, it, vi } from 'vitest';

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

  const appModule = await import('../app.js');
  const typesModule = await import('../types.js');
  const elementsModule = await import('../elements.js');

  return {
    state,
    app: appModule.app,
    Cmd: typesModule.Cmd,
    Sub: typesModule.Sub,
    focus: elementsModule.focus,
    text: elementsModule.text,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('runtime accessibility bridge', () => {
  it('emits focus changes through the accessibility sink', async () => {
    const { state, app, Cmd, Sub, focus, text } = await loadRuntime();
    const onFocusChange = vi.fn();

    const handle = app<{ step: number }, { type: 'focus'; id: string | null }>(
      {
        init: () => [{ step: 0 }, Cmd.none()],
        update: (_msg, model) => [{ ...model, step: model.step + 1 }, Cmd.none()],
        view: () => ({
          kind: 'column',
          children: [focus('first', text('First')), focus('second', text('Second'))],
        }),
        subscriptions: () => Sub.focus((id) => ({ type: 'focus', id })),
      },
      {
        accessibility: { onFocusChange },
      },
    );

    state.inputHandler?.(Buffer.from([0x09]));

    expect(onFocusChange).toHaveBeenCalled();
    expect(onFocusChange.mock.calls.at(-1)?.[1]).toBe('first');

    handle.stop();
  });

  it('flushes announce commands through the accessibility sink', async () => {
    const { app, Cmd, Sub, text } = await loadRuntime();
    const onAnnouncements = vi.fn();

    const handle = app<{ done: boolean }, { type: 'done' }>(
      {
        init: () => [{ done: false }, Cmd.announce('Agent finished', 'assertive')],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => text('done'),
        subscriptions: () => Sub.none(),
      },
      {
        accessibility: { onAnnouncements },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAnnouncements).toHaveBeenCalledTimes(1);
    expect(onAnnouncements.mock.calls[0]?.[0][0]?.message).toBe('Agent finished');
    expect(onAnnouncements.mock.calls[0]?.[0][0]?.priority).toBe('assertive');

    handle.stop();
  });

  it('flushes announce commands inside sequences without follow-up messages', async () => {
    const { app, Cmd, Sub, text } = await loadRuntime();
    const onAnnouncements = vi.fn();

    const handle = app<{ done: boolean }, { type: 'done' }>(
      {
        init: () => [{ done: false }, Cmd.sequence(Cmd.announce('Queued'))],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => text('done'),
        subscriptions: () => Sub.none(),
      },
      {
        accessibility: { onAnnouncements },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onAnnouncements).toHaveBeenCalledTimes(1);
    expect(onAnnouncements.mock.calls[0]?.[0][0]?.message).toBe('Queued');

    handle.stop();
  });

  it('reports focus changes when render resets a missing focused node', async () => {
    vi.useFakeTimers();
    const { state, app, Cmd, Sub, focus, text } = await loadRuntime();
    const onFocusChange = vi.fn();

    const handle = app<{ showFirst: boolean }, { type: 'hide' } | { type: 'focus'; id: string | null }>(
      {
        init: () => [{ showFirst: true }, Cmd.none()],
        update: (msg, model) => {
          if (msg.type === 'hide') {
            return [{ showFirst: false }, Cmd.none()];
          }

          return [model, Cmd.none()];
        },
        view: (model) => ({
          kind: 'column',
          children: model.showFirst ? [focus('first', text('First')), focus('second', text('Second'))] : [focus('second', text('Second'))],
        }),
        subscriptions: () =>
          Sub.batch(
            Sub.focus<{ type: 'hide' } | { type: 'focus'; id: string | null }>((id) => ({ type: 'focus', id })),
            Sub.key<{ type: 'hide' } | { type: 'focus'; id: string | null }>('h', { type: 'hide' }),
          ),
      },
      {
        accessibility: { onFocusChange },
      },
    );

    state.inputHandler?.(Buffer.from([0x09]));
    expect(onFocusChange.mock.calls.at(-1)?.[1]).toBe('first');

    state.inputHandler?.(Buffer.from('h'));
    await vi.advanceTimersByTimeAsync(20);
    expect(onFocusChange.mock.calls.at(-1)?.[1]).toBe('second');

    vi.useRealTimers();
    handle.stop();
  });
});
