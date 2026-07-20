export interface MediaTier {
  /** Minimum number of terminal columns for this tier to apply. */
  cols: number;
  /** Equivalent browser pixel width for emitting `@media` queries. 0 means implicit base tier. */
  browserPx?: number;
}

export interface MediaContract {
  /** Stable contract identifier (e.g. 'pane', 'window'). */
  name: string;
  /**
   * Ordered tier table keyed by tier name. Order matters: tiers must be
   * sorted ascending by `cols`. The first tier should typically have
   * `cols: 0` to act as the base.
   */
  tiers: Record<string, MediaTier>;
}

let activeContracts: Map<string, MediaContract> = new Map();

/**
 * Validate and normalize a media contract definition. Throws on invalid
 * input rather than silently coercing — contracts ship the design language.
 */
export function defineMediaContract(contract: MediaContract): MediaContract {
  if (!contract.name) {
    throw new Error('Media contract requires a non-empty name.');
  }
  const tierNames = Object.keys(contract.tiers);
  if (tierNames.length === 0) {
    throw new Error(`Media contract "${contract.name}" must define at least one tier.`);
  }

  let lastCols = -Infinity;
  for (const name of tierNames) {
    const tier = contract.tiers[name]!;
    if (typeof tier.cols !== 'number' || !Number.isFinite(tier.cols) || tier.cols < 0) {
      throw new Error(`Media contract "${contract.name}" tier "${name}" has invalid cols: ${tier.cols}.`);
    }
    if (tier.cols < lastCols) {
      throw new Error(`Media contract "${contract.name}" tiers must be sorted ascending by cols (tier "${name}" out of order).`);
    }
    if (tier.browserPx !== undefined) {
      if (!Number.isFinite(tier.browserPx) || tier.browserPx < 0) {
        throw new Error(`Media contract "${contract.name}" tier "${name}" has invalid browserPx: ${tier.browserPx}.`);
      }
    }
    lastCols = tier.cols;
  }

  return contract;
}

/**
 * Register a contract as the active one for its `name` (write-once per name).
 * Calling again with the same name throws to make accidental redefinitions loud.
 */
export function setActiveMediaContract(contract: MediaContract): void {
  defineMediaContract(contract);
  if (activeContracts.has(contract.name)) {
    const existing = activeContracts.get(contract.name)!;
    if (existing === contract) return;
    throw new Error(`Media contract "${contract.name}" is already registered. Clear it first to replace.`);
  }
  activeContracts.set(contract.name, contract);
}

export function getActiveMediaContract(name: string): MediaContract | null {
  return activeContracts.get(name) ?? null;
}

/** Test-only: clear all active contracts. */
export function clearActiveMediaContracts(): void {
  activeContracts = new Map();
}

/**
 * Pick the highest tier in `contract` whose `cols` is `<= cols`. Returns
 * `null` if no tier qualifies (i.e. cols are below the smallest tier).
 */
export function matchTier(contract: MediaContract, cols: number): { name: string; tier: MediaTier } | null {
  const entries = Object.entries(contract.tiers);
  let best: { name: string; tier: MediaTier } | null = null;
  for (const [name, tier] of entries) {
    if (cols >= tier.cols) {
      best = { name, tier };
    }
  }
  return best;
}

/**
 * Emit one `@media (min-width: NNNpx)` rule per non-zero `browserPx` tier.
 * The implicit `0` tier is skipped because its rules belong in the base CSS.
 * Each rule wraps a body produced by the caller.
 */
export function emitContractMediaQueries(contract: MediaContract, body: (tierName: string, tier: MediaTier) => string): string {
  const out: string[] = [];
  for (const [name, tier] of Object.entries(contract.tiers)) {
    if (!tier.browserPx || tier.browserPx <= 0) continue;
    const rule = `@media (min-width: ${tier.browserPx}px) {\n${body(name, tier)}\n}`;
    out.push(rule);
  }
  return out.join('\n');
}
