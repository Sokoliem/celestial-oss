import type { AgentEvent, AgentMessage, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { ConnectionManager, McpClient } from './contracts.js';
import { defaultRetryPolicy } from './contracts.js';
import { createMcpClient } from './mcp-client.js';
import { createTransport } from './transport.js';
import { computeRetryDelay, shouldRetry, validateRetryPolicy } from './utils.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createConnectionManager<M>(): ConnectionManager<M> {
  interface ActiveConnection {
    client: McpClient | null;
    stopped: boolean;
    toMsg: (event: AgentEvent) => M;
    dispatch: (msg: M) => void;
    cancelRetry: (() => void) | null;
  }

  const activeAgents = new Map<string, ActiveConnection>();

  function dispatchEvent(connection: ActiveConnection, event: AgentEvent): void {
    if (!connection.stopped) connection.dispatch(connection.toMsg(event));
  }

  function waitForRetry(ms: number, connection: ActiveConnection): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(finish, ms);
      function finish(): void {
        clearTimeout(timer);
        if (connection.cancelRetry === finish) connection.cancelRetry = null;
        resolve();
      }
      connection.cancelRetry = finish;
    });
  }

  function start(id: string, config: TransportConfig, toMsg: (event: AgentEvent) => M, dispatch: (msg: M) => void, retryPolicy?: RetryPolicy): void {
    if (activeAgents.has(id)) return;

    const policy = retryPolicy ?? defaultRetryPolicy;
    validateRetryPolicy(policy);
    const connection: ActiveConnection = { client: null, stopped: false, toMsg, dispatch, cancelRetry: null };
    activeAgents.set(id, connection);

    void (async () => {
      let attempt = 0;
      while (!connection.stopped) {
        try {
          // The manager owns reconnects. Disabling transport-local WebSocket
          // reconnects prevents the old socket and a new manager connection
          // from racing to become active after the same close event.
          const managedConfig = config.kind === 'websocket' ? { ...config, reconnect: false } : config;
          const client = createMcpClient(createTransport(managedConfig), id);
          client.onEvent((event) => dispatchEvent(connection, event));
          await client.connect();
          connection.client = client;
          attempt = 0;
          await client.waitForClose();
          connection.client = null;
          if (connection.stopped) break;
          if (config.kind === 'websocket' && config.reconnect === false) break;
          const reconnectDelay = config.kind === 'websocket' ? (config.reconnectInterval ?? policy.baseDelayMs) : policy.baseDelayMs;
          await waitForRetry(reconnectDelay, connection);
        } catch (error) {
          connection.client = null;
          if (connection.stopped) break;
          attempt++;
          if (!shouldRetry(attempt, policy)) {
            dispatchEvent(connection, {
              type: 'agent:error',
              agentId: id,
              error: error instanceof Error ? error : new Error(String(error)),
            });
            break;
          }
          await waitForRetry(computeRetryDelay(attempt, policy), connection);
        }
      }
    })();
  }

  function update(id: string, toMsg: (event: AgentEvent) => M, dispatch: (msg: M) => void): void {
    const connection = activeAgents.get(id);
    if (!connection) return;
    connection.toMsg = toMsg;
    connection.dispatch = dispatch;
  }

  function stop(id: string): void {
    const connection = activeAgents.get(id);
    if (!connection) return;
    connection.stopped = true;
    connection.cancelRetry?.();
    try {
      connection.client?.disconnect();
    } catch {
      // A transport must not prevent the manager from releasing its entry.
    }
    activeAgents.delete(id);
  }

  async function send(id: string, message: AgentMessage): Promise<void> {
    const connection = activeAgents.get(id);
    if (!connection?.client) {
      throw new Error(`No active agent connection for id "${id}"`);
    }
    await connection.client.sendMessage(message.role, message.content, message.toolCallId);
  }

  function stopAll(): void {
    for (const id of [...activeAgents.keys()]) stop(id);
  }

  return { start, update, stop, send, stopAll };
}
