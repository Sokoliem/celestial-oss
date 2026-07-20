/**
 * Minimal structural contract Orbit accepts for optional causal-event
 * emission. It is intentionally owned by Orbit so applications can connect
 * any ledger without adding another framework package to the public graph.
 */
export interface OrbitLedgerEvent {
  /** Stable event kind. Orbit emits `form:*` and `wizard:*` kinds. */
  readonly kind: string;
  /** Structured payload, typically including a field name and workflow id. */
  readonly payload?: Record<string, unknown>;
  /** Causal parent event ids, if known. */
  readonly causedBy?: readonly string[];
  /** Optional searchable tags. */
  readonly tags?: Record<string, string>;
}

export interface OrbitLedgerAppendResult {
  readonly id: string;
}

/**
 * Calls to `append` may return synchronously or as a promise. Orbit treats
 * both as fire-and-forget so event emission never blocks form interaction.
 */
export interface OrbitLedger {
  append(input: OrbitLedgerEvent): OrbitLedgerAppendResult | Promise<OrbitLedgerAppendResult>;
}

/**
 * Emit an event to the supplied ledger without ever throwing.
 * Returns a promise that always resolves so callers can safely fire-and-forget.
 */
export async function emitLedgerEvent(store: OrbitLedger | undefined, input: OrbitLedgerEvent): Promise<void> {
  if (!store) return;
  try {
    await Promise.resolve(store.append(input));
  } catch {
    // A broken ledger must not crash form interaction. The host app owns
    // observability for emission failures; Orbit preserves form correctness.
  }
}
