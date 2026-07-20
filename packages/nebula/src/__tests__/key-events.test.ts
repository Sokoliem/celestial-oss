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

  const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

  return { state, app, Cmd, Sub };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Sub.keyEvent', () => {
  it('delivers parsed printable key events', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const received: Array<{ key: string; char?: string; ctrl: boolean; alt: boolean; shift: boolean }> = [];

    const handle = app<{}, { type: 'key'; event: { key: string; char?: string; ctrl: boolean; alt: boolean; shift: boolean } }>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        received.push(msg.event);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.keyEvent((event) => ({ type: 'key', event })),
    });

    state.inputHandler?.(Buffer.from('A', 'utf8'));

    expect(received).toEqual([{ key: 'A', char: 'A', ctrl: false, alt: false, shift: true }]);

    handle.stop();
  });

  it('delivers modified key events alongside plain key subscriptions', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const received: string[] = [];

    const handle = app<{}, { type: 'raw'; key: string } | { type: 'save' }>({
      init: () => [{}, Cmd.none()],
      update: (msg, model) => {
        received.push(msg.type === 'raw' ? `raw:${msg.key}` : 'save');
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch<{ type: 'raw'; key: string } | { type: 'save' }>(
          Sub.keyEvent<{ type: 'raw'; key: string } | { type: 'save' }>((event) => ({ type: 'raw', key: `${event.ctrl ? 'ctrl+' : ''}${event.key}` })),
          Sub.keyWithModifiers<{ type: 'raw'; key: string } | { type: 'save' }>('s', { ctrl: true }, { type: 'save' as const }),
        ),
    });

    state.inputHandler?.(Buffer.from([0x13]));

    expect(received).toEqual(['raw:ctrl+s', 'save']);

    handle.stop();
  });
});
