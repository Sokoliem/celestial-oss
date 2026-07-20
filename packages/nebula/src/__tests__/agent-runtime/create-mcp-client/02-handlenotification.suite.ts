import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AgentTransport, createMcpClient, type McpClient } from '../../../agent-runtime.js';
import type { AgentEvent } from '../../../agent-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Flush microtask queue so `await transport.connect()` inside createMcpClient completes. */
function tick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

const INIT_RESULT = {
  protocolVersion: '2024-11-05',
  serverInfo: { name: 'test-server', version: '1.0.0' },
  capabilities: {},
};

/**
 * Creates a fake in-memory AgentTransport for testing the MCP client
 * without spawning real processes or opening connections.
 */
function createFakeTransport(opts?: { connectError?: Error }): AgentTransport & {
  simulateMessage: (msg: string) => void;
  simulateClose: (reason?: string) => void;
  simulateError: (error: Error) => void;
  sentMessages: string[];
  disconnectCalled: boolean;
} {
  let isConnected = false;
  const messageHandlers: Array<(message: string) => void> = [];
  const closeHandlers: Array<(reason?: string) => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];
  const sentMessages: string[] = [];
  let disconnectCalled = false;

  return {
    get connected() {
      return isConnected;
    },
    async connect() {
      if (opts?.connectError) throw opts.connectError;
      isConnected = true;
    },
    send(message: string) {
      sentMessages.push(message);
    },
    onMessage(handler: (message: string) => void) {
      messageHandlers.push(handler);
    },
    onClose(handler: (reason?: string) => void) {
      closeHandlers.push(handler);
    },
    onError(handler: (error: Error) => void) {
      errorHandlers.push(handler);
    },
    disconnect() {
      isConnected = false;
      disconnectCalled = true;
    },
    simulateMessage(msg: string) {
      for (const h of messageHandlers) h(msg);
    },
    simulateClose(reason?: string) {
      isConnected = false;
      for (const h of closeHandlers) h(reason);
    },
    simulateError(error: Error) {
      for (const h of errorHandlers) h(error);
    },
    sentMessages,
    get disconnectCalled() {
      return disconnectCalled;
    },
  };
}

function jsonRpcResult(id: number | string, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function jsonRpcNotification(method: string, params?: unknown): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method,
    ...(params !== undefined ? { params } : {}),
  });
}

/**
 * Connects an MCP client through the full initialize handshake.
 * Handles the async microtask gap between transport.connect() and sendRequest.
 */
async function connectClient(transport: ReturnType<typeof createFakeTransport>, client: McpClient, initResult: unknown = INIT_RESULT): Promise<void> {
  const p = client.connect();
  // After client.connect() starts, transport.connect() is an async call.
  // We need to flush the microtask queue so the code after
  // `await transport.connect()` runs — which is where sendRequest('initialize') happens.
  await tick();
  // Now the initialize request should be in sentMessages.
  transport.simulateMessage(jsonRpcResult(1, initResult));
  await p;
}

describe('createMcpClient', () => {
  let transport: ReturnType<typeof createFakeTransport>;

  let client: McpClient;

  beforeEach(() => {
    transport = createFakeTransport();
    client = createMcpClient(transport, 'test-agent');
  });

  describe('handleNotification', () => {
    it('emits agent:thinking for thinking notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(jsonRpcNotification('agent/thinking', { text: 'Analyzing...' }));

      const found = events.filter((e) => e.type === 'agent:thinking');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:thinking') {
        expect(found[0]!.text).toBe('Analyzing...');
        expect(found[0]!.agentId).toBe('test-agent');
      }
    });

    it('emits agent:tool-result for tool result notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      // Method must contain both 'tool' and 'result' (case-sensitive includes)
      transport.simulateMessage(
        jsonRpcNotification('agent/tool_result', {
          toolCallId: 'tc-1',
          result: 'file contents here',
          isError: false,
        }),
      );

      const found = events.filter((e) => e.type === 'agent:tool-result');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:tool-result') {
        expect(found[0]!.toolCallId).toBe('tc-1');
        expect(found[0]!.result).toBe('file contents here');
        expect(found[0]!.isError).toBe(false);
      }
    });

    it('emits agent:tool-call for tool call notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(
        jsonRpcNotification('agent/tool_call', {
          id: 'tc-2',
          name: 'read_file',
          args: { path: '/etc/hosts' },
          status: 'running',
          duration: 150,
        }),
      );

      const found = events.filter((e) => e.type === 'agent:tool-call');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:tool-call') {
        expect(found[0]!.toolCall.id).toBe('tc-2');
        expect(found[0]!.toolCall.name).toBe('read_file');
        expect(found[0]!.toolCall.args).toEqual({ path: '/etc/hosts' });
        expect(found[0]!.toolCall.status).toBe('running');
        expect(found[0]!.toolCall.duration).toBe(150);
      }
    });

    it('emits agent:tool-call for toolInvoke variant', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(
        jsonRpcNotification('agent/tool_invoke', {
          id: 'tc-3',
          name: 'write_file',
          args: {},
          status: 'pending',
        }),
      );

      expect(events.filter((e) => e.type === 'agent:tool-call')).toHaveLength(1);
    });

    it('emits agent:response for response notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(
        jsonRpcNotification('agent/response', {
          content: 'Here is my answer',
          done: true,
        }),
      );

      const found = events.filter((e) => e.type === 'agent:response');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:response') {
        expect(found[0]!.content).toBe('Here is my answer');
        expect(found[0]!.done).toBe(true);
      }
    });

    it('emits agent:response for message notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(
        jsonRpcNotification('agent/message', {
          content: 'Partial content',
          done: false,
        }),
      );

      const found = events.filter((e) => e.type === 'agent:response');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:response') {
        expect(found[0]!.content).toBe('Partial content');
        expect(found[0]!.done).toBe(false);
      }
    });

    it('emits agent:token-usage for usage notifications', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(
        jsonRpcNotification('agent/token_usage', {
          prompt: 100,
          completion: 50,
          total: 150,
          limit: 4000,
        }),
      );

      const found = events.filter((e) => e.type === 'agent:token-usage');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:token-usage') {
        expect(found[0]!.usage).toEqual({
          prompt: 100,
          completion: 50,
          total: 150,
          limit: 4000,
        });
      }
    });

    it('provides default values for missing notification params', async () => {
      await connectClient(transport, client);
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateMessage(jsonRpcNotification('agent/thinking'));

      const found = events.filter((e) => e.type === 'agent:thinking');
      expect(found).toHaveLength(1);
      if (found[0]!.type === 'agent:thinking') {
        expect(found[0]!.text).toBe('');
      }
    });
  });

  describe('onEvent / unsubscribe', () => {
    it('returns an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = client.onEvent(handler);
      expect(typeof unsub).toBe('function');
    });

    it('stops receiving events after unsubscribe', async () => {
      const handler = vi.fn();
      const unsub = client.onEvent(handler);

      const connectPromise = client.connect();
      // handler received agent:connecting synchronously in connect()
      unsub();

      await tick();
      transport.simulateMessage(jsonRpcResult(1, INIT_RESULT));
      await connectPromise;

      // handler should have received connecting but not connected
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:connecting' }));
    });
  });

  describe('waitForClose', () => {
    it('resolves immediately when already disconnected', async () => {
      await client.waitForClose();
    });

    it('resolves when client disconnects', async () => {
      await connectClient(transport, client);

      const closePromise = client.waitForClose();
      client.disconnect();
      await closePromise;
    });

    it('resolves when transport closes', async () => {
      await connectClient(transport, client);

      const closePromise = client.waitForClose();
      transport.simulateClose('connection reset');
      await closePromise;
    });
  });

  describe('transport error handling', () => {
    it('emits error event and disconnects on transport error', async () => {
      await connectClient(transport, client);

      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      transport.simulateError(new Error('broken pipe'));

      expect(events.some((e) => e.type === 'agent:error')).toBe(true);
      expect(events.some((e) => e.type === 'agent:disconnected')).toBe(true);
      expect(client.state).toBe('disconnected');
    });
  });

  describe('request timeout', () => {
    it('rejects after REQUEST_TIMEOUT_MS', async () => {
      vi.useFakeTimers();

      // With fake timers, we need to manually manage the connect sequence
      const connectPromise = client.connect();
      // Flush microtask (queueMicrotask won't work with fake timers, use advanceTimersByTime(0))
      await vi.advanceTimersByTimeAsync(0);
      transport.simulateMessage(jsonRpcResult(1, INIT_RESULT));
      await connectPromise;

      const sendPromise = client.sendMessage('user', 'hello');

      // Advance past timeout (30_000ms)
      vi.advanceTimersByTime(31_000);

      await expect(sendPromise).rejects.toThrow('timed out');

      vi.useRealTimers();
    });
  });
});
