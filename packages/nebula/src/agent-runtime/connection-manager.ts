import type { AgentEvent, AgentMessage, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { ConnectionManager, McpClient } from './contracts.js';
import { defaultRetryPolicy } from './contracts.js';
import { createMcpClient } from './mcp-client.js';
import { createTransport } from './transport.js';
import { computeRetryDelay, shouldRetry } from './utils.js';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createConnectionManager<M>(): ConnectionManager<M> {
  const activeAgents = new Map<string, { client: McpClient | null; stopped: boolean }>();

  function start(id: string, config: TransportConfig, toMsg: (event: AgentEvent) => M, dispatch: (msg: M) => void, retryPolicy?: RetryPolicy): void {
    if (activeAgents.has(id)) return;

    const connection = { client: null as McpClient | null, stopped: false };
    activeAgents.set(id, connection);
    const policy = retryPolicy ?? defaultRetryPolicy;

    void (async () => {
      let attempt = 0;
      while (!connection.stopped) {
        try {
          const client = createMcpClient(createTransport(config), id);
          client.onEvent((event) => dispatch(toMsg(event)));
          await client.connect();
          connection.client = client;
          attempt = 0;
          await client.waitForClose();
          connection.client = null;
          if (connection.stopped) break;
        } catch (error) {
          connection.client = null;
          if (connection.stopped) break;
          attempt++;
          if (!shouldRetry(attempt, policy)) {
            dispatch(
              toMsg({
                type: 'agent:error',
                agentId: id,
                error: error instanceof Error ? error : new Error(String(error)),
              }),
            );
            break;
          }
          await sleep(computeRetryDelay(attempt, policy));
        }
      }
    })();
  }

  function stop(id: string): void {
    const connection = activeAgents.get(id);
    if (!connection) return;
    connection.stopped = true;
    connection.client?.disconnect();
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

  return { start, stop, send, stopAll };
}
