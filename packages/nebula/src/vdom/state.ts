/** Runtime-owned state for memo, lazy, and local-state VNodes. */

import type { LazyNode, LocalStateNode, MemoNode, VNode } from './nodes.js';

interface MemoEntry {
  deps: readonly unknown[];
  result: VNode;
}

export interface VNodeStateScope {
  readonly memoCache: WeakMap<Function, MemoEntry>;
  readonly lazyFactories: Map<string, () => VNode>;
  readonly lazyLoading: Map<string, symbol>;
  readonly localStateStore: Map<string, unknown>;
  readonly localStateReducers: Map<string, (state: unknown, action: unknown) => unknown>;
  localStateSeenKeys: Set<string> | null;
  lazyScheduleRender: (() => void) | null;
  localStateScheduleRender: (() => void) | null;
  disposed: boolean;
}

export function createVNodeStateScope(scheduleRender: (() => void) | null = null): VNodeStateScope {
  return {
    memoCache: new WeakMap(),
    lazyFactories: new Map(),
    lazyLoading: new Map(),
    localStateStore: new Map(),
    localStateReducers: new Map(),
    localStateSeenKeys: null,
    lazyScheduleRender: scheduleRender,
    localStateScheduleRender: scheduleRender,
    disposed: false,
  };
}

const defaultScope = createVNodeStateScope();
let activeScope = defaultScope;

function shallowEqualDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function setVNodeStateScheduleRender(scope: VNodeStateScope, scheduleRender: (() => void) | null): void {
  if (scope.disposed) return;
  scope.lazyScheduleRender = scheduleRender;
  scope.localStateScheduleRender = scheduleRender;
}

export function disposeVNodeStateScope(scope: VNodeStateScope): void {
  if (scope.disposed) return;
  scope.disposed = true;
  scope.lazyFactories.clear();
  scope.lazyLoading.clear();
  scope.localStateStore.clear();
  scope.localStateReducers.clear();
  scope.localStateSeenKeys = null;
  scope.lazyScheduleRender = null;
  scope.localStateScheduleRender = null;
}

/** Activate a scope for synchronous tree walkers; call the returned function to restore it. */
export function activateVNodeStateScope(scope: VNodeStateScope): () => void {
  const previousScope = activeScope;
  activeScope = scope;
  return () => {
    activeScope = previousScope;
  };
}

/** Run a complete layout frame against one app's isolated VNode state. */
export function withVNodeStateFrame<T>(scope: VNodeStateScope, operation: () => T): T {
  if (scope.disposed) return operation();
  const previousSeenKeys = scope.localStateSeenKeys;
  const restoreScope = activateVNodeStateScope(scope);
  scope.localStateSeenKeys = new Set();
  let completed = false;

  try {
    const result = operation();
    completed = true;
    return result;
  } finally {
    const seenKeys = scope.localStateSeenKeys;
    if (completed && seenKeys) {
      for (const key of scope.localStateStore.keys()) {
        if (!seenKeys.has(key)) {
          scope.localStateStore.delete(key);
          scope.localStateReducers.delete(key);
        }
      }
    }
    scope.localStateSeenKeys = previousSeenKeys;
    restoreScope();
  }
}

export function resolveMemo(node: MemoNode): VNode {
  const scope = activeScope;
  const cached = scope.memoCache.get(node.render);
  if (cached && shallowEqualDeps(cached.deps, node.deps)) return cached.result;
  const result = node.render();
  if (!scope.disposed) scope.memoCache.set(node.render, { deps: node.deps, result });
  return result;
}

export function setLazyScheduleRender(fn: (() => void) | null): void {
  activeScope.lazyScheduleRender = fn;
}

export function resolveLazy(node: LazyNode): VNode {
  const scope = activeScope;
  const factory = scope.lazyFactories.get(node.key);
  if (factory) return factory();

  if (!scope.disposed && !scope.lazyLoading.has(node.key)) {
    const token = Symbol(node.key);
    scope.lazyLoading.set(node.key, token);
    let loading: Promise<() => VNode>;
    try {
      loading = node.loader();
    } catch {
      scope.lazyLoading.delete(node.key);
      return node.placeholder;
    }
    loading.then(
      (loadedFactory) => {
        if (scope.disposed || scope.lazyLoading.get(node.key) !== token) return;
        scope.lazyFactories.set(node.key, loadedFactory);
        scope.lazyLoading.delete(node.key);
        scope.lazyScheduleRender?.();
      },
      () => {
        if (!scope.disposed && scope.lazyLoading.get(node.key) === token) {
          scope.lazyLoading.delete(node.key);
        }
      },
    );
  }
  return node.placeholder;
}

export function setLocalStateScheduleRender(fn: (() => void) | null): void {
  activeScope.localStateScheduleRender = fn;
}

/** Backwards-compatible standalone frame API. App runtimes use withVNodeStateFrame. */
export function beginLocalStateFrame(): void {
  activeScope.localStateSeenKeys = new Set();
}

export function endLocalStateFrame(): void {
  const scope = activeScope;
  if (scope.localStateSeenKeys) {
    for (const key of scope.localStateStore.keys()) {
      if (!scope.localStateSeenKeys.has(key)) {
        scope.localStateStore.delete(key);
        scope.localStateReducers.delete(key);
      }
    }
    scope.localStateSeenKeys = null;
  }
}

export function resolveLocalState(node: LocalStateNode): VNode {
  const scope = activeScope;
  scope.localStateSeenKeys?.add(node.key);
  if (!scope.localStateStore.has(node.key)) {
    scope.localStateStore.set(node.key, node.init());
  }
  scope.localStateReducers.set(node.key, node.reducer as (state: unknown, action: unknown) => unknown);
  const state = scope.localStateStore.get(node.key)!;
  const dispatch = (action: unknown): void => {
    if (scope.disposed || !scope.localStateStore.has(node.key)) return;
    const current = scope.localStateStore.get(node.key);
    const reducer = scope.localStateReducers.get(node.key);
    if (!reducer) return;
    const next = reducer(current, action);
    scope.localStateStore.set(node.key, next);
    scope.localStateScheduleRender?.();
  };
  return (node.view as (value: unknown, send: (action: unknown) => void) => VNode)(state, dispatch);
}
