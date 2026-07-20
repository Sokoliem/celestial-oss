/**
 * Horizon Constraint System
 *
 * Pure functional constraint model for pane sizing. Provides min/max
 * constraints, lock/collapse, snap-to-preferred-ratio, and priority-based
 * resolution. Integrates with SplitConfig and TileLayout.
 */

import type { PaneId } from './focus.js';
import type { SplitConfig } from './split.js';
import type { TileLayout } from './tile.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// PaneId is imported from focus.ts (canonical definition)
export type { PaneId } from './focus.js';

/** Size constraints for a single pane */
export interface PaneConstraint {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly locked: boolean;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly preferredRatio?: number;
  readonly priority: number;
}

/** Constraint model holding per-pane constraints and snap config */
export interface ConstraintModel {
  readonly constraints: Readonly<Record<PaneId, PaneConstraint>>;
  readonly snapThreshold: number;
}

/** Messages for the constraint reducer */
export type ConstraintMsg =
  | { readonly type: 'constraint-set'; readonly paneId: PaneId; readonly constraint: Partial<PaneConstraint> }
  | { readonly type: 'constraint-remove'; readonly paneId: PaneId }
  | { readonly type: 'constraint-lock'; readonly paneId: PaneId }
  | { readonly type: 'constraint-unlock'; readonly paneId: PaneId }
  | { readonly type: 'constraint-collapse'; readonly paneId: PaneId }
  | { readonly type: 'constraint-expand'; readonly paneId: PaneId }
  | { readonly type: 'constraint-toggle-collapse'; readonly paneId: PaneId }
  | { readonly type: 'constraint-set-snap-threshold'; readonly threshold: number };

/** Request passed to the constraint resolver for each pane */
export interface SizeRequest {
  readonly id: PaneId;
  readonly ratio: number;
  readonly min?: number;
  readonly max?: number;
  readonly locked: boolean;
  readonly collapsed: boolean;
  readonly preferredRatio?: number;
  readonly priority: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default constraint values for a pane with no overrides */
export const DEFAULT_CONSTRAINT: PaneConstraint = {
  locked: false,
  collapsible: false,
  collapsed: false,
  priority: 0,
};

const DEFAULT_SNAP_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new ConstraintModel with optional initial constraints */
export function createConstraintModel(opts?: { constraints?: Record<PaneId, Partial<PaneConstraint>>; snapThreshold?: number }): ConstraintModel {
  const raw = opts?.constraints ?? {};
  const constraints: Record<PaneId, PaneConstraint> = {};

  for (const [id, partial] of Object.entries(raw)) {
    constraints[id] = { ...DEFAULT_CONSTRAINT, ...partial };
  }

  return {
    constraints,
    snapThreshold: opts?.snapThreshold ?? DEFAULT_SNAP_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Pure reducer for constraint messages */
export function constraintUpdate(msg: ConstraintMsg, model: ConstraintModel): ConstraintModel {
  switch (msg.type) {
    case 'constraint-set': {
      const existing = model.constraints[msg.paneId] ?? DEFAULT_CONSTRAINT;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, ...msg.constraint },
        },
      };
    }

    case 'constraint-remove': {
      if (model.constraints[msg.paneId] === undefined) {
        return model;
      }
      const next = { ...model.constraints };
      delete next[msg.paneId];
      return { ...model, constraints: next };
    }

    case 'constraint-lock': {
      const existing = model.constraints[msg.paneId] ?? DEFAULT_CONSTRAINT;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, locked: true },
        },
      };
    }

    case 'constraint-unlock': {
      const existing = model.constraints[msg.paneId];
      if (existing === undefined) return model;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, locked: false },
        },
      };
    }

    case 'constraint-collapse': {
      const existing = model.constraints[msg.paneId];
      if (existing === undefined || !existing.collapsible) return model;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, collapsed: true },
        },
      };
    }

    case 'constraint-expand': {
      const existing = model.constraints[msg.paneId];
      if (existing === undefined) return model;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, collapsed: false },
        },
      };
    }

    case 'constraint-toggle-collapse': {
      const existing = model.constraints[msg.paneId];
      if (existing === undefined || !existing.collapsible) return model;
      return {
        ...model,
        constraints: {
          ...model.constraints,
          [msg.paneId]: { ...existing, collapsed: !existing.collapsed },
        },
      };
    }

    case 'constraint-set-snap-threshold': {
      return { ...model, snapThreshold: msg.threshold };
    }
  }
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/** Get the constraint for a pane, or undefined if none */
export function getConstraint(model: ConstraintModel, paneId: PaneId): PaneConstraint | undefined {
  return model.constraints[paneId];
}

/** Whether a pane is locked */
export function isLocked(model: ConstraintModel, paneId: PaneId): boolean {
  return model.constraints[paneId]?.locked ?? false;
}

/** Whether a pane is currently collapsed */
export function isCollapsed(model: ConstraintModel, paneId: PaneId): boolean {
  return model.constraints[paneId]?.collapsed ?? false;
}

/** Whether a pane is collapsible */
export function isCollapsible(model: ConstraintModel, paneId: PaneId): boolean {
  return model.constraints[paneId]?.collapsible ?? false;
}

// ---------------------------------------------------------------------------
// Constraint Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve size constraints for a set of pane requests within available space.
 *
 * Algorithm:
 * 1. Collapsed panes get 0 size
 * 2. Proportional allocation based on ratios
 * 3. Snap to preferredRatio when within threshold
 * 4. Iterative clamping (max 10 iterations): clamp to min/max by priority,
 *    redistribute excess among unclamped
 * 5. Rounding correction on largest pane
 * 6. Report violations
 */
export function resolveConstraints(
  requests: readonly SizeRequest[],
  availableSpace: number,
  snapThreshold: number,
): { sizes: readonly { id: PaneId; size: number }[]; violations: readonly PaneId[] } {
  if (requests.length === 0) {
    return { sizes: [], violations: [] };
  }

  // Step 1: Separate collapsed from active
  const collapsed: PaneId[] = [];
  const active: SizeRequest[] = [];

  for (const req of requests) {
    if (req.collapsed) {
      collapsed.push(req.id);
    } else {
      active.push(req);
    }
  }

  // If all collapsed, return zeros
  if (active.length === 0) {
    return {
      sizes: requests.map((r) => ({ id: r.id, size: 0 })),
      violations: [],
    };
  }

  // Step 2: Proportional allocation for active panes
  const totalRatio = active.reduce((sum, r) => sum + r.ratio, 0);
  const sizes = new Map<PaneId, number>();

  for (const req of active) {
    const normalizedRatio = totalRatio > 0 ? req.ratio / totalRatio : 1 / active.length;
    sizes.set(req.id, normalizedRatio * availableSpace);
  }

  // Step 3: Snap to preferredRatio when within threshold
  for (const req of active) {
    if (req.preferredRatio !== undefined) {
      const preferredSize = req.preferredRatio * availableSpace;
      const currentSize = sizes.get(req.id)!;
      if (Math.abs(currentSize - preferredSize) <= snapThreshold) {
        sizes.set(req.id, preferredSize);
      }
    }
  }

  // After snapping, redistribute to maintain total = availableSpace
  // Recalculate: snapped panes are "fixed", unsnapped get proportional remainder
  const snappedIds = new Set<PaneId>();
  for (const req of active) {
    if (req.preferredRatio !== undefined) {
      const preferredSize = req.preferredRatio * availableSpace;
      const currentSize = sizes.get(req.id)!;
      if (currentSize === preferredSize) {
        snappedIds.add(req.id);
      }
    }
  }

  if (snappedIds.size > 0 && snappedIds.size < active.length) {
    let snappedTotal = 0;
    for (const id of snappedIds) {
      snappedTotal += sizes.get(id)!;
    }
    const remaining = availableSpace - snappedTotal;
    const unsnapped = active.filter((r) => !snappedIds.has(r.id));
    const unsnappedRatioTotal = unsnapped.reduce((s, r) => s + r.ratio, 0);
    for (const req of unsnapped) {
      const normalizedRatio = unsnappedRatioTotal > 0 ? req.ratio / unsnappedRatioTotal : 1 / unsnapped.length;
      sizes.set(req.id, normalizedRatio * remaining);
    }
  }

  // Step 4: Iterative clamping by priority
  // Sort active requests by priority descending for clamping order
  const byPriority = [...active].sort((a, b) => b.priority - a.priority);
  const clamped = new Set<PaneId>();
  const skipped = new Set<PaneId>();
  const MAX_ITERATIONS = 10;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;

    for (const req of byPriority) {
      if (clamped.has(req.id) || skipped.has(req.id)) continue;

      const currentSize = sizes.get(req.id)!;
      let newSize = currentSize;

      if (req.min !== undefined && currentSize < req.min) {
        newSize = req.min;
      }
      if (req.max !== undefined && currentSize > req.max) {
        newSize = req.max;
      }
      if (req.locked) {
        // Locked panes keep their proportional size (already set)
        newSize = currentSize;
      }

      if (newSize !== currentSize) {
        // Check if redistribution is possible before clamping
        const unclamped = active.filter((r) => !clamped.has(r.id) && !skipped.has(r.id) && r.id !== req.id);
        if (unclamped.length === 0) {
          // No panes to absorb the difference; skip clamping (will be a violation)
          skipped.add(req.id);
          continue;
        }

        // Check if clamping would cause same-or-higher-priority peers to violate their mins
        const excess = currentSize - newSize; // negative when expanding to min
        const unclampedTotal = unclamped.reduce((s, r) => s + sizes.get(r.id)!, 0);
        let wouldViolate = false;

        if (excess < 0) {
          // We need to take space from unclamped panes
          for (const ur of unclamped) {
            const share = unclampedTotal > 0 ? sizes.get(ur.id)! / unclampedTotal : 1 / unclamped.length;
            const newPeerSize = sizes.get(ur.id)! + excess * share;
            // Only block if the peer has a min at same or higher priority
            if (ur.min !== undefined && ur.priority >= req.priority && newPeerSize < ur.min) {
              wouldViolate = true;
              break;
            }
          }
        }

        if (wouldViolate) {
          // Clamping this pane would violate a same-or-higher-priority peer; skip
          skipped.add(req.id);
          continue;
        }

        sizes.set(req.id, newSize);
        clamped.add(req.id);
        changed = true;

        // Compute proportional shares for ALL unclamped peers before applying any updates
        const shares = unclamped.map((ur) => ({
          id: ur.id,
          share: unclampedTotal > 0 ? sizes.get(ur.id)! / unclampedTotal : 1 / unclamped.length,
        }));
        for (const s of shares) {
          sizes.set(s.id, sizes.get(s.id)! + excess * s.share);
        }
      }
    }

    if (!changed) break;
  }

  // Step 5: Round to integers and apply rounding correction
  const roundedSizes = new Map<PaneId, number>();
  let roundedTotal = 0;

  for (const req of active) {
    const rounded = Math.round(sizes.get(req.id)!);
    roundedSizes.set(req.id, rounded);
    roundedTotal += rounded;
  }

  // Apply rounding correction to the largest pane
  const diff = availableSpace - roundedTotal;
  if (diff !== 0) {
    let largestId: PaneId | null = null;
    let largestSize = -1;
    for (const req of active) {
      const s = roundedSizes.get(req.id)!;
      if (s > largestSize) {
        largestSize = s;
        largestId = req.id;
      }
    }
    if (largestId !== null) {
      roundedSizes.set(largestId, roundedSizes.get(largestId)! + diff);
    }
  }

  // Step 6: Detect violations
  const violations: PaneId[] = [];
  for (const req of active) {
    const finalSize = roundedSizes.get(req.id)!;
    if (req.min !== undefined && finalSize < req.min) {
      violations.push(req.id);
    } else if (req.max !== undefined && finalSize > req.max) {
      violations.push(req.id);
    }
  }

  // Build result maintaining original request order
  const result: { id: PaneId; size: number }[] = requests.map((req) => {
    if (req.collapsed) {
      return { id: req.id, size: 0 };
    }
    return { id: req.id, size: roundedSizes.get(req.id)! };
  });

  return { sizes: result, violations };
}

// ---------------------------------------------------------------------------
// Layout integration: Split
// ---------------------------------------------------------------------------

/**
 * Apply constraints to a SplitConfig, returning an adjusted config
 * with a new ratio that respects pane constraints.
 */
export function applySplitConstraints(
  config: SplitConfig,
  constraints: ConstraintModel,
  firstId: PaneId,
  secondId: PaneId,
  availableSpace: number,
): SplitConfig {
  const firstConstraint = constraints.constraints[firstId];
  const secondConstraint = constraints.constraints[secondId];

  // If no constraints on either pane, return unchanged
  if (firstConstraint === undefined && secondConstraint === undefined) {
    return config;
  }

  // Use the appropriate dimension for the split direction
  const isHorizontal = config.direction === 'horizontal';

  const firstRequest: SizeRequest = {
    id: firstId,
    ratio: config.ratio,
    min: firstConstraint ? (isHorizontal ? firstConstraint.minWidth : firstConstraint.minHeight) : undefined,
    max: firstConstraint ? (isHorizontal ? firstConstraint.maxWidth : firstConstraint.maxHeight) : undefined,
    locked: firstConstraint?.locked ?? false,
    collapsed: firstConstraint?.collapsed ?? false,
    preferredRatio: firstConstraint?.preferredRatio,
    priority: firstConstraint?.priority ?? 0,
  };

  const secondRequest: SizeRequest = {
    id: secondId,
    ratio: 1 - config.ratio,
    min: secondConstraint ? (isHorizontal ? secondConstraint.minWidth : secondConstraint.minHeight) : undefined,
    max: secondConstraint ? (isHorizontal ? secondConstraint.maxWidth : secondConstraint.maxHeight) : undefined,
    locked: secondConstraint?.locked ?? false,
    collapsed: secondConstraint?.collapsed ?? false,
    preferredRatio: secondConstraint?.preferredRatio,
    priority: secondConstraint?.priority ?? 0,
  };

  const resolved = resolveConstraints([firstRequest, secondRequest], availableSpace, constraints.snapThreshold);

  const firstSize = resolved.sizes[0]!.size;
  const newRatio = availableSpace > 0 ? firstSize / availableSpace : config.ratio;

  return {
    ...config,
    ratio: newRatio,
  };
}

// ---------------------------------------------------------------------------
// Layout integration: Tile
// ---------------------------------------------------------------------------

/**
 * Apply constraints recursively to a TileLayout, adjusting split
 * ratios based on pane constraints.
 */
export function applyTileConstraints(
  layout: TileLayout,
  constraints: ConstraintModel,
  width: number,
  height: number,
  getPaneId: (layout: TileLayout) => PaneId | null,
): TileLayout {
  if (layout.kind === 'leaf') {
    return layout;
  }

  // Recursively get the available space for each child
  const isHorizontal = layout.direction === 'horizontal';
  const availableSpace = isHorizontal ? width : height;

  // Collect pane IDs from each subtree to build requests
  const firstId = collectFirstPaneId(layout.first, getPaneId);
  const secondId = collectFirstPaneId(layout.second, getPaneId);

  let newRatio = layout.ratio;

  // Only adjust if we have identifiable panes
  if (firstId !== null || secondId !== null) {
    const firstConstraint = firstId !== null ? constraints.constraints[firstId] : undefined;
    const secondConstraint = secondId !== null ? constraints.constraints[secondId] : undefined;

    if (firstConstraint !== undefined || secondConstraint !== undefined) {
      const firstRequest: SizeRequest = {
        id: firstId ?? '__first__',
        ratio: layout.ratio,
        min: firstConstraint ? (isHorizontal ? firstConstraint.minWidth : firstConstraint.minHeight) : undefined,
        max: firstConstraint ? (isHorizontal ? firstConstraint.maxWidth : firstConstraint.maxHeight) : undefined,
        locked: firstConstraint?.locked ?? false,
        collapsed: firstConstraint?.collapsed ?? false,
        preferredRatio: firstConstraint?.preferredRatio,
        priority: firstConstraint?.priority ?? 0,
      };

      const secondRequest: SizeRequest = {
        id: secondId ?? '__second__',
        ratio: 1 - layout.ratio,
        min: secondConstraint ? (isHorizontal ? secondConstraint.minWidth : secondConstraint.minHeight) : undefined,
        max: secondConstraint ? (isHorizontal ? secondConstraint.maxWidth : secondConstraint.maxHeight) : undefined,
        locked: secondConstraint?.locked ?? false,
        collapsed: secondConstraint?.collapsed ?? false,
        preferredRatio: secondConstraint?.preferredRatio,
        priority: secondConstraint?.priority ?? 0,
      };

      const resolved = resolveConstraints([firstRequest, secondRequest], availableSpace, constraints.snapThreshold);

      const firstSize = resolved.sizes[0]!.size;
      newRatio = availableSpace > 0 ? firstSize / availableSpace : layout.ratio;
    }
  }

  // Compute child dimensions for recursive application
  const firstWidth = isHorizontal ? Math.round(width * newRatio) : width;
  const firstHeight = isHorizontal ? height : Math.round(height * newRatio);
  const secondWidth = isHorizontal ? width - firstWidth : width;
  const secondHeight = isHorizontal ? height : height - firstHeight;

  const adjustedFirst = applyTileConstraints(layout.first, constraints, firstWidth, firstHeight, getPaneId);
  const adjustedSecond = applyTileConstraints(layout.second, constraints, secondWidth, secondHeight, getPaneId);

  return {
    kind: 'split',
    direction: layout.direction,
    ratio: newRatio,
    first: adjustedFirst,
    second: adjustedSecond,
  };
}

/** Walk a TileLayout tree to find the first leaf's pane ID */
function collectFirstPaneId(layout: TileLayout, getPaneId: (layout: TileLayout) => PaneId | null): PaneId | null {
  if (layout.kind === 'leaf') {
    return getPaneId(layout);
  }
  return collectFirstPaneId(layout.first, getPaneId) ?? collectFirstPaneId(layout.second, getPaneId);
}
