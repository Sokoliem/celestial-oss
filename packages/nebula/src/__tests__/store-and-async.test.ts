import { describe, expect, it } from 'vitest';
import { createStore } from '../state/store.js';
import { Cmd, cmdKind } from '../types/cmd.js';

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

  it('builds Cmd.async descriptors with onSuccess/onError mapping', () => {
    type AsyncMsg = { type: 'SUCCESS'; data: string } | { type: 'ERROR'; error: string };

    const cmd = Cmd.async<string, AsyncMsg>(
      async () => 'hello',
      {
        onSuccess: (data): AsyncMsg => ({ type: 'SUCCESS', data }),
        onError: (err): AsyncMsg => ({ type: 'ERROR', error: err.message }),
      },
    );

    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('attempt');
  });

  it('builds Cmd.throttle descriptors', () => {
    const cmd = Cmd.throttle(200, Cmd.msg({ type: 'TICK' }), 'search');
    const kind = cmdKind(cmd);
    expect(kind.kind).toBe('debounce');
    if (kind.kind === 'debounce') {
      expect(kind.ms).toBe(200);
      expect(kind.key).toBe('throttle:search');
    }
  });
});
