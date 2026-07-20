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

function jsonRpcError(id: number | string, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
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

  describe('initial state', () => {
    it('starts in disconnected state', () => {
      expect(client.state).toBe('disconnected');
    });
  });

  describe('connect', () => {
    it('transitions to connecting then ready after initialize handshake', async () => {
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      const connectPromise = client.connect();
      await tick();

      // The client should have sent an initialize JSON-RPC request
      expect(transport.sentMessages).toHaveLength(1);
      const initRequest = JSON.parse(transport.sentMessages[0]!);
      expect(initRequest.method).toBe('initialize');
      expect(initRequest.jsonrpc).toBe('2.0');
      expect(initRequest.id).toBe(1);
      expect(initRequest.params.protocolVersion).toBe('2024-11-05');
      expect(initRequest.params.clientInfo.name).toBe('celestui-agent');

      // Simulate server responding to initialize
      transport.simulateMessage(
        jsonRpcResult(1, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'test-server', version: '1.0.0' },
          capabilities: { tools: true },
        }),
      );

      await connectPromise;

      expect(client.state).toBe('ready');

      // Should have sent notifications/initialized after init succeeded
      expect(transport.sentMessages).toHaveLength(2);
      const initNotification = JSON.parse(transport.sentMessages[1]!);
      expect(initNotification.method).toBe('notifications/initialized');
      expect(initNotification.id).toBeUndefined();

      // Check events emitted
      expect(events).toHaveLength(2);
      expect(events[0]!.type).toBe('agent:connecting');
      expect(events[1]!.type).toBe('agent:connected');
      if (events[1]!.type === 'agent:connected') {
        expect(events[1]!.serverInfo.name).toBe('test-server');
        expect(events[1]!.serverInfo.capabilities).toEqual({ tools: true });
      }
    });

    it('does nothing if already connected', async () => {
      await connectClient(transport, client);

      // Calling connect again should be a no-op
      await client.connect();
      expect(transport.sentMessages).toHaveLength(2); // init request + initialized notification only
    });

    it('emits error and rethrows when transport.connect fails', async () => {
      const failTransport = createFakeTransport({
        connectError: new Error('connection refused'),
      });
      const failClient = createMcpClient(failTransport, 'fail-agent');

      const events: AgentEvent[] = [];
      failClient.onEvent((e) => events.push(e));

      await expect(failClient.connect()).rejects.toThrow('connection refused');

      expect(failClient.state).toBe('disconnected');
      expect(events.some((e) => e.type === 'agent:error')).toBe(true);
    });

    it('handles initialize error response from server', async () => {
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      const connectPromise = client.connect();
      await tick();

      // Server returns an error for initialize
      transport.simulateMessage(jsonRpcError(1, -32600, 'Unsupported protocol version'));

      await expect(connectPromise).rejects.toThrow('Unsupported protocol version');

      expect(client.state).toBe('disconnected');
      expect(transport.disconnectCalled).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('transitions to disconnected and cleans up', async () => {
      const events: AgentEvent[] = [];
      client.onEvent((e) => events.push(e));

      await connectClient(transport, client);

      client.disconnect();

      expect(client.state).toBe('disconnected');
      expect(transport.disconnectCalled).toBe(true);
      expect(events.some((e) => e.type === 'agent:disconnected')).toBe(true);
    });

    it('is a no-op when already disconnected', () => {
      client.disconnect();
      expect(client.state).toBe('disconnected');
    });

    it('rejects pending requests on disconnect', async () => {
      await connectClient(transport, client);

      // Send a message that creates a pending request
      const sendPromise = client.sendMessage('user', 'hello');

      // Disconnect before response arrives
      client.disconnect();

      await expect(sendPromise).rejects.toThrow('Client disconnected');
    });
  });

  describe('sendMessage', () => {
    it('sends a JSON-RPC request with sampling/createMessage method', async () => {
      await connectClient(transport, client);

      const sendPromise = client.sendMessage('user', 'Hello, agent!');
      const reqMsg = JSON.parse(transport.sentMessages[transport.sentMessages.length - 1]!);

      expect(reqMsg.method).toBe('sampling/createMessage');
      expect(reqMsg.params.messages[0].role).toBe('user');
      expect(reqMsg.params.messages[0].content).toEqual({
        type: 'text',
        text: 'Hello, agent!',
      });

      // Respond to resolve the promise
      transport.simulateMessage(jsonRpcResult(reqMsg.id, { ok: true }));
      await sendPromise;
    });

    it('sends tool role with toolCallId', async () => {
      await connectClient(transport, client);

      const sendPromise = client.sendMessage('tool', 'result data', 'call-123');
      const reqMsg = JSON.parse(transport.sentMessages[transport.sentMessages.length - 1]!);

      expect(reqMsg.params.messages[0].role).toBe('tool');
      expect(reqMsg.params.messages[0].toolCallId).toBe('call-123');

      transport.simulateMessage(jsonRpcResult(reqMsg.id, { ok: true }));
      await sendPromise;
    });
  });

  describe('handleInboundMessage', () => {
    it('ignores invalid JSON', async () => {
      await connectClient(transport, client);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      transport.simulateMessage('not valid json{{{');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse inbound JSON'));
      stderrSpy.mockRestore();
    });

    it('ignores non-object messages', async () => {
      await connectClient(transport, client);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      transport.simulateMessage('"just a string"');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Inbound message is not an object'));
      stderrSpy.mockRestore();
    });

    it('ignores null messages', async () => {
      await connectClient(transport, client);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      transport.simulateMessage('null');

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Inbound message is not an object'));
      stderrSpy.mockRestore();
    });

    it('logs unhandled server-to-client requests (method + id)', async () => {
      await connectClient(transport, client);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      transport.simulateMessage(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'server/ping' }));

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled server-to-client request'));
      stderrSpy.mockRestore();
    });
  });

  describe('handleResponse', () => {
    it('resolves pending request with result', async () => {
      await connectClient(transport, client);

      const sendPromise = client.sendMessage('user', 'test');
      const reqMsg = JSON.parse(transport.sentMessages[transport.sentMessages.length - 1]!);

      transport.simulateMessage(jsonRpcResult(reqMsg.id, { content: 'response' }));

      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('rejects pending request on error response', async () => {
      await connectClient(transport, client);

      const sendPromise = client.sendMessage('user', 'test');
      const reqMsg = JSON.parse(transport.sentMessages[transport.sentMessages.length - 1]!);

      transport.simulateMessage(jsonRpcError(reqMsg.id, -32000, 'Something went wrong'));

      await expect(sendPromise).rejects.toThrow('Something went wrong');
    });

    it('ignores responses for unknown request ids', async () => {
      await connectClient(transport, client);

      // This should not throw
      transport.simulateMessage(jsonRpcResult(99999, { data: 'orphan' }));
    });
  });
});
