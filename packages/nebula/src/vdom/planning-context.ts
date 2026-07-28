/**
 * Extracted from ../vdom.ts. Behavior-preserving split.
 */

import type { LayoutEntry, LayoutPlan, LayoutTraceEntry } from './layout-types.js';
import type { PortalNode, VNode } from './nodes.js';
import type { ComponentRenderContext, LayoutSpace } from './style.js';

export interface ActiveLayoutContext {
  terminal: LayoutSpace;
  previousPlan?: LayoutPlan;
  previousIndex: Map<string, LayoutEntry>;
  trace?: LayoutTraceEntry[];
  stats: {
    plannedEntries: number;
    reusedEntries: number;
  };
}

let activeLayoutContext: ActiveLayoutContext | null = null;
export interface PortalCollector {
  entries: Array<{ node: PortalNode; child: VNode; pointerEvents?: 'auto' | 'none' }>;
}

let activePortalCollector: PortalCollector | null = null;

export function getActiveLayoutContext(): ActiveLayoutContext | null {
  return activeLayoutContext;
}

export function setActiveLayoutContext(context: ActiveLayoutContext | null): void {
  activeLayoutContext = context;
}

export function getActivePortalCollector(): PortalCollector | null {
  return activePortalCollector;
}

export function setActivePortalCollector(collector: PortalCollector | null): void {
  activePortalCollector = collector;
}

export function createLayoutSpace(cols: number, rows: number): LayoutSpace {
  return {
    cols: Math.max(0, Math.floor(cols)),
    rows: Math.max(0, Math.floor(rows)),
  };
}

export function resolveRenderContext(containerWidth: number, context?: Partial<ComponentRenderContext>): ComponentRenderContext {
  const fallbackRows = context?.container?.rows ?? context?.available?.rows ?? context?.terminal?.rows ?? 24;
  const terminal = createLayoutSpace(context?.terminal?.cols ?? containerWidth, context?.terminal?.rows ?? fallbackRows);
  const available = createLayoutSpace(
    context?.available?.cols ?? context?.container?.cols ?? containerWidth,
    context?.available?.rows ?? context?.container?.rows ?? terminal.rows,
  );
  const container = createLayoutSpace(context?.container?.cols ?? available.cols, context?.container?.rows ?? available.rows);
  return { terminal, available, container };
}

export function createPlanningRenderContext(availW: number, availH: number): ComponentRenderContext {
  const terminal = activeLayoutContext?.terminal ?? createLayoutSpace(availW, availH);
  const available = createLayoutSpace(availW, availH);
  return {
    terminal,
    available,
    container: available,
  };
}

function layoutSpaceEqual(left: LayoutSpace | undefined, right: LayoutSpace): boolean {
  return left?.cols === right.cols && left?.rows === right.rows;
}

/**
 * Lightweight fingerprint for layout reuse. Uses content length instead of
 * full content to avoid RangeError on large text nodes. Never recurses
 * into children — each child is fingerprinted independently via planNode.
 */
export function nodeFingerprint(node: VNode, _available: LayoutSpace): string {
  switch (node.kind) {
    case 'text':
      return `t:${node.content.length}:${node.wrap ?? false}:${node.href ?? ''}`;
    case 'empty':
      return `e:${node.width ?? ''}:${node.height ?? ''}`;
    case 'row':
      return `r:${node.gap ?? 0}:${node.children.length}`;
    case 'column':
      return `c:${node.gap ?? 0}:${node.children.length}`;
    case 'box':
      return `b:${node.width ?? ''}:${node.height ?? ''}:${node.fit ?? 'fill'}:${node.overflow ?? 'v'}:${node.scrollOffset ?? 0}:${node.children.length}`;
    case 'scroll':
      return `s:${node.offset}:${node.height}`;
    case 'focus':
      return `f:${node.id}:${node.focused}`;
    case 'component':
      return `C:${node.key ?? ''}`;
    case 'event':
      return `E:${node.id}`;
    case 'hover':
      return `h:${node.id}:${node.hovered}`;
    case 'image':
      return `i:${node.width}:${node.height}`;
    case 'overlay':
      return `o:${node.x}:${node.y}:${node.width ?? ''}:${node.height ?? ''}`;
    case 'flex':
      return `F:${node.flex ?? 1}`;
    case 'memo':
      return `m:${node.deps?.length ?? 0}`;
    case 'suspense':
      return `S:${node.resolved}`;
    case 'portal':
      return `p:${node.target}:${node.transparent ?? false}`;
    case 'localState':
      return `l:${node.key}`;
    case 'lazy':
      return `L:${node.key}`;
    case 'tabGroup':
      return `T:${node.id}:${node.activeIndex}:${node.children.length}`;
  }
}

export function entryLayoutId(node: VNode): string | undefined {
  return 'layoutId' in node ? node.layoutId : undefined;
}

function addEntryToIndex(entry: LayoutEntry, index: Map<string, LayoutEntry>): void {
  if (entryLayoutId(entry.node)) {
    index.set(entry.id, entry);
  }
  for (const child of entry.children) {
    addEntryToIndex(child, index);
  }
}

function countEntries(entry: LayoutEntry): number {
  return 1 + entry.children.reduce((sum, child) => sum + countEntries(child), 0);
}

function cloneEntryForReuse(entry: LayoutEntry): LayoutEntry {
  return {
    ...entry,
    reused: true,
    children: entry.children.map((child) => cloneEntryForReuse(child)),
  };
}

export function traceEntry(phase: 'plan' | 'reuse', entry: LayoutEntry, available: LayoutSpace): void {
  activeLayoutContext?.trace?.push({
    phase,
    nodeKind: entry.node.kind,
    id: entry.id,
    layoutId: entryLayoutId(entry.node),
    rect: entry.rect,
    available,
    details: phase === 'reuse' ? { reused: true } : undefined,
  });
}

export function tryReuseEntry(node: VNode, available: LayoutSpace, index: Map<string, LayoutEntry>): LayoutEntry | null {
  const layoutId = entryLayoutId(node);
  if (!activeLayoutContext?.previousPlan || !layoutId || ('layoutDirty' in node && node.layoutDirty === true)) {
    return null;
  }

  const previous = activeLayoutContext.previousIndex.get(layoutId);
  if (!previous || !layoutSpaceEqual(previous.available, available)) {
    return null;
  }

  // Reference equality — if the exact same VNode object, skip fingerprinting entirely
  if (node !== previous.node && previous.fingerprint !== nodeFingerprint(node, available)) {
    return null;
  }

  const reused = cloneEntryForReuse(previous);
  addEntryToIndex(reused, index);
  activeLayoutContext.stats.reusedEntries += countEntries(reused);
  traceEntry('reuse', reused, available);
  return reused;
}
