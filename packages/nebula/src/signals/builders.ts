import { disposeEffect, flush, getCurrentSubscriber, markSubscribersDirty, runEffect, subscribe, updateComputed } from './evaluation.js';
import {
  type ComputedNode,
  type ContextState,
  createContextState,
  type EffectNode,
  NodeState,
  type Signal,
  type SignalContext,
  type SignalNode,
} from './state.js';

export function createSignalFn(ctx: ContextState) {
  return function signal<T>(initialValue: T): [Signal<T>, (newValue: T) => void] {
    const node: SignalNode<T> = {
      kind: 'signal',
      value: initialValue,
      subscribers: new Set(),
    };

    const getter: Signal<T> = () => {
      const subscriber = getCurrentSubscriber(ctx);
      if (subscriber) {
        subscribe(node, subscriber);
      }
      return node.value;
    };

    const setter = (newValue: T): void => {
      if (Object.is(node.value, newValue)) return;
      node.value = newValue;
      markSubscribersDirty(ctx, node);
      if (ctx.batchDepth === 0) {
        flush(ctx);
      }
    };

    return [getter, setter];
  };
}

export function createComputedFn(ctx: ContextState) {
  return function computed<T>(fn: () => T): Signal<T> {
    const node: ComputedNode<T> = {
      kind: 'computed',
      fn,
      value: undefined,
      state: NodeState.Dirty,
      sources: new Set(),
      subscribers: new Set(),
    };

    const getter: Signal<T> = () => {
      const subscriber = getCurrentSubscriber(ctx);
      if (subscriber) {
        subscribe(node, subscriber);
      }

      if (node.state !== NodeState.Clean) {
        updateComputed(ctx, node);
      }

      return node.value as T;
    };

    return getter;
  };
}

export function createEffectFn(ctx: ContextState) {
  return function effect(fn: () => void | (() => void)): () => void {
    const node: EffectNode = {
      kind: 'effect',
      fn,
      cleanup: undefined,
      sources: new Set(),
      disposed: false,
      children: new Set(),
    };

    const parentEffect = ctx.effectStack[ctx.effectStack.length - 1];
    if (parentEffect) {
      parentEffect.children.add(node);
    }

    runEffect(ctx, node);

    return () => {
      disposeEffect(ctx, node);
      if (parentEffect) {
        parentEffect.children.delete(node);
      }
    };
  };
}

export function createBatchFn(ctx: ContextState) {
  return function batch(fn: () => void): void {
    ctx.batchDepth++;
    try {
      fn();
    } finally {
      ctx.batchDepth--;
      if (ctx.batchDepth === 0) {
        flush(ctx);
      }
    }
  };
}

export function createSignalContext(opts?: { maxIterations?: number }): SignalContext {
  const ctx = createContextState(opts);
  return {
    signal: createSignalFn(ctx),
    computed: createComputedFn(ctx),
    effect: createEffectFn(ctx),
    batch: createBatchFn(ctx),
  };
}
