/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { LazyNode, LocalStateNode, MemoNode, VNode } from './nodes.js';

// --- Memo VNode Cache ---
const MEMO_CACHE = new WeakMap<Function, { deps: readonly unknown[]; result: VNode }>();

function shallowEqualDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

export function resolveMemo(node: MemoNode): VNode {
  const cached = MEMO_CACHE.get(node.render);
  if (cached && shallowEqualDeps(cached.deps, node.deps)) {
    return cached.result;
  }
  const result = node.render();
  MEMO_CACHE.set(node.render, { deps: node.deps, result });
  return result;
}

// --- Lazy VNode Registry ---
const LAZY_FACTORIES = new Map<string, () => VNode>();
const LAZY_LOADING = new Set<string>();
let lazyScheduleRender: (() => void) | null = null;

export function setLazyScheduleRender(fn: (() => void) | null): void {
  lazyScheduleRender = fn;
}

export function resolveLazy(node: LazyNode): VNode {
  const factory = LAZY_FACTORIES.get(node.key);
  if (factory) return factory();
  if (!LAZY_LOADING.has(node.key)) {
    LAZY_LOADING.add(node.key);
    node.loader().then(
      (f) => {
        LAZY_FACTORIES.set(node.key, f);
        LAZY_LOADING.delete(node.key);
        lazyScheduleRender?.();
      },
      () => {
        LAZY_LOADING.delete(node.key);
      },
    );
  }
  return node.placeholder;
}

// --- Local State Registry ---
const LOCAL_STATE_STORE = new Map<string, unknown>();
let localStateScheduleRender: (() => void) | null = null;
let localStateSeenKeys: Set<string> | null = null;

export function setLocalStateScheduleRender(fn: (() => void) | null): void {
  localStateScheduleRender = fn;
}

export function beginLocalStateFrame(): void {
  localStateSeenKeys = new Set();
}

export function endLocalStateFrame(): void {
  if (localStateSeenKeys) {
    for (const key of LOCAL_STATE_STORE.keys()) {
      if (!localStateSeenKeys.has(key)) LOCAL_STATE_STORE.delete(key);
    }
    localStateSeenKeys = null;
  }
}

export function resolveLocalState(node: LocalStateNode): VNode {
  localStateSeenKeys?.add(node.key);
  if (!LOCAL_STATE_STORE.has(node.key)) {
    LOCAL_STATE_STORE.set(node.key, node.init());
  }
  const state = LOCAL_STATE_STORE.get(node.key)!;
  const dispatch = (action: unknown) => {
    const current = LOCAL_STATE_STORE.get(node.key);
    const next = (node.reducer as (s: unknown, a: unknown) => unknown)(current, action);
    LOCAL_STATE_STORE.set(node.key, next);
    localStateScheduleRender?.();
  };
  return (node.view as (s: unknown, d: (a: unknown) => void) => VNode)(state, dispatch);
}
