/**
 * Nebula Focus Management
 *
 * Pure-function focus manager for the celesTUI framework.
 * Maintains an ordered list of focusable elements, supports tab cycling,
 * and focus groups (traps) for modal-style navigation.
 */

import { type EchoHint, type LayerFocusMode, resolveMemo, type VNode } from './vdom.js';

// --- Focus State ---

export interface FocusState {
  /** Ordered list of focusable element IDs (sorted by tabIndex, then document order) */
  focusableIds: string[];
  /** Currently focused element ID, or null if nothing is focused */
  currentId: string | null;
  /** Stack of active focus groups (for modal focus traps) */
  groups: string[];
}

/** Collected info about a single FocusNode in the tree */
export interface FocusNodeInfo {
  id: string;
  tabIndex: number;
  group?: string;
  focused?: boolean;
  echoHint?: EchoHint;
}

// --- Factory ---

/** Create an empty focus state */
export function createFocusState(): FocusState {
  return {
    focusableIds: [],
    currentId: null,
    groups: [],
  };
}

// --- VNode Tree Walking ---

/**
 * Walk a VNode tree and collect all FocusNode entries in document order.
 * Returns them sorted by tabIndex (ascending), with document order as tiebreaker.
 */
export function collectFocusNodes(root: VNode): FocusNodeInfo[] {
  const nodes: FocusNodeInfo[] = [];
  const layers: FocusLayer[] = [];
  const order = { value: 0 };
  walkTree(root, nodes, layers, order, 0);

  const owner = layers
    .filter((layer) => layer.mode !== 'passive')
    .sort((a, b) => b.priority - a.priority || b.zIndex - a.zIndex || b.order - a.order)[0];
  const navigable = owner ? owner.nodes : nodes;

  // Stable sort: tabIndex ascending, document order preserved for ties.
  // Nodes without tabIndex default to 0.
  navigable.sort((a, b) => a.tabIndex - b.tabIndex);

  return navigable;
}

interface FocusLayer {
  mode: LayerFocusMode;
  priority: number;
  zIndex: number;
  order: number;
  nodes: FocusNodeInfo[];
}

function focusLayerRank(mode: LayerFocusMode): number {
  if (mode === 'modal' || mode === 'blocked') return 2;
  if (mode === 'active') return 1;
  return 0;
}

function walkLayer(
  child: VNode,
  mode: LayerFocusMode,
  zIndex: number,
  layers: FocusLayer[],
  order: { value: number },
  parentPriority: number,
): void {
  const priority = Math.max(parentPriority, focusLayerRank(mode));
  const layer: FocusLayer = {
    mode,
    priority,
    zIndex: Number.isFinite(zIndex) ? zIndex : 0,
    order: order.value++,
    nodes: [],
  };
  layers.push(layer);
  // Passive and blocked layers exclude their entire subtree from keyboard
  // ownership. In particular, an active/modal child must not escape an
  // unfocused window merely because it registers as a separate layer.
  if (mode === 'active' || mode === 'modal') walkTree(child, layer.nodes, layers, order, priority);
}

function walkTree(node: VNode, acc: FocusNodeInfo[], layers: FocusLayer[], order: { value: number }, priority: number): void {
  switch (node.kind) {
    case 'focus':
      acc.push({
        id: node.id,
        tabIndex: node.tabIndex ?? 0,
        group: node.group,
        ...(node.focused ? { focused: true } : {}),
        ...(node.echoHint ? { echoHint: node.echoHint } : {}),
      });
      // Also walk the child — it might contain nested focus nodes
      walkTree(node.child, acc, layers, order, priority);
      break;
    case 'box':
      for (const child of node.children) walkTree(child, acc, layers, order, priority);
      break;
    case 'row':
      for (const child of node.children) walkTree(child, acc, layers, order, priority);
      break;
    case 'column':
      for (const child of node.children) walkTree(child, acc, layers, order, priority);
      break;
    case 'scroll':
      walkTree(node.child, acc, layers, order, priority);
      break;
    case 'component':
      walkTree(node.render(), acc, layers, order, priority);
      break;
    case 'event':
      walkTree(node.child, acc, layers, order, priority);
      break;
    case 'hover':
      walkTree(node.child, acc, layers, order, priority);
      break;
    case 'overlay':
      if (node.focusMode) {
        walkLayer(node.child, node.focusMode, node.zIndex ?? 0, layers, order, priority);
      } else {
        walkTree(node.child, acc, layers, order, priority);
      }
      break;
    case 'flex':
      walkTree(node.child, acc, layers, order, priority);
      break;
    case 'memo':
      // Memo nodes resolve lazily; walk the render result
      walkTree(resolveMemo(node), acc, layers, order, priority);
      break;
    case 'suspense':
      // Only walk the active branch
      walkTree(node.resolved ? node.child : node.fallback, acc, layers, order, priority);
      break;
    case 'portal':
      if (node.focusMode) {
        // Portals paint after ordinary overlays, so they win equal-priority
        // focus ownership unless a modal layer is present.
        walkLayer(node.child, node.focusMode, Number.MAX_SAFE_INTEGER, layers, order, priority);
      } else {
        // Walk the portal's child at declaration site for focus collection
        walkTree(node.child, acc, layers, order, priority);
      }
      break;
    case 'localState':
      // LocalState resolves dynamically; skip deep walk to avoid side effects
      break;
    case 'lazy':
      // Lazy nodes may not be loaded; walk placeholder
      walkTree(node.placeholder, acc, layers, order, priority);
      break;
    case 'tabGroup':
      for (const child of node.children) walkTree(child, acc, layers, order, priority);
      break;
    case 'text':
    case 'empty':
    case 'image':
      // Leaf nodes — nothing to collect
      break;
  }
}

// --- Navigation ---

/**
 * Sync focus state with the current VNode tree.
 * Updates the focusable ID list and ensures currentId is still valid.
 */
export function syncFocusState(state: FocusState, root: VNode): FocusState {
  const nodes = collectFocusNodes(root);
  const focusableIds = nodes.map((n) => n.id);

  let currentId = state.currentId;

  // If current ID is no longer in the tree, reset to first available
  if (currentId !== null && !focusableIds.includes(currentId)) {
    const navigable = getNavigableIdsFromList(focusableIds, state.groups, nodes);
    currentId = navigable.length > 0 ? navigable[0]! : null;
  }

  return { ...state, focusableIds, currentId };
}

/** Helper to get navigable IDs without requiring a full FocusState */
function getNavigableIdsFromList(focusableIds: string[], groups: string[], allNodes: FocusNodeInfo[]): string[] {
  if (groups.length === 0) {
    return focusableIds;
  }
  const activeGroup = groups[groups.length - 1]!;
  const groupIds = new Set(allNodes.filter((n) => n.group === activeGroup).map((n) => n.id));
  return focusableIds.filter((id) => groupIds.has(id));
}

/** Move focus to the next focusable element, wrapping around */
export function focusNext(state: FocusState, allNodes?: FocusNodeInfo[]): FocusState {
  const navigable = allNodes ? getNavigableIdsFromList(state.focusableIds, state.groups, allNodes) : state.focusableIds;
  if (navigable.length === 0) return state;

  if (state.currentId === null) {
    return { ...state, currentId: navigable[0]! };
  }

  const idx = navigable.indexOf(state.currentId);
  if (idx === -1) {
    return { ...state, currentId: navigable[0]! };
  }

  const nextIdx = (idx + 1) % navigable.length;
  return { ...state, currentId: navigable[nextIdx]! };
}

/** Move focus to the previous focusable element, wrapping around */
export function focusPrev(state: FocusState, allNodes?: FocusNodeInfo[]): FocusState {
  const navigable = allNodes ? getNavigableIdsFromList(state.focusableIds, state.groups, allNodes) : state.focusableIds;
  if (navigable.length === 0) return state;

  if (state.currentId === null) {
    return { ...state, currentId: navigable[navigable.length - 1]! };
  }

  const idx = navigable.indexOf(state.currentId);
  if (idx === -1) {
    return { ...state, currentId: navigable[navigable.length - 1]! };
  }

  const prevIdx = (idx - 1 + navigable.length) % navigable.length;
  return { ...state, currentId: navigable[prevIdx]! };
}

/** Focus a specific element by ID. No-op if ID is not in the focusable list. */
export function focusById(state: FocusState, id: string): FocusState {
  if (!state.focusableIds.includes(id)) return state;
  return { ...state, currentId: id };
}

// --- Focus Groups (Traps) ---

/**
 * Push a focus group onto the stack. Navigation will be restricted to
 * elements belonging to this group. The first element in the group
 * receives focus.
 */
export function pushFocusGroup(state: FocusState, group: string): FocusState {
  const newGroups = [...state.groups, group];
  return { ...state, groups: newGroups };
}

/**
 * Pop the top focus group from the stack. Navigation returns to the
 * previous group (or all elements if the stack is empty).
 */
export function popFocusGroup(state: FocusState): FocusState {
  if (state.groups.length === 0) return state;
  const newGroups = state.groups.slice(0, -1);
  return { ...state, groups: newGroups };
}

// --- VNode Tree Patching ---

/**
 * Walk a VNode tree and set `focused: true` on the FocusNode whose id
 * matches the given currentId, and `focused: false` on all others.
 * Returns a new tree (does not mutate the original).
 */
export function applyFocusToTree(root: VNode, currentId: string | null): VNode {
  return patchNode(root, currentId);
}

function patchNode(node: VNode, currentId: string | null): VNode {
  switch (node.kind) {
    case 'focus': {
      const newFocused = node.id === currentId;
      const newChild = patchNode(node.child, currentId);
      if (newFocused === node.focused && newChild === node.child) return node;
      return { ...node, focused: newFocused, child: newChild };
    }
    case 'box': {
      const newChildren = patchChildren(node.children, currentId);
      if (newChildren === node.children) return node;
      return { ...node, children: newChildren };
    }
    case 'row': {
      const newChildren = patchChildren(node.children, currentId);
      if (newChildren === node.children) return node;
      return { ...node, children: newChildren };
    }
    case 'column': {
      const newChildren = patchChildren(node.children, currentId);
      if (newChildren === node.children) return node;
      return { ...node, children: newChildren };
    }
    case 'scroll': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'component':
      // Components are lazily rendered — we cannot patch them structurally.
      // The runtime will apply focus after the component renders.
      return node;
    case 'event': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'hover': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'overlay': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'flex': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'memo':
      return node;
    case 'suspense': {
      const nextChild = patchNode(node.child, currentId);
      const nextFallback = patchNode(node.fallback, currentId);
      if (nextChild === node.child && nextFallback === node.fallback) return node;
      return { ...node, child: nextChild, fallback: nextFallback };
    }
    case 'portal': {
      const newChild = patchNode(node.child, currentId);
      if (newChild === node.child) return node;
      return { ...node, child: newChild };
    }
    case 'localState':
      return node;
    case 'lazy': {
      const newPlaceholder = patchNode(node.placeholder, currentId);
      if (newPlaceholder === node.placeholder) return node;
      return { ...node, placeholder: newPlaceholder };
    }
    case 'tabGroup': {
      const newChildren = patchChildren(node.children, currentId);
      if (newChildren === node.children) return node;
      return { ...node, children: newChildren };
    }
    case 'text':
    case 'empty':
    case 'image':
      return node;
  }
}

function patchChildren(children: VNode[], currentId: string | null): VNode[] {
  let changed = false;
  const result: VNode[] = [];
  for (const child of children) {
    const patched = patchNode(child, currentId);
    if (patched !== child) changed = true;
    result.push(patched);
  }
  return changed ? result : children;
}
