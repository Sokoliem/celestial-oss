type Matcher<T> = string | RegExp | ((value: T) => boolean);

export interface FetchMockDefinition {
  matches(input: RequestInfo | URL, init?: RequestInit): boolean;
  resolve(input: RequestInfo | URL, init?: RequestInit): Response | Promise<Response>;
}

export interface SubprocessMockDefinition {
  matches(payload: unknown): boolean;
  resolve(payload: unknown): unknown | Promise<unknown>;
}

export interface FetchMockObject {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  json?: unknown;
}

export type FetchMockResponse =
  | Response
  | Error
  | FetchMockObject
  | ((input: RequestInfo | URL, init?: RequestInit) => Response | Error | FetchMockObject | Promise<Response | Error | FetchMockObject>);

export type SubprocessMockResponse = unknown | Error | ((payload: unknown) => unknown | Promise<unknown>);

export interface SubprocessInvocation {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  input?: string;
}

interface FetchMockLayer {
  readonly id: symbol;
  readonly mocks: readonly FetchMockDefinition[];
  readonly passthrough: boolean;
}

const fetchMockLayers: FetchMockLayer[] = [];
let baseFetch: typeof fetch | undefined;

export function mockFetch(pattern: Matcher<string>, response: FetchMockResponse): FetchMockDefinition {
  return {
    matches(input, init) {
      return matchesPattern(pattern, requestUrl(input, init));
    },
    async resolve(input, init) {
      const resolved = typeof response === 'function' ? await response(input, init) : response;
      return toResponse(resolved);
    },
  };
}

export function mockSubprocess(pattern: Matcher<string>, response: SubprocessMockResponse): SubprocessMockDefinition {
  return {
    matches(payload) {
      const invocation = normalizeSubprocessPayload(payload);
      return matchesPattern(pattern, invocation.command ? [invocation.command, ...(invocation.args ?? [])].join(' ') : '');
    },
    async resolve(payload) {
      const resolved = typeof response === 'function' ? await response(payload) : response;
      if (resolved instanceof Error) {
        throw resolved;
      }
      return resolved;
    },
  };
}

export function installFetchMocks(mocks: readonly FetchMockDefinition[] | undefined, passthrough = false): () => void {
  if (!mocks || mocks.length === 0) {
    return () => {};
  }

  if (fetchMockLayers.length === 0) baseFetch = globalThis.fetch;
  const layer: FetchMockLayer = { id: Symbol('fetch-mock-layer'), mocks: [...mocks], passthrough };
  fetchMockLayers.push(layer);
  globalThis.fetch = dispatchMockFetch;

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    const index = fetchMockLayers.findIndex((candidate) => candidate.id === layer.id);
    if (index >= 0) fetchMockLayers.splice(index, 1);
    if (fetchMockLayers.length === 0) {
      globalThis.fetch = baseFetch!;
      baseFetch = undefined;
    }
  };
}

async function dispatchMockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let layerIndex = fetchMockLayers.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = fetchMockLayers[layerIndex]!;
    for (const mock of layer.mocks) {
      if (mock.matches(input, init)) return mock.resolve(input, init);
    }
    if (!layer.passthrough) throw new Error(`No fetch mock matched ${requestUrl(input, init)}`);
  }

  if (baseFetch) return baseFetch(input, init);
  throw new Error(`No fetch implementation is available for ${requestUrl(input, init)}`);
}

function matchesPattern<T extends string>(pattern: Matcher<T>, value: T): boolean {
  if (typeof pattern === 'string') {
    return value === pattern;
  }
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    const matched = pattern.test(value);
    pattern.lastIndex = 0;
    return matched;
  }
  return pattern(value);
}

function requestUrl(input: RequestInfo | URL, _init?: RequestInit): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if ('url' in input && typeof input.url === 'string') return input.url;
  return String(input);
}

async function toResponse(response: Response | Error | FetchMockObject): Promise<Response> {
  if (response instanceof Error) {
    throw response;
  }

  if (response instanceof Response) {
    return response;
  }

  const headers = new Headers(response.headers);
  let body = response.body ?? null;
  if (response.json !== undefined) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    body = JSON.stringify(response.json);
  }

  return new Response(body, {
    status: response.status ?? 200,
    statusText: response.statusText,
    headers,
  });
}

function normalizeSubprocessPayload(payload: unknown): SubprocessInvocation {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const invocation = payload as Record<string, unknown>;
  return {
    command: typeof invocation['command'] === 'string' ? invocation['command'] : undefined,
    args: Array.isArray(invocation['args']) ? invocation['args'].filter((item): item is string => typeof item === 'string') : undefined,
    cwd: typeof invocation['cwd'] === 'string' ? invocation['cwd'] : undefined,
    input: typeof invocation['input'] === 'string' ? invocation['input'] : undefined,
  };
}
