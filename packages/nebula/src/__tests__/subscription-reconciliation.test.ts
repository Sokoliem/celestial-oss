import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';

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

describe('subscription reconciliation', () => {
  it('uses the latest timer mapper while preserving an unchanged interval', async () => {
    vi.useFakeTimers();
    type Msg = { type: 'increment' } | { type: 'tick'; value: number };
    const terminal = createMockTerminal();
    const ticks: number[] = [];
    const config: AppConfig<{ value: number }, Msg> = {
      init: () => [{ value: 0 }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'increment') return [{ value: model.value + 1 }, Cmd.none()];
        ticks.push(message.value);
        return [model, Cmd.none()];
      },
      view: () => text('timer'),
      subscriptions: (model) =>
        Sub.batch<Msg>(
          Sub.key<Msg>('i', { type: 'increment' }),
          Sub.timer(100, () => ({ type: 'tick' as const, value: model.value })),
        ),
    };
    const handle = app(config, { terminal });

    terminal.emitInput('i');
    await vi.advanceTimersByTimeAsync(100);

    expect(ticks).toEqual([1]);
    handle.stop();
  });

  it('rejects invalid subscription durations at construction time', () => {
    expect(() => Sub.timer(-1, 'tick')).toThrow(RangeError);
    expect(() => Sub.idle(Number.NaN, 'idle')).toThrow(RangeError);
    expect(() => Sub.debounce(Sub.none(), Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => Sub.throttle(Sub.none(), -0.1)).toThrow(RangeError);
  });
});
