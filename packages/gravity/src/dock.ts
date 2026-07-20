import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { SplitterController } from './splitter-controller-types.js';
import type { ComponentNode, MeasurementContext, VNode } from './types.js';
import { resolveWeightedStack, type WeightedStackItem } from './weighted-stack.js';

/**
 * Width/height spec for a weighted dock edge. Measured-against the axis
 * remainder after subtracting intrinsic edges.
 */
export interface DockWeightSpec {
  /** Relative weight against the center pane (which always carries weight 1). */
  readonly weight: number;
  /** Minimum cells along the edge axis. */
  readonly min?: number;
  /** Maximum cells along the edge axis. */
  readonly max?: number;
}

export type DockEdgeSize = 'auto' | number | DockWeightSpec;

/**
 * Spec for a single docked edge. `size` controls how the edge consumes its
 * axis: `'auto'` measures the node's intrinsic size, a `number` pins it to
 * an exact cell count, and a `DockWeightSpec` gives it a share of the
 * remaining space.
 */
export interface DockEdgeSpec {
  readonly node: VNode;
  readonly size?: DockEdgeSize;
  /** Stable id used when emitting splitter handle hit-regions. */
  readonly id?: string;
  /**
   * Optional splitter controller; when present and `size` is a weight spec
   * AND `id` is set, dock will allocate the edge as a draggable seam by
   * routing through the controller (host wires drag via nexus).
   */
  readonly splitterController?: SplitterController;
}

export interface DockOptions {
  readonly top?: DockEdgeSpec;
  readonly bottom?: DockEdgeSpec;
  readonly left?: DockEdgeSpec;
  readonly right?: DockEdgeSpec;
  readonly center: VNode;
  /** Width spec for the center pane along the row axis (defaults to weight 1). */
  readonly centerMinWidth?: number;
  /** Height spec for the center pane along the column axis (defaults to weight 1). */
  readonly centerMinHeight?: number;
}

const CENTER_ID = '__dock_center__';

function normalizeSize(size: DockEdgeSize | undefined): { kind: 'auto' } | { kind: 'fixed'; value: number } | { kind: 'weighted'; spec: DockWeightSpec } {
  if (size === undefined || size === 'auto') return { kind: 'auto' };
  if (typeof size === 'number') return { kind: 'fixed', value: Math.max(0, Math.floor(size)) };
  return { kind: 'weighted', spec: size };
}

function measureEdgeIntrinsic(spec: DockEdgeSpec, axis: 'row' | 'column', context: MeasurementContext): number {
  const measured = measureNodeWithContext(spec.node, context);
  return axis === 'row' ? Math.max(0, measured.width) : Math.max(0, measured.height);
}

interface AxisLayout {
  readonly leadingSize: number;
  readonly trailingSize: number;
  readonly centerSize: number;
}

function resolveAxis(args: {
  available: number;
  leading?: DockEdgeSpec;
  trailing?: DockEdgeSpec;
  axis: 'row' | 'column';
  context: MeasurementContext;
  centerMinSize: number;
}): AxisLayout {
  const { available, leading, trailing, axis, context, centerMinSize } = args;

  const leadingSpec = leading ? normalizeSize(leading.size) : undefined;
  const trailingSpec = trailing ? normalizeSize(trailing.size) : undefined;

  let leadingFixed = 0;
  let trailingFixed = 0;

  if (leading && leadingSpec) {
    if (leadingSpec.kind === 'fixed') leadingFixed = leadingSpec.value;
    else if (leadingSpec.kind === 'auto') leadingFixed = measureEdgeIntrinsic(leading, axis, context);
  }
  if (trailing && trailingSpec) {
    if (trailingSpec.kind === 'fixed') trailingFixed = trailingSpec.value;
    else if (trailingSpec.kind === 'auto') trailingFixed = measureEdgeIntrinsic(trailing, axis, context);
  }

  const remainder = Math.max(0, available - leadingFixed - trailingFixed);

  // Build a weighted stack across [leading?, center, trailing?] for the axis
  // remainder. Center gets weight 1 by default.
  const items: WeightedStackItem[] = [];
  if (leading && leadingSpec?.kind === 'weighted') {
    items.push({
      id: 'leading',
      weight: Math.max(0, leadingSpec.spec.weight),
      minSize: leadingSpec.spec.min,
      maxSize: leadingSpec.spec.max,
    });
  }
  items.push({ id: CENTER_ID, weight: 1, minSize: centerMinSize });
  if (trailing && trailingSpec?.kind === 'weighted') {
    items.push({
      id: 'trailing',
      weight: Math.max(0, trailingSpec.spec.weight),
      minSize: trailingSpec.spec.min,
      maxSize: trailingSpec.spec.max,
    });
  }

  const layout = resolveWeightedStack({ items, size: remainder, gap: 0, minItemSize: 0 });

  let leadingWeighted = 0;
  let trailingWeighted = 0;
  let centerSize = 0;
  for (const entry of layout.entries) {
    if (entry.id === 'leading') leadingWeighted = entry.size;
    else if (entry.id === 'trailing') trailingWeighted = entry.size;
    else centerSize = entry.size;
  }

  return {
    leadingSize: leadingFixed + leadingWeighted,
    trailingSize: trailingFixed + trailingWeighted,
    centerSize,
  };
}

function paneBox(child: VNode, width: number, height: number): VNode {
  return {
    kind: 'box',
    width,
    height,
    overflow: 'hidden',
    children: [child],
  };
}

function maybeWrapWithEdgeRegion(spec: DockEdgeSpec | undefined, child: VNode, axis: 'row' | 'column'): VNode {
  if (!spec) return child;
  const sized = normalizeSize(spec.size);
  if (sized.kind !== 'weighted') return child;
  if (!spec.splitterController || !spec.id) return child;
  // Emit a region the host can wire through nexus. We do not own drag here;
  // gravity stays render-pure (matches the splitter primitive contract).
  return {
    kind: 'event',
    id: `dock:${spec.id}:handle`,
    child,
    handlers: {},
    metadata: {
      intent: 'drag',
      affordances: ['drag'],
      cursor: axis === 'row' ? 'ew-resize' : 'ns-resize',
      extra: {
        dock: true,
        edgeId: spec.id,
        axis,
      },
    },
  };
}

/**
 * Pinned-edge shell layout. Two-phase resolution per axis:
 *
 *   1. Measure intrinsic edges (`size: 'auto'`) via `measureNodeWithContext`,
 *      and consume any fixed-pixel sizes literally.
 *   2. `resolveWeightedStack` distributes the axis remainder across any
 *      weighted edges + the center pane (which carries weight 1).
 *
 * Order of evaluation: rows-first. Top/bottom intrinsic measurements are
 * taken against the full terminal width before left/right intrinsic
 * measurements are taken against the remaining row height. This matters
 * when both axes carry weighted edges — the row axis "wins" on its own
 * intrinsic sizing.
 *
 * Composes via `column(top?, row(left?, center, right?), bottom?)`.
 */
export function dock(options: DockOptions): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);

      // Phase 1: row axis (top + bottom intrinsic against the full container width).
      const totalRows = measurementContext.container.rows;
      const totalCols = measurementContext.container.cols;

      const rowAxis = resolveAxis({
        available: totalRows,
        leading: options.top,
        trailing: options.bottom,
        axis: 'column',
        context: measurementContext,
        centerMinSize: Math.max(0, options.centerMinHeight ?? 0),
      });

      // Phase 2: col axis (left + right intrinsic against the center row height).
      const centerRowContext: MeasurementContext = {
        terminal: measurementContext.terminal,
        available: { cols: totalCols, rows: rowAxis.centerSize },
        container: { cols: totalCols, rows: rowAxis.centerSize },
      };

      const colAxis = resolveAxis({
        available: totalCols,
        leading: options.left,
        trailing: options.right,
        axis: 'row',
        context: centerRowContext,
        centerMinSize: Math.max(0, options.centerMinWidth ?? 0),
      });

      // Compose.
      const middleRowChildren: VNode[] = [];
      if (options.left && colAxis.leadingSize > 0) {
        middleRowChildren.push(maybeWrapWithEdgeRegion(options.left, paneBox(options.left.node, colAxis.leadingSize, rowAxis.centerSize), 'row'));
      }
      middleRowChildren.push(paneBox(options.center, colAxis.centerSize, rowAxis.centerSize));
      if (options.right && colAxis.trailingSize > 0) {
        middleRowChildren.push(maybeWrapWithEdgeRegion(options.right, paneBox(options.right.node, colAxis.trailingSize, rowAxis.centerSize), 'row'));
      }

      const middleRow: VNode =
        middleRowChildren.length === 1
          ? middleRowChildren[0]!
          : {
              kind: 'row',
              children: middleRowChildren,
            };

      const columnChildren: VNode[] = [];
      if (options.top && rowAxis.leadingSize > 0) {
        columnChildren.push(maybeWrapWithEdgeRegion(options.top, paneBox(options.top.node, totalCols, rowAxis.leadingSize), 'column'));
      }
      columnChildren.push(middleRow);
      if (options.bottom && rowAxis.trailingSize > 0) {
        columnChildren.push(maybeWrapWithEdgeRegion(options.bottom, paneBox(options.bottom.node, totalCols, rowAxis.trailingSize), 'column'));
      }

      if (columnChildren.length === 1) {
        return columnChildren[0]!;
      }

      return {
        kind: 'column',
        children: columnChildren,
      };
    },
  };
}
