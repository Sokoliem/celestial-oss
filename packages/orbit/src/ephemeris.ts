/**
 * Minimal duck-typed contract orbit accepts for emitting events to an
 * external causal event ledger.
 *
 * The shape is deliberately a subset of `@celestial/ephemeris`'
 * `EphemerisStore.append`. We don't import the package directly — that
 * would invert the framework-package dependency direction (a Layer-5 forms
 * package taking a Layer-5 ledger dep). Consumers that already use
 * `@celestial/ephemeris` pass its store straight in; consumers that don't
 * can implement the two-method contract trivially.
 */
export interface EphemerisAppendInput {
  /** Stable event kind. Orbit emits `form:*` and `wizard:*` kinds. */
  readonly kind: string;
  /** Structured payload — typically the field name, value, and form id. */
  readonly payload?: Record<string, unknown>;
  /** Causal parent event ids, if known. */
  readonly causedBy?: readonly string[];
  /** Optional searchable tags. */
  readonly tags?: Record<string, string>;
}

export interface EphemerisAppendResult {
  readonly id: string;
}

/**
 * Subset of `@celestial/ephemeris`' EphemerisStore. Calls to `append` may
 * return synchronously OR as a promise; orbit treats both as fire-and-forget
 * so emission never blocks the form pipeline. Errors are swallowed in
 * `emitEphemeris` so a misbehaving ledger cannot break form interaction.
 */
export interface EphemerisStoreLike {
  append(input: EphemerisAppendInput): EphemerisAppendResult | Promise<EphemerisAppendResult>;
}

/**
 * Emit an event to the supplied ledger without ever throwing.
 * Returns a promise that always resolves — callers fire-and-forget.
 */
export async function emitEphemeris(
  store: EphemerisStoreLike | undefined,
  input: EphemerisAppendInput,
): Promise<void> {
  if (!store) return;
  try {
    await Promise.resolve(store.append(input));
  } catch {
    // Intentional: a broken ledger must not crash form interaction. The
    // host app is responsible for surfacing emission failures through its
    // own observability stack — orbit prefers correctness of the form
    // pipeline over completeness of the ledger.
  }
}
