// ─── Spatial Keyboard Navigation ────────────────────────────────────────────
// Pure state-machine for 2D spatial focus navigation.
// Algorithm adapted from horizon/focus.ts buildNavMap/findNeighbor.

export type SpatialDirection = 'up' | 'down' | 'left' | 'right';

export interface SpatialRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  disabled?: boolean;
}

export type SpatialNavMap = Readonly<
  Record<
    string,
    {
      up: string | null;
      down: string | null;
      left: string | null;
      right: string | null;
    }
  >
>;

export interface SpatialNavState {
  focusedId: string | null;
  navMap: SpatialNavMap;
}

export type SpatialNavMsg =
  | { type: 'spatial-focus'; id: string }
  | { type: 'spatial-move'; direction: SpatialDirection }
  | { type: 'spatial-activate' }
  | { type: 'spatial-blur' };

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true when the two 1D ranges [a1, a2) and [b1, b2) overlap. */
function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/** Euclidean distance between two points. */
function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find the best candidate in `direction` from `source` among `candidates`.
 *
 * Scoring priority:
 *  1. Filter candidates strictly in the given direction.
 *  2. Prefer candidates with cross-axis overlap.
 *  3. Break ties by edge distance (closer edge wins).
 *  4. Break edge-distance ties by center-to-center distance.
 */
function bestCandidate(source: SpatialRegion, direction: SpatialDirection, candidates: readonly SpatialRegion[]): string | null {
  const srcRight = source.x + source.width;
  const srcBottom = source.y + source.height;
  const srcCx = source.x + source.width / 2;
  const srcCy = source.y + source.height / 2;

  let bestId: string | null = null;
  let bestOverlap = false;
  let bestEdgeDist = Infinity;
  let bestCenterDist = Infinity;

  for (const c of candidates) {
    if (c.id === source.id || c.disabled) continue;

    const cRight = c.x + c.width;
    const cBottom = c.y + c.height;

    // 1. Filter strictly in direction
    let inDirection: boolean;
    let edgeDist: number;
    let hasOverlap: boolean;

    switch (direction) {
      case 'right':
        inDirection = c.x >= srcRight;
        edgeDist = c.x - srcRight;
        hasOverlap = rangesOverlap(source.y, srcBottom, c.y, cBottom);
        break;
      case 'left':
        inDirection = cRight <= source.x;
        edgeDist = source.x - cRight;
        hasOverlap = rangesOverlap(source.y, srcBottom, c.y, cBottom);
        break;
      case 'down':
        inDirection = c.y >= srcBottom;
        edgeDist = c.y - srcBottom;
        hasOverlap = rangesOverlap(source.x, srcRight, c.x, cRight);
        break;
      case 'up':
        inDirection = cBottom <= source.y;
        edgeDist = source.y - cBottom;
        hasOverlap = rangesOverlap(source.x, srcRight, c.x, cRight);
        break;
    }

    if (!inDirection) continue;

    const cCx = c.x + c.width / 2;
    const cCy = c.y + c.height / 2;
    const centerDist = dist(srcCx, srcCy, cCx, cCy);

    // 2. Prefer overlap > 3. edge distance > 4. center-to-center distance
    if (bestId === null) {
      bestId = c.id;
      bestOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }

    // Overlap beats no overlap
    if (hasOverlap && !bestOverlap) {
      bestId = c.id;
      bestOverlap = true;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }
    if (!hasOverlap && bestOverlap) continue;

    // Same overlap status — compare edge distance
    if (edgeDist < bestEdgeDist) {
      bestId = c.id;
      bestOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }
    if (edgeDist > bestEdgeDist) continue;

    // Same edge distance — compare center-to-center
    if (centerDist < bestCenterDist) {
      bestId = c.id;
      bestOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
    }
  }

  return bestId;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function createSpatialNavState(initialId?: string): SpatialNavState {
  return { focusedId: initialId ?? null, navMap: {} };
}

/**
 * Build a complete navigation map from a list of spatial regions.
 * Disabled regions are excluded from both sources and candidates.
 */
export function buildSpatialNavMap(regions: readonly SpatialRegion[]): SpatialNavMap {
  const active = regions.filter((r) => !r.disabled);
  const map: Record<string, { up: string | null; down: string | null; left: string | null; right: string | null }> = {};

  for (const region of active) {
    map[region.id] = {
      up: bestCandidate(region, 'up', active),
      down: bestCandidate(region, 'down', active),
      left: bestCandidate(region, 'left', active),
      right: bestCandidate(region, 'right', active),
    };
  }

  return map;
}

/** Pure reducer for spatial navigation state. */
export function spatialNavUpdate(msg: SpatialNavMsg, state: SpatialNavState): SpatialNavState {
  switch (msg.type) {
    case 'spatial-focus':
      return { ...state, focusedId: msg.id };

    case 'spatial-move': {
      if (state.focusedId === null) return state;
      const entry = state.navMap[state.focusedId];
      if (!entry) return state;
      const nextId = entry[msg.direction];
      if (nextId === null) return state;
      return { ...state, focusedId: nextId };
    }

    case 'spatial-activate':
      return state;

    case 'spatial-blur':
      return { ...state, focusedId: null };
  }
}

/**
 * Standalone one-off neighbor lookup without building the full map.
 * Returns null if sourceId is not found or no neighbor exists in that direction.
 */
export function findSpatialNeighbor(sourceId: string, direction: SpatialDirection, regions: readonly SpatialRegion[]): string | null {
  const source = regions.find((r) => r.id === sourceId && !r.disabled);
  if (!source) return null;
  const candidates = regions.filter((r) => !r.disabled);
  return bestCandidate(source, direction, candidates);
}
