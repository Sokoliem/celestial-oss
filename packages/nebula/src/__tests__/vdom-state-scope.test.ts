import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, app } from '../app.js';
import { lazy, localState, memo, text } from '../elements.js';
import type { TerminalBackend } from '../terminal.js';
import { Cmd, Sub } from '../types.js';
import type { VNode } from '../vdom.js';

function createMockTerminal(): TerminalBackend & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    enterRawMode: vi.fn(),
    exitRawMode: vi.fn(),
    write: (value) => output.push(value),
    onInput: vi.fn(),
    offInput: vi.fn(),
    onResize: vi.fn(),
    offResize: vi.fn(),
    getSize: () => ({ cols: 40, rows: 10 }),
  };
}

function runView(view: () => VNode, terminal = createMockTerminal()) {
  const config: AppConfig<null, never> = {
    init: () => [null, Cmd.none()],
    update: (_message, model) => [model, Cmd.none()],
    view,
    subscriptions: () => Sub.none(),
  };
  return { terminal, handle: app(config, { terminal }) };
}

describe('app-scoped VNode state', () => {
  it('isolates local state with the same key across app instances', async () => {
    const statesA: number[] = [];
    const statesB: number[] = [];
    const reducerA = vi.fn((state: number) => state + 1);
    let dispatchA: ((action: 'increment') => void) | undefined;

    const appA = runView(
      () =>
        localState(
          'shared-counter',
          () => 0,
          reducerA,
          (state, dispatch) => {
            statesA.push(state);
            dispatchA = dispatch;
            return text(String(state));
          },
        ) as unknown as VNode,
    );
    const appB = runView(
      () =>
        localState(
          'shared-counter',
          () => 10,
          (state: number) => state + 1,
          (state) => {
            statesB.push(state);
            return text(String(state));
          },
        ) as unknown as VNode,
    );

    expect(statesA.at(-1)).toBe(0);
    expect(statesB.at(-1)).toBe(10);

    dispatchA?.('increment');
    await vi.waitFor(() => expect(statesA.at(-1)).toBe(1));
    expect(statesB.at(-1)).toBe(10);

    appA.handle.stop();
    dispatchA?.('increment');
    expect(reducerA).toHaveBeenCalledOnce();
    appB.handle.stop();
  });

  it('does not reuse memoized nodes between apps', () => {
    let value = 'first';
    const render = vi.fn(() => text(value));
    const appA = runView(() => memo(render, []));

    value = 'second';
    const appB = runView(() => memo(render, []));

    expect(render).toHaveBeenCalledTimes(2);
    appA.handle.stop();
    appB.handle.stop();
  });

  it('loads identical lazy keys independently and ignores completion after disposal', async () => {
    let resolveA: ((factory: () => VNode) => void) | undefined;
    let resolveB: ((factory: () => VNode) => void) | undefined;
    const loaderA = vi.fn(
      () =>
        new Promise<() => VNode>((resolve) => {
          resolveA = resolve;
        }),
    );
    const loaderB = vi.fn(
      () =>
        new Promise<() => VNode>((resolve) => {
          resolveB = resolve;
        }),
    );
    const appA = runView(() => lazy('shared-lazy', loaderA, text('loading-a')));
    const appB = runView(() => lazy('shared-lazy', loaderB, text('loading-b')));

    expect(loaderA).toHaveBeenCalledOnce();
    expect(loaderB).toHaveBeenCalledOnce();
    appA.handle.stop();
    appB.handle.stop();
    const writesA = appA.terminal.output.length;
    const writesB = appB.terminal.output.length;

    resolveA?.(() => text('loaded-a'));
    resolveB?.(() => text('loaded-b'));
    await Promise.resolve();
    await Promise.resolve();

    expect(appA.terminal.output).toHaveLength(writesA);
    expect(appB.terminal.output).toHaveLength(writesB);
  });

  it('routes retained local-state dispatchers through the latest reducer', async () => {
    let step = 1;
    let retainedDispatch: ((action: 'increment') => void) | undefined;
    const states: number[] = [];
    const running = runView(() => {
      const currentStep = step;
      return localState(
        'changing-reducer',
        () => 0,
        (state: number) => state + currentStep,
        (state, dispatch) => {
          states.push(state);
          retainedDispatch = dispatch;
          return text(String(state));
        },
      ) as unknown as VNode;
    });
    const oldDispatch = retainedDispatch;

    step = 10;
    running.handle.requestRedraw();
    oldDispatch?.('increment');

    await vi.waitFor(() => expect(states.at(-1)).toBe(10));
    running.handle.stop();
  });
});
