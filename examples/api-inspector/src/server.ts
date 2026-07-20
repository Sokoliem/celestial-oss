import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';

export interface DemoApiServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export interface ApiRequest {
  method: 'GET' | 'POST';
  path: string;
  body: string;
  timeoutMs?: number;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
}

export type ApiRuntimeEvent = { type: 'server-ready'; baseUrl: string } | { type: 'server-error'; message: string };

export interface ApiRuntime {
  request(request: ApiRequest, signal?: AbortSignal): Promise<ApiResponse>;
  subscribe(listener: (event: ApiRuntimeEvent) => void): () => void;
  dispose(): Promise<void> | void;
  isRunning(): boolean;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 65_536) throw new Error('Request body exceeds the 64 KiB demo limit.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

export async function startDemoApiServer(): Promise<DemoApiServer> {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: 'celestial-demo', transport: 'loopback' });
        return;
      }
      if (method === 'GET' && url.pathname === '/users') {
        sendJson(response, 200, {
          users: [
            { id: 1, name: 'Ada', role: 'maintainer' },
            { id: 2, name: 'Lin', role: 'contributor' },
          ],
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/echo') {
        const body = await readBody(request);
        let parsed: unknown = body;
        try {
          parsed = body.length > 0 ? JSON.parse(body) : null;
        } catch {
          // Echo non-JSON input as text.
        }
        sendJson(response, 200, { method, received: parsed });
        return;
      }
      if (method === 'GET' && url.pathname === '/slow') {
        const delay = Math.max(0, Math.min(10_000, Number(url.searchParams.get('ms') ?? '500')));
        const timer = setTimeout(() => sendJson(response, 200, { ok: true, waitedMs: delay }), delay);
        response.once('close', () => clearTimeout(timer));
        return;
      }
      if (method === 'GET' && url.pathname === '/error') {
        sendJson(response, 500, { error: 'Intentional demo failure', retryable: false });
        return;
      }
      sendJson(response, 404, { error: 'Route not found', path: url.pathname });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Loopback server did not expose a TCP address.');
  }

  let closed = false;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      await closeServer(server);
    },
  };
}

function formatBody(contentType: string | null, value: string): string {
  if (!contentType?.includes('application/json')) return value;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function createApiRuntime(): ApiRuntime {
  const listeners = new Set<(event: ApiRuntimeEvent) => void>();
  let server: DemoApiServer | undefined;
  let startPromise: Promise<DemoApiServer> | undefined;
  let disposed = false;

  const emit = (event: ApiRuntimeEvent): void => {
    for (const listener of listeners) listener(event);
  };

  const ensureServer = (): Promise<DemoApiServer> => {
    if (server) return Promise.resolve(server);
    startPromise ??= startDemoApiServer()
      .then((started) => {
        server = started;
        emit({ type: 'server-ready', baseUrl: started.baseUrl });
        if (disposed) void started.close();
        return started;
      })
      .catch((error) => {
        emit({ type: 'server-error', message: error instanceof Error ? error.message : String(error) });
        throw error;
      });
    return startPromise;
  };

  return {
    async request(request, signal) {
      const activeServer = await ensureServer();
      if (!request.path.startsWith('/')) throw new Error('Use a relative path beginning with /.');
      const target = new URL(request.path, activeServer.baseUrl);
      if (target.origin !== new URL(activeServer.baseUrl).origin) throw new Error('Requests must stay on the loopback demo server.');

      const timeout = AbortSignal.timeout(request.timeoutMs ?? 3_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const startedAt = performance.now();
      const response = await fetch(target, {
        method: request.method,
        body: request.method === 'POST' ? request.body : undefined,
        headers: request.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        signal: combined,
      });
      const rawBody = await response.text();
      return {
        status: response.status,
        statusText: response.statusText,
        durationMs: performance.now() - startedAt,
        headers: Object.fromEntries(response.headers.entries()),
        body: formatBody(response.headers.get('content-type'), rawBody),
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      if (server) listener({ type: 'server-ready', baseUrl: server.baseUrl });
      else void ensureServer().catch(() => {});
      return () => listeners.delete(listener);
    },

    async dispose() {
      disposed = true;
      listeners.clear();
      const activeServer = server ?? (await startPromise?.catch(() => undefined));
      await activeServer?.close();
      server = undefined;
    },

    isRunning() {
      return server !== undefined && !disposed;
    },
  };
}
