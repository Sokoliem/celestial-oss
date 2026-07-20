export type Signal<T> = () => T;

export enum NodeState {
  Clean = 0,
  Dirty = 1,
  PossiblyDirty = 2,
}

export interface SignalNode<T> {
  kind: 'signal';
  value: T;
  subscribers: Set<Subscriber>;
}

export interface ComputedNode<T> {
  kind: 'computed';
  fn: () => T;
  value: T | undefined;
  state: NodeState;
  sources: Set<Source>;
  subscribers: Set<Subscriber>;
}

export interface EffectNode {
  kind: 'effect';
  fn: () => void | (() => void);
  cleanup: (() => void) | undefined;
  sources: Set<Source>;
  disposed: boolean;
  children: Set<EffectNode>;
}

export type Subscriber = ComputedNode<unknown> | EffectNode;
export type Source = SignalNode<unknown> | ComputedNode<unknown>;

/** Mutable reactive tracking state. Encapsulated for multi-instance support. */
export interface SignalContext {
  /** Create a reactive signal within this context */
  signal<T>(initialValue: T): [Signal<T>, (newValue: T) => void];
  /** Create a computed (derived) signal within this context */
  computed<T>(fn: () => T): Signal<T>;
  /** Create a reactive effect within this context */
  effect(fn: () => void | (() => void)): () => void;
  /** Group multiple signal writes within this context */
  batch(fn: () => void): void;
}

export interface ContextState {
  /** Stack of the currently-evaluating subscriber (computed or effect). */
  trackingStack: Subscriber[];
  /** Stack of the currently-evaluating effect (for nested-effect ownership). */
  effectStack: EffectNode[];
  /** Batch depth counter — when > 0 we are inside a batch. */
  batchDepth: number;
  /** Effects that need to run once the outermost batch ends. */
  pendingEffects: Set<EffectNode>;
  /** Re-entrancy guard for flush. */
  isFlushing: boolean;
  /** Maximum flush iterations before throwing (safety valve). */
  maxIterations: number;
}

export function createContextState(opts?: { maxIterations?: number }): ContextState {
  return {
    trackingStack: [],
    effectStack: [],
    batchDepth: 0,
    pendingEffects: new Set(),
    isFlushing: false,
    maxIterations: opts?.maxIterations ?? 100,
  };
}
