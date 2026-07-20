// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app as createApp } from '../../../app.js';
import type { TerminalBackend } from '../../../terminal.js';
import { Cmd, Sub } from '../../../types.js';

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

  const terminal: TerminalBackend = {
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

describe('app runtime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not treat ctrl/alt modified keys as plain key subscriptions', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();
    const update = (msg: string, model: number): [number, import('../../../types.js').Cmd<string>] => {
      updateCalls(msg, model);
      return [model + 1, Cmd.none<string>()];
    };

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update,
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.key('c', 'pressed'),
    });

    state.inputHandler?.(Buffer.from([0x03]));
    state.inputHandler?.(Buffer.from('\x1bc', 'binary'));
    expect(updateCalls).not.toHaveBeenCalled();

    state.inputHandler?.(Buffer.from('c', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('pressed', 0);

    handle.stop();
  });

  it('dispatches resize subscriptions and unregisters the resize listener on stop', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();
    const update = (
      msg: { type: 'resized'; cols: number; rows: number },
      model: number,
    ): [number, import('../../../types.js').Cmd<{ type: 'resized'; cols: number; rows: number }>] => {
      updateCalls(msg, model);
      expect(model).toBe(0);
      return [model + 1, Cmd.none<typeof msg>()];
    };

    const handle = app<number, { type: 'resized'; cols: number; rows: number }>({
      init: () => [0, Cmd.none()],
      update,
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.resize((cols, rows) => ({ type: 'resized', cols, rows })),
    });

    state.size = { cols: 120, rows: 40 };
    state.resizeHandler?.();

    expect(updateCalls).toHaveBeenCalledWith({ type: 'resized', cols: 120, rows: 40 }, 0);

    expect(state.resizeHandler).not.toBeNull();
    handle.stop();

    // After stop, the resize handler should have been unregistered via terminal.offResize
    expect(state.resizeHandler).toBeNull();
  });

  it('preserves mapped sequence ordering for async commands', async () => {
    const { app, Cmd, Sub } = await loadRuntime();
    const callOrder: number[] = [];

    const handle = app<number, number>({
      init: () => [
        0,
        Cmd.map(
          Cmd.sequence(
            Cmd.perform(
              () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 25)),
              (value) => value,
            ),
            Cmd.perform(
              () => Promise.resolve(2),
              (value) => value,
            ),
          ),
          (value) => value,
        ),
      ],
      update: (msg, model) => {
        callOrder.push(msg);
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.none(),
    });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(callOrder).toEqual([1, 2]);

    handle.stop();
  });

  it('should dispatch Sub.mouse events to update when mouse input is received', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    type Msg = { type: 'mouse'; event: import('../../../types.js').MouseEventData };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.mouse((event) => ({ type: 'mouse', event })),
    });

    // Send an SGR 1006 mouse click: left button at (10, 5) — 1-indexed in protocol
    state.inputHandler?.(Buffer.from('\x1b[<0;10;5M', 'utf8'));

    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith({
      type: 'mouse',
      event: {
        type: 'press',
        button: 0,
        x: 9, // 0-indexed
        y: 4, // 0-indexed
        ctrl: false,
        alt: false,
        shift: false,
      },
    });

    handle.stop();
  });

  it('should dispatch Sub.mouse move events through Sub.batch', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    type Msg = { type: 'mouse'; event: import('../../../types.js').MouseEventData } | { type: 'key-pressed' };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch(
          Sub.key('q', { type: 'key-pressed' } as Msg),
          Sub.mouse((event) => ({ type: 'mouse', event })),
        ),
    });

    // Send SGR 1006 mouse move (no button): baseButton 35 at (20, 10)
    state.inputHandler?.(Buffer.from('\x1b[<35;20;10M', 'utf8'));

    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls.mock.calls[0]![0]).toMatchObject({
      type: 'mouse',
      event: { type: 'move', button: 'none', x: 19, y: 9 },
    });

    handle.stop();
  });

  it('should enable mouse tracking when only Sub.elementMouse is subscribed', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'element-mouse'; event: import('../../../types.js').ElementMouseEvent };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (_msg, model) => [model + 1, Cmd.none()],
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.elementMouse((event) => ({ type: 'element-mouse', event })),
    });

    // The runtime should have written MOUSE_ENABLE to the terminal
    const mouseEnableSeq = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h';
    expect(state.writes.some((w) => w.includes(mouseEnableSeq) || w.includes('1000h'))).toBe(true);

    handle.stop();
  });

  it('delivers tab key events before focus navigation intercepts them', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const received: Array<{ key: string; shift: boolean }> = [];

    const handle = app<number, { type: 'key'; key: string; shift: boolean }>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        received.push({ key: msg.key, shift: msg.shift });
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.keyEvent((event) => ({ type: 'key', key: event.key, shift: event.shift })),
    });

    state.inputHandler?.(Buffer.from('\t', 'utf8'));

    expect(received).toEqual([{ key: 'tab', shift: false }]);

    handle.stop();
  });

  it('reconciles subscriptions after key events before matching plain keys', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const received: string[] = [];

    type Msg = { type: 'toggle-open' } | { type: 'raw'; key: string } | { type: 'close' } | { type: 'save' };

    const handle = app<{ open: boolean }, Msg>({
      init: () => [{ open: true }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'raw') {
          received.push(`raw:${msg.key}`);
          if (msg.key === 'escape') {
            return [{ open: false }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }
        if (msg.type === 'close') {
          received.push('close');
          return [{ open: false }, Cmd.none()];
        }
        if (msg.type === 'save') {
          received.push('save');
          return [model, Cmd.none()];
        }
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) =>
        model.open
          ? Sub.batch<Msg>(
              Sub.keyEvent((event) => ({ type: 'raw', key: event.key })),
              Sub.key('escape', { type: 'close' }),
            )
          : Sub.batch<Msg>(
              Sub.keyEvent((event) => ({ type: 'raw', key: event.key })),
              Sub.key('escape', { type: 'save' }),
            ),
    });

    state.inputHandler?.(Buffer.from('\x1b', 'utf8'));

    expect(received).toEqual(['raw:escape', 'save']);

    handle.stop();
  });

  it('dispatches element mouse events through capture, target, and bubble phases', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    type Msg = { type: 'element-mouse'; event: import('../../../types.js').ElementMouseEvent };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg.event);
        return [model + 1, Cmd.none()];
      },
      view: () => ({
        kind: 'event',
        id: 'grandparent',
        handlers: { onClickCapture: 'grandparent-capture', onClick: 'grandparent-bubble' },
        child: {
          kind: 'event',
          id: 'parent',
          handlers: { onClickCapture: 'parent-capture', onClick: 'parent-bubble' },
          child: {
            kind: 'event',
            id: 'child',
            handlers: { onClick: 'child-target' },
            child: { kind: 'text', content: 'X' },
          },
        },
      }),
      subscriptions: () => Sub.elementMouse((event) => ({ type: 'element-mouse', event })),
    });

    state.inputHandler?.(Buffer.from('\x1b[<0;1;1M', 'utf8'));

    expect(
      updateCalls.mock.calls.map(([event]) => ({
        handlerTag: event.handlerTag,
        phase: event.phase,
        currentTargetId: event.currentTargetId,
        targetId: event.targetId,
        path: event.path,
      })),
    ).toEqual([
      {
        handlerTag: 'grandparent-capture',
        phase: 'capture',
        currentTargetId: 'grandparent',
        targetId: 'child',
        path: ['grandparent', 'parent', 'child'],
      },
      {
        handlerTag: 'parent-capture',
        phase: 'capture',
        currentTargetId: 'parent',
        targetId: 'child',
        path: ['grandparent', 'parent', 'child'],
      },
      {
        handlerTag: 'child-target',
        phase: 'target',
        currentTargetId: 'child',
        targetId: 'child',
        path: ['grandparent', 'parent', 'child'],
      },
      {
        handlerTag: 'parent-bubble',
        phase: 'bubble',
        currentTargetId: 'parent',
        targetId: 'child',
        path: ['grandparent', 'parent', 'child'],
      },
      {
        handlerTag: 'grandparent-bubble',
        phase: 'bubble',
        currentTargetId: 'grandparent',
        targetId: 'child',
        path: ['grandparent', 'parent', 'child'],
      },
    ]);

    handle.stop();
  });
});
