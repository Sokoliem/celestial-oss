/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { LayoutEntry } from './layout-types.js';
import { measure } from './measure.js';
import type { BoxNode, ColumnNode, ComponentNode, EmptyNode, FlexNode, FocusNode, RowNode, ScrollNode, VNode } from './nodes.js';
import { getNodeId, type IdGen, type OverlayCollector, planNode } from './planning.js';
import { createPlanningRenderContext } from './planning-context.js';
import { getBreakpoint, normalizeSides, resolveResponsive } from './responsive.js';

/**
 * Distribute available space among flex items proportionally by weight,
 * respecting min/max constraints. Uses iterative clamping: items that
 * hit their min or max are fixed, and remaining space is redistributed.
 */
export function distributeFlexSpace(items: Array<{ weight: number; min?: number; max?: number }>, totalSpace: number): number[] {
  if (items.length === 0) return [];

  const sizes = new Array<number>(items.length).fill(0);
  const fixed = new Array<boolean>(items.length).fill(false);
  let remainingSpace = totalSpace;

  // Iteratively distribute — clamp constrained items and redistribute
  for (let iteration = 0; iteration < items.length; iteration++) {
    let totalWeight = 0;
    for (let i = 0; i < items.length; i++) {
      if (!fixed[i]) totalWeight += items[i]!.weight;
    }
    if (totalWeight <= 0) break;

    let changed = false;
    let spaceUsed = 0;

    for (let i = 0; i < items.length; i++) {
      if (fixed[i]) continue;
      const item = items[i]!;
      let size = Math.floor((item.weight / totalWeight) * remainingSpace);

      if (item.min !== undefined && size < item.min) {
        size = item.min;
        fixed[i] = true;
        changed = true;
      } else if (item.max !== undefined && size > item.max) {
        size = item.max;
        fixed[i] = true;
        changed = true;
      }

      sizes[i] = size;
      spaceUsed += size;
    }

    if (!changed) {
      // No items were clamped — distribute any rounding remainder
      const remainder = remainingSpace - spaceUsed;
      if (remainder > 0) {
        // Give extra pixels to first unfixed item(s)
        for (let i = 0; i < items.length; i++) {
          if (!fixed[i]) {
            sizes[i] = (sizes[i] ?? 0) + remainder;
            break;
          }
        }
      }
      break;
    }

    // Recalculate remaining space after clamping
    let fixedSpace = 0;
    for (let i = 0; i < items.length; i++) {
      if (fixed[i]) fixedSpace += sizes[i]!;
    }
    remainingSpace = totalSpace - fixedSpace;
  }

  return sizes;
}

export function planRow(
  node: RowNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const gap = node.gap ?? 0;
  const childCount = node.children.length;
  const totalGaps = childCount > 1 ? (childCount - 1) * gap : 0;

  // Check if any children are flex nodes
  const hasFlexChildren = node.children.some((c) => c.kind === 'flex');

  if (!hasFlexChildren) {
    // Original non-flex path
    const children: LayoutEntry[] = [];
    let offsetX = 0;
    let maxH = 0;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      const remainW = Math.max(availW - offsetX, 0);
      const childSize = measure(child, remainW, createPlanningRenderContext(remainW, availH));
      const childW = Math.min(childSize.width, remainW);
      if (childW <= 0 && child.kind !== 'overlay' && child.kind !== 'portal') {
        if (remainW <= 0) break;
        continue;
      }
      const childEntry = planNode(child, x + offsetX, y, childW, availH, index, nextId, overlays);
      children.push(childEntry);
      offsetX += childW;
      maxH = Math.max(maxH, childEntry.rect.height);
      if (i < node.children.length - 1) offsetX += gap;
    }
    const id = getNodeId(node, nextId);
    const entry: LayoutEntry = { id, node, rect: { x, y, width: offsetX, height: maxH }, children };
    if (node.layoutId) index.set(id, entry);
    return entry;
  }

  // Flex-aware layout: two-pass algorithm
  // Pass 1: measure non-flex children, compute remaining space
  let fixedWidth = 0;
  let _totalFlex = 0;
  const childInfos: Array<{ child: VNode; isFlex: boolean; flexWeight: number; naturalW: number }> = [];

  for (const child of node.children) {
    if (child.kind === 'flex') {
      const weight = child.flex ?? 1;
      _totalFlex += weight;
      childInfos.push({ child, isFlex: true, flexWeight: weight, naturalW: 0 });
    } else {
      const childSize = measure(child, availW, createPlanningRenderContext(availW, availH));
      fixedWidth += childSize.width;
      childInfos.push({ child, isFlex: false, flexWeight: 0, naturalW: childSize.width });
    }
  }

  const remaining = Math.max(0, availW - fixedWidth - totalGaps);

  // Pass 2: distribute remaining space among flex children, respecting min/max
  const flexWidths = distributeFlexSpace(
    childInfos
      .filter((c) => c.isFlex)
      .map((c) => ({
        weight: c.flexWeight,
        min: (c.child as FlexNode).minWidth,
        max: (c.child as FlexNode).maxWidth,
      })),
    remaining,
  );

  // Plan all children with computed widths
  const children: LayoutEntry[] = [];
  let offsetX = 0;
  let flexIdx = 0;

  for (let i = 0; i < childInfos.length; i++) {
    const info = childInfos[i]!;
    if (i > 0) offsetX += gap;

    if (info.isFlex) {
      const w = flexWidths[flexIdx++]!;
      const flexNode = info.child as FlexNode;
      // Plan the flex node's child with the computed width
      const childEntry = planNode(flexNode.child, x + offsetX, y, w, availH, index, nextId, overlays);
      const nodeId = getNodeId(flexNode, nextId);
      const flexEntry: LayoutEntry = {
        id: nodeId,
        node: flexNode,
        rect: { x: x + offsetX, y, width: w, height: childEntry.rect.height },
        children: [childEntry],
      };
      if (flexNode.layoutId) index.set(nodeId, flexEntry);
      children.push(flexEntry);
      offsetX += w;
    } else {
      const childW = Math.min(info.naturalW, availW - offsetX);
      if (childW <= 0 && info.child.kind !== 'overlay' && info.child.kind !== 'portal') continue;
      const childEntry = planNode(info.child, x + offsetX, y, childW, availH, index, nextId, overlays);
      children.push(childEntry);
      offsetX += childW;
    }
  }

  // Calculate max height among all children
  const maxH = children.reduce((max, c) => Math.max(max, c.rect.height), 0);

  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: Math.min(offsetX, availW), height: maxH }, children };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planColumn(
  node: ColumnNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const gap = node.gap ?? 0;
  const childCount = node.children.length;
  const totalGaps = childCount > 1 ? (childCount - 1) * gap : 0;

  // Check if any children are flex nodes
  const hasFlexChildren = node.children.some((c) => c.kind === 'flex');

  if (!hasFlexChildren) {
    // Original non-flex path
    const children: LayoutEntry[] = [];
    let offsetY = 0;
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      // For wrapping text nodes, use remaining availH so wrapping can expand height
      const isWrappingText = child.kind === 'text' && child.wrap;
      const remainH = availH - offsetY;
      let childH: number;
      if (isWrappingText) {
        childH = remainH;
      } else {
        const childSize = measure(child, availW, createPlanningRenderContext(availW, remainH));
        childH = Math.min(childSize.height, remainH);
      }
      if (childH <= 0 && child.kind !== 'overlay' && child.kind !== 'portal') {
        if (remainH <= 0) break;
        continue;
      }
      const childEntry = planNode(child, x, y + offsetY, availW, childH, index, nextId, overlays);
      children.push(childEntry);
      // Use actual planned height for wrapping text so subsequent children stack correctly
      const usedH = isWrappingText ? childEntry.rect.height : childH;
      offsetY += usedH;
      if (i < node.children.length - 1) offsetY += gap;
    }
    const id = getNodeId(node, nextId);
    const entry: LayoutEntry = { id, node, rect: { x, y, width: availW, height: offsetY }, children };
    if (node.layoutId) index.set(id, entry);
    return entry;
  }

  // Flex-aware layout: two-pass algorithm
  // Pass 1: measure non-flex children, compute remaining space
  let fixedHeight = 0;
  let _totalFlex = 0;
  const childInfos: Array<{ child: VNode; isFlex: boolean; flexWeight: number; naturalH: number }> = [];

  for (const child of node.children) {
    if (child.kind === 'flex') {
      const weight = child.flex ?? 1;
      _totalFlex += weight;
      childInfos.push({ child, isFlex: true, flexWeight: weight, naturalH: 0 });
    } else {
      const childSize = measure(child, availW, createPlanningRenderContext(availW, availH));
      fixedHeight += childSize.height;
      childInfos.push({ child, isFlex: false, flexWeight: 0, naturalH: childSize.height });
    }
  }

  const remaining = Math.max(0, availH - fixedHeight - totalGaps);

  // Pass 2: distribute remaining space among flex children, respecting min/max
  const flexHeights = distributeFlexSpace(
    childInfos
      .filter((c) => c.isFlex)
      .map((c) => ({
        weight: c.flexWeight,
        min: (c.child as FlexNode).minHeight,
        max: (c.child as FlexNode).maxHeight,
      })),
    remaining,
  );

  // Plan all children with computed heights
  const children: LayoutEntry[] = [];
  let offsetY = 0;
  let flexIdx = 0;

  for (let i = 0; i < childInfos.length; i++) {
    const info = childInfos[i]!;
    if (i > 0) offsetY += gap;

    if (info.isFlex) {
      const h = flexHeights[flexIdx++]!;
      const flexNode = info.child as FlexNode;
      const childEntry = planNode(flexNode.child, x, y + offsetY, availW, h, index, nextId, overlays);
      const nodeId = getNodeId(flexNode, nextId);
      const flexEntry: LayoutEntry = { id: nodeId, node: flexNode, rect: { x, y: y + offsetY, width: availW, height: h }, children: [childEntry] };
      if (flexNode.layoutId) index.set(nodeId, flexEntry);
      children.push(flexEntry);
      offsetY += h;
    } else {
      const childH = Math.min(info.naturalH, availH - offsetY);
      if (childH <= 0 && info.child.kind !== 'overlay' && info.child.kind !== 'portal') continue;
      const childEntry = planNode(info.child, x, y + offsetY, availW, childH, index, nextId, overlays);
      children.push(childEntry);
      offsetY += childEntry.rect.height; // use actual planned height
    }
  }

  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: availW, height: Math.min(offsetY, availH) }, children };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planBox(
  node: BoxNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const bp = getBreakpoint(availW);
  const resolvedW = resolveResponsive(node.width, bp);
  const resolvedH = resolveResponsive(node.height, bp);
  const padding = normalizeSides(resolveResponsive(node.style?.padding, bp) ?? 0);
  const intrinsic = node.fit === 'content' ? measure(node, availW, createPlanningRenderContext(availW, availH)) : undefined;

  let w = resolvedW !== undefined ? Math.min(resolvedW, availW) : intrinsic ? Math.min(intrinsic.width, availW) : availW;
  let h = resolvedH !== undefined ? Math.min(resolvedH, availH) : intrinsic ? Math.min(intrinsic.height, availH) : availH;
  if (node.minWidth !== undefined) w = Math.max(node.minWidth, w);
  if (node.maxWidth !== undefined) w = Math.min(node.maxWidth, w);
  if (node.minHeight !== undefined) h = Math.max(node.minHeight, h);
  if (node.maxHeight !== undefined) h = Math.min(node.maxHeight, h);

  const borderOffset = node.border ? 1 : 0;

  const bx = x + borderOffset + padding[3];
  const by = y + borderOffset + padding[0];
  const bw = Math.max(0, w - borderOffset * 2 - padding[1] - padding[3]);
  const bh = Math.max(0, h - borderOffset * 2 - padding[0] - padding[2]);

  const children: LayoutEntry[] = [];
  if (node.children.length === 1) {
    // Single child: plan directly without wrapping in extra column
    children.push(planNode(node.children[0]!, bx, by, bw, bh, index, nextId, overlays));
  } else if (node.children.length > 1) {
    // Multiple children: wrap in column for vertical stacking
    const innerColumn: ColumnNode = { kind: 'column', children: node.children };
    children.push(planNode(innerColumn, bx, by, bw, bh, index, nextId, overlays));
  }

  // If height was not explicitly defined, shrink to fit the planned children.
  // Exception: boxes with a background color keep their full allocated height
  // so the background fill covers the entire region.
  const hasBgStyle = node.style?.bg !== undefined;
  if (resolvedH === undefined && !hasBgStyle) {
    const innerH = children.length > 0 ? children[0]!.rect.height : 0;
    h = Math.min(availH, innerH + borderOffset * 2 + padding[0] + padding[2]);
  }
  if (node.minWidth !== undefined) w = Math.max(node.minWidth, w);
  if (node.maxWidth !== undefined) w = Math.min(node.maxWidth, w);
  if (node.minHeight !== undefined) h = Math.max(node.minHeight, h);
  if (node.maxHeight !== undefined) h = Math.min(node.maxHeight, h);

  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: w, height: h }, children };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planEmpty(
  node: EmptyNode,
  x: number,
  y: number,
  _availW: number,
  _availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
): LayoutEntry {
  const bp = getBreakpoint(_availW);
  const w = resolveResponsive(node.width, bp) ?? 0;
  const h = resolveResponsive(node.height, bp) ?? 1;
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: w, height: h }, children: [] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planScroll(
  node: ScrollNode,
  x: number,
  y: number,
  availW: number,
  _availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  // Plan the child once with a large sentinel height to get its full virtual size.
  // Avoids calling measure() first (which would render components twice).
  const childEntry = planNode(node.child, 0, 0, availW, 100000, index, nextId, overlays);

  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = {
    id,
    node,
    rect: { x, y, width: availW, height: node.height },
    children: [childEntry],
  };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planFocus(
  node: FocusNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const childEntry = planNode(node.child, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: availW, height: availH }, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planComponent(
  node: ComponentNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const rendered = node.render(createPlanningRenderContext(availW, availH));
  const childEntry = planNode(rendered, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: availW, height: availH }, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}
