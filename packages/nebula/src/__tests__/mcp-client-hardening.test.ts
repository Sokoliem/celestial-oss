import { describe, expect, it, vi } from 'vitest';
import { createMcpClient } from '../agent-runtime/mcp-client.js';
import type { AgentTransport } from '../agent-runtime.js';
import type { AgentEvent } from '../agent-types.js';

function createFakeTransport(options: { throwOnSend?: boolean } = {}) {
  let messageHandler: ((message: string) => void) | null = null;
  let closeHandler: ((reason?: string) => void) | null = null;
  let errorHandler: ((error: Error) => void) | null = null;
  let connected = false;
  const transport: AgentTransport = {
    get connected() {
      return connected;
    },
    async connect() {
      connected = true;
    },
    send(message) {
      if (options.throwOnSend) throw new Error('send failed');
      const request = JSON.parse(message) as { id?: number; method?: string };
      if (request.method === 'initialize' && request.id !== undefined) {
        messageHandler?.(
          JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: { protocolVersion: '2024-11-05', serverInfo: { name: 'fake', version: '1.0.0' }, capabilities: {} },
          }),
        );
      }
    },
    onMessage(handler) {
      messageHandler = handler;
    },
    onClose(handler) {
      closeHandler = handler;
    },
    onError(handler) {
      errorHandler = handler;
    },
    disconnect() {
      connected = false;
      closeHandler?.('closed');
    },
  };
  return {
    transport,
    emitMessage: (message: string) => messageHandler?.(message),
    emitError: (error: Error) => errorHandler?.(error),
  };
}

describe('MCP client hardening', () => {
  it('cleans up immediately when transport.send throws during initialization', async () => {
    const { transport } = createFakeTransport({ throwOnSend: true });
    const client = createMcpClient(transport, 'failing');

    await expect(client.connect()).rejects.toThrow('send failed');
    expect(client.state).toBe('disconnected');
  });

  it('redacts malformed payloads, isolates event handlers, and rejects sends after disconnect', async () => {
    const fake = createFakeTransport();
    const client = createMcpClient(fake.transport, 'safe');
    await client.connect();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const received: AgentEvent[] = [];
    client.onEvent(() => {
      throw new Error('consumer failed');
    });
    client.onEvent((event) => received.push(event));

    fake.emitMessage('{"secret":"do-not-log"');
    fake.emitMessage(JSON.stringify({ jsonrpc: '2.0', method: 'agent/thinking', params: { text: 'working' } }));

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('Failed to parse inbound JSON'));
    expect(stderr.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('do-not-log');
    expect(received).toContainEqual({ type: 'agent:thinking', agentId: 'safe', text: 'working' });

    client.disconnect();
    await expect(client.sendMessage('user', 'hello')).rejects.toThrow('not connected');
    stderr.mockRestore();
  });
});
