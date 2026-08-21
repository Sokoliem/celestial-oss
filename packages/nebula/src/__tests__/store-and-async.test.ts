import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { text } from '../elements.js';
import { createStore } from '../state/store.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, cmdKind } from '../types/cmd.js';
import { Sub } from '../types.js';

function createMockTerminal(): TerminalBackend {
  return {
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: vi.fn(),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

function run<M>(initial: Cmd<M>, update: (message: M, model: M[]) => [M[], Cmd<M>]) {
  const seen: M[] = [];
  const config: AppConfig<M[], M> = {
    init: () => [[], initial],
    update: (message, model) => {
      seen.push(message);
      return update(message, model);
    },
    view: () => text('store-and-async'),
    subscriptions: () => Sub.none(),
  };
  return { seen, handle: app(config, { terminal: createMockTerminal() }) };
}

describe('Store and Async Command Primitives', () => {
  it('creates a reactive store with dispatch and state updates', () => {
    interface CounterState {
      count: number;
    }
    type CounterMsg = { type: 'inc' } | { type: 'dec' } | { type: 'set'; val: number };

    const store = createStore<CounterState, CounterMsg>({ count: 0 }, (state, msg) => {
      switch (msg.type) {
        case 'inc':
          return { count: state.count + 1 };
        case 'dec':
          return { count: state.count - 1 };
        case 'set':
          return { count: msg.val };
      }
    });

    expect(store.getState().count).toBe(0);
    expect(store.state().count).toBe(0);

    let observed = 0;
    const unsub = store.subscribe((s) => {
      observed = s.count;
    });

    store.dispatch({ type: 'inc' });
    expect(store.getState().count).toBe(1);
    expect(store.state().count).toBe(1);
    expect(observed).toBe(1);

    store.dispatch({ type: 'set', val: 10 });
    expect(store.getState().count).toBe(10);
    expect(observed).toBe(10);

    unsub();
    store.dispatch({ type: 'inc' });
    expect(store.getState().count).toBe(11);
    expect(observed).toBe(10); // Unsubscribed
  });

  it('executes Cmd.async tasks and maps fulfillment through onSuccess', async () => {
    type AsyncMsg = { type: 'SUCCESS'; data: string } | { type: 'ERROR'; error: string };

    const cmd = Cmd.async<string, AsyncMsg>(async () => 'hello', {
      onSuccess: (data): AsyncMsg => ({ type: 'SUCCESS', data }),
      onError: (err): AsyncMsg => ({ type: 'ERROR', error: err.message }),
    });

    const { seen, handle } = run<AsyncMsg>(cmd, (message, model) => [[...model, message], Cmd.none()]);
    await vi.waitFor(() => expect(seen).toEqual([{ type: 'SUCCESS', data: 'hello' }]));
    handle.stop();
  });

  it('executes Cmd.async tasks and maps rejection through onError with an Error', async () => {
    type AsyncMsg = { type: 'SUCCESS'; data: string } | { type: 'ERROR'; error: string };

    const cmd = Cmd.async<string, AsyncMsg>(
      async () => {
        throw 'string failure';
      },
      {
        onSuccess: (data): AsyncMsg => ({ type: 'SUCCESS', data }),
        onError: (err): AsyncMsg => ({ type: 'ERROR', error: err.message }),
      },
    );

    const { seen, handle } = run<AsyncMsg>(cmd, (message, model) => [[...model, message], Cmd.none()]);
    await vi.waitFor(() => expect(seen).toEqual([{ type: 'ERROR', error: 'string failure' }]));
    handle.stop();
  });

  it('builds Cmd.throttle descriptors with a dedicated kind and unmodified key', () => {
    const cmd = Cmd.throttle(200, Cmd.msg({ type: 'TICK' }), 'search');
    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('throttle');
    if (kind.kind === 'throttle') {
      expect(kind.ms).toBe(200);
      expect(kind.key).toBe('search');
    }
  });

  it('runs the first throttled command immediately and drops repeats inside the window', async () => {
    type TickMsg = { type: 'tick'; n: number };
    const windowMs = 60_000;

    const { seen, handle } = run<TickMsg>(
      Cmd.throttle(
        windowMs,
        Cmd.msg<TickMsg>({ type: 'tick', n: 1 }),
        'k',
      ),
      (message, model) => [
        [...model, message],
        model.length === 0 ? Cmd.throttle(windowMs, Cmd.msg<TickMsg>({ type: 'tick', n: 2 }), 'k') : Cmd.none(),
      ],
    );

    await vi.waitFor(() => expect(seen).toEqual([{ type: 'tick', n: 1 }]));
    // Give the dropped second command every chance to (incorrectly) dispatch.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(seen).toEqual([{ type: 'tick', n: 1 }]);
    handle.stop();
  });

  it('runs a throttled command again after the window elapses', async () => {
    type TickMsg = { type: 'tick'; n: number } | { type: 'again' };

    const { seen, handle } = run<TickMsg>(
      Cmd.throttle(
        20,
        Cmd.msg<TickMsg>({ type: 'tick', n: 1 }),
        'k',
      ),
      (message, model) => {
        if (message.type === 'tick') return [[...model, message], Cmd.none()];
        return [[...model, message], Cmd.throttle(20, Cmd.msg<TickMsg>({ type: 'tick', n: 2 }), 'k')];
      },
    );

    await vi.waitFor(() => expect(seen).toEqual([{ type: 'tick', n: 1 }]));
    // Wait out the 20ms throttle window before redispatching.
    await new Promise((resolve) => setTimeout(resolve, 40));
    handle.dispatch({ type: 'again' });
    await vi.waitFor(() =>
      expect(seen).toEqual([{ type: 'tick', n: 1 }, { type: 'again' }, { type: 'tick', n: 2 }]),
    );
    handle.stop();
  });
});
