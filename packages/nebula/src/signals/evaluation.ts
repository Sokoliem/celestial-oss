import { type ComputedNode, type ContextState, type EffectNode, NodeState, type Source, type Subscriber } from './state.js';

export function getCurrentSubscriber(ctx: ContextState): Subscriber | undefined {
  return ctx.trackingStack[ctx.trackingStack.length - 1];
}

export function subscribe(source: Source, subscriber: Subscriber): void {
  source.subscribers.add(subscriber);
  if (subscriber.kind === 'computed' || subscriber.kind === 'effect') {
    subscriber.sources.add(source);
  }
}

export function unsubscribe(subscriber: Subscriber): void {
  const sources = subscriber.sources;
  for (const source of sources) {
    source.subscribers.delete(subscriber);
  }
  sources.clear();
}

export function markSubscribersDirty(ctx: ContextState, source: Source): void {
  for (const sub of source.subscribers) {
    if (sub.kind === 'computed') {
      if (sub.state === NodeState.Clean) {
        sub.state = NodeState.Dirty;
        markComputedSubscribersPossiblyDirty(ctx, sub);
      }
    } else if (sub.kind === 'effect' && !sub.disposed) {
      ctx.pendingEffects.add(sub);
    }
  }
}

function markComputedSubscribersPossiblyDirty(ctx: ContextState, source: ComputedNode<unknown>): void {
  for (const sub of source.subscribers) {
    if (sub.kind === 'computed') {
      if (sub.state === NodeState.Clean) {
        sub.state = NodeState.PossiblyDirty;
        markComputedSubscribersPossiblyDirty(ctx, sub);
      }
    } else if (sub.kind === 'effect' && !sub.disposed) {
      ctx.pendingEffects.add(sub);
    }
  }
}

export function updateComputed<T>(ctx: ContextState, node: ComputedNode<T>): void {
  let sourceChanged = false;
  for (const source of node.sources) {
    if (source.kind === 'computed' && source.state !== NodeState.Clean) {
      const prevValue = source.value;
      updateComputed(ctx, source);
      if (source.value !== prevValue) {
        sourceChanged = true;
      }
    }
  }

  if (node.state === NodeState.Clean) {
    return;
  }

  if (node.state === NodeState.PossiblyDirty && !sourceChanged) {
    const hasSignalSources = [...node.sources].some((s) => s.kind === 'signal');
    if (!hasSignalSources) {
      node.state = NodeState.Clean;
      return;
    }
  }

  unsubscribe(node);

  ctx.trackingStack.push(node);
  let newValue: T;
  try {
    newValue = node.fn();
  } finally {
    ctx.trackingStack.pop();
  }

  node.state = NodeState.Clean;

  if (node.value !== newValue) {
    node.value = newValue;
  }
}

export function runEffect(ctx: ContextState, node: EffectNode): void {
  if (node.disposed) return;

  let anySourceChanged = false;
  for (const source of node.sources) {
    if (source.kind === 'computed' && source.state !== NodeState.Clean) {
      const prevValue = source.value;
      updateComputed(ctx, source);
      if (source.value !== prevValue) {
        anySourceChanged = true;
      }
    } else if (source.kind === 'signal') {
      anySourceChanged = true;
    }
  }

  if (!anySourceChanged && node.sources.size > 0) {
    return;
  }

  if (node.cleanup) {
    node.cleanup();
    node.cleanup = undefined;
  }

  for (const child of node.children) {
    disposeEffect(ctx, child);
  }
  node.children.clear();

  unsubscribe(node);

  ctx.trackingStack.push(node);
  ctx.effectStack.push(node);
  try {
    const result = node.fn();
    if (typeof result === 'function') {
      node.cleanup = result;
    }
  } finally {
    ctx.trackingStack.pop();
    ctx.effectStack.pop();
  }
}

export function disposeEffect(ctx: ContextState, node: EffectNode): void {
  if (node.disposed) return;
  node.disposed = true;

  if (node.cleanup) {
    node.cleanup();
    node.cleanup = undefined;
  }

  for (const child of node.children) {
    disposeEffect(ctx, child);
  }
  node.children.clear();

  unsubscribe(node);
  ctx.pendingEffects.delete(node);
}

export function flush(ctx: ContextState): void {
  if (ctx.isFlushing) return;
  ctx.isFlushing = true;
  try {
    let iterations = 0;

    while (ctx.pendingEffects.size > 0) {
      if (++iterations > ctx.maxIterations) {
        throw new Error(
          `Nebula: possible infinite loop detected in reactive graph (${iterations} iterations, ${ctx.pendingEffects.size} effects still pending). Check for circular signal writes in effects.`,
        );
      }

      const effects = [...ctx.pendingEffects];
      ctx.pendingEffects = new Set();

      for (const eff of effects) {
        if (!eff.disposed) {
          runEffect(ctx, eff);
        }
      }
    }
  } finally {
    ctx.isFlushing = false;
  }
}
