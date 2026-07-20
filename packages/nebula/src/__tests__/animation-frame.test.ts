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
  vi.useRealTimers();
  vi.resetModules();
});

describe('Sub.animationFrame', () => {
  it('delivers FrameInfo with frame, timestamp, and delta', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame'; frame: number; timestamp: number; delta: number };
    const frames: Msg[] = [];

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        frames.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.animationFrame((info) => ({
          type: 'frame' as const,
          ...info,
        })),
    });

    // Advance time by 2 frames (~32ms at 60fps)
    await vi.advanceTimersByTimeAsync(32);

    expect(frames.length).toBeGreaterThanOrEqual(1);
    const first = frames[0]!;
    expect(first.type).toBe('frame');
    expect(typeof first.frame).toBe('number');
    expect(typeof first.timestamp).toBe('number');
    expect(typeof first.delta).toBe('number');
    expect(first.frame).toBe(0);

    handle.stop();
  });

  it('frame counter increases monotonically', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame'; frame: number };
    const frameNumbers: number[] = [];

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        frameNumbers.push(msg.frame);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.animationFrame((info) => ({
          type: 'frame' as const,
          frame: info.frame,
        })),
    });

    // Advance 5 frames
    await vi.advanceTimersByTimeAsync(16 * 5);

    expect(frameNumbers.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < frameNumbers.length; i++) {
      expect(frameNumbers[i]).toBe(frameNumbers[i - 1]! + 1);
    }

    handle.stop();
  });

  it('delta reflects time between frames', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame'; delta: number };
    const deltas: number[] = [];

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        deltas.push(msg.delta);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.animationFrame((info) => ({
          type: 'frame' as const,
          delta: info.delta,
        })),
    });

    await vi.advanceTimersByTimeAsync(16 * 4);

    // With fake timers, delta should be exactly 16ms
    for (const d of deltas) {
      expect(d).toBe(16);
    }

    handle.stop();
  });

  it('auto-stops timer when subscription disappears', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame'; frame: number } | { type: 'stop' };
    let frameCount = 0;

    const handle = app<{ animating: boolean; count: number }, Msg>({
      init: () => [{ animating: true, count: 0 }, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'frame') {
          frameCount++;
          // Stop animating after 3 frames
          if (frameCount >= 3) {
            return [{ ...model, animating: false, count: model.count + 1 }, Cmd.none()];
          }
          return [{ ...model, count: model.count + 1 }, Cmd.none()];
        }
        return [model, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: (model) => (model.animating ? Sub.animationFrame((info) => ({ type: 'frame' as const, frame: info.frame })) : Sub.none()),
    });

    // Get through the 3 frames
    await vi.advanceTimersByTimeAsync(16 * 5);
    const countAfterStop = frameCount;

    // Advance more time — should not get more frames
    await vi.advanceTimersByTimeAsync(16 * 10);
    expect(frameCount).toBe(countAfterStop);

    handle.stop();
  });

  it('works with Sub.map', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type InnerMsg = { type: 'frame'; frame: number };
    type OuterMsg = { type: 'wrapped'; inner: InnerMsg };
    const messages: OuterMsg[] = [];

    const handle = app<number, OuterMsg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        messages.push(msg);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.map(
          Sub.animationFrame<InnerMsg>((info) => ({
            type: 'frame' as const,
            frame: info.frame,
          })),
          (inner) => ({ type: 'wrapped' as const, inner }),
        ),
    });

    await vi.advanceTimersByTimeAsync(32);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0]!.type).toBe('wrapped');
    expect(messages[0]!.inner.type).toBe('frame');

    handle.stop();
  });

  it('coexists with Sub.timer without interference', async () => {
    vi.useFakeTimers({ now: 1000 });
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame'; frame: number } | { type: 'tick' };
    const frameMessages: number[] = [];
    let tickCount = 0;

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'frame') {
          frameMessages.push((msg as { type: 'frame'; frame: number }).frame);
        } else if (msg.type === 'tick') {
          tickCount++;
        }
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.animationFrame<Msg>((info) => ({ type: 'frame' as const, frame: info.frame })),
          Sub.timer<Msg>(100, () => ({ type: 'tick' as const })),
        ),
    });

    await vi.advanceTimersByTimeAsync(200);

    // Should have both frame messages and tick messages
    expect(frameMessages.length).toBeGreaterThan(0);
    expect(tickCount).toBeGreaterThan(0);

    handle.stop();
  });

  it('cleans up timer on app stop', async () => {
    vi.useFakeTimers({ now: 1000 });
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'frame' };

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (_msg, model) => [model + 1, Cmd.none()],
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () => Sub.animationFrame(() => ({ type: 'frame' as const })),
    });

    await vi.advanceTimersByTimeAsync(32);

    handle.stop();

    // clearInterval should have been called (for both the animation frame timer and any other cleanup)
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('multiple Sub.animationFrame in a batch share one timer', async () => {
    vi.useFakeTimers({ now: 1000 });
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const { app, Cmd, Sub } = await loadRuntime();

    type Msg = { type: 'a'; frame: number } | { type: 'b'; frame: number };
    const aFrames: number[] = [];
    const bFrames: number[] = [];

    const handle = app<number, Msg>({
      init: () => [0, Cmd.none()],
      update: (msg, model) => {
        if (msg.type === 'a') aFrames.push(msg.frame);
        else bFrames.push(msg.frame);
        return [model + 1, Cmd.none()];
      },
      view: () => ({ kind: 'text', content: 'ok' }),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.animationFrame<Msg>((info) => ({ type: 'a' as const, frame: info.frame })),
          Sub.animationFrame<Msg>((info) => ({ type: 'b' as const, frame: info.frame })),
        ),
    });

    await vi.advanceTimersByTimeAsync(32);

    // Both should receive frames
    expect(aFrames.length).toBeGreaterThan(0);
    expect(bFrames.length).toBeGreaterThan(0);

    // They should receive the same frame numbers (shared clock)
    expect(aFrames).toEqual(bFrames);

    // Count how many setInterval calls were made for animation frames (16ms interval)
    const animFrameCalls = setIntervalSpy.mock.calls.filter((call) => call[1] === 16);
    expect(animFrameCalls.length).toBe(1); // Only one timer

    handle.stop();
  });
});
