import type { WebSocketTransportConfig } from '../agent-types.js';
import type { AgentTransport, CloseEvent } from './contracts.js';

export function createWebSocketTransport(config: WebSocketTransportConfig): AgentTransport {
  const reconnect = config.reconnect ?? true;
  const reconnectInterval = config.reconnectInterval ?? 3000;

  let socket: WebSocket | null = null;
  let disconnectedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const messageHandlers: Array<(message: string) => void> = [];
  const closeHandlers: Array<(reason?: string) => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];

  function emitMessage(message: string): void {
    for (const handler of messageHandlers) handler(message);
  }

  function emitClose(reason?: string): void {
    for (const handler of closeHandlers) handler(reason);
  }

  function emitError(error: Error): void {
    for (const handler of errorHandlers) handler(error);
  }

  function scheduleReconnect(): void {
    if (reconnectTimer !== null || disconnectedByUser) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (disconnectedByUser) return;
      void connectSocket().catch((error) => {
        emitError(error instanceof Error ? error : new Error(String(error)));
        if (!disconnectedByUser && reconnect) scheduleReconnect();
      });
    }, reconnectInterval);
  }

  function connectSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const WebSocketCtor = globalThis.WebSocket;
      if (!WebSocketCtor) {
        reject(new Error('WebSocket transport is not available in this runtime'));
        return;
      }

      const ws = new WebSocketCtor(config.url);
      socket = ws;

      const onOpen = () => {
        if (config.auth) ws.send(config.auth);
        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          emitMessage(event.data);
        } else if (event.data instanceof ArrayBuffer) {
          emitMessage(Buffer.from(event.data).toString('utf8'));
        }
      };

      const onError = () => {
        reject(new Error('WebSocket connection failed'));
      };

      const onClose = (event: CloseEvent) => {
        if (socket === ws) socket = null;
        if (!disconnectedByUser) {
          emitClose(event.reason || `WebSocket closed (${event.code})`);
          if (reconnect) scheduleReconnect();
        }
      };

      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', onError, { once: true });
      ws.addEventListener('close', onClose);
    });
  }

  return {
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
    },
    connect() {
      disconnectedByUser = false;
      return connectSocket();
    },
    send(message: string) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        emitError(new Error('Cannot send: transport is not connected'));
        return;
      }
      socket.send(message);
    },
    onMessage(handler) {
      messageHandlers.push(handler);
    },
    onClose(handler) {
      closeHandlers.push(handler);
    },
    onError(handler) {
      errorHandlers.push(handler);
    },
    disconnect() {
      disconnectedByUser = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
    },
  };
}
