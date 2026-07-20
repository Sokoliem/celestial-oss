import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, type StreamSource, Sub } from '../types.js';

function createMockTerminal(): TerminalBackend & { emitInput: (value: string) => void } {
  let inputHandler: ((data: Buffer) => void) | null = null;
  return {
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(),
    onInput: (handler) => {
      inputHandler = handler;
    },
    offInput: (handler) => {
      if (inputHandler === handler) inputHandler = null;
    },
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
    emitInput: (value) => inputHandler?.(Buffer.from(value)),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('subscription combinators across event sources', () => {
  it('preserves filter-before-map ordering for key subscriptions', () => {
    type Msg = { type: 'mapped'; value: string };
    const terminal = createMockTerminal();
    const received: Msg[] = [];
    const config: AppConfig<null, Msg> = {
      init: () => [null, Cmd.none()],
      update: (message, model) => {
        received.push(message);
        return [model, Cmd.none()];
      },
      view: () => text('map-filter'),
      subscriptions: () =>
        Sub.map(
          Sub.filter(Sub.key('x', 'blocked'), () => false),
          (value) => ({ type: 'mapped', value }),
        ),
    };
    const handle = app(config, { terminal });

    terminal.emitInput('x');
    expect(received).toEqual([]);
    handle.stop();
  });

  it('applies distinct and throttle to periodic timers', async () => {
    vi.useFakeTimers();
    type Msg = { type: 'distinct' } | { type: 'throttled'; tick: number };
    const terminal = createMockTerminal();
    const received: Msg[] = [];
    let tick = 0;
    const config: AppConfig<null, Msg> = {
      init: () => [null, Cmd.none()],
      update: (message, model) => {
        received.push(message);
        return [model, Cmd.none()];
      },
      view: () => text('timer-combinators'),
      subscriptions: () =>
        Sub.batch<Msg>(
          Sub.distinct(Sub.timer<Msg>(10, { type: 'distinct' }), (left, right) => left.type === right.type),
          Sub.throttle(
            Sub.timer<Msg>(10, () => ({ type: 'throttled', tick: tick++ })),
            25,
          ),
        ),
    };
    const handle = app(config, { terminal });

    await vi.advanceTimersByTimeAsync(50);
    expect(received.filter((message) => message.type === 'distinct')).toHaveLength(1);
    expect(received.filter((message) => message.type === 'throttled')).toHaveLength(2);
    handle.stop();
  });

  it('cancels a pending stream debounce when its subscription disappears', async () => {
    vi.useFakeTimers();
    type Msg = { type: 'disable' } | { type: 'data'; value: string };
    const terminal = createMockTerminal();
    const received: string[] = [];
    let streamCallback: ((data: unknown) => void) | null = null;
    const setup = (): StreamSource => ({
      onData: (callback) => {
        streamCallback = callback;
      },
      teardown: vi.fn(),
    });
    const config: AppConfig<{ enabled: boolean }, Msg> = {
      init: () => [{ enabled: true }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'disable') return [{ enabled: false }, Cmd.none()];
        received.push(message.value);
        return [model, Cmd.none()];
      },
      view: () => text('stream-debounce'),
      subscriptions: (model) =>
        Sub.batch<Msg>(
          Sub.key('d', { type: 'disable' }),
          model.enabled ? Sub.debounce(Sub.stream<Msg>({ id: 'events', setup, toMsg: (data) => ({ type: 'data', value: String(data) }) }), 50) : Sub.none(),
        ),
    };
    const handle = app(config, { terminal });

    (streamCallback as ((data: unknown) => void) | null)?.('pending');
    terminal.emitInput('d');
    await vi.advanceTimersByTimeAsync(50);

    expect(received).toEqual([]);
    handle.stop();
  });

  it('applies throttle to animation-frame subscriptions', async () => {
    vi.useFakeTimers();
    type Msg = { type: 'frame'; frame: number };
    const terminal = createMockTerminal();
    const frames: number[] = [];
    const config: AppConfig<null, Msg> = {
      init: () => [null, Cmd.none()],
      update: (message, model) => {
        frames.push(message.frame);
        return [model, Cmd.none()];
      },
      view: () => text('animation-throttle'),
      subscriptions: () =>
        Sub.throttle(
          Sub.animationFrame<Msg>((info) => ({ type: 'frame', frame: info.frame })),
          50,
        ),
    };
    const handle = app(config, { terminal });

    await vi.advanceTimersByTimeAsync(160);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.length).toBeLessThanOrEqual(4);
    handle.stop();
  });
});
