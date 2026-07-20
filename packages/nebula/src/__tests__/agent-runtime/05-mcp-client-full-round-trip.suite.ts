import { describe, expect, it } from 'vitest';
import { type AgentTransport, createMcpClient, type McpClient } from '../../agent-runtime.js';
import type { AgentEvent } from '../../agent-types.js';

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

// ─── Integration-style tests with fake transport ────────────────────────────

describe('MCP client full round-trip', () => {
  it('handles a complete conversation flow', async () => {
    const transport = createFakeTransport();
    const client = createMcpClient(transport, 'conv-agent');
    const events: AgentEvent[] = [];
    client.onEvent((e) => events.push(e));

    // 1. Connect
    await connectClient(transport, client, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'assistant', version: '2.0' },
      capabilities: { tools: true, thinking: true },
    });
    expect(client.state).toBe('ready');

    // 2. Send a user message
    const sendPromise = client.sendMessage('user', 'What is 2+2?');

    // 3. Agent sends thinking notification
    transport.simulateMessage(jsonRpcNotification('agent/thinking', { text: 'Computing arithmetic...' }));

    // 4. Agent sends tool call
    transport.simulateMessage(
      jsonRpcNotification('agent/tool_call', {
        id: 'call-1',
        name: 'calculator',
        args: { expression: '2+2' },
        status: 'running',
      }),
    );

    // 5. Tool result
    transport.simulateMessage(
      jsonRpcNotification('agent/tool_result', {
        toolCallId: 'call-1',
        result: '4',
        isError: false,
      }),
    );

    // 6. Final response
    transport.simulateMessage(
      jsonRpcNotification('agent/response', {
        content: 'The answer is 4.',
        done: true,
      }),
    );

    // 7. Usage stats
    transport.simulateMessage(
      jsonRpcNotification('agent/token_usage', {
        prompt: 10,
        completion: 5,
        total: 15,
        limit: 4096,
      }),
    );

    // 8. Resolve the sendMessage request
    const reqMsg = JSON.parse(transport.sentMessages[2]!);
    transport.simulateMessage(jsonRpcResult(reqMsg.id, { ok: true }));
    await sendPromise;

    // Verify all event types were emitted so far
    const types = events.map((e) => e.type);
    expect(types).toContain('agent:connecting');
    expect(types).toContain('agent:connected');
    expect(types).toContain('agent:thinking');
    expect(types).toContain('agent:tool-call');
    expect(types).toContain('agent:tool-result');
    expect(types).toContain('agent:response');
    expect(types).toContain('agent:token-usage');

    // 9. Clean disconnect
    const closePromise = client.waitForClose();
    client.disconnect();
    await closePromise;
    expect(client.state).toBe('disconnected');
    expect(events.map((e) => e.type)).toContain('agent:disconnected');
  });

  it('handles multiple concurrent requests', async () => {
    const transport = createFakeTransport();
    const client = createMcpClient(transport, 'multi-agent');

    await connectClient(transport, client);

    // Send two messages concurrently
    const p1 = client.sendMessage('user', 'First');
    const p2 = client.sendMessage('user', 'Second');

    // Both should have been sent (init req + initialized notif + 2 messages = 4)
    expect(transport.sentMessages.length).toBe(4);

    const msg1 = JSON.parse(transport.sentMessages[2]!);
    const msg2 = JSON.parse(transport.sentMessages[3]!);

    // Respond out of order
    transport.simulateMessage(jsonRpcResult(msg2.id, { ok: true }));
    transport.simulateMessage(jsonRpcResult(msg1.id, { ok: true }));

    await Promise.all([p1, p2]);
  });

  it('increments request IDs', async () => {
    const transport = createFakeTransport();
    const client = createMcpClient(transport, 'id-agent');

    await connectClient(transport, client);

    // Initialize used id=1, so next should be id=2
    const p1 = client.sendMessage('user', 'msg1');
    const p2 = client.sendMessage('user', 'msg2');

    const req1 = JSON.parse(transport.sentMessages[2]!);
    const req2 = JSON.parse(transport.sentMessages[3]!);

    expect(req1.id).toBe(2);
    expect(req2.id).toBe(3);

    transport.simulateMessage(jsonRpcResult(2, {}));
    transport.simulateMessage(jsonRpcResult(3, {}));
    await Promise.all([p1, p2]);
  });
});
