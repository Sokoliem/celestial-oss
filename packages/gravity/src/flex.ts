import { measureNodeWithContext } from './measure.js';
import { resolveConditional, resolveWhen } from './responsive.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type {
  AlignItems,
  AnyWhenCondition,
  ComponentNode,
  FlexChild,
  FlexDirection,
  FlexItemOptions,
  FlexProps,
  FlexWrap,
  Gap,
  JustifyContent,
  Margin,
  MeasurementContext,
  SafeAreaInsets,
  VNode,
  WhenConditional,
} from './types.js';

/** Create a FlexChild with default options */
export function flexItem(node: VNode, options?: Partial<FlexItemOptions>): FlexChild;
export function flexItem(options: Partial<FlexItemOptions>, node: VNode): FlexChild;
export function flexItem(nodeOrOptions: VNode | Partial<FlexItemOptions>, optionsOrNode?: Partial<FlexItemOptions> | VNode): FlexChild {
  const node = isVNode(nodeOrOptions) ? nodeOrOptions : (optionsOrNode as VNode);
  const options = isVNode(nodeOrOptions) ? (optionsOrNode as Partial<FlexItemOptions> | undefined) : nodeOrOptions;
  return {
    node,
    options: {
      grow: 0,
      shrink: 1,
      basis: 'auto',
      ...options,
    },
  };
}

function isVNode(value: unknown): value is VNode {
  return value !== null && typeof value === 'object' && 'kind' in (value as Record<string, unknown>);
}

function normalizeGap(gap: number | Gap | undefined, direction: 'row' | 'column'): number {
  const normalize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  if (typeof gap === 'number' || gap === undefined) {
    return normalize(gap ?? 0);
  }
  return normalize(direction === 'row' ? (gap.col ?? gap.row ?? 0) : (gap.row ?? gap.col ?? 0));
}

function normalizeGaps(gap: number | Gap | undefined, direction: 'row' | 'column'): { main: number; cross: number } {
  const normalize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  if (typeof gap === 'number' || gap === undefined) {
    const value = normalize(gap ?? 0);
    return { main: value, cross: value };
  }
  return direction === 'row'
    ? { main: normalize(gap.col ?? gap.row ?? 0), cross: normalize(gap.row ?? gap.col ?? 0) }
    : { main: normalize(gap.row ?? gap.col ?? 0), cross: normalize(gap.col ?? gap.row ?? 0) };
}

function isReverseDirection(direction: FlexDirection): boolean {
  return direction === 'row-reverse' || direction === 'column-reverse';
}

function toAxisDirection(direction: FlexDirection): 'row' | 'column' {
  return direction === 'row' || direction === 'row-reverse' ? 'row' : 'column';
}

function isWhenCondition(value: unknown): value is AnyWhenCondition {
  return value !== null && typeof value === 'object' && '_tag' in (value as Record<string, unknown>);
}

interface ResolvedFlexItem {
  child: FlexChild;
  grow: number;
  shrink: number;
  basis: number;
  minSize?: number;
  maxSize?: number;
  minCrossSize?: number;
  maxCrossSize?: number;
  alignSelf?: AlignItems;
  margin: SafeAreaInsets;
  size: number;
}

function normalizeMargin(margin: Margin | undefined): SafeAreaInsets {
  if (typeof margin === 'number') {
    const size = normalizeCellSize(margin);
    return { top: size, right: size, bottom: size, left: size };
  }
  return {
    top: normalizeCellSize(margin?.top),
    right: normalizeCellSize(margin?.right),
    bottom: normalizeCellSize(margin?.bottom),
    left: normalizeCellSize(margin?.left),
  };
}

function normalizeCellSize(value: number | undefined, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
}

function normalizeWeight(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value!) : fallback;
}

function normalizeMaxSize(value: number | undefined, min: number): number | undefined {
  if (value === undefined || value === Number.POSITIVE_INFINITY) return undefined;
  return Math.max(min, normalizeCellSize(value, min));
}

function mainMargin(margin: SafeAreaInsets, axisDirection: 'row' | 'column'): number {
  return axisDirection === 'row' ? margin.left + margin.right : margin.top + margin.bottom;
}

function crossMargin(margin: SafeAreaInsets, axisDirection: 'row' | 'column'): number {
  return axisDirection === 'row' ? margin.top + margin.bottom : margin.left + margin.right;
}

function normalizeAlignItems(value: AlignItems | undefined): AlignItems {
  if (value === 'flex-start') return 'start';
  if (value === 'flex-end') return 'end';
  return value ?? 'stretch';
}

function normalizeJustifyContent(value: JustifyContent | undefined): JustifyContent {
  if (value === 'flex-start') return 'start';
  if (value === 'flex-end') return 'end';
  return value ?? 'start';
}

function axisSpacer(axisDirection: 'row' | 'column', size: number): VNode {
  const clamped = Math.max(0, Math.floor(size));
  if (axisDirection === 'row') {
    return { kind: 'box', width: clamped, children: [{ kind: 'empty' }] };
  }
  return { kind: 'box', height: clamped, children: [{ kind: 'empty' }] };
}

function resolveCrossAxis(
  item: ResolvedFlexItem,
  axisDirection: 'row' | 'column',
  context: MeasurementContext,
  alignItems: AlignItems | undefined,
): { crossSize?: number; padding: [number, number, number, number] } {
  const margin = item.margin;
  const align = normalizeAlignItems(item.alignSelf ?? alignItems);
  const measured = measureNodeWithContext(item.child.node, context);
  const childCross = axisDirection === 'row' ? measured.height : measured.width;
  const containerCross = axisDirection === 'row' ? context.container.rows : context.container.cols;
  const minCross = item.minCrossSize ?? 0;
  const maxCross = item.maxCrossSize ?? Number.POSITIVE_INFINITY;
  const desiredCross = Math.max(minCross, Math.min(maxCross, childCross + crossMargin(margin, axisDirection)));
  const stretchSize = Math.max(desiredCross, Math.min(maxCross, containerCross));
  const crossSize = align === 'stretch' || align === 'center' || align === 'end' ? stretchSize : desiredCross;
  const remaining = Math.max(0, crossSize - desiredCross);

  let top = margin.top;
  let right = margin.right;
  let bottom = margin.bottom;
  let left = margin.left;

  if (axisDirection === 'row') {
    if (align === 'center') {
      top += Math.floor(remaining / 2);
      bottom += remaining - Math.floor(remaining / 2);
    } else if (align === 'end') {
      top += remaining;
    } else if (align === 'stretch') {
      bottom += remaining;
    }
  } else if (align === 'center') {
    left += Math.floor(remaining / 2);
    right += remaining - Math.floor(remaining / 2);
  } else if (align === 'end') {
    left += remaining;
  } else if (align === 'stretch') {
    right += remaining;
  }

  return {
    crossSize,
    padding: [top, right, bottom, left],
  };
}

function resolveItemSize(item: ResolvedFlexItem, axisDirection: 'row' | 'column', context: MeasurementContext, alignItems?: AlignItems): VNode {
  const size = Math.max(0, Math.floor(item.size));
  const contentSize = Math.max(0, size - mainMargin(item.margin, axisDirection));
  const cross = resolveCrossAxis(item, axisDirection, context, alignItems);
  const style = cross.padding.some((value) => value > 0) ? { padding: cross.padding } : undefined;

  if (axisDirection === 'row') {
    return {
      kind: 'box',
      children: [item.child.node],
      style,
      width: size,
      height: cross.crossSize,
    };
  }

  return {
    kind: 'box',
    children: [item.child.node],
    style,
    width: cross.crossSize,
    height: contentSize + item.margin.top + item.margin.bottom,
  };
}

function createWrappedLines(items: readonly ResolvedFlexItem[], available: number, gap: number): ResolvedFlexItem[][] {
  const lines: ResolvedFlexItem[][] = [];
  let current: ResolvedFlexItem[] = [];
  let currentUsed = 0;

  for (const item of items) {
    const nextUsed = current.length === 0 ? item.basis : currentUsed + gap + item.basis;
    if (current.length > 0 && nextUsed > available) {
      lines.push(current);
      current = [item];
      currentUsed = item.basis;
      continue;
    }
    current.push(item);
    currentUsed = nextUsed;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}

function resolveFlexLine(line: readonly ResolvedFlexItem[], available: number, gap: number): ResolvedFlexItem[] {
  const cloned = line.map((item) => ({ ...item, size: item.basis }));
  const lineAvailable = Math.max(0, available - gap * Math.max(0, cloned.length - 1));
  const totalBasis = cloned.reduce((sum, item) => sum + item.basis, 0);

  if (totalBasis < lineAvailable) {
    distributeGrow(cloned, lineAvailable);
  } else if (totalBasis > lineAvailable) {
    distributeShrink(cloned, lineAvailable);
  }

  return cloned;
}

function wrapFlexLines(
  items: readonly ResolvedFlexItem[],
  axisDirection: 'row' | 'column',
  wrap: FlexWrap,
  gaps: { main: number; cross: number },
  available: number,
  context: MeasurementContext,
  alignItems?: AlignItems,
): VNode {
  const lines = createWrappedLines(items, available, gaps.main).map((line) => resolveFlexLine(line, available, gaps.main));
  if (wrap === 'wrap-reverse') {
    lines.reverse();
  }

  const lineNodes = lines.map((line) => {
    snapItemSizes(line);
    const children = line.map((item) => resolveItemSize(item, axisDirection, context, alignItems));
    return axisDirection === 'row'
      ? ({ kind: 'row', gap: gaps.main, children } satisfies VNode)
      : ({ kind: 'column', gap: gaps.main, children } satisfies VNode);
  });

  return axisDirection === 'row'
    ? {
        kind: 'column',
        gap: gaps.cross,
        children: lineNodes,
      }
    : {
        kind: 'row',
        gap: gaps.cross,
        children: lineNodes,
      };
}

/** Preserve every allocatable terminal cell after fractional flex distribution. */
function snapItemSizes(items: ResolvedFlexItem[]): void {
  const target = Math.round(items.reduce((sum, item) => sum + item.size, 0));
  const ranked = items
    .map((item, index) => ({ item, index, floor: Math.floor(item.size), fraction: item.size - Math.floor(item.size) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  let remaining = target - ranked.reduce((sum, entry) => sum + entry.floor, 0);
  for (const entry of ranked) {
    entry.item.size = entry.floor + (remaining > 0 ? 1 : 0);
    if (remaining > 0) remaining -= 1;
  }
}

function justifyFlexChildren(
  children: readonly VNode[],
  axisDirection: 'row' | 'column',
  gap: number,
  containerMain: number,
  usedMain: number,
  justifyContent: JustifyContent | undefined,
): { children: VNode[]; gap: number } {
  const justify = normalizeJustifyContent(justifyContent);
  const remaining = Math.max(0, Math.floor(containerMain - usedMain));
  if (remaining === 0 || children.length === 0 || justify === 'start') {
    return { children: [...children], gap };
  }

  if (justify === 'end') {
    return { children: [axisSpacer(axisDirection, remaining), ...children], gap };
  }

  if (justify === 'center') {
    const before = Math.floor(remaining / 2);
    const after = remaining - before;
    return { children: [axisSpacer(axisDirection, before), ...children, axisSpacer(axisDirection, after)], gap };
  }

  if (justify === 'space-between' && children.length > 1) {
    return { children: [...children], gap: gap + Math.floor(remaining / (children.length - 1)) };
  }

  if (justify === 'space-around') {
    const outer = Math.floor(remaining / (children.length * 2));
    const innerGap = gap + outer * 2;
    return { children: [axisSpacer(axisDirection, outer), ...children, axisSpacer(axisDirection, outer)], gap: innerGap };
  }

  if (justify === 'space-evenly') {
    const spacer = Math.floor(remaining / (children.length + 1));
    return { children: [axisSpacer(axisDirection, spacer), ...children, axisSpacer(axisDirection, spacer)], gap: gap + spacer };
  }

  return { children: [...children], gap };
}

function distributeGrow(items: ResolvedFlexItem[], available: number): void {
  const EPSILON = 1e-6;

  while (true) {
    const used = items.reduce((sum, item) => sum + item.size, 0);
    const remaining = available - used;
    if (remaining <= EPSILON) {
      return;
    }

    const growable = items.filter((item) => item.grow > 0 && (item.maxSize === undefined || item.size < item.maxSize));
    const totalGrow = growable.reduce((sum, item) => sum + item.grow, 0);
    if (growable.length === 0 || totalGrow <= 0) {
      return;
    }

    let clamped = false;
    for (const item of growable) {
      const extra = (item.grow / totalGrow) * remaining;
      const maxExtra = item.maxSize === undefined ? Number.POSITIVE_INFINITY : item.maxSize - item.size;
      if (extra >= maxExtra) {
        item.size += maxExtra;
        clamped = clamped || Number.isFinite(maxExtra);
      } else {
        item.size += extra;
      }
    }

    if (!clamped) {
      return;
    }
  }
}

function distributeShrink(items: ResolvedFlexItem[], available: number): void {
  const EPSILON = 1e-6;

  while (true) {
    const used = items.reduce((sum, item) => sum + item.size, 0);
    const remainingDeficit = used - available;
    if (remainingDeficit <= EPSILON) {
      return;
    }

    const shrinkable = items.filter((item) => item.shrink > 0 && item.basis > 0 && (item.minSize === undefined || item.size > item.minSize));
    const totalShrinkWeighted = shrinkable.reduce((sum, item) => sum + item.shrink * item.basis, 0);
    if (shrinkable.length === 0 || totalShrinkWeighted <= 0) {
      return;
    }

    let clamped = false;
    for (const item of shrinkable) {
      const reduction = ((item.shrink * item.basis) / totalShrinkWeighted) * remainingDeficit;
      const maxReduction = item.minSize === undefined ? item.size : item.size - item.minSize;
      if (reduction >= maxReduction) {
        item.size -= maxReduction;
        clamped = clamped || item.minSize !== undefined;
      } else {
        item.size -= reduction;
      }
    }

    if (!clamped) {
      return;
    }
  }
}

function wrapOverflow(node: VNode, props: FlexProps, context: MeasurementContext): VNode {
  if (!props.overflow || props.overflow === 'visible') {
    return node;
  }

  return {
    kind: 'box',
    children: [node],
    width: context.container.cols,
    height: context.container.rows,
    overflow: props.overflow,
    scrollOffset: props.scrollOffset,
  };
}

/** Create a flex layout that returns a ComponentNode */
export function flex(props: FlexProps): ComponentNode;
export function flex(props: Omit<FlexProps, 'children'>, ...children: FlexChild[]): ComponentNode;
export function flex(props: FlexProps | Omit<FlexProps, 'children'>, ...children: FlexChild[]): ComponentNode {
  const normalizedProps: FlexProps = {
    ...props,
    children: 'children' in props ? props.children : children,
  };

  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);

      let direction: FlexDirection;
      if (typeof normalizedProps.direction === 'string') {
        direction = normalizedProps.direction;
      } else {
        direction = resolveConditional(normalizedProps.direction as WhenConditional<FlexDirection>, measurementContext.terminal.cols);
      }

      const axisDirection = toAxisDirection(direction);
      const isReverse = isReverseDirection(direction);
      const gap = normalizeGap(normalizedProps.gap, axisDirection);
      const gaps = normalizeGaps(normalizedProps.gap, axisDirection);

      const visibleChildren = normalizedProps.children
        .map((child, index) => ({ child, index }))
        .filter(({ child }) => {
          const hide = child.options.hide;
          if (hide === true) return false;
          if (hide === false || hide === undefined) return true;
          if (isWhenCondition(hide)) {
            return !resolveWhen(hide, measurementContext.terminal.cols);
          }
          return true;
        })
        .sort((left, right) => {
          const leftOrder = left.child.options.order ?? 0;
          const rightOrder = right.child.options.order ?? 0;
          return leftOrder - rightOrder || left.index - right.index;
        })
        .map(({ child }) => child);

      if (isReverse) {
        visibleChildren.reverse();
      }

      if (visibleChildren.length === 0) {
        return { kind: 'empty' };
      }

      const wrap = normalizedProps.wrap ?? 'nowrap';
      const totalGaps = gap * (visibleChildren.length - 1);
      const containerMain = axisDirection === 'row' ? measurementContext.container.cols : measurementContext.container.rows;
      const available = Math.max(0, wrap === 'nowrap' ? containerMain - totalGaps : containerMain);

      const items: ResolvedFlexItem[] = visibleChildren.map((child) => {
        const opts = child.options;
        let basis: number;
        if (typeof opts.basis === 'number') {
          basis = normalizeCellSize(opts.basis);
        } else {
          const measured = measureNodeWithContext(child.node, measurementContext);
          basis = axisDirection === 'row' ? measured.width : measured.height;
        }
        const margin = normalizeMargin(opts.margin);
        const minSize = normalizeCellSize(opts.minMainSize ?? opts.minSize);
        const maxSize = normalizeMaxSize(opts.maxMainSize ?? opts.maxSize, minSize);
        const minCrossSize = normalizeCellSize(opts.minCrossSize);
        const maxCrossSize = normalizeMaxSize(opts.maxCrossSize, minCrossSize);

        return {
          child,
          grow: normalizeWeight(opts.grow, 0),
          shrink: normalizeWeight(opts.shrink, 1),
          basis: basis + mainMargin(margin, axisDirection),
          minSize,
          maxSize,
          minCrossSize,
          maxCrossSize,
          alignSelf: opts.alignSelf,
          margin,
          size: basis + mainMargin(margin, axisDirection),
        };
      });

      if (wrap !== 'nowrap') {
        return wrapOverflow(
          wrapFlexLines(items, axisDirection, wrap, gaps, containerMain, measurementContext, normalizedProps.alignItems),
          normalizedProps,
          measurementContext,
        );
      }

      const totalBasis = items.reduce((sum, item) => sum + item.basis, 0);

      if (totalBasis < available) {
        distributeGrow(items, available);
      } else if (totalBasis > available) {
        distributeShrink(items, available);
      }
      snapItemSizes(items);

      const resolvedChildren: VNode[] = items.map((item) => resolveItemSize(item, axisDirection, measurementContext, normalizedProps.alignItems));
      const usedMain = items.reduce((sum, item) => sum + Math.max(0, Math.floor(item.size)), 0) + gap * Math.max(0, items.length - 1);
      const justified = justifyFlexChildren(resolvedChildren, axisDirection, gap, containerMain, usedMain, normalizedProps.justifyContent);

      const layoutNode: VNode =
        axisDirection === 'row'
          ? {
              kind: 'row',
              gap: justified.gap,
              children: justified.children,
            }
          : {
              kind: 'column',
              gap: justified.gap,
              children: justified.children,
            };

      return wrapOverflow(layoutNode, normalizedProps, measurementContext);
    },
  };
}
