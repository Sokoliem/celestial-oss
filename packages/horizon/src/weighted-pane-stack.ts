/**
 * Horizon Weighted Pane Stack
 *
 * Multi-pane vertical (or horizontal) layout that distributes a fixed total
 * size across N panes by relative weight, with:
 *
 *   - per-pane `minSize` / `maxSize` clamping (with overflow redistribution)
 *   - `collapsible` / `collapsed` panes that yield 0 size and donate their
 *     weight to the remaining panes
 *   - resize-handle rows reserved *between* adjacent panes
 *   - a pure layout function (`getWeightedPaneStackLayout`) so hit-testing
 *     and gesture math can be written against the same coordinates the
 *     renderer uses (no double source of truth)
 *
 * This is the primitive the wrapper docked sidebar (`apps/claude-wrapper/
 * src/sidebar.ts`) had to hand-roll because `splitPane` is binary and
 * `panel` / `peek` are single-pane chrome. ADR 0047 records the placement
 * decision and the OQ-F-1 resolution.
 *
 * The render side (`weightedPaneStack`) is intentionally thin: it composes
 * a `column` of `flex` cells from the layout result, dropping in caller-
 * supplied resize-handle text rows verbatim so that hit-testing in the
 * consuming app can be wired through the same `nexus` paths used elsewhere.
 */

import { type Style, style } from '@celestial/core/corona';
import { box, type ColumnNode, type FlexNode, type RowNode, text, type VNode } from '@celestial/core/nebula';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PaneSpec<Model> {
  /** Stable id used for layout lookup, resize-handle wiring, and hit-tests. */
  id: string;
  /**
   * Relative weight (any positive number). The sum across *visible,
   * non-collapsed* panes is normalized — absolute values do not matter,
   * only ratios. Non-finite or non-positive weights are treated as 0.
   */
  weight: number;
  /** Minimum size (rows for vertical, cols for horizontal). Default: 0. */
  minSize?: number;
  /** Maximum size. Default: unbounded. */
  maxSize?: number;
  /** Whether the pane can be collapsed by user gesture (informational). */
  collapsible?: boolean;
  /** When true, the pane gets 0 size and donates its weight to siblings. */
  collapsed?: boolean;
  /** Pane body. Receives the consumer's model. */
  view: (model: Model) => VNode;
  /** Optional per-pane container style. */
  paneStyle?: Style;
}

export interface WeightedPaneStackConfig<Model, Msg> {
  panes: readonly PaneSpec<Model>[];
  /** Total available size (rows for vertical, cols for horizontal). */
  totalSize: number;
  /** Stack direction. Default: 'vertical'. */
  direction?: 'vertical' | 'horizontal';
  /**
   * Emit when the user has dragged a resize handle and a pane's normalized
   * weight should change. The handle's `betweenIds[0]` is the pane being
   * resized (the one *before* the handle).
   *
   * Type-erased here: weightedPaneStack is a renderer + layout primitive,
   * not a controller. The consumer wires the gesture → Msg path through
   * the layout coordinates returned by `getWeightedPaneStackLayout`. We
   * keep the field on the config so the primitive shape matches the
   * consumer's intent and future controller helpers can attach.
   */
  onResize?: (paneId: string, newWeight: number) => Msg;
  /**
   * Optional animation budget. Pure layout does not animate; consumers can
   * interpolate weights externally and pass interpolated values in.
   */
  animationDurationMs?: number;
  /** Character drawn on resize-handle rows. Default: '─' (vertical stack). */
  resizeHandleChar?: string;
  /** Resize-handle row style. Default: dim. */
  resizeHandleStyle?: Style;
}

/** A single pane's allocated range within the stack's coordinate space. */
export interface PaneRange {
  id: string;
  /** Inclusive start (0-based, in the stack's primary axis). */
  startRow: number;
  /** Exclusive end. `endRow - startRow === size`. */
  endRow: number;
  /** Size in primary-axis units (rows for vertical, cols for horizontal). */
  size: number;
  /** True if this pane was rendered as collapsed (size === 0). */
  collapsed: boolean;
}

/** A resize-handle row sits *between* two adjacent visible panes. */
export interface ResizeHandleRange {
  /** Primary-axis index of the handle row. */
  rowIndex: number;
  /** [paneBefore, paneAfter] — the two panes the handle resizes against. */
  betweenIds: [string, string];
}

export interface WeightedPaneStackLayout {
  paneRanges: readonly PaneRange[];
  resizeHandleRows: readonly ResizeHandleRange[];
  /** Sum of all pane sizes + handle rows. ≤ totalSize. */
  usedSize: number;
}

// ─── Pure layout math ─────────────────────────────────────────────────────

interface LayoutPaneInput {
  id: string;
  weight: number;
  minSize?: number;
  maxSize?: number;
  collapsed?: boolean;
}

const HANDLE_SIZE = 1;

function safeWeight(weight: number): number {
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

/**
 * Distribute `available` units across panes by weight, honoring per-pane
 * min/max clamps. Panes that hit their min/max are "frozen" at the clamp
 * and the remaining units are redistributed across the un-frozen panes.
 *
 * Returns one size per input pane in the same order. Collapsed panes are
 * expected to be pre-filtered (they get size 0 elsewhere).
 */
function distributeWithClamps(panes: readonly LayoutPaneInput[], available: number): number[] {
  const n = panes.length;
  if (n === 0 || available <= 0) {
    return panes.map(() => 0);
  }

  const sizes = new Array<number>(n).fill(0);
  const frozen = new Array<boolean>(n).fill(false);
  let remaining = available;

  // Iterative clamp-and-redistribute. Converges in ≤ n passes (each pass
  // freezes at least one pane or terminates).
  for (let pass = 0; pass < n + 1; pass += 1) {
    const liveIndices: number[] = [];
    let liveWeight = 0;
    for (let i = 0; i < n; i += 1) {
      if (!frozen[i]) {
        liveIndices.push(i);
        liveWeight += safeWeight(panes[i]!.weight);
      }
    }
    if (liveIndices.length === 0 || remaining <= 0) {
      break;
    }

    // Fallback: zero weight → distribute evenly across live panes.
    if (liveWeight <= 0) {
      const even = Math.floor(remaining / liveIndices.length);
      let rem = remaining - even * liveIndices.length;
      let changed = false;
      for (const i of liveIndices) {
        const share = even + (rem > 0 ? 1 : 0);
        rem = Math.max(0, rem - 1);
        const pane = panes[i]!;
        const min = pane.minSize ?? 0;
        const max = pane.maxSize ?? Number.POSITIVE_INFINITY;
        const clamped = Math.max(min, Math.min(max, share));
        if (clamped !== share && (clamped === min || clamped === max)) {
          sizes[i] = clamped;
          frozen[i] = true;
          remaining -= clamped;
          changed = true;
        } else {
          sizes[i] = share;
          remaining -= share;
        }
      }
      if (!changed) break;
      continue;
    }

    // Allocate by largest-remainder.
    const allocations = liveIndices.map((i) => {
      const w = safeWeight(panes[i]!.weight);
      const exact = (remaining * w) / liveWeight;
      const floor = Math.floor(exact);
      return { i, floor, frac: exact - floor };
    });
    let assigned = allocations.reduce((sum, a) => sum + a.floor, 0);
    let leftover = remaining - assigned;
    // Distribute leftover by descending fractional part.
    const sorted = [...allocations].sort((a, b) => b.frac - a.frac);
    for (const a of sorted) {
      if (leftover <= 0) break;
      a.floor += 1;
      leftover -= 1;
      assigned += 1;
    }

    // Now apply clamps. If any pane clamps, freeze it and loop.
    let clampedThisPass = false;
    for (const a of allocations) {
      const pane = panes[a.i]!;
      const min = pane.minSize ?? 0;
      const max = pane.maxSize ?? Number.POSITIVE_INFINITY;
      if (a.floor < min) {
        sizes[a.i] = min;
        frozen[a.i] = true;
        remaining -= min;
        clampedThisPass = true;
      } else if (a.floor > max) {
        sizes[a.i] = max;
        frozen[a.i] = true;
        remaining -= max;
        clampedThisPass = true;
      } else {
        sizes[a.i] = a.floor;
      }
    }

    if (!clampedThisPass) {
      // All live panes accepted their allocations; we're done.
      remaining = 0;
      break;
    }
  }

  return sizes;
}

/**
 * Compute pane ranges + resize-handle rows for a weighted stack.
 *
 * Pure — no rendering, no animation state. Safe to call from hit-tests,
 * gesture handlers, devtools, and the renderer; all consumers see the
 * same coordinates.
 */
export function getWeightedPaneStackLayout(
  panes: readonly LayoutPaneInput[],
  totalSize: number,
): WeightedPaneStackLayout {
  if (panes.length === 0 || totalSize <= 0) {
    return { paneRanges: [], resizeHandleRows: [], usedSize: 0 };
  }

  // Decide which panes are visible (non-collapsed). Collapsed panes get
  // size 0 but still appear in `paneRanges` so the consumer can position
  // chrome/headers consistently.
  const visibleIndices: number[] = [];
  for (let i = 0; i < panes.length; i += 1) {
    if (!panes[i]!.collapsed) visibleIndices.push(i);
  }

  // Reserve one row per adjacent-visible-pair for resize handles.
  const handleCount = Math.max(0, visibleIndices.length - 1);
  const availableForPanes = Math.max(0, totalSize - handleCount * HANDLE_SIZE);

  const visiblePanes = visibleIndices.map((i) => panes[i]!);
  const visibleSizes = distributeWithClamps(visiblePanes, availableForPanes);

  // Build final sizes (including 0 for collapsed panes).
  const sizes = new Array<number>(panes.length).fill(0);
  for (let k = 0; k < visibleIndices.length; k += 1) {
    sizes[visibleIndices[k]!] = visibleSizes[k] ?? 0;
  }

  // Walk panes in order, emitting pane ranges and handle rows between
  // adjacent visible panes.
  const paneRanges: PaneRange[] = [];
  const resizeHandleRows: ResizeHandleRange[] = [];
  let cursor = 0;
  let lastVisibleId: string | null = null;

  for (let i = 0; i < panes.length; i += 1) {
    const pane = panes[i]!;
    const isVisible = !pane.collapsed;
    if (isVisible && lastVisibleId !== null) {
      // Emit a handle row *before* this pane.
      resizeHandleRows.push({
        rowIndex: cursor,
        betweenIds: [lastVisibleId, pane.id],
      });
      cursor += HANDLE_SIZE;
    }
    const size = sizes[i] ?? 0;
    paneRanges.push({
      id: pane.id,
      startRow: cursor,
      endRow: cursor + size,
      size,
      collapsed: !isVisible || size === 0,
    });
    cursor += size;
    if (isVisible) lastVisibleId = pane.id;
  }

  return { paneRanges, resizeHandleRows, usedSize: cursor };
}

// ─── Renderer ─────────────────────────────────────────────────────────────

const DEFAULT_VERTICAL_HANDLE_CHAR = '─';
const DEFAULT_HORIZONTAL_HANDLE_CHAR = '│';

/**
 * Render a weighted pane stack as a column (vertical) or row (horizontal)
 * VNode. The layout is computed via `getWeightedPaneStackLayout`; the
 * renderer just composes `flex` cells with proportional `flex` weights so
 * downstream nebula layout produces the same allocation we computed.
 *
 * Consumers wanting precise hit-test coordinates should call
 * `getWeightedPaneStackLayout` directly and feed the result into their
 * `nexus` hitmap; the renderer keeps the same allocation by passing
 * `size`-derived `flex` values.
 */
export function weightedPaneStack<Model, Msg>(
  config: WeightedPaneStackConfig<Model, Msg>,
  model: Model,
): VNode {
  const direction = config.direction ?? 'vertical';
  const handleChar =
    config.resizeHandleChar ?? (direction === 'vertical' ? DEFAULT_VERTICAL_HANDLE_CHAR : DEFAULT_HORIZONTAL_HANDLE_CHAR);
  const handleStyle = config.resizeHandleStyle ?? style({ dim: true });

  const layoutInputs: LayoutPaneInput[] = config.panes.map((pane) => ({
    id: pane.id,
    weight: pane.weight,
    minSize: pane.minSize,
    maxSize: pane.maxSize,
    collapsed: pane.collapsed,
  }));
  const layout = getWeightedPaneStackLayout(layoutInputs, config.totalSize);

  const minProp: 'minHeight' | 'minWidth' = direction === 'vertical' ? 'minHeight' : 'minWidth';
  const handleNode: VNode = text(handleChar, handleStyle);

  // Walk panes in order, interleaving handle rows between visible panes.
  const children: VNode[] = [];
  let lastVisibleEmitted = false;
  for (let i = 0; i < config.panes.length; i += 1) {
    const pane = config.panes[i]!;
    const range = layout.paneRanges[i]!;
    const isVisible = !range.collapsed && range.size > 0;
    if (isVisible && lastVisibleEmitted) {
      children.push(handleNode);
    }
    if (isVisible) {
      const flexCell: FlexNode = {
        kind: 'flex',
        flex: Math.max(1, range.size),
        [minProp]: pane.minSize ?? 0,
        child: box(pane.view(model), pane.paneStyle, { overflow: 'hidden' }),
      };
      children.push(flexCell);
      lastVisibleEmitted = true;
    }
    // Collapsed panes contribute no children — the consumer renders their
    // chrome separately via the layout coordinates if needed.
  }

  if (direction === 'vertical') {
    const node: ColumnNode = { kind: 'column', children };
    return node;
  }
  const node: RowNode = { kind: 'row', children };
  return node;
}
