/**
 * Tests for synchronized output wrapping in the render pipeline.
 *
 * Verifies that every render's terminal output is wrapped in
 * BSU (Begin Synchronized Update) / ESU (End Synchronized Update)
 * sequences to eliminate screen tearing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

interface RuntimeState {
  size: { cols: number; rows: number };
  writes: string[];
  inputHandler: ((data: Buffer) => void) | null;
  resizeHandler: (() => void) | null;
  failWrite: ((data: string) => boolean) | null;
}

async function loadRuntime() {
  const state: RuntimeState = {
    size: { cols: 80, rows: 24 },
    writes: [],
    inputHandler: null,
    resizeHandler: null,
    failWrite: null,
  };
  const terminal = {
    enterRawMode() {},
    exitRawMode() {},
    write(data: string) {
      state.writes.push(data);
      if (state.failWrite?.(data)) throw new Error('render write failed');
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

  const [{ app }, { Cmd, Sub }, { ansi }] = await Promise.all([import('../app.js'), import('../types.js'), import('../terminal.js')]);

  return { state, terminal, app, Cmd, Sub, ansi };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('synchronized output in render', () => {
  it('wraps the initial render output with BSU and ESU sequences', async () => {
    const { state, terminal, app, Cmd, Sub, ansi } = await loadRuntime();

    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => ({ kind: 'text', content: 'hello' }),
        subscriptions: () => Sub.none(),
      },
      { terminal },
    );

    // Find the BSU and ESU in the writes
    const bsuIndex = state.writes.indexOf(ansi.syncOutput.begin);
    const esuIndex = state.writes.indexOf(ansi.syncOutput.end);

    expect(bsuIndex).toBeGreaterThanOrEqual(0);
    expect(esuIndex).toBeGreaterThan(bsuIndex);

    handle.stop();
  });

  it('wraps subsequent render output (after dispatch) with BSU and ESU', async () => {
    vi.useFakeTimers();
    const { state, terminal, app, Cmd, Sub, ansi } = await loadRuntime();

    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model + 1, Cmd.none()],
        view: (model) => ({ kind: 'text', content: `count: ${model}` }),
        subscriptions: () => Sub.key('a', 'inc'),
      },
      { terminal },
    );

    // Clear initial writes
    state.writes.length = 0;

    // Trigger a dispatch via key input
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    // Advance past the frame budget so the coalesced render fires
    await vi.advanceTimersByTimeAsync(20);

    // The dispatch-triggered render should also be wrapped
    const bsuIndex = state.writes.indexOf(ansi.syncOutput.begin);
    const esuIndex = state.writes.indexOf(ansi.syncOutput.end);

    expect(bsuIndex).toBeGreaterThanOrEqual(0);
    expect(esuIndex).toBeGreaterThan(bsuIndex);

    vi.useRealTimers();
    handle.stop();
  });

  it('BSU appears before any render content and ESU appears after', async () => {
    const { state, terminal, app, Cmd, Sub, ansi } = await loadRuntime();

    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => ({ kind: 'text', content: 'test' }),
        subscriptions: () => Sub.none(),
      },
      { terminal },
    );

    // BSU should be the first write before clearScreen
    const bsuIndex = state.writes.indexOf(ansi.syncOutput.begin);
    const clearIndex = state.writes.indexOf(ansi.clearScreen);
    const esuIndex = state.writes.indexOf(ansi.syncOutput.end);

    // BSU must come before clearScreen (which is part of initial render)
    expect(bsuIndex).toBeLessThan(clearIndex);
    // ESU must come after all render output
    expect(esuIndex).toBeGreaterThan(clearIndex);

    handle.stop();
  });

  it('closes synchronized output when a frame write fails', async () => {
    const { state, terminal, app, Cmd, Sub, ansi } = await loadRuntime();
    const errors: unknown[] = [];
    let failed = false;
    state.failWrite = (data) => {
      if (!failed && data === ansi.clearScreen) {
        failed = true;
        return true;
      }
      return false;
    };

    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model, Cmd.none()],
        view: () => ({ kind: 'text', content: 'test' }),
        subscriptions: () => Sub.none(),
      },
      { terminal, onRenderError: (error) => errors.push(error) },
    );

    const bsuIndex = state.writes.indexOf(ansi.syncOutput.begin);
    const esuIndex = state.writes.indexOf(ansi.syncOutput.end);
    expect(errors).toHaveLength(1);
    expect(bsuIndex).toBeGreaterThanOrEqual(0);
    expect(esuIndex).toBeGreaterThan(bsuIndex);

    handle.stop();
  });
});
