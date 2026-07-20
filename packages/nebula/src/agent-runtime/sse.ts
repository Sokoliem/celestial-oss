import * as http from 'node:http';
import * as https from 'node:https';
import type { SseTransportConfig } from '../agent-types.js';
import { type AgentTransport, CONNECT_TIMEOUT_MS, MAX_AGENT_MESSAGE_BYTES } from './contracts.js';

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
  let endpointTimer: ReturnType<typeof setTimeout> | null = null;
  let connecting: Promise<void> | null = null;
  let disconnectedByUser = false;
  const activePosts = new Set<http.ClientRequest>();

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
    const blocks = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n/);
    const remainder = blocks.pop() ?? '';

    for (const block of blocks) {
      if (block.trim().length === 0) continue;
      let event: string | undefined;
      const dataLines: string[] = [];
      let id: string | undefined;

      for (const rawLine of block.split('\n')) {
        const line = rawLine.replace(/^\uFEFF/, '');
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        if (field === 'event') event = value;
        else if (field === 'data') dataLines.push(value);
        else if (field === 'id' && !value.includes('\0')) id = value;
      }

      if (dataLines.length > 0) {
        events.push({ event, data: dataLines.join('\n'), id });
      }
    }

    return [events, remainder];
  }

  function resolveEndpoint(endpoint: string): string {
    const streamUrl = new URL(config.url);
    const resolved = new URL(endpoint, streamUrl);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      throw new Error(`Unsupported SSE endpoint protocol: ${resolved.protocol}`);
    }
    if (resolved.origin !== streamUrl.origin) {
      throw new Error('SSE endpoint must use the same origin as the event stream');
    }
    return resolved.toString();
  }

  function getRequestModule(url: string): typeof http | typeof https {
    return url.startsWith('https') ? https : http;
  }

  function establishStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const parsed = new URL(config.url);
      if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
        reject(new Error('SSE URL must be an http(s) URL without embedded credentials'));
        return;
      }
      const mod = getRequestModule(config.url);
      const headers: Record<string, string> = {
        ...(config.headers ?? {}),
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      };

      if (lastEventId !== undefined) headers['Last-Event-ID'] = lastEventId;

      const request = mod.request(
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
            currentRequest = null;
            if (endpointTimer !== null) clearTimeout(endpointTimer);
            endpointTimer = null;
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
            if (Buffer.byteLength(sseBuffer, 'utf8') > MAX_AGENT_MESSAGE_BYTES) {
              request.destroy(new Error(`SSE event exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
              return;
            }
            for (const sseEvent of events) {
              if (Buffer.byteLength(sseEvent.data, 'utf8') > MAX_AGENT_MESSAGE_BYTES) {
                request.destroy(new Error(`SSE event exceeded ${MAX_AGENT_MESSAGE_BYTES} bytes`));
                return;
              }
              if (sseEvent.id !== undefined) lastEventId = sseEvent.id;
              if (sseEvent.event === 'endpoint' && postEndpoint === null) {
                try {
                  postEndpoint = resolveEndpoint(sseEvent.data);
                } catch (error: unknown) {
                  request.destroy(error instanceof Error ? error : new Error(String(error)));
                  return;
                }
                if (!resolved) {
                  resolved = true;
                  isConnected = true;
                  if (endpointTimer !== null) clearTimeout(endpointTimer);
                  endpointTimer = null;
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
            if (endpointTimer !== null) clearTimeout(endpointTimer);
            endpointTimer = null;
            if (!resolved) {
              reject(new Error('SSE stream ended before providing endpoint'));
              return;
            }
            if (!disconnectedByUser) emitClose('SSE stream ended');
          });

          res.on('error', (error: Error) => {
            isConnected = false;
            currentRequest = null;
            if (endpointTimer !== null) clearTimeout(endpointTimer);
            endpointTimer = null;
            if (!resolved) {
              reject(error);
              return;
            }
            emitError(error);
          });
        },
      );
      currentRequest = request;

      request.on('error', (error: Error) => {
        if (currentRequest === request) currentRequest = null;
        if (endpointTimer !== null) clearTimeout(endpointTimer);
        endpointTimer = null;
        if (isConnected) emitError(error);
        else reject(error);
      });

      endpointTimer = setTimeout(() => {
        request.destroy(new Error(`SSE endpoint was not received within ${CONNECT_TIMEOUT_MS}ms`));
      }, CONNECT_TIMEOUT_MS);
      request.end();
    });
  }

  return {
    get connected() {
      return isConnected;
    },
    connect() {
      if (isConnected) return Promise.resolve();
      if (connecting) return connecting;
      disconnectedByUser = false;
      postEndpoint = null;
      const attempt = establishStream();
      connecting = attempt.finally(() => {
        connecting = null;
      });
      return connecting;
    },
    send(message: string) {
      if (!isConnected || !postEndpoint) {
        const error = new Error('Cannot send: transport is not connected or endpoint not received');
        emitError(error);
        throw error;
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
            ...(config.headers ?? {}),
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        },
        (res) => {
          activePosts.delete(req);
          res.resume();
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            emitError(new Error(`POST to SSE endpoint failed with status ${res.statusCode}`));
          }
        },
      );
      activePosts.add(req);

      req.on('error', (error: Error) => {
        activePosts.delete(req);
        emitError(error);
      });
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
      if (endpointTimer !== null) clearTimeout(endpointTimer);
      endpointTimer = null;
      currentRequest?.destroy();
      currentRequest = null;
      for (const request of activePosts) request.destroy();
      activePosts.clear();
      isConnected = false;
      postEndpoint = null;
    },
  };
}
