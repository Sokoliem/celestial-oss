/**
 * Type-only declarations for the splitter controller. Lives in its own
 * module so consumers (notably `dock.ts`) can depend on the controller
 * shape without pulling in the runtime implementation in `splitter.ts`.
 *
 * The runtime factory + primitive live in `splitter.ts`.
 */

export interface SplitterPaneSnapshot<TId extends string = string> {
  readonly id: TId;
  readonly weight: number;
  readonly collapsed: boolean;
}

export interface SplitterSnapshot<TId extends string = string> {
  readonly version: 1;
  readonly panes: readonly SplitterPaneSnapshot<TId>[];
}

/**
 * Reactive controller for a `splitter()` instance. Holds the current
 * weight + collapsed state per pane, normalizes weights to sum to 1, and
 * notifies subscribers on change. Drag wiring is host-driven: the host
 * runs `resizeHandleUpdate` from `@celestial/nexus` and feeds the result
 * back through `setWeight` / `setCollapsed`.
 *
 * Persistence is the host's responsibility — the controller exposes
 * `serialize()` and `hydrate()`; gravity does not touch storage.
 */
export interface SplitterController<TId extends string = string> {
  /** Current normalized weight for a pane (0..1). */
  getWeight(id: TId): number;
  /** Set a pane's normalized weight. Other panes rescale to keep the sum at 1. */
  setWeight(id: TId, weight: number): void;
  /** Bulk update — replaces all weights atomically and renormalizes. */
  setWeights(weights: Readonly<Record<TId, number>>): void;
  /** Whether the pane is currently collapsed (snapped below threshold). */
  isCollapsed(id: TId): boolean;
  /** Force a pane open or collapsed. */
  setCollapsed(id: TId, collapsed: boolean): void;
  /** Reset all weights back to the initial spec. */
  reset(): void;
  /** Read the current ratios + collapsed state for persistence. */
  serialize(): SplitterSnapshot<TId>;
  /** Restore from a previously-serialized snapshot. */
  hydrate(snapshot: SplitterSnapshot<TId>): void;
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}
