export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error';

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly result?: string;
  readonly status: ToolCallStatus;
  readonly duration?: number;
}

export interface TokenUsage {
  readonly prompt: number;
  readonly completion: number;
  readonly total: number;
  readonly limit: number;
}

export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: Record<string, unknown>;
}

export type JsonSchema = boolean | Record<string, unknown>;

export interface McpToolInfo {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

export interface StdioTransportConfig {
  readonly kind: 'stdio';
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

export interface SseTransportConfig {
  readonly kind: 'sse';
  readonly url: string;
  readonly headers?: Record<string, string>;
}

export interface WebSocketTransportConfig {
  readonly kind: 'websocket';
  readonly url: string;
  readonly auth?: string;
  readonly reconnect?: boolean;
  readonly reconnectInterval?: number;
}

export type TransportConfig = StdioTransportConfig | SseTransportConfig | WebSocketTransportConfig;

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
}

export interface AgentMessage {
  readonly role: 'user' | 'tool';
  readonly content: string;
  readonly toolCallId?: string;
}

export type AgentEvent =
  | { readonly type: 'agent:connecting'; readonly agentId: string }
  | { readonly type: 'agent:connected'; readonly agentId: string; readonly serverInfo: McpServerInfo }
  | { readonly type: 'agent:disconnected'; readonly agentId: string; readonly reason?: string }
  | { readonly type: 'agent:error'; readonly agentId: string; readonly error: Error }
  | { readonly type: 'agent:thinking'; readonly agentId: string; readonly text: string }
  | { readonly type: 'agent:tool-call'; readonly agentId: string; readonly toolCall: ToolCall }
  | { readonly type: 'agent:tool-result'; readonly agentId: string; readonly toolCallId: string; readonly result: string; readonly isError: boolean }
  | { readonly type: 'agent:response'; readonly agentId: string; readonly content: string; readonly done: boolean }
  | { readonly type: 'agent:token-usage'; readonly agentId: string; readonly usage: TokenUsage }
  | { readonly type: 'agent:tools-available'; readonly agentId: string; readonly tools: readonly McpToolInfo[] };

export interface AgentSubConfig<M> {
  readonly id: string;
  readonly transport: TransportConfig;
  readonly toMsg: (event: AgentEvent) => M;
  readonly retryPolicy?: RetryPolicy;
}
