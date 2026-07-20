// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app as createApp } from '../../../app.js';
import { BRACKETED_PASTE_DISABLE, BRACKETED_PASTE_ENABLE } from '../../../clipboard.js';
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

  it('stops element propagation after target when stopPropagation is called', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const seen: string[] = [];

    type Msg = { type: 'element-mouse'; event: import('../../../types.js').ElementMouseEvent };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        seen.push(`${msg.event.phase}:${msg.event.currentTargetId}:${msg.event.handlerTag}`);
        if (msg.event.handlerTag === 'child-target') {
          msg.event.stopPropagation();
        }
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

    expect(seen).toEqual(['capture:grandparent:grandparent-capture', 'capture:parent:parent-capture', 'target:child:child-target']);

    handle.stop();
  });

  it('exports optimistic helpers from the public API', async () => {
    const nebula = await import('../../../index.js');

    expect(typeof nebula.createOptimisticState).toBe('function');
    expect(typeof nebula.applyOptimistic).toBe('function');
    expect(typeof nebula.confirmOptimistic).toBe('function');
    expect(typeof nebula.rejectOptimistic).toBe('function');
  });

  it('echoes focused text input characters before the deferred render flushes', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    vi.useFakeTimers();

    type Msg = { type: 'char'; char: string } | { type: 'focus'; id: string | null };
    const viewCalls = vi.fn();

    const handle = app<{ value: string; focused: boolean }, Msg>({
      init: () => [{ value: 'x', focused: true }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'char') {
          return [{ ...model, value: model.value + msg.char }, Cmd.none()];
        }
        return [model, Cmd.none()];
      },
      view: (model) => {
        viewCalls();
        return {
          kind: 'focus',
          id: 'input',
          focused: model.focused,
          echoHint: { kind: 'text-input', value: model.value, cursor: model.value.length },
          child: {
            kind: 'row',
            children: [
              { kind: 'text', content: model.value },
              { kind: 'text', content: ' ' },
            ],
          },
        };
      },
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.key('a', { type: 'char', char: 'a' }),
          Sub.focus((id) => ({ type: 'focus', id })),
        ),
    });

    expect(viewCalls).toHaveBeenCalledTimes(1);
    state.writes.length = 0;
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    const immediateOutput = state.writes.join('');
    expect(immediateOutput).toContain('\x1b[1;2H');
    expect(immediateOutput).toContain('a');
    expect(immediateOutput).not.toContain('xa ');
    expect(viewCalls).toHaveBeenCalledTimes(1);

    const writeCountBeforeFlush = state.writes.length;
    await vi.advanceTimersByTimeAsync(16);
    expect(state.writes.length).toBeGreaterThan(writeCountBeforeFlush);
    expect(viewCalls).toHaveBeenCalledTimes(2);
    expect(state.writes.slice(writeCountBeforeFlush).join('')).toContain('\x1b[?2026h');
    expect(state.writes.slice(writeCountBeforeFlush).join('')).toContain('\x1b[?2026l');
    expect(state.writes.slice(writeCountBeforeFlush).join('')).not.toContain('\x1b[1;2H');

    handle.stop();
  });

  it('fast echo shifts the visible tail when inserting in the middle', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    vi.useFakeTimers();

    type Msg = { type: 'char'; char: string };

    const handle = app<{ value: string }, Msg>({
      init: () => [{ value: 'xo' }, Cmd.none()],
      update: (msg, model) => [{ value: `${model.value[0]}${msg.char}${model.value.slice(1)}` }, Cmd.none()],
      view: (model) => ({
        kind: 'focus',
        id: 'input',
        focused: true,
        echoHint: { kind: 'text-input', value: model.value, cursor: 1 },
        child: {
          kind: 'text',
          content: model.value,
        },
      }),
      subscriptions: () => Sub.key('a', { type: 'char', char: 'a' }),
    });

    state.writes.length = 0;
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    const immediateOutput = state.writes.join('');
    expect(immediateOutput).toContain('\x1b[1;2H');
    expect(immediateOutput).toContain('a');
    expect(immediateOutput).toContain('\x1b[1;3H');
    expect(immediateOutput).toContain('o');

    await vi.advanceTimersByTimeAsync(16);
    expect(state.writes.slice(1).join('')).toContain('\x1b[?2026h');
    expect(state.writes.slice(1).join('')).toContain('\x1b[?2026l');

    handle.stop();
  });

  it('suspends and resumes terminal IO without losing app state', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    type Msg = { type: 'inc' } | { type: 'paste'; text: string } | { type: 'mouse'; event: import('../../../types.js').MouseEventData };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg, model);
        return [model + 1, Cmd.none()];
      },
      view: (model) => ({ kind: 'text', content: `count:${model}` }),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.key('a', { type: 'inc' }),
          Sub.paste((text) => ({ type: 'paste', text })),
          Sub.mouse((event) => ({ type: 'mouse', event })),
        ),
    });

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenLastCalledWith({ type: 'inc' }, 0);

    state.writes.length = 0;
    handle.suspend();

    expect(state.inputHandler).toBeNull();
    expect(state.resizeHandler).toBeNull();
    expect(state.exitRawModeCalls).toBe(1);
    expect(state.writes.join('')).toContain(BRACKETED_PASTE_DISABLE);
    expect(state.writes.join('')).toContain('\x1b[?1006l');

    state.writes.length = 0;
    handle.resume();

    expect(state.inputHandler).not.toBeNull();
    expect(state.resizeHandler).not.toBeNull();
    expect(state.enterRawModeCalls).toBe(2);
    expect(state.writes.join('')).toContain(BRACKETED_PASTE_ENABLE);
    expect(state.writes.join('')).toContain('\x1b[?1006h');

    state.inputHandler?.(Buffer.from('a', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(2);
    expect(updateCalls).toHaveBeenLastCalledWith({ type: 'inc' }, 1);

    handle.stop();
  });

  it('cancels scheduled renders while suspended and resumes with a single immediate repaint', async () => {
    vi.useFakeTimers();
    const { state, app, Cmd, Sub } = await loadRuntime();

    let renderCount = 0;
    const handle = app<number, { type: 'inc' }>({
      init: () => [0, Cmd.none()],
      update: (_msg, model) => [model + 1, Cmd.none()],
      view: (model) => {
        renderCount++;
        return { kind: 'text', content: `count:${model}` };
      },
      subscriptions: () => Sub.key('a', { type: 'inc' }),
    });

    const initialRenderCount = renderCount;
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    handle.suspend();

    await vi.advanceTimersByTimeAsync(32);
    expect(renderCount).toBe(initialRenderCount);

    handle.resume();
    expect(renderCount).toBe(initialRenderCount + 1);

    await vi.advanceTimersByTimeAsync(32);
    expect(renderCount).toBe(initialRenderCount + 1);

    handle.stop();
  });
});
