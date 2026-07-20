import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../agent-types.js';

const mocks = vi.hoisted(() => {
  const clients: Array<{
    eventHandler: ((event: AgentEvent) => void) | null;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  return { clients };
});

vi.mock('../agent-runtime/transport.js', () => ({
  createTransport: vi.fn(() => ({})),
}));

vi.mock('../agent-runtime/mcp-client.js', () => ({
  createMcpClient: vi.fn(() => {
    const client = {
      state: 'ready' as const,
      eventHandler: null as ((event: AgentEvent) => void) | null,
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      onEvent(handler: (event: AgentEvent) => void) {
        client.eventHandler = handler;
        return () => {
          client.eventHandler = null;
        };
      },
      sendMessage: vi.fn(async () => undefined),
      waitForClose: vi.fn(() => new Promise<void>(() => undefined)),
    };
    mocks.clients.push(client);
    return client;
  }),
}));

import { createTransport } from '../agent-runtime/transport.js';
import { createConnectionManager } from '../agent-runtime.js';

describe('connection manager handler updates', () => {
  it('routes existing connection events through the latest mapper and dispatcher', async () => {
    type Message = { version: number; event: AgentEvent };
    const firstDispatch = vi.fn();
    const latestDispatch = vi.fn();
    const manager = createConnectionManager<Message>();
    manager.start('agent', { kind: 'websocket', url: 'wss://example.test/events', reconnect: true }, (event) => ({ version: 0, event }), firstDispatch);
    expect(vi.mocked(createTransport)).toHaveBeenCalledWith(expect.objectContaining({ kind: 'websocket', reconnect: false }));

    manager.update('agent', (event) => ({ version: 1, event }), latestDispatch);
    const event: AgentEvent = { type: 'agent:thinking', agentId: 'agent', text: 'working' };
    mocks.clients.at(-1)?.eventHandler?.(event);

    expect(firstDispatch).not.toHaveBeenCalled();
    expect(latestDispatch).toHaveBeenCalledWith({ version: 1, event });
    await Promise.resolve();
    manager.stop('agent');
    expect(mocks.clients.at(-1)?.disconnect).toHaveBeenCalledOnce();
  });
});
