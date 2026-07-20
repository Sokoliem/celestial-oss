/**
 * Focus system for Horizon pane management.
 *
 * Provides focus tracking, tab-order navigation, directional navigation,
 * focus trapping (for modals/dialogs), and focus restoration.
 *
 * All functions are pure — the original model is never mutated.
 */

import type { LayoutPlan, LayoutRect } from '@celestial/core/nebula';
import type { PaneGeometry } from './primitives/geometry.js';
import { type StateUpdateResult, stateUpdateResult } from './state/update.js';

// --- Shared Types ---

/** A unique pane identifier, matches VNode layoutId */
export type PaneId = string;

/** Direction for spatial navigation */
export type Direction = 'up' | 'down' | 'left' | 'right';

// --- Model Types ---

/** Directional neighbors for spatial navigation */
export interface DirectionalNeighbors {
  readonly up: PaneId | null;
  readonly down: PaneId | null;
  readonly left: PaneId | null;
  readonly right: PaneId | null;
}

/** A focus trap restricts navigation to a subset of panes (e.g., modal dialogs) */
export interface FocusTrap {
  readonly id: string;
  readonly paneIds: readonly PaneId[];
  readonly initialFocusId: PaneId | null;
  readonly wrapAround: boolean;
}

/** The focus model tracks which pane is focused, navigation order, and trap state */
export interface FocusModel {
  readonly focusedId: PaneId | null;
  /** Restoration stack — most recent last, capped at maxHistory */
  readonly history: readonly PaneId[];
  readonly maxHistory: number;
  /** Sequential navigation order for Tab/Shift+Tab */
  readonly tabOrder: readonly PaneId[];
  /** Modal/dialog restriction stack */
  readonly traps: readonly FocusTrap[];
  /** Spatial adjacency map for directional navigation */
  readonly navMap: Readonly<Record<PaneId, DirectionalNeighbors>>;
}

// --- Messages ---

/** Discriminated union of all focus messages */
export type FocusMsg =
  | { readonly type: 'focus'; readonly id: PaneId }
  | { readonly type: 'blur' }
  | { readonly type: 'focus-next' }
  | { readonly type: 'focus-prev' }
  | { readonly type: 'focus-direction'; readonly direction: Direction }
  | { readonly type: 'focus-push-trap'; readonly trap: FocusTrap }
  | { readonly type: 'focus-pop-trap'; readonly trapId?: string }
  | { readonly type: 'focus-restore' }
  | { readonly type: 'focus-set-tab-order'; readonly paneIds: readonly PaneId[] }
  | { readonly type: 'focus-set-nav-map'; readonly navMap: Readonly<Record<PaneId, DirectionalNeighbors>> };

// --- Factory ---

/** Create a new FocusModel with optional initial configuration */
export function createFocusModel(opts?: { initialFocusId?: PaneId; tabOrder?: PaneId[]; maxHistory?: number }): FocusModel {
  return {
    focusedId: opts?.initialFocusId ?? null,
    history: [],
    maxHistory: opts?.maxHistory ?? 32,
    tabOrder: opts?.tabOrder ? [...opts.tabOrder] : [],
    traps: [],
    navMap: {},
  };
}

// --- Internal helpers ---

/**
 * Push an id to the history stack, respecting the maxHistory cap.
 * Returns a new array — never mutates the original.
 */
function pushHistory(history: readonly PaneId[], id: PaneId, maxHistory: number): readonly PaneId[] {
  const next = [...history, id];
  if (next.length > maxHistory) {
    return next.slice(next.length - maxHistory);
  }
  return next;
}

/**
 * Get the navigable pane IDs considering the active trap.
 * Returns the intersection of tabOrder and the topmost trap's paneIds,
 * preserving tabOrder ordering.
 */
function computeNavigableIds(model: FocusModel): readonly PaneId[] {
  if (model.traps.length === 0) {
    return model.tabOrder;
  }
  const trap = model.traps[model.traps.length - 1]!;
  const trapSet = new Set(trap.paneIds);
  return model.tabOrder.filter((id) => trapSet.has(id));
}

/**
 * Check whether the given id is allowed by the active trap boundary.
 * If no traps are active, all ids are allowed.
 */
function isAllowedByTrap(model: FocusModel, id: PaneId): boolean {
  if (model.traps.length === 0) return true;
  const trap = model.traps[model.traps.length - 1]!;
  return trap.paneIds.includes(id);
}

/**
 * Get the wrapAround setting from the active trap, or true (default) if not trapped.
 */
function getWrapAround(model: FocusModel): boolean {
  if (model.traps.length === 0) return true;
  return model.traps[model.traps.length - 1]!.wrapAround;
}

// --- Reducer ---

/** Pure reducer — processes a FocusMsg and returns a new FocusModel */
export function focusUpdate(msg: FocusMsg, model: FocusModel): FocusModel {
  switch (msg.type) {
    case 'focus':
      return handleFocus(msg.id, model);
    case 'blur':
      return handleBlur(model);
    case 'focus-next':
      return handleFocusNext(model);
    case 'focus-prev':
      return handleFocusPrev(model);
    case 'focus-direction':
      return handleFocusDirection(msg.direction, model);
    case 'focus-push-trap':
      return handlePushTrap(msg.trap, model);
    case 'focus-pop-trap':
      return handlePopTrap(msg.trapId, model);
    case 'focus-restore':
      return handleRestore(model);
    case 'focus-set-tab-order':
      return { ...model, tabOrder: [...msg.paneIds] };
    case 'focus-set-nav-map':
      return { ...model, navMap: msg.navMap };
  }
}

export function focusUpdateResult(msg: FocusMsg, model: FocusModel): StateUpdateResult<FocusModel> {
  return stateUpdateResult(focusUpdate(msg, model));
}

function handleFocus(id: PaneId, model: FocusModel): FocusModel {
  // Validate against trap boundary
  if (!isAllowedByTrap(model, id)) {
    return model;
  }
  const history = model.focusedId != null ? pushHistory(model.history, model.focusedId, model.maxHistory) : model.history;
  return { ...model, focusedId: id, history };
}

function handleBlur(model: FocusModel): FocusModel {
  const history = model.focusedId != null ? pushHistory(model.history, model.focusedId, model.maxHistory) : model.history;
  return { ...model, focusedId: null, history };
}

function handleFocusNext(model: FocusModel): FocusModel {
  const navigable = computeNavigableIds(model);
  if (navigable.length === 0) return model;

  // If currently unfocused, focus the first navigable pane
  if (model.focusedId == null) {
    return { ...model, focusedId: navigable[0]! };
  }

  const currentIdx = navigable.indexOf(model.focusedId);
  if (currentIdx === -1) {
    // Current focus not in navigable set — focus first
    return { ...model, focusedId: navigable[0]! };
  }

  const wrapAround = getWrapAround(model);
  if (currentIdx === navigable.length - 1) {
    // At end
    if (!wrapAround) return model;
    const history = pushHistory(model.history, model.focusedId, model.maxHistory);
    return { ...model, focusedId: navigable[0]!, history };
  }

  const history = pushHistory(model.history, model.focusedId, model.maxHistory);
  return { ...model, focusedId: navigable[currentIdx + 1]!, history };
}

function handleFocusPrev(model: FocusModel): FocusModel {
  const navigable = computeNavigableIds(model);
  if (navigable.length === 0) return model;

  // If currently unfocused, focus the last navigable pane
  if (model.focusedId == null) {
    return { ...model, focusedId: navigable[navigable.length - 1]! };
  }

  const currentIdx = navigable.indexOf(model.focusedId);
  if (currentIdx === -1) {
    // Current focus not in navigable set — focus last
    return { ...model, focusedId: navigable[navigable.length - 1]! };
  }

  const wrapAround = getWrapAround(model);
  if (currentIdx === 0) {
    // At beginning
    if (!wrapAround) return model;
    const history = pushHistory(model.history, model.focusedId, model.maxHistory);
    return { ...model, focusedId: navigable[navigable.length - 1]!, history };
  }

  const history = pushHistory(model.history, model.focusedId, model.maxHistory);
  return { ...model, focusedId: navigable[currentIdx - 1]!, history };
}

function handleFocusDirection(direction: Direction, model: FocusModel): FocusModel {
  if (model.focusedId == null) return model;

  const neighbors = model.navMap[model.focusedId];
  if (!neighbors) return model;

  const targetId = neighbors[direction];
  if (targetId == null) return model;

  // Validate against trap boundary
  if (!isAllowedByTrap(model, targetId)) return model;

  const history = pushHistory(model.history, model.focusedId, model.maxHistory);
  return { ...model, focusedId: targetId, history };
}

function handlePushTrap(trap: FocusTrap, model: FocusModel): FocusModel {
  const history = model.focusedId != null ? pushHistory(model.history, model.focusedId, model.maxHistory) : model.history;
  return {
    ...model,
    traps: [...model.traps, trap],
    focusedId: trap.initialFocusId,
    history,
  };
}

function handlePopTrap(trapId: string | undefined, model: FocusModel): FocusModel {
  if (model.traps.length === 0) return model;

  let newTraps: readonly FocusTrap[];
  if (trapId != null) {
    // Pop specific trap by id
    const idx = model.traps.findIndex((t) => t.id === trapId);
    if (idx === -1) return model;
    newTraps = [...model.traps.slice(0, idx), ...model.traps.slice(idx + 1)];
  } else {
    // Pop topmost
    newTraps = model.traps.slice(0, -1);
  }

  // Restore focus from history, skipping IDs not in the new navigable set
  const tempModel: FocusModel = { ...model, traps: newTraps };
  const navigable = computeNavigableIds(tempModel);
  const navigableSet = new Set(navigable);

  let restoredId: PaneId | null = null;
  const newHistory = [...model.history];
  while (newHistory.length > 0) {
    const candidate = newHistory.pop()!;
    const isNavigable = tempModel.tabOrder.length === 0 || navigableSet.has(candidate);
    const allowed = (newTraps.length === 0 || isAllowedByTrap(tempModel, candidate)) && isNavigable;

    if (allowed) {
      restoredId = candidate;
      break;
    }
  }

  // If history is exhausted with no navigable candidate, fall back to the
  // first navigable pane so the UI is never left with no focused element.
  if (restoredId === null) {
    restoredId = navigable[0] ?? null;
  }

  return {
    ...tempModel,
    focusedId: restoredId,
    history: newHistory,
  };
}

function handleRestore(model: FocusModel): FocusModel {
  const navigable = computeNavigableIds(model);
  const navigableSet = new Set(navigable);

  let restoredId: PaneId | null = null;
  const newHistory = [...model.history];
  while (newHistory.length > 0) {
    const candidate = newHistory.pop()!;
    const isNavigable = model.tabOrder.length === 0 || navigableSet.has(candidate);
    const allowed = (model.traps.length === 0 || isAllowedByTrap(model, candidate)) && isNavigable;
    if (allowed) {
      restoredId = candidate;
      break;
    }
  }

  return { ...model, focusedId: restoredId, history: newHistory };
}

// --- Query Functions ---

/** Get the currently focused pane ID, or null if nothing is focused */
export function getFocusedId(model: FocusModel): PaneId | null {
  return model.focusedId;
}

/** Check whether the given pane is currently focused */
export function isFocused(model: FocusModel, id: PaneId): boolean {
  return model.focusedId === id;
}

/** Get the focus history stack (most recent last) */
export function getFocusHistory(model: FocusModel): readonly PaneId[] {
  return model.history;
}

/** Get the current tab order */
export function getTabOrder(model: FocusModel): readonly PaneId[] {
  return model.tabOrder;
}

/** Check whether focus is currently trapped */
export function isTrapped(model: FocusModel): boolean {
  return model.traps.length > 0;
}

/** Get the active (topmost) trap, or null if not trapped */
export function getActiveTrapBoundary(model: FocusModel): FocusTrap | null {
  if (model.traps.length === 0) return null;
  return model.traps[model.traps.length - 1]!;
}

/** Get the neighbor of a pane in the given direction, or null */
export function getNeighbor(model: FocusModel, id: PaneId, direction: Direction): PaneId | null {
  const neighbors = model.navMap[id];
  if (!neighbors) return null;
  return neighbors[direction];
}

/** Get the list of currently navigable pane IDs (respecting active trap) */
export function getNavigableIds(model: FocusModel): readonly PaneId[] {
  return computeNavigableIds(model);
}

// --- Directional Navigation Builder ---

/** A pane with its positioned rectangle from layout */
export interface PaneRect extends PaneGeometry {
  readonly rect: LayoutRect;
}

/**
 * Build a directional adjacency map from positioned pane rectangles.
 *
 * For each pane, finds the nearest neighbor in each direction:
 * 1. Filter candidates strictly in that direction
 * 2. Prefer candidates with cross-axis overlap
 * 3. Break ties by edge distance, then center-to-center distance
 */
export function buildNavMap(panes: readonly PaneRect[]): Readonly<Record<PaneId, DirectionalNeighbors>> {
  const result: Record<PaneId, DirectionalNeighbors> = {};

  for (const pane of panes) {
    result[pane.id] = {
      up: findNeighbor(pane, panes, 'up'),
      down: findNeighbor(pane, panes, 'down'),
      left: findNeighbor(pane, panes, 'left'),
      right: findNeighbor(pane, panes, 'right'),
    };
  }

  return result;
}

function findNeighbor(source: PaneRect, panes: readonly PaneRect[], direction: Direction): PaneId | null {
  let bestId: PaneId | null = null;
  let bestHasOverlap = false;
  let bestEdgeDist = Infinity;
  let bestCenterDist = Infinity;

  const sx = source.rect.x;
  const sy = source.rect.y;
  const sw = source.rect.width;
  const sh = source.rect.height;
  const sCenterX = sx + sw / 2;
  const sCenterY = sy + sh / 2;

  for (const candidate of panes) {
    if (candidate.id === source.id) continue;

    const cx = candidate.rect.x;
    const cy = candidate.rect.y;
    const cw = candidate.rect.width;
    const ch = candidate.rect.height;

    // Step 1: Filter strictly in the given direction
    let edgeDist: number;
    let hasOverlap: boolean;

    switch (direction) {
      case 'up':
        // Candidate's bottom edge must be at or above source's top edge
        if (cy + ch > sy) continue;
        edgeDist = sy - (cy + ch);
        // Cross-axis overlap: horizontal
        hasOverlap = rangesOverlap(sx, sx + sw, cx, cx + cw);
        break;
      case 'down':
        // Candidate's top edge must be at or below source's bottom edge
        if (cy < sy + sh) continue;
        edgeDist = cy - (sy + sh);
        hasOverlap = rangesOverlap(sx, sx + sw, cx, cx + cw);
        break;
      case 'left':
        // Candidate's right edge must be at or left of source's left edge
        if (cx + cw > sx) continue;
        edgeDist = sx - (cx + cw);
        // Cross-axis overlap: vertical
        hasOverlap = rangesOverlap(sy, sy + sh, cy, cy + ch);
        break;
      case 'right':
        // Candidate's left edge must be at or right of source's right edge
        if (cx < sx + sw) continue;
        edgeDist = cx - (sx + sw);
        hasOverlap = rangesOverlap(sy, sy + sh, cy, cy + ch);
        break;
    }

    const cCenterX = cx + cw / 2;
    const cCenterY = cy + ch / 2;
    const centerDist = Math.sqrt((sCenterX - cCenterX) ** 2 + (sCenterY - cCenterY) ** 2);

    // Step 2: Prefer overlap, then edge distance, then center distance
    if (bestId == null) {
      bestId = candidate.id;
      bestHasOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }

    // Prefer candidates with cross-axis overlap
    if (hasOverlap && !bestHasOverlap) {
      bestId = candidate.id;
      bestHasOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }
    if (!hasOverlap && bestHasOverlap) {
      continue;
    }

    // Both have same overlap status — compare edge distance
    if (edgeDist < bestEdgeDist) {
      bestId = candidate.id;
      bestHasOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
      continue;
    }
    if (edgeDist > bestEdgeDist) {
      continue;
    }

    // Same edge distance — compare center distance
    if (centerDist < bestCenterDist) {
      bestId = candidate.id;
      bestHasOverlap = hasOverlap;
      bestEdgeDist = edgeDist;
      bestCenterDist = centerDist;
    }
  }

  return bestId;
}

/** Check whether two 1D ranges [a1, a2) and [b1, b2) overlap */
function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/**
 * Extract positioned rectangles for the given pane IDs from a LayoutPlan.
 * Looks up each ID in `plan.index` (keyed by layoutId).
 * Skips IDs that are not found.
 */
export function extractPaneRects(plan: LayoutPlan, paneIds: readonly PaneId[]): PaneRect[] {
  const result: PaneRect[] = [];
  for (const id of paneIds) {
    const entry = plan.index.get(id);
    if (entry) {
      result.push({ id, rect: entry.rect });
    }
  }
  return result;
}
