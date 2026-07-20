/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { LayoutEntry } from './layout-types.js';
import type {
  EventNode,
  FlexNode,
  HoverNode,
  ImageNode,
  LazyNode,
  LocalStateNode,
  MemoNode,
  OverlayNode,
  PortalNode,
  SuspenseNode,
  TabGroupNode,
  TextNode,
} from './nodes.js';
import { getNodeId, type IdGen, type OverlayCollector, planNode } from './planning.js';
import { getActivePortalCollector } from './planning-context.js';
import { resolveLazy, resolveLocalState, resolveMemo } from './state.js';
import { visualWidth, wrapText } from './visual-width.js';

export function planOverlay(
  node: OverlayNode,
  _x: number,
  _y: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  // Collect overlay for later processing — returns zero-size entry for flow
  if (overlays) {
    overlays.entries.push({ node });
  }
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = {
    id,
    node,
    rect: { x: _x, y: _y, width: 0, height: 0 },
    children: [],
  };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planEvent(
  node: EventNode,
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
  const entry: LayoutEntry = { id, node, rect: { x, y, width: childEntry.rect.width, height: childEntry.rect.height }, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planHover(
  node: HoverNode,
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
  const entry: LayoutEntry = { id, node, rect: { x, y, width: childEntry.rect.width, height: childEntry.rect.height }, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planFlex(
  node: FlexNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  // When not inside a row/column context, plan the child with available space
  const childEntry = planNode(node.child, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: availW, height: availH }, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planMemo(
  node: MemoNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const resolved = resolveMemo(node);
  const childEntry = planNode(resolved, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: childEntry.rect, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planSuspense(
  node: SuspenseNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const active = node.resolved ? node.child : node.fallback;
  const childEntry = planNode(active, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: childEntry.rect, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planPortal(node: PortalNode, x: number, y: number, index: Map<string, LayoutEntry>, nextId: IdGen, _overlays?: OverlayCollector): LayoutEntry {
  const activePortalCollector = getActivePortalCollector();
  if (activePortalCollector) {
    activePortalCollector.entries.push({ node, child: node.child });
  }
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: 0, height: 0 }, children: [] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planLocalState(
  node: LocalStateNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const resolved = resolveLocalState(node);
  const childEntry = planNode(resolved, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: childEntry.rect, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planLazy(
  node: LazyNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const resolved = resolveLazy(node);
  const childEntry = planNode(resolved, x, y, availW, availH, index, nextId, overlays);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: childEntry.rect, children: [childEntry] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planTabGroup(
  node: TabGroupNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const children: LayoutEntry[] = [];
  if (node.orientation === 'horizontal') {
    let offsetX = 0;
    for (const child of node.children) {
      const childEntry = planNode(child, x + offsetX, y, availW - offsetX, availH, index, nextId, overlays);
      children.push(childEntry);
      offsetX += childEntry.rect.width;
    }
    const maxH = children.reduce((max, c) => Math.max(max, c.rect.height), 0);
    const id = getNodeId(node, nextId);
    const entry: LayoutEntry = { id, node, rect: { x, y, width: Math.min(offsetX, availW), height: maxH }, children };
    if (node.layoutId) index.set(id, entry);
    return entry;
  } else {
    let offsetY = 0;
    for (const child of node.children) {
      const childEntry = planNode(child, x, y + offsetY, availW, availH - offsetY, index, nextId, overlays);
      children.push(childEntry);
      offsetY += childEntry.rect.height;
    }
    const maxW = children.reduce((max, c) => Math.max(max, c.rect.width), 0);
    const id = getNodeId(node, nextId);
    const entry: LayoutEntry = { id, node, rect: { x, y, width: maxW, height: Math.min(offsetY, availH) }, children };
    if (node.layoutId) index.set(id, entry);
    return entry;
  }
}

export function planImage(node: ImageNode, x: number, y: number, availW: number, availH: number, index: Map<string, LayoutEntry>, nextId: IdGen): LayoutEntry {
  const w = Math.min(node.width, availW);
  const h = Math.min(node.height, availH);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: w, height: h }, children: [] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}

export function planText(node: TextNode, x: number, y: number, availW: number, availH: number, index: Map<string, LayoutEntry>, nextId: IdGen): LayoutEntry {
  const lines = node.wrap ? wrapText(node.content, availW) : node.content.split('\n');
  const maxLineWidth = lines.reduce((max, l) => Math.max(max, visualWidth(l)), 0);
  const w = Math.min(maxLineWidth, availW);
  const h = Math.min(lines.length, availH);
  const id = getNodeId(node, nextId);
  const entry: LayoutEntry = { id, node, rect: { x, y, width: w, height: h }, children: [] };
  if (node.layoutId) index.set(id, entry);
  return entry;
}
