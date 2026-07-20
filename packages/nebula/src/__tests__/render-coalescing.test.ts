/**
 * Tests for render frame coalescing.
 *
 * Verifies that multiple rapid dispatches are batched into a single
 * render frame via microtask scheduling, while the initial render
 * remains synchronous (immediate).
 */
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
  const terminal = {
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
  };

  const [{ app }, { Cmd, Sub }, { ansi }] = await Promise.all([import('../app.js'), import('../types.js'), import('../terminal.js')]);

  return { state, terminal, app, Cmd, Sub, ansi };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('render frame coalescing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first render is synchronous (immediate, not deferred)', async () => {
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

    // The initial render should have already happened synchronously
    // (clearScreen is part of the first render)
    const hasRendered = state.writes.some((w) => w === ansi.clearScreen);
    expect(hasRendered).toBe(true);

    handle.stop();
  });

  it('multiple rapid dispatches result in a single coalesced render', async () => {
    vi.useFakeTimers();
    const { state, terminal, app, Cmd, Sub } = await loadRuntime();

    let renderCount = 0;
    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model + 1, Cmd.none()],
        view: (model) => {
          renderCount++;
          return { kind: 'text', content: `count: ${model}` };
        },
        subscriptions: () => Sub.key('a', 'inc'),
      },
      { terminal },
    );

    // Reset after initial render
    const initialRenderCount = renderCount;
    state.writes.length = 0;

    // Fire 5 rapid key presses synchronously
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    // Before frame timer flushes, no new renders should have happened.
    const rendersBeforeFlush = renderCount - initialRenderCount;

    await vi.advanceTimersByTimeAsync(16);

    const rendersAfterFlush = renderCount - initialRenderCount;

    expect(rendersBeforeFlush).toBe(0);
    expect(rendersAfterFlush).toBe(1);

    handle.stop();
  });

  it('render budget warning fires when render exceeds threshold', async () => {
    vi.useFakeTimers();
    const originalDebugRender = process.env.CELESTIAL_DEBUG_RENDER;
    process.env.CELESTIAL_DEBUG_RENDER = '1';
    const { state, terminal, app, Cmd, Sub } = await loadRuntime();

    // Mock stderr to capture warnings
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // Mock performance.now to simulate a slow render
    let callCount = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      callCount++;
      // First call returns 0 (start), second call returns 20 (end) => 20ms > 16ms budget
      return callCount % 2 === 1 ? 0 : 20;
    });

    const handle = app<number, string>(
      {
        init: () => [0, Cmd.none()],
        update: (_msg, model) => [model + 1, Cmd.none()],
        view: (model) => ({ kind: 'text', content: `count: ${model}` }),
        subscriptions: () => Sub.key('a', 'inc'),
      },
      { terminal },
    );

    // Trigger a dispatch
    state.inputHandler?.(Buffer.from('a', 'utf8'));

    await vi.advanceTimersByTimeAsync(16);

    // Check that a budget warning was emitted
    const warningCalls = stderrSpy.mock.calls.filter((call) => typeof call[0] === 'string' && (call[0] as string).includes('render budget'));
    expect(warningCalls.length).toBeGreaterThan(0);

    stderrSpy.mockRestore();
    vi.spyOn(performance, 'now').mockRestore();
    handle.stop();
    if (originalDebugRender === undefined) {
      delete process.env.CELESTIAL_DEBUG_RENDER;
    } else {
      process.env.CELESTIAL_DEBUG_RENDER = originalDebugRender;
    }
  });
});
