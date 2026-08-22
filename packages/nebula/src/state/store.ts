import { type Signal, signal } from '../signals.js';

export interface Store<State, Msg> {
  getState(): State;
  dispatch(msg: Msg): void;
  subscribe(listener: (state: State) => void): () => void;
  readonly state: Signal<State>;
}

/**
 * Creates a lightweight state container with a reducer, reactive signal integration,
 * and subscription listeners. Useful for managing local sub-component state without
 * boilerplate.
 */
export function createStore<State, Msg>(
  initialState: State,
  reducer: (state: State, msg: Msg) => State,
): Store<State, Msg> {
  let currentState = initialState;
  const [getter, setter] = signal<State>(initialState);
  const listeners = new Set<(state: State) => void>();

  function getState(): State {
    return currentState;
  }

  function dispatch(msg: Msg): void {
    const nextState = reducer(currentState, msg);
    if (!Object.is(currentState, nextState)) {
      currentState = nextState;
      setter(nextState);
      for (const listener of listeners) {
        listener(nextState);
      }
    }
  }

  function subscribe(listener: (state: State) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState,
    dispatch,
    subscribe,
    get state() {
      return getter;
    },
  };
}
