import * as http from 'node:http';
import * as https from 'node:https';
import type { SseTransportConfig } from '../agent-types.js';
import type { AgentTransport } from './contracts.js';

interface SseEvent {
  readonly event?: string;
  readonly data: string;
  readonly id?: string;
}

export function createSseTransport(config: SseTransportConfig): AgentTransport {
  let isConnected = false;
  let postEndpoint: string | null = null;
  let lastEventId: string | undefined;
  let currentRequest: http.ClientRequest | null = null;
  let disconnectedByUser = false;

  const messageHandlers: Array<(message: string) => void> = [];
  const closeHandlers: Array<(reason?: string) => void> = [];
  const errorHandlers: Array<(error: Error) => void> = [];

  function emitMessage(message: string): void {
    for (const handler of messageHandlers) handler(message);
  }

  function emitClose(reason?: string): void {
    isConnected = false;
    for (const handler of closeHandlers) handler(reason);
  }

  function emitError(error: Error): void {
    for (const handler of errorHandlers) handler(error);
  }

  function parseSseBuffer(buffer: string): [SseEvent[], string] {
    const events: SseEvent[] = [];
    const blocks = buffer.split(/\n\n/);
    const remainder = blocks.pop() ?? '';

    for (const block of blocks) {
      if (block.trim().length === 0) continue;
      let event: string | undefined;
      const dataLines: string[] = [];
      let id: string | undefined;

      for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/^\uFEFF/, '');
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        else if (line.startsWith('id:')) id = line.slice(3).trim();
      }

      if (dataLines.length > 0) {
        events.push({ event, data: dataLines.join('\n'), id });
      }
    }

    return [events, remainder];
  }

  function resolveEndpoint(endpoint: string): string {
    try {
      new URL(endpoint);
      return endpoint;
    } catch {
      return new URL(endpoint, new URL(config.url)).toString();
    }
  }

  function getRequestModule(url: string): typeof http | typeof https {
    return url.startsWith('https') ? https : http;
  }

  function establishStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const parsed = new URL(config.url);
      const mod = getRequestModule(config.url);
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(config.headers ?? {}),
      };

      if (lastEventId !== undefined) headers['Last-Event-ID'] = lastEventId;

      currentRequest = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: 'GET',
          headers,
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`SSE connection failed with status ${res.statusCode}`));
            return;
          }

          let sseBuffer = '';
          let resolved = false;
          res.setEncoding('utf8');

          res.on('data', (chunk: string) => {
            sseBuffer += chunk;
            const [events, remainder] = parseSseBuffer(sseBuffer);
            sseBuffer = remainder;
            for (const sseEvent of events) {
              if (sseEvent.id !== undefined) lastEventId = sseEvent.id;
              if (sseEvent.event === 'endpoint' && postEndpoint === null) {
                postEndpoint = resolveEndpoint(sseEvent.data);
                if (!resolved) {
                  resolved = true;
                  isConnected = true;
                  resolve();
                }
                continue;
              }
              if (sseEvent.event === 'message' || sseEvent.event === undefined) {
                emitMessage(sseEvent.data);
              }
            }
          });

          res.on('end', () => {
            isConnected = false;
            currentRequest = null;
            if (!resolved) {
              reject(new Error('SSE stream ended before providing endpoint'));
              return;
            }
            if (!disconnectedByUser) emitClose('SSE stream ended');
          });

          res.on('error', (error: Error) => {
            isConnected = false;
            currentRequest = null;
            if (!resolved) {
              reject(error);
              return;
            }
            emitError(error);
          });
        },
      );

      currentRequest.on('error', (error: Error) => {
        currentRequest = null;
        reject(error);
      });

      currentRequest.end();
    });
  }

  return {
    get connected() {
      return isConnected;
    },
    connect() {
      if (isConnected) return Promise.resolve();
      disconnectedByUser = false;
      postEndpoint = null;
      return establishStream();
    },
    send(message: string) {
      if (!isConnected || !postEndpoint) {
        emitError(new Error('Cannot send: transport is not connected or endpoint not received'));
        return;
      }

      const mod = getRequestModule(postEndpoint);
      const parsed = new URL(postEndpoint);
      const body = Buffer.from(message, 'utf8');
      const req = mod.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            ...(config.headers ?? {}),
          },
        },
        (res) => {
          res.resume();
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            emitError(new Error(`POST to SSE endpoint failed with status ${res.statusCode}`));
          }
        },
      );

      req.on('error', (error: Error) => emitError(error));
      req.write(body);
      req.end();
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
      currentRequest?.destroy();
      currentRequest = null;
      isConnected = false;
      postEndpoint = null;
    },
  };
}
