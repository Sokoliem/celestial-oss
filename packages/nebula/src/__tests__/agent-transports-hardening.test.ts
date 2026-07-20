import { createServer, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSseTransport } from '../agent-runtime/sse.js';
import { createWebSocketTransport } from '../agent-runtime/websocket.js';

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SSE transport framing and endpoint policy', () => {
  it('parses CRLF-framed events and posts to a same-origin relative endpoint', async () => {
    let streamResponse: ServerResponse | null = null;
    let postedBody = '';
    let resolvePosted: (() => void) | undefined;
    const posted = new Promise<void>((resolve) => {
      resolvePosted = resolve;
    });
    const server = createServer((request, response) => {
      if (request.method === 'GET') {
        streamResponse = response;
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write('event: endpoint\r\ndata: /messages\r\n\r\nevent: message\r\ndata: {"ready":true}\r\n\r\n');
        return;
      }
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        postedBody += chunk;
      });
      request.on('end', () => {
        response.writeHead(204).end();
        resolvePosted?.();
      });
    });
    const port = await listen(server);
    const transport = createSseTransport({ kind: 'sse', url: `http://127.0.0.1:${port}/events` });
    const messages: string[] = [];
    transport.onMessage((message) => messages.push(message));
    await transport.connect();
    expect(messages).toEqual(['{"ready":true}']);
    transport.send('{"ping":1}');

    await posted;
    expect(postedBody).toBe('{"ping":1}');
    transport.disconnect();
    (streamResponse as ServerResponse | null)?.end();
    await closeServer(server);
  });

  it('rejects a cross-origin post endpoint', async () => {
    let streamResponse: ServerResponse | null = null;
    const server = createServer((_request, response) => {
      streamResponse = response;
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('event: endpoint\ndata: https://other.example/messages\n\n');
    });
    const port = await listen(server);
    const transport = createSseTransport({ kind: 'sse', url: `http://127.0.0.1:${port}/events` });

    await expect(transport.connect()).rejects.toThrow('same origin');
    transport.disconnect();
    (streamResponse as ServerResponse | null)?.end();
    await closeServer(server);
  });
});

describe('WebSocket transport connection settlement', () => {
  it('rejects when a socket closes before opening and shares concurrent connects', async () => {
    const originalWebSocket = globalThis.WebSocket;
    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      readyState = 0;
      private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

      constructor(readonly url: string) {
        FakeWebSocket.instances.push(this);
      }

      addEventListener(type: string, listener: (event: unknown) => void): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      send(): void {}

      close(): void {
        this.readyState = 3;
      }

      emit(type: string, event: unknown): void {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
    }
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    try {
      const transport = createWebSocketTransport({ kind: 'websocket', url: 'wss://example.test/socket', reconnect: false });
      const first = transport.connect();
      const second = transport.connect();
      expect(second).toBe(first);

      FakeWebSocket.instances[0]?.emit('close', { code: 1006, reason: 'closed early' });
      await expect(first).rejects.toThrow('closed early');
      expect(() => transport.send('message')).toThrow('not connected');
      transport.disconnect();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
