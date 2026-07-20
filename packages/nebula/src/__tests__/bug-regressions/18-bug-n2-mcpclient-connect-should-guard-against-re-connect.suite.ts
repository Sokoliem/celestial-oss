// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug N2: McpClient.connect() allows duplicate handler accumulation ──────

describe('Bug N2: McpClient.connect() should guard against re-connect', () => {
  it('should not allow connect when already connecting/initializing/ready', async () => {
    const agentRuntime = await import('../../agent-runtime.js');
    const createMcpClient = agentRuntime.createMcpClient;

    let connectCallCount = 0;
    const messageHandlers: Array<(msg: string) => void> = [];
    const transport: import('../../agent-runtime.js').AgentTransport = {
      connect: async () => {
        connectCallCount++;
      },
      send: () => {},
      onMessage: (h) => {
        messageHandlers.push(h);
      },
      onClose: () => {},
      onError: () => {},
      disconnect: () => {},
      get connected() {
        return connectCallCount > 0;
      },
    };

    const client = createMcpClient(transport, 'test-agent');
    // Start first connect — transport.connect() resolves instantly but
    // the initialize sendRequest will be pending. Don't await it.
    const p1 = client.connect().catch(() => {});

    // Yield to let the connect() async function progress past transport.connect()
    await new Promise<void>((r) => queueMicrotask(r));

    // Client should be in 'initializing' state (transport connected, waiting for init)
    expect(client.state).toBe('initializing');

    // After fix: calling connect again while state !== 'disconnected'
    // should be a no-op (return immediately without adding duplicate handlers)
    await client.connect();

    // Before fix: wireTransport() called again, accumulating duplicate handlers
    // After fix: only 1 handler registered from the first connect()
    expect(messageHandlers.length).toBe(1);
    expect(connectCallCount).toBe(1);

    // Clean up — disconnect clears pending requests so p1 rejects
    client.disconnect();
    await p1;
  });
});
