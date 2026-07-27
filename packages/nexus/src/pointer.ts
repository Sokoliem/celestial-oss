// ─── Types ───────────────────────────────────────────────────────────────

import { isPointerCursor, type PointerCursor } from '@celestial/nebula';
import type { HitRegion } from './hitmap.js';

export type CursorType = PointerCursor;

export type CursorPriority = 'drag' | 'resize' | 'system' | 'region' | 'default';

export interface CursorClaim {
  cursor: CursorType;
  priority: CursorPriority;
  source: string;
  layerId?: string;
}

export interface PointerState {
  claims: CursorClaim[];
  resolved: CursorType;
}

export type PointerMsg =
  | { type: 'pointer-claim'; claim: CursorClaim }
  | { type: 'pointer-release'; source: string }
  | { type: 'pointer-release-priority'; priority: CursorPriority }
  | { type: 'pointer-clear' };

// ─── Priority Ranking ────────────────────────────────────────────────────

const PRIORITY_RANK: Record<CursorPriority, number> = {
  drag: 5,
  resize: 4,
  system: 3,
  region: 2,
  default: 1,
};
const CURSOR_PRIORITIES: ReadonlySet<string> = new Set<CursorPriority>(['drag', 'resize', 'system', 'region', 'default']);
const RESIZE_CURSORS: ReadonlySet<CursorType> = new Set([
  'e-resize',
  'ew-resize',
  'n-resize',
  'ne-resize',
  'nesw-resize',
  'ns-resize',
  'nw-resize',
  'nwse-resize',
  's-resize',
  'se-resize',
  'sw-resize',
  'w-resize',
]);
const MAX_CURSOR_CLAIMS = 256;

function isCursorClaim(value: unknown): value is CursorClaim {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<CursorClaim>;
  return (
    isPointerCursor(claim.cursor)
    && typeof claim.priority === 'string'
    && CURSOR_PRIORITIES.has(claim.priority)
    && typeof claim.source === 'string'
    && claim.source.length > 0
    && claim.source.length <= 512
    && (claim.layerId === undefined || (typeof claim.layerId === 'string' && claim.layerId.length <= 512))
  );
}

// ─── Resolution ──────────────────────────────────────────────────────────

function resolve(claims: CursorClaim[]): CursorType {
  if (claims.length === 0) return 'default';

  let highestRank = -1;
  let winner: CursorType = 'default';

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]!;
    const rank = PRIORITY_RANK[claim.priority];
    // >= so that later claims at the same priority win (last-added wins)
    if (rank >= highestRank) {
      highestRank = rank;
      winner = claim.cursor;
    }
  }

  return winner;
}

// ─── Factory ─────────────────────────────────────────────────────────────

export function createPointerState(): PointerState {
  return { claims: [], resolved: 'default' };
}

// ─── Reducer ─────────────────────────────────────────────────────────────

export function pointerUpdate(msg: PointerMsg, state: PointerState): PointerState {
  switch (msg.type) {
    case 'pointer-claim': {
      if (!isCursorClaim(msg.claim)) return state;
      // Remove any existing claim from the same source, then append the new one
      const filtered = state.claims.filter((c) => c.source !== msg.claim.source);
      const claims = [...filtered, { ...msg.claim }].slice(-MAX_CURSOR_CLAIMS);
      return { claims, resolved: resolve(claims) };
    }

    case 'pointer-release': {
      const claims = state.claims.filter((c) => c.source !== msg.source);
      return { claims, resolved: resolve(claims) };
    }

    case 'pointer-release-priority': {
      const claims = state.claims.filter((c) => c.priority !== msg.priority);
      return { claims, resolved: resolve(claims) };
    }

    case 'pointer-clear': {
      return { claims: [], resolved: 'default' };
    }
  }
}

// ─── Accessors ───────────────────────────────────────────────────────────

/** Convenience accessor — returns the currently resolved cursor. */
export function resolvedCursor(state: PointerState): CursorType {
  return state.resolved;
}

// ─── HitRegion Bridge ────────────────────────────────────────────────────

/**
 * Creates a CursorClaim from a HitRegion's cursor field.
 * Returns null if the region has no meaningful cursor override.
 *
 * @param source — unique identifier for the region (e.g., region id or coordinates).
 *   Defaults to 'hitregion'. Callers with multiple active regions MUST provide
 *   distinct sources to prevent claim collisions in PointerState.
 */
export function claimFromHitRegion<M>(region: HitRegion<M>, source: string = 'hitregion'): CursorClaim | null {
  if (!isPointerCursor(region.cursor) || region.cursor === 'default' || source.length === 0 || source.length > 512) return null;
  return {
    cursor: region.cursor,
    priority: RESIZE_CURSORS.has(region.cursor) ? 'resize' : region.cursor === 'grabbing' ? 'drag' : 'region',
    source,
  };
}
