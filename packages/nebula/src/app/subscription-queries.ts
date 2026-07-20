import type { AgentEvent, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { MachineRegistry } from '../machine-registry.js';
import { type StreamSource, type Sub, subKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';
import { walkSubscriptionLeaves } from './subscription-walk.js';

export interface AgentSub {
  id: string;
  transport: TransportConfig;
  handle: (event: AgentEvent) => void;
  retryPolicy?: RetryPolicy;
}

export interface PhaseSub {
  id: string;
  registry: MachineRegistry;
  machineRef: unknown;
  handle: (state: unknown, prev: unknown | null) => boolean;
}

export interface StreamSub {
  id: string;
  setup: () => StreamSource;
  handle: (data: unknown) => void;
  restartKey?: string | number;
}

export function hasPasteSub<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): boolean {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'paste':
      return true;
    case 'batch':
      return kind.subs.some((s) => hasPasteSub(ctx, s));
    case 'map':
      return hasPasteSub(ctx, kind.sub as Sub<M>);
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return hasPasteSub(ctx, ctx.combinatorInnerSub(kind));
    default:
      return false;
  }
}

export function hasMouseSub<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): boolean {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'mouse':
    case 'elementMouse':
      return true;
    case 'batch':
      return kind.subs.some((s) => hasMouseSub(ctx, s));
    case 'map':
      return hasMouseSub(ctx, kind.sub as Sub<M>);
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return hasMouseSub(ctx, ctx.combinatorInnerSub(kind));
    default:
      return false;
  }
}

export function hasResizeSub<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): boolean {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'resize':
      return true;
    case 'batch':
      return kind.subs.some((s) => hasResizeSub(ctx, s));
    case 'map':
      return hasResizeSub(ctx, kind.sub as Sub<M>);
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return hasResizeSub(ctx, ctx.combinatorInnerSub(kind));
    default:
      return false;
  }
}

export function hasWindowFocusSub<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): boolean {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'windowFocus':
      return true;
    case 'batch':
      return kind.subs.some((s) => hasWindowFocusSub(ctx, s));
    case 'map':
      return hasWindowFocusSub(ctx, kind.sub as Sub<M>);
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return hasWindowFocusSub(ctx, ctx.combinatorInnerSub(kind));
    default:
      return false;
  }
}

export function collectIdleSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): Array<{ ms: number; fire: () => void }> {
  const result: Array<{ ms: number; fire: () => void }> = [];
  walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
    if (kind.kind === 'idle') {
      result.push({
        ms: kind.ms,
        fire: () => {
          try {
            emit(kind.msg);
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
          }
        },
      });
    }
  });
  return result;
}

export function collectAgentSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): AgentSub[] {
  const result: AgentSub[] = [];
  walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
    if (kind.kind === 'agent') {
      result.push({
        id: kind.id,
        transport: kind.transport,
        retryPolicy: kind.retryPolicy,
        handle: (event) => {
          try {
            emit(kind.toMsg(event));
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
          }
        },
      });
    }
  });
  return result;
}

export function collectPhaseSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): PhaseSub[] {
  const result: PhaseSub[] = [];
  walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
    if (kind.kind === 'phase') {
      result.push({
        id: kind.id,
        registry: kind.registry,
        machineRef: kind.machineRef,
        handle: (state, prev) => {
          try {
            if (kind.filter && !kind.filter(state)) return false;
            emit(kind.toMsg(state, prev));
            return true;
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
            return false;
          }
        },
      });
    }
  });
  return result;
}

export function collectStreamSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): StreamSub[] {
  const result: StreamSub[] = [];
  walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
    if (kind.kind === 'stream') {
      result.push({
        id: kind.id,
        setup: kind.setup,
        restartKey: kind.restartKey,
        handle: (data) => {
          try {
            emit(kind.toMsg(data));
          } catch (error: unknown) {
            ctx.notifyRenderError(error);
          }
        },
      });
    }
  });
  return result;
}
