import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../agent-types.js';
import type { TerminalBackend } from '../terminal.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('agent subscription reconciliation', () => {
  it('updates message handlers in place and reconnects only for transport changes', async () => {
    const manager = {
      start: vi.fn(),
      update: vi.fn(),
      stop: vi.fn(),
      send: vi.fn(async () => undefined),
      stopAll: vi.fn(),
    };
    vi.resetModules();
    vi.doMock('../agent-runtime.js', async () => {
      const actual = await vi.importActual<typeof import('../agent-runtime.js')>('../agent-runtime.js');
      return { ...actual, createConnectionManager: () => manager };
    });

    let inputHandler: ((data: Buffer) => void) | null = null;
    const terminal: TerminalBackend = {
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
    };
    const [{ app }, { Cmd, Sub }] = await Promise.all([import('../app.js'), import('../types.js')]);

    type Msg = { type: 'prefix' } | { type: 'transport' } | { type: 'agent'; label: string };
    const agentLabels: string[] = [];
    const handle = app<{ prefix: number; transport: number }, Msg>(
      {
        init: () => [{ prefix: 0, transport: 0 }, Cmd.none()],
        update: (message, model) => {
          if (message.type === 'prefix') return [{ ...model, prefix: model.prefix + 1 }, Cmd.none()];
          if (message.type === 'transport') return [{ ...model, transport: model.transport + 1 }, Cmd.none()];
          agentLabels.push(message.label);
          return [model, Cmd.none()];
        },
        view: () => ({ kind: 'text', content: 'agent' }),
        subscriptions: (model) =>
          Sub.batch(
            Sub.key('p', { type: 'prefix' as const }),
            Sub.key('t', { type: 'transport' as const }),
            Sub.agent<Msg>({
              id: 'assistant',
              transport: { kind: 'sse', url: `https://example.test/${model.transport}` },
              toMsg: (event) => ({ type: 'agent', label: `${model.prefix}:${event.type}` }),
            }),
          ),
      },
      { terminal },
    );

    expect(manager.start).toHaveBeenCalledOnce();
    (inputHandler as ((data: Buffer) => void) | null)?.(Buffer.from('p'));
    expect(manager.stop).not.toHaveBeenCalled();
    expect(manager.start).toHaveBeenCalledOnce();
    expect(manager.update).toHaveBeenCalled();

    const latestMapper = manager.update.mock.calls.at(-1)?.[1] as ((event: AgentEvent) => AgentEvent) | undefined;
    const latestDispatch = manager.update.mock.calls.at(-1)?.[2] as ((event: AgentEvent) => void) | undefined;
    const event: AgentEvent = { type: 'agent:thinking', agentId: 'assistant', text: 'hello' };
    const mappedEvent = latestMapper?.(event);
    if (mappedEvent) latestDispatch?.(mappedEvent);
    expect(agentLabels).toEqual(['1:agent:thinking']);

    (inputHandler as ((data: Buffer) => void) | null)?.(Buffer.from('t'));
    expect(manager.stop).toHaveBeenCalledWith('assistant');
    expect(manager.start).toHaveBeenCalledTimes(2);
    expect(manager.start.mock.calls[1]?.[1]).toMatchObject({ kind: 'sse', url: 'https://example.test/1' });
    handle.stop();
  });
});
