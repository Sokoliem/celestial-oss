/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { LayoutEntry, LayoutPlan, LayoutPlanOptions, LayoutTraceEntry, OverlayEntry } from './layout-types.js';
import { measure } from './measure.js';
import type { OverlayNode, PortalNode, VNode } from './nodes.js';
import {
  createLayoutSpace,
  createPlanningRenderContext,
  getActiveLayoutContext,
  getActivePortalCollector,
  nodeFingerprint,
  setActiveLayoutContext,
  setActivePortalCollector,
  traceEntry,
  tryReuseEntry,
} from './planning-context.js';
import { planBox, planColumn, planComponent, planEmpty, planFocus, planRow, planScroll } from './planning-flow.js';
import {
  planEvent,
  planFlex,
  planHover,
  planImage,
  planLazy,
  planLocalState,
  planMemo,
  planOverlay,
  planPortal,
  planSuspense,
  planTabGroup,
  planText,
} from './planning-nodes.js';
import { getBreakpoint, resolveResponsive, resolveStyle } from './responsive.js';
import type { StyleAttrs } from './style.js';

/** Get the layoutId from a VNode, or generate a unique one using a local counter */
export function getNodeId(node: VNode, nextId: () => string): string {
  if ('layoutId' in node && node.layoutId) return node.layoutId;
  return nextId();
}

/** Collector for overlay nodes encountered during layout planning */
export interface OverlayCollector {
  entries: Array<{
    node: OverlayNode;
    pointerEvents?: 'auto' | 'none';
  }>;
  /** Pointer policy inherited from a promoted overlay or portal ancestor. */
  pointerEvents?: 'auto' | 'none';
}

/** Plan the layout of a VNode tree — compute positions without painting */
export function planLayout(node: VNode, width: number, height: number, options: LayoutPlanOptions = {}): LayoutPlan {
  const previousContext = getActiveLayoutContext();
  const trace = options.trace ? ([] as LayoutTraceEntry[]) : undefined;
  const stats = {
    plannedEntries: 0,
    reusedEntries: 0,
  };
  const previousPortalCollector = getActivePortalCollector();
  const portalCollector = {
    entries: [] as Array<{ node: PortalNode; child: VNode; pointerEvents?: 'auto' | 'none' }>,
  };

  setActiveLayoutContext({
    terminal: createLayoutSpace(width, height),
    previousPlan: options.previousPlan,
    previousIndex: options.previousPlan?.index ?? new Map<string, LayoutEntry>(),
    trace,
    stats,
  });

  try {
    let counter = 0;
    const nextId = () => `__auto_${counter++}`;
    const index = new Map<string, LayoutEntry>();
    const overlayCollector: OverlayCollector = { entries: [] };
    setActivePortalCollector(portalCollector);
    const root = planNode(node, 0, 0, width, height, index, nextId, overlayCollector);
    const bp = getBreakpoint(width);

    // Process collected overlays: each gets its own mini layout pass
    const overlays: OverlayEntry[] = [];
    for (const collected of overlayCollector.entries) {
      const ov = collected.node;
      const pointerEvents = collected.pointerEvents === 'none' || ov.pointerEvents === 'none' ? 'none' : 'auto';
      const childSize = measure(ov.child, width, createPlanningRenderContext(width, height));
      const ovW = resolveResponsive(ov.width, bp) ?? childSize.width;
      const ovH = resolveResponsive(ov.height, bp) ?? childSize.height;
      const childEntry = planNode(ov.child, ov.x, ov.y, ovW, ovH, index, nextId, {
        entries: overlayCollector.entries,
        pointerEvents,
      });
      const id = ov.layoutId ?? nextId();
      const available = createLayoutSpace(ovW, ovH);
      const entry: LayoutEntry = {
        id,
        node: ov,
        rect: { x: ov.x, y: ov.y, width: ovW, height: ovH },
        children: [childEntry],
        available,
        fingerprint: nodeFingerprint(ov, available),
      };
      if (ov.layoutId) index.set(id, entry);
      overlays.push({
        zIndex: ov.zIndex ?? 0,
        entry,
        transparent: ov.transparent ?? false,
        pointerEvents,
      });
      getActiveLayoutContext()!.stats.plannedEntries += 1;
      traceEntry('plan', entry, available);
    }

    // Sort overlays by zIndex ascending (lowest rendered first)
    overlays.sort((a, b) => a.zIndex - b.zIndex);

    // Process collected portals: render at target positions as overlay entries
    for (const portal of portalCollector.entries) {
      const targetEntry = index.get(portal.node.target);
      if (!targetEntry) continue;
      const { x: tx, y: ty, width: tw, height: th } = targetEntry.rect;
      const childEntry = planNode(portal.child, tx, ty, tw, th, index, nextId, {
        entries: overlayCollector.entries,
        pointerEvents: portal.pointerEvents,
      });
      overlays.push({
        zIndex: 1000,
        entry: childEntry,
        transparent: portal.node.transparent ?? false,
        pointerEvents: portal.pointerEvents ?? 'auto',
      });
    }

    return { root, index, width, height, overlays, trace, stats };
  } finally {
    setActivePortalCollector(previousPortalCollector);
    setActiveLayoutContext(previousContext);
  }
}

export type IdGen = () => string;

/** Mutable variant of LayoutEntry used internally during layout planning. */
type MutableLayoutEntry = { -readonly [K in keyof LayoutEntry]: LayoutEntry[K] };

export function planNode(
  node: VNode,
  x: number,
  y: number,
  availW: number,
  availH: number,
  index: Map<string, LayoutEntry>,
  nextId: IdGen,
  overlays?: OverlayCollector,
): LayoutEntry {
  const available = createLayoutSpace(availW, availH);
  const reusedEntry = tryReuseEntry(node, available, index);
  if (reusedEntry) {
    return reusedEntry;
  }

  let entry: MutableLayoutEntry;
  switch (node.kind) {
    case 'text':
      entry = planText(node, x, y, availW, availH, index, nextId);
      break;
    case 'row':
      entry = planRow(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'column':
      entry = planColumn(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'box':
      entry = planBox(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'empty':
      entry = planEmpty(node, x, y, availW, availH, index, nextId);
      break;
    case 'scroll':
      entry = planScroll(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'focus':
      entry = planFocus(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'component':
      entry = planComponent(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'event':
      entry = planEvent(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'hover':
      entry = planHover(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'image':
      entry = planImage(node, x, y, availW, availH, index, nextId);
      break;
    case 'overlay':
      entry = planOverlay(node, x, y, index, nextId, overlays);
      break;
    case 'flex':
      entry = planFlex(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'memo':
      entry = planMemo(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'suspense':
      entry = planSuspense(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'portal':
      entry = planPortal(node, x, y, index, nextId, overlays);
      break;
    case 'localState':
      entry = planLocalState(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'lazy':
      entry = planLazy(node, x, y, availW, availH, index, nextId, overlays);
      break;
    case 'tabGroup':
      entry = planTabGroup(node, x, y, availW, availH, index, nextId, overlays);
      break;
  }

  if ('style' in node && node.style) {
    const bp = getBreakpoint(availW);
    const resolved = resolveStyle(node.style as StyleAttrs, bp);
    if (resolved) {
      entry.resolvedStyle = resolved;
    }
  }

  entry.available = available;
  entry.fingerprint = nodeFingerprint(node, available);
  const activeContext = getActiveLayoutContext();
  if (activeContext) activeContext.stats.plannedEntries += 1;
  traceEntry('plan', entry, available);
  return entry;
}
