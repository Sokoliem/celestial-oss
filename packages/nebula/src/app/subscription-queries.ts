import type { AgentEvent, RetryPolicy, TransportConfig } from '../agent-types.js';
import type { MachineRegistry } from '../machine-registry.js';
import { type StreamSource, type Sub, subKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';
import { applySubMap } from './sub-map.js';

export interface AgentSub<M> {
  id: string;
  transport: TransportConfig;
  toMsg: (event: AgentEvent) => M;
  retryPolicy?: RetryPolicy;
}

export interface PhaseSub<M> {
  id: string;
  registry: MachineRegistry;
  machineRef: unknown;
  toMsg: (state: unknown, prev: unknown | null) => M;
  filter?: (state: unknown) => boolean;
}

export interface StreamSub<M> {
  id: string;
  setup: () => StreamSource;
  toMsg: (data: unknown) => M;
}

export function hasPasteSub<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): boolean {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'paste':
      return true;
    case 'batch':
      return kind.subs.some((s) => hasPasteSub(ctx, s));
    case 'map':
      return hasPasteSub(ctx, applySubMap(kind.sub, kind.fn));
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
      return hasMouseSub(ctx, applySubMap(kind.sub, kind.fn));
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
      return hasResizeSub(ctx, applySubMap(kind.sub, kind.fn));
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
      return hasWindowFocusSub(ctx, applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return hasWindowFocusSub(ctx, ctx.combinatorInnerSub(kind));
    default:
      return false;
  }
}

export function collectIdleSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): Array<{ ms: number; msg: M }> {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'idle':
      return [{ ms: kind.ms, msg: kind.msg }];
    case 'batch':
      return kind.subs.flatMap((s) => collectIdleSubs(ctx, s));
    case 'map':
      return collectIdleSubs(ctx, applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return collectIdleSubs(ctx, ctx.combinatorInnerSub(kind));
    default:
      return [];
  }
}

export function collectAgentSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): AgentSub<M>[] {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'agent':
      return [{ id: kind.id, transport: kind.transport, toMsg: kind.toMsg, retryPolicy: kind.retryPolicy }];
    case 'batch':
      return kind.subs.flatMap((s) => collectAgentSubs(ctx, s));
    case 'map':
      return collectAgentSubs(ctx, applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return collectAgentSubs(ctx, ctx.combinatorInnerSub(kind));
    default:
      return [];
  }
}

export function collectPhaseSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): PhaseSub<M>[] {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'phase':
      return [{ id: kind.id, registry: kind.registry, machineRef: kind.machineRef, toMsg: kind.toMsg, filter: kind.filter }];
    case 'batch':
      return kind.subs.flatMap((s) => collectPhaseSubs(ctx, s));
    case 'map':
      return collectPhaseSubs(ctx, applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return collectPhaseSubs(ctx, ctx.combinatorInnerSub(kind));
    default:
      return [];
  }
}

export function collectStreamSubs<Model, M>(ctx: RuntimeContext<Model, M>, sub: Sub<M>): StreamSub<M>[] {
  const kind = subKind(sub);
  switch (kind.kind) {
    case 'stream':
      return [{ id: kind.id, setup: kind.setup, toMsg: kind.toMsg }];
    case 'batch':
      return kind.subs.flatMap((s) => collectStreamSubs(ctx, s));
    case 'map':
      return collectStreamSubs(ctx, applySubMap(kind.sub, kind.fn));
    case 'debounce':
    case 'throttle':
    case 'filter':
    case 'distinct':
      return collectStreamSubs(ctx, ctx.combinatorInnerSub(kind));
    default:
      return [];
  }
}
