import type { AgentEvent, McpServerInfo, TokenUsage, ToolCall } from '../agent-types.js';
import type { AgentTransport, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpClient } from './contracts.js';
import { CLIENT_NAME, CLIENT_VERSION, PROTOCOL_VERSION, REQUEST_TIMEOUT_MS } from './contracts.js';

export function createMcpClient(transport: AgentTransport, agentId: string): McpClient {
  let state: McpClient['state'] = 'disconnected';
  let nextId = 1;
  const pending = new Map<
    number | string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const eventHandlers = new Set<(event: AgentEvent) => void>();
  let closeResolvers: Array<() => void> = [];

  function emit(event: AgentEvent): void {
    for (const handler of eventHandlers) handler(event);
  }

  function transitionToDisconnected(reason?: string): void {
    if (state === 'disconnected') return;
    state = 'disconnected';

    for (const [, req] of pending) {
      clearTimeout(req.timer);
      req.reject(new Error('Client disconnected'));
    }
    pending.clear();

    emit({ type: 'agent:disconnected', agentId, reason });
    for (const resolver of closeResolvers) resolver();
    closeResolvers = [];
  }

  function sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Request ${method} (id=${id}) timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      transport.send(JSON.stringify(request));
    });
  }

  function sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) };
    transport.send(JSON.stringify(notification));
  }

  function handleResponse(response: JsonRpcResponse): void {
    const req = pending.get(response.id);
    if (!req) return;
    pending.delete(response.id);
    clearTimeout(req.timer);
    if (response.error) req.reject(new Error(response.error.message));
    else req.resolve(response.result);
  }

  function handleNotification(notification: JsonRpcNotification): void {
    const method = notification.method;
    const params = (notification.params ?? {}) as Record<string, unknown>;

    if (method.includes('thinking')) {
      emit({ type: 'agent:thinking', agentId, text: (params.text as string) ?? '' });
      return;
    }

    if (method.includes('tool') && method.includes('result')) {
      emit({
        type: 'agent:tool-result',
        agentId,
        toolCallId: (params.toolCallId as string) ?? '',
        result: (params.result as string) ?? '',
        isError: (params.isError as boolean) ?? false,
      });
      return;
    }

    if (method.includes('tool') && (method.includes('call') || method.includes('invoke'))) {
      const toolCall: ToolCall = {
        id: (params.id as string) ?? '',
        name: (params.name as string) ?? '',
        args: (params.args as Record<string, unknown>) ?? {},
        status: (params.status as ToolCall['status']) ?? 'pending',
        result: params.result as string | undefined,
        duration: params.duration as number | undefined,
      };
      emit({ type: 'agent:tool-call', agentId, toolCall });
      return;
    }

    if (method.includes('response') || method.includes('message')) {
      emit({
        type: 'agent:response',
        agentId,
        content: (params.content as string) ?? '',
        done: (params.done as boolean) ?? false,
      });
      return;
    }

    if (method.includes('usage')) {
      const usage: TokenUsage = {
        prompt: (params.prompt as number) ?? 0,
        completion: (params.completion as number) ?? 0,
        total: (params.total as number) ?? 0,
        limit: (params.limit as number) ?? 0,
      };
      emit({ type: 'agent:token-usage', agentId, usage });
    }
  }

  function handleInboundMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      process.stderr.write(`[agent:${agentId}] Failed to parse inbound JSON: ${raw}\n`);
      return;
    }

    if (typeof message !== 'object' || message === null) {
      process.stderr.write(`[agent:${agentId}] Inbound message is not an object\n`);
      return;
    }

    const record = message as Record<string, unknown>;
    if ('id' in record && !('method' in record)) {
      handleResponse(record as unknown as JsonRpcResponse);
      return;
    }

    if ('method' in record && !('id' in record)) {
      handleNotification(record as unknown as JsonRpcNotification);
      return;
    }

    if ('method' in record && 'id' in record) {
      process.stderr.write(`[agent:${agentId}] Unhandled server-to-client request: ${String(record.method)}\n`);
    }
  }

  function wireTransport(): void {
    transport.onMessage(handleInboundMessage);
    transport.onClose((reason) => transitionToDisconnected(reason));
    transport.onError((error) => {
      emit({ type: 'agent:error', agentId, error });
      transitionToDisconnected(error.message);
    });
  }

  return {
    get state() {
      return state;
    },
    async connect() {
      if (state !== 'disconnected') return;
      state = 'connecting';
      emit({ type: 'agent:connecting', agentId });
      wireTransport();

      try {
        await transport.connect();
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        emit({ type: 'agent:error', agentId, error: normalized });
        state = 'disconnected';
        throw normalized;
      }

      try {
        state = 'initializing';
        const initResult = await sendRequest('initialize', {
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
          capabilities: {},
        });

        const result = initResult as Record<string, unknown>;
        const serverInfoRaw = result.serverInfo as Record<string, unknown> | undefined;
        const serverInfo: McpServerInfo = {
          name: (serverInfoRaw?.name as string) ?? 'unknown',
          version: (serverInfoRaw?.version as string) ?? '0.0.0',
          protocolVersion: (result.protocolVersion as string) ?? PROTOCOL_VERSION,
          capabilities: (result.capabilities as Record<string, unknown>) ?? {},
        };

        sendNotification('notifications/initialized');
        state = 'ready';
        emit({ type: 'agent:connected', agentId, serverInfo });
      } catch (error) {
        // Transport connected but initialize failed (e.g. timeout) — clean up
        try {
          transport.disconnect();
        } catch {
          /* ignore disconnect errors */
        }
        state = 'disconnected';
        const normalized = error instanceof Error ? error : new Error(String(error));
        emit({ type: 'agent:error', agentId, error: normalized });
        throw normalized;
      }
    },
    disconnect() {
      if (state === 'disconnected') return;
      state = 'disconnecting';
      transport.disconnect();
      transitionToDisconnected();
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
    async sendMessage(role: 'user' | 'tool', content: string, toolCallId?: string) {
      const message: Record<string, unknown> = {
        role,
        content: { type: 'text', text: content },
      };
      if (toolCallId !== undefined) message.toolCallId = toolCallId;
      await sendRequest('sampling/createMessage', { messages: [message] });
    },
    waitForClose() {
      if (state === 'disconnected') return Promise.resolve();
      return new Promise<void>((resolve) => {
        closeResolvers.push(resolve);
      });
    },
  };
}
