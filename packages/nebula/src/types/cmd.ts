import type { AgentMessage } from '../agent-types.js';
import type { MachineRegistry } from '../machine-registry.js';
import type { TaskDescriptor } from '../tasks.js';
import type { Result } from './core.js';

export type CmdKind<M> =
  | { kind: 'none' }
  | { kind: 'batch'; cmds: Cmd<M>[] }
  | { kind: 'sequence'; cmds: Cmd<M>[] }
  | { kind: 'perform'; task: (signal: AbortSignal) => Promise<unknown>; toMsg: (result: unknown) => M }
  | { kind: 'attempt'; task: (signal: AbortSignal) => Promise<unknown>; toMsg: (result: Result<unknown, unknown>) => M }
  | { kind: 'map'; cmd: Cmd<unknown>; fn: (a: unknown) => M }
  | { kind: 'debounce'; ms: number; cmd: Cmd<M>; key: string }
  | { kind: 'quit' }
  | { kind: 'sendToAgent'; agentId: string; message: AgentMessage; toMsg?: (result: Result<void, Error>) => M }
  | { kind: 'phase-send'; registry: MachineRegistry; machineId: string; event: unknown }
  | { kind: 'custom'; tag: string; payload: unknown; toMsg?: (result: Result<unknown, unknown>) => M }
  | { kind: 'taskStart'; task: TaskDescriptor<M> }
  | { kind: 'taskCancel'; taskId: string }
  | { kind: 'taskCancelOwner'; owner: string }
  | { kind: 'pushFocusGroup'; group: string }
  | { kind: 'popFocusGroup' }
  | { kind: 'race'; cmds: Cmd<M>[]; toMsg: (winner: { index: number; result: unknown }) => M }
  | { kind: 'all'; cmds: Cmd<M>[]; toMsg: (results: unknown[]) => M }
  | { kind: 'timeout'; cmd: Cmd<M>; ms: number; fallbackMsg: M };

/**
 * A command represents a side effect as a value. Commands are descriptions
 * of work to perform -- the runtime is responsible for executing them.
 */
export interface Cmd<M> {
  readonly _tag: 'cmd';
  readonly _phantom?: M;
  /** @internal */
  readonly _kind: CmdKind<M>;
}

function mkCmd<M>(kind: CmdKind<M>): Cmd<M> {
  return { _tag: 'cmd', _kind: kind };
}

export const Cmd = {
  /** A command that does nothing. */
  none<M>(): Cmd<M> {
    return mkCmd({ kind: 'none' });
  },

  /** Combine multiple commands to run concurrently. */
  batch<M>(...cmds: Cmd<M>[]): Cmd<M> {
    return mkCmd({ kind: 'batch', cmds });
  },

  /** Chain multiple commands to run in sequence. */
  sequence<M>(...cmds: Cmd<M>[]): Cmd<M> {
    return mkCmd({ kind: 'sequence', cmds });
  },

  /** Dispatch a single message on the next tick. */
  msg<M>(message: M): Cmd<M> {
    return mkCmd({
      kind: 'perform',
      task: () => Promise.resolve(undefined),
      toMsg: () => message,
    });
  },

  /** Wrap an async task. When the promise resolves, the result is mapped to a message. */
  perform<M, T>(task: (signal: AbortSignal) => Promise<T>, toMsg: (result: T) => M): Cmd<M> {
    return mkCmd({
      kind: 'perform',
      task: task as (signal: AbortSignal) => Promise<unknown>,
      toMsg: toMsg as (result: unknown) => M,
    });
  },

  /** Wrap an async task with error handling. */
  attempt<M, T, E = Error>(task: (signal: AbortSignal) => Promise<T>, toMsg: (result: Result<T, E>) => M): Cmd<M> {
    return mkCmd({
      kind: 'attempt',
      task: task as (signal: AbortSignal) => Promise<unknown>,
      toMsg: toMsg as (result: Result<unknown, unknown>) => M,
    });
  },

  /** Fetch a URL and deliver the JSON-parsed result as a message. */
  fetch<M, T>(url: string, options: RequestInit & { timeout?: number }, toMsg: (result: Result<T, Error>) => M): Cmd<M> {
    return mkCmd({
      kind: 'attempt',
      task: (async (signal: AbortSignal) => {
        const { timeout, ...init } = options as RequestInit & { timeout?: number };
        const signals = timeout ? [signal, AbortSignal.timeout(timeout)] : [signal];
        const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : signal;
        const response = await fetch(url, { ...init, signal: combinedSignal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as T;
      }) as (signal: AbortSignal) => Promise<unknown>,
      toMsg: toMsg as (result: Result<unknown, unknown>) => M,
    });
  },

  /** Fetch a URL and deliver the response body as a string. */
  fetchText<M>(url: string, options: RequestInit & { timeout?: number }, toMsg: (result: Result<string, Error>) => M): Cmd<M> {
    return mkCmd({
      kind: 'attempt',
      task: (async (signal: AbortSignal) => {
        const { timeout, ...init } = options as RequestInit & { timeout?: number };
        const signals = timeout ? [signal, AbortSignal.timeout(timeout)] : [signal];
        const combinedSignal = signals.length > 1 ? AbortSignal.any(signals) : signal;
        const response = await fetch(url, { ...init, signal: combinedSignal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
      }) as (signal: AbortSignal) => Promise<unknown>,
      toMsg: toMsg as (result: Result<unknown, unknown>) => M,
    });
  },

  /** Convenience wrapper around Cmd.fetch that sets JSON content-type headers. */
  fetchJson<M, T>(
    url: string,
    options: Omit<RequestInit, 'headers'> & { timeout?: number; headers?: Record<string, string> },
    toMsg: (result: Result<T, Error>) => M,
  ): Cmd<M> {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    };
    return Cmd.fetch<M, T>(url, { ...options, headers }, toMsg);
  },

  /** Transform the message type of a command. */
  map<A, B>(cmd: Cmd<A>, fn: (a: A) => B): Cmd<B> {
    return mkCmd({
      kind: 'map',
      cmd: cmd as Cmd<unknown>,
      fn: fn as (a: unknown) => B,
    });
  },

  /** Dispatch a message after a delay. */
  delay<M>(ms: number, msg: M): Cmd<M> {
    return Cmd.perform(
      (signal) =>
        new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
            return;
          }

          const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
          }, ms);

          const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          };

          signal.addEventListener('abort', onAbort, { once: true });
        }),
      () => msg,
    );
  },

  /** Delay starting a command and supersede any pending debounced command with the same key. */
  debounce<M>(ms: number, cmd: Cmd<M>, key = 'default'): Cmd<M> {
    return mkCmd({ kind: 'debounce', ms, cmd, key });
  },

  /** A command that tells the runtime to quit the application. */
  quit<M>(): Cmd<M> {
    return mkCmd({ kind: 'quit' });
  },

  /** Send a message to a connected MCP agent. Requires a matching Sub.agent with the same ID. */
  sendToAgent<M>(agentId: string, message: AgentMessage, toMsg?: (result: Result<void, Error>) => M): Cmd<M> {
    return mkCmd({ kind: 'sendToAgent', agentId, message, toMsg });
  },

  /** Send an event to a running Phase machine. Requires a matching Sub.phase with the same ID. */
  toMachine<M>(registry: MachineRegistry, machineId: string, event: unknown): Cmd<M> {
    return mkCmd({ kind: 'phase-send', registry, machineId, event });
  },

  /** Create a custom command with a domain-specific tag and payload. */
  custom<M>(tag: string, payload: unknown, toMsg?: (result: Result<unknown, unknown>) => M): Cmd<M> {
    return mkCmd({ kind: 'custom', tag, payload, toMsg });
  },

  /** Start a managed task that can be cancelled by id or owner. */
  startTask<M>(task: TaskDescriptor<M>): Cmd<M> {
    return mkCmd({ kind: 'taskStart', task });
  },

  /** Cancel all running tasks with the given id. */
  cancelTask<M>(taskId: string): Cmd<M> {
    return mkCmd({ kind: 'taskCancel', taskId });
  },

  /** Cancel all running tasks owned by the given owner token. */
  cancelTasksByOwner<M>(owner: string): Cmd<M> {
    return mkCmd({ kind: 'taskCancelOwner', owner });
  },

  announce<M>(message: string, priority: 'polite' | 'assertive' = 'polite', toMsg?: (result: Result<void, Error>) => M): Cmd<M> {
    return mkCmd({
      kind: 'custom',
      tag: 'a11y.announce',
      payload: { message, priority },
      toMsg: toMsg as ((result: Result<unknown, unknown>) => M) | undefined,
    });
  },

  /** Push a focus group onto the stack, restricting navigation to elements in this group. */
  pushFocusGroup<M>(group: string): Cmd<M> {
    return mkCmd({ kind: 'pushFocusGroup', group });
  },

  /** Pop the topmost focus group from the stack. */
  popFocusGroup<M>(): Cmd<M> {
    return mkCmd({ kind: 'popFocusGroup' });
  },

  /** Race multiple async commands. First to resolve wins; others are aborted. */
  race<M>(cmds: Cmd<M>[], toMsg: (winner: { index: number; result: unknown }) => M): Cmd<M> {
    return mkCmd({ kind: 'race', cmds, toMsg });
  },

  /** Wait for all async commands to complete. Results collected in order. */
  all<M>(cmds: Cmd<M>[], toMsg: (results: unknown[]) => M): Cmd<M> {
    return mkCmd({ kind: 'all', cmds, toMsg });
  },

  /** Execute a command with a timeout. Dispatches fallbackMsg if cmd exceeds ms. */
  timeout<M>(cmd: Cmd<M>, ms: number, fallbackMsg: M): Cmd<M> {
    return mkCmd({ kind: 'timeout', cmd, ms, fallbackMsg });
  },
};

/** Extract the internal kind descriptor from a command (for runtime use). */
export function cmdKind<M>(cmd: Cmd<M>): CmdKind<M> {
  return cmd._kind;
}
