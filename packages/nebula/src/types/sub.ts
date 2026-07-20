import type { AgentEvent, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { MachineRegistry } from '../machine-registry.js';
import type { KeyEvent } from '../terminal.js';
import type { LayoutRects, StreamSource } from './core.js';
import type { ElementMouseEvent, FrameInfo, KeyModifiers, MouseEventData } from './events.js';

export type SubKind<M> =
  | { kind: 'none' }
  | { kind: 'batch'; subs: Sub<M>[] }
  | { kind: 'key'; key: string; msg: M }
  | { kind: 'keyWithModifiers'; key: string; modifiers: KeyModifiers; msg: M }
  | { kind: 'keyEvent'; toMsg: (event: KeyEvent) => M }
  | { kind: 'timer'; ms: number; toMsg: () => M }
  | { kind: 'idle'; ms: number; msg: M }
  | { kind: 'resize'; toMsg: (cols: number, rows: number) => M }
  | { kind: 'mouse'; toMsg: (event: MouseEventData) => M }
  | { kind: 'elementMouse'; toMsg: (event: ElementMouseEvent) => M }
  | { kind: 'focus'; toMsg: (focusedId: string | null) => M }
  | { kind: 'windowFocus'; toMsg: (focused: boolean) => M }
  | { kind: 'layout'; ids: string[]; toMsg: (rects: LayoutRects) => M }
  | { kind: 'paste'; toMsg: (text: string) => M }
  | { kind: 'agent'; id: string; transport: TransportConfig; toMsg: (event: AgentEvent) => M; retryPolicy?: RetryPolicy }
  | { kind: 'animationFrame'; toMsg: (info: FrameInfo) => M }
  | {
      kind: 'phase';
      id: string;
      registry: MachineRegistry;
      machineRef: unknown;
      toMsg: (state: unknown, prev: unknown | null) => M;
      filter?: (state: unknown) => boolean;
    }
  | { kind: 'stream'; id: string; setup: () => StreamSource; toMsg: (data: unknown) => M }
  | { kind: 'map'; sub: Sub<unknown>; fn: (a: unknown) => M }
  | { kind: 'debounce'; sub: Sub<unknown>; ms: number }
  | { kind: 'throttle'; sub: Sub<unknown>; ms: number }
  | { kind: 'filter'; sub: Sub<unknown>; predicate: (msg: unknown) => boolean }
  | { kind: 'distinct'; sub: Sub<unknown>; equals?: (a: unknown, b: unknown) => boolean };

/**
 * A subscription represents an event source. Subscriptions are descriptions
 * of events the runtime should listen for and deliver as messages.
 */
export interface Sub<M> {
  readonly _tag: 'sub';
  readonly _phantom?: M;
  /** @internal */
  readonly _kind: SubKind<M>;
}

function mkSub<M>(kind: SubKind<M>): Sub<M> {
  return { _tag: 'sub', _kind: kind };
}

export const Sub = {
  /** A subscription that listens for nothing. */
  none<M>(): Sub<M> {
    return mkSub({ kind: 'none' });
  },

  /** Combine multiple subscriptions. */
  batch<M>(...subs: Sub<M>[]): Sub<M> {
    return mkSub({ kind: 'batch', subs });
  },

  /** Subscribe to a specific key press (no modifiers). */
  key<M>(key: string, msg: M): Sub<M> {
    return mkSub({ kind: 'key', key, msg });
  },

  /** Subscribe to a key press with specific modifier requirements. */
  keyWithModifiers<M>(key: string, modifiers: KeyModifiers, msg: M): Sub<M> {
    return mkSub({ kind: 'keyWithModifiers', key, modifiers, msg });
  },

  /** Subscribe to parsed key events, including modifiers and printable chars. */
  keyEvent<M>(toMsg: (event: KeyEvent) => M): Sub<M> {
    return mkSub({ kind: 'keyEvent', toMsg });
  },

  /** Subscribe to a periodic timer. Accepts a callback or a plain message value. */
  timer<M>(ms: number, toMsg: M | (() => M)): Sub<M> {
    const fn = typeof toMsg === 'function' ? (toMsg as () => M) : () => toMsg;
    return mkSub({ kind: 'timer', ms, toMsg: fn });
  },

  /** Fire once after no user input occurs for ms milliseconds. */
  idle<M>(ms: number, msg: M): Sub<M> {
    return mkSub({ kind: 'idle', ms, msg });
  },

  /** Subscribe to terminal resize events. */
  resize<M>(toMsg: (cols: number, rows: number) => M): Sub<M> {
    return mkSub({ kind: 'resize', toMsg });
  },

  /** Subscribe to mouse events (click, move, scroll). */
  mouse<M>(toMsg: (event: MouseEventData) => M): Sub<M> {
    return mkSub({ kind: 'mouse', toMsg });
  },

  /** Subscribe to element-scoped mouse events (click, hover, etc.) */
  elementMouse<M>(toMsg: (event: ElementMouseEvent) => M): Sub<M> {
    return mkSub({ kind: 'elementMouse', toMsg });
  },

  /** Subscribe to focus changes (Tab/Shift+Tab navigation). */
  focus<M>(toMsg: (focusedId: string | null) => M): Sub<M> {
    return mkSub({ kind: 'focus', toMsg });
  },

  /** Subscribe to terminal focus-in / focus-out events (DECSET 1004). */
  windowFocus<M>(toMsg: (focused: boolean) => M): Sub<M> {
    return mkSub({ kind: 'windowFocus', toMsg });
  },

  /** Subscribe to computed layout rects from the previous frame. */
  layout<M>(ids: string[], toMsg: (rects: LayoutRects) => M): Sub<M> {
    return mkSub({ kind: 'layout', ids, toMsg });
  },

  /** Subscribe to bracketed paste events. Delivers pasted text as a message. */
  paste<M>(toMsg: (text: string) => M): Sub<M> {
    return mkSub({ kind: 'paste', toMsg });
  },

  /** Subscribe to 60fps animation frames. All subscribers share one timer. */
  animationFrame<M>(toMsg: (info: FrameInfo) => M): Sub<M> {
    return mkSub({ kind: 'animationFrame', toMsg });
  },

  /** Subscribe to an MCP-compatible AI agent. The runtime manages the connection lifecycle. */
  agent<M>(config: { id: string; transport: TransportConfig; toMsg: (event: AgentEvent) => M; retryPolicy?: RetryPolicy }): Sub<M> {
    return mkSub({ kind: 'agent', ...config });
  },

  /** Subscribe to a Phase state machine. */
  phase<M>(config: {
    id: string;
    registry: MachineRegistry;
    machineRef: unknown;
    toMsg: (state: unknown, prev: unknown | null) => M;
    filter?: (state: unknown) => boolean;
  }): Sub<M> {
    return mkSub({ kind: 'phase', ...config });
  },

  /** Subscribe to an external event source. */
  stream<M>(config: { id: string; setup: () => StreamSource; toMsg: (data: unknown) => M }): Sub<M> {
    return mkSub({ kind: 'stream', ...config });
  },

  /** Transform the message type of a subscription. */
  map<A, B>(sub: Sub<A>, fn: (a: A) => B): Sub<B> {
    return mkSub({
      kind: 'map',
      sub: sub as Sub<unknown>,
      fn: fn as (a: unknown) => B,
    });
  },

  /** Debounce — delay message delivery until events settle for ms. */
  debounce<M>(sub: Sub<M>, ms: number): Sub<M> {
    return mkSub({ kind: 'debounce', sub: sub as Sub<unknown>, ms } as SubKind<M>);
  },

  /** Throttle — deliver at most one message per ms window. */
  throttle<M>(sub: Sub<M>, ms: number): Sub<M> {
    return mkSub({ kind: 'throttle', sub: sub as Sub<unknown>, ms } as SubKind<M>);
  },

  /** Filter — only deliver messages that pass the predicate. */
  filter<M>(sub: Sub<M>, predicate: (msg: M) => boolean): Sub<M> {
    return mkSub({ kind: 'filter', sub: sub as Sub<unknown>, predicate: predicate as (msg: unknown) => boolean } as SubKind<M>);
  },

  /** Distinct — deduplicate consecutive equal messages. */
  distinct<M>(sub: Sub<M>, equals?: (a: M, b: M) => boolean): Sub<M> {
    return mkSub({ kind: 'distinct', sub: sub as Sub<unknown>, equals: equals as ((a: unknown, b: unknown) => boolean) | undefined } as SubKind<M>);
  },
};

/** Extract the internal kind descriptor from a subscription (for runtime use). */
export function subKind<M>(sub: Sub<M>): SubKind<M> {
  return sub._kind;
}
