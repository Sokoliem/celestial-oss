import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sub, subKind } from '../types.js';

// ---------------------------------------------------------------------------
// Sub.keyWithModifiers — type-level tests
// ---------------------------------------------------------------------------

describe('Sub.keyWithModifiers', () => {
  it('creates a keyWithModifiers sub kind', () => {
    const sub = Sub.keyWithModifiers('c', { ctrl: true }, 'ctrl-c');
    expect(sub._tag).toBe('sub');
    const kind = subKind(sub);
    expect(kind.kind).toBe('keyWithModifiers');
    if (kind.kind === 'keyWithModifiers') {
      expect(kind.key).toBe('c');
      expect(kind.modifiers).toEqual({ ctrl: true });
      expect(kind.msg).toBe('ctrl-c');
    }
  });

  it('supports multiple modifiers', () => {
    const sub = Sub.keyWithModifiers('x', { ctrl: true, shift: true }, 'cx');
    const kind = subKind(sub);
    expect(kind.kind).toBe('keyWithModifiers');
    if (kind.kind === 'keyWithModifiers') {
      expect(kind.modifiers.ctrl).toBe(true);
      expect(kind.modifiers.shift).toBe(true);
      expect(kind.modifiers.alt).toBeUndefined();
    }
  });

  it('works inside Sub.batch', () => {
    const sub = Sub.batch(Sub.key('q', 'quit'), Sub.keyWithModifiers('c', { ctrl: true }, 'ctrl-c'), Sub.keyWithModifiers('x', { alt: true }, 'alt-x'));
    const kind = subKind(sub);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.subs).toHaveLength(3);
      expect(subKind(kind.subs[0]!).kind).toBe('key');
      expect(subKind(kind.subs[1]!).kind).toBe('keyWithModifiers');
      expect(subKind(kind.subs[2]!).kind).toBe('keyWithModifiers');
    }
  });

  it('works with Sub.map', () => {
    const inner = Sub.keyWithModifiers<number>('s', { ctrl: true }, 42);
    const mapped = Sub.map(inner, (n) => `msg:${n}`);

    const kind = subKind(mapped);
    expect(kind.kind).toBe('map');
    if (kind.kind === 'map') {
      expect(kind.fn(42)).toBe('msg:42');
      const innerKind = subKind(kind.sub as Sub<number>);
      expect(innerKind.kind).toBe('keyWithModifiers');
    }
  });
});

// ---------------------------------------------------------------------------
// matchKeySub — runtime dispatch tests (via mock terminal)
// ---------------------------------------------------------------------------

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

describe('matchKeySub with modifiers', () => {
  it('dispatches on ctrl+key when Sub.keyWithModifiers matches', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.keyWithModifiers('c', { ctrl: true }, 'ctrl-c'),
    });

    // Send Ctrl+C (byte 0x03 = ctrl+c)
    state.inputHandler?.(Buffer.from([0x03]));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('ctrl-c');

    handle.stop();
  });

  it('does NOT dispatch on ctrl+key when modifiers mismatch', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      // Subscribe to alt+c, NOT ctrl+c
      subscriptions: () => Sub.keyWithModifiers('c', { alt: true }, 'alt-c'),
    });

    // Send Ctrl+C — should NOT match alt+c subscription
    state.inputHandler?.(Buffer.from([0x03]));
    expect(updateCalls).not.toHaveBeenCalled();

    handle.stop();
  });

  it('plain Sub.key still works (no regression)', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.key('q', 'quit'),
    });

    // Send plain 'q'
    state.inputHandler?.(Buffer.from('q', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('quit');

    handle.stop();
  });

  it('plain Sub.key does NOT fire when ctrl is held', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.key('c', 'plain-c'),
    });

    // Send Ctrl+C — should NOT match plain 'c'
    state.inputHandler?.(Buffer.from([0x03]));
    expect(updateCalls).not.toHaveBeenCalled();

    // Send plain 'c' — should match
    state.inputHandler?.(Buffer.from('c', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('plain-c');

    handle.stop();
  });

  it('keyWithModifiers works inside Sub.batch', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.batch(Sub.key('q', 'quit'), Sub.keyWithModifiers('c', { ctrl: true }, 'ctrl-c')),
    });

    // Ctrl+C should match keyWithModifiers but not the plain 'q' sub
    state.inputHandler?.(Buffer.from([0x03]));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('ctrl-c');

    // Plain 'q' should match the key sub
    state.inputHandler?.(Buffer.from('q', 'utf8'));
    expect(updateCalls).toHaveBeenCalledTimes(2);
    expect(updateCalls).toHaveBeenCalledWith('quit');

    handle.stop();
  });

  it('keyWithModifiers works with Sub.map', async () => {
    const { state, app, Cmd, Sub } = await loadRuntime();
    const updateCalls = vi.fn();

    const handle = app<number, string>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        updateCalls(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.map(Sub.keyWithModifiers<number>('c', { ctrl: true }, 1), (n) => `mapped:${n}`),
    });

    state.inputHandler?.(Buffer.from([0x03]));
    expect(updateCalls).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveBeenCalledWith('mapped:1');

    handle.stop();
  });
});
