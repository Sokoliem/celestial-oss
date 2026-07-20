// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug N8: MCP connect timeout leaves old transport connected ─────────────

describe('Bug N8: MCP connect should disconnect transport on initialize timeout', () => {
  it('should disconnect transport when initialize request times out', async () => {
    const agentRuntime2 = await import('../../agent-runtime.js');
    const createMcpClient = agentRuntime2.createMcpClient;

    let transportConnected = false;
    let disconnectCalled = false;
    const transport: import('../../agent-runtime.js').AgentTransport = {
      connect: async () => {
        transportConnected = true;
      },
      send: () => {}, // initialize request will be sent but never answered
      onMessage: () => {},
      onClose: () => {},
      onError: () => {},
      disconnect: () => {
        disconnectCalled = true;
        transportConnected = false;
      },
      get connected() {
        return transportConnected;
      },
    };

    const client = createMcpClient(transport, 'test-timeout');

    // connect() will succeed (transport.connect works), but initialize
    // request will time out since no response is sent.
    // After fix: transport.disconnect() should be called on timeout error.
    try {
      await client.connect();
    } catch (error) {
      // Expected: timeout error
      expect((error as Error).message).toContain('timed out');
    }

    // After fix: transport should be disconnected on failure
    expect(disconnectCalled).toBe(true);
    expect(client.state).toBe('disconnected');
  }, 35_000); // timeout > REQUEST_TIMEOUT_MS (30s)
});
