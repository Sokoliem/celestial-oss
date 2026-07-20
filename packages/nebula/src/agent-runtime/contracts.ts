import type { AgentEvent, AgentMessage, RetryPolicy, TransportConfig } from '../agent-types.js';

export type CloseEvent = { code: number; reason: string };

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
}

export interface AgentTransport {
  connect(): Promise<void>;
  send(message: string): void;
  onMessage(handler: (message: string) => void): void;
  onClose(handler: (reason?: string) => void): void;
  onError(handler: (error: Error) => void): void;
  disconnect(): void;
  readonly connected: boolean;
}

export interface McpClient {
  readonly state: 'disconnected' | 'connecting' | 'initializing' | 'ready' | 'disconnecting';
  connect(): Promise<void>;
  disconnect(): void;
  onEvent(handler: (event: AgentEvent) => void): () => void;
  sendMessage(role: 'user' | 'tool', content: string, toolCallId?: string): Promise<void>;
  waitForClose(): Promise<void>;
}

export interface ConnectionManager<M> {
  start(id: string, config: TransportConfig, toMsg: (event: AgentEvent) => M, dispatch: (msg: M) => void, retryPolicy?: RetryPolicy): void;
  stop(id: string): void;
  send(id: string, message: AgentMessage): Promise<void>;
  stopAll(): void;
}

export const PROTOCOL_VERSION = '2024-11-05';
export const CLIENT_NAME = 'celestui-agent';
export const CLIENT_VERSION = '0.0.1';
export const REQUEST_TIMEOUT_MS = 30_000;

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffFactor: 2,
};
