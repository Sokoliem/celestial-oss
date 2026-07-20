import type { WebSocketTransportConfig } from '../agent-types.js';
import { type AgentTransport, type CloseEvent, MAX_AGENT_MESSAGE_BYTES } from './contracts.js';

export function createWebSocketTransport(config: WebSocketTransportConfig): AgentTransport {
  const parsedUrl = new URL(config.url);
  if ((parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') || parsedUrl.username || parsedUrl.password) {
    throw new Error('WebSocket URL must be a ws(s) URL without embedded credentials');
  }
  const reconnect = config.reconnect ?? true;
  const reconnectInterval = config.reconnectInterval ?? 3000;
  if (!Number.isFinite(reconnectInterval) || reconnectInterval < 0) {
    throw new RangeError('WebSocket reconnectInterval must be a finite, non-negative number');
  }

  let socket: WebSocket | null = null;
  let connectPromise: Promise<void> | null = null;
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
      void connect().catch((error) => {
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
      let opened = false;
      let settled = false;

      const onOpen = () => {
        if (socket !== ws || disconnectedByUser) {
          ws.close();
          return;
        }
        opened = true;
        settled = true;
        if (config.auth) ws.send(config.auth);
        resolve();
      };

      const onMessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          if (Buffer.byteLength(event.data, 'utf8') <= MAX_AGENT_MESSAGE_BYTES) emitMessage(event.data);
          else emitError(new Error(`WebSocket message exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
        } else if (event.data instanceof ArrayBuffer) {
          if (event.data.byteLength <= MAX_AGENT_MESSAGE_BYTES) emitMessage(Buffer.from(event.data).toString('utf8'));
          else emitError(new Error(`WebSocket message exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
        } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
          if (event.data.size > MAX_AGENT_MESSAGE_BYTES) {
            emitError(new Error(`WebSocket message exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
          } else {
            void event.data.text().then(emitMessage, (error: unknown) => emitError(error instanceof Error ? error : new Error(String(error))));
          }
        }
      };

      const onError = () => {
        const error = new Error('WebSocket connection failed');
        if (!settled) {
          settled = true;
          reject(error);
        } else {
          emitError(error);
        }
      };

      const onClose = (event: CloseEvent) => {
        if (socket === ws) socket = null;
        if (!settled) {
          settled = true;
          reject(new Error(event.reason || `WebSocket closed before opening (${event.code})`));
        }
        if (!disconnectedByUser) {
          if (opened) emitClose(event.reason || `WebSocket closed (${event.code})`);
          if (opened && reconnect) scheduleReconnect();
        }
      };

      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', onError, { once: true });
      ws.addEventListener('close', onClose);
    });
  }

  function connect(): Promise<void> {
    if (socket?.readyState === 1) return Promise.resolve();
    if (connectPromise) return connectPromise;
    disconnectedByUser = false;
    const attempt = connectSocket();
    connectPromise = attempt.finally(() => {
      connectPromise = null;
    });
    return connectPromise;
  }

  return {
    get connected() {
      return socket?.readyState === 1;
    },
    connect,
    send(message: string) {
      if (!socket || socket.readyState !== 1) {
        const error = new Error('Cannot send: transport is not connected');
        emitError(error);
        throw error;
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
