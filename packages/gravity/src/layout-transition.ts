import type { LayoutTransitionConfig, VNode } from '@celestial/nebula';
import { getActiveLayoutOverrides } from './layout-transition-context.js';
import { preferReducedMotion } from './motion-prefs.js';
import type { ComponentNode } from './types.js';

export type LayoutIdSource = 'focus-id' | 'component-key' | 'layout-id';

export interface LayoutTransitionOptions {
  /** Subtree to wrap. Returned untouched when reduceMotion is on. */
  child: VNode;
  /** Per-id transition override(s). Registered on the active compositor. */
  transitions?: LayoutTransitionConfig | Record<string, LayoutTransitionConfig>;
  /**
   * How to derive layoutIds for nodes in the subtree. Defaults to 'id'
   * (FocusNode.id then ComponentNode.key). Pass a function for full control.
   */
  trackBy?: 'id' | ((node: VNode) => string | undefined);
  /** Override the global motion preference. */
  reduceMotion?: boolean;
}

/**
 * Wrap a subtree so that nodes with stable identity participate in FLIP
 * layout transitions on the host's nebula compositor.
 *
 * The host must (1) install a compositor via
 * `installDefaultLayoutCompositor` (or `setActiveLayoutCompositor` with a
 * custom one) and (2) call `compositor.update(plan, now)` between
 * `planLayout` and `rasterize` on every frame.
 */
export function layoutTransition(options: LayoutTransitionOptions): ComponentNode | VNode {
  if (preferReducedMotion(options.reduceMotion)) {
    return options.child;
  }

  registerLayoutTransitions(options.transitions);

  const child = assignLayoutIds(options.child, options.trackBy ?? 'id');

  return {
    kind: 'component',
    render: () => child,
  };
}

/**
 * Register per-id `LayoutTransitionConfig` entries on the active compositor's
 * overrides map. Pass a single config to apply it as a synthetic default for
 * any new ids assigned by `assignLayoutIds`; pass an object to register
 * specific layoutIds. No-op when there is no active compositor.
 */
export function registerLayoutTransitions(transitions?: LayoutTransitionConfig | Record<string, LayoutTransitionConfig>): void {
  if (!transitions) return;
  const overrides = getActiveLayoutOverrides();
  if (!overrides) return;

  if (isLayoutTransitionConfig(transitions)) {
    overrides.set('__gravity_default__', transitions);
    return;
  }

  for (const [id, config] of Object.entries(transitions)) {
    overrides.set(id, config);
  }
}

/**
 * Walk a subtree and assign `layoutId` to each child node based on `trackBy`.
 * Existing `layoutId` values are preserved. The 'id' strategy reads
 * `FocusNode.id` then `ComponentNode.key`.
 */
export function assignLayoutIds(node: VNode, trackBy: 'id' | ((node: VNode) => string | undefined) = 'id'): VNode {
  return walkAndAssign(node, trackBy);
}

function walkAndAssign(node: VNode, trackBy: 'id' | ((node: VNode) => string | undefined)): VNode {
  const derivedId = node.layoutId ?? deriveLayoutId(node, trackBy);
  const withId = derivedId && !node.layoutId ? withLayoutId(node, derivedId) : node;

  switch (withId.kind) {
    case 'box':
    case 'row':
    case 'column': {
      const children = withId.children.map((c) => walkAndAssign(c, trackBy));
      if (childrenChanged(withId.children, children)) {
        return { ...withId, children };
      }
      return withId;
    }
    case 'scroll':
    case 'focus':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'suspense':
    case 'portal': {
      const childNode = walkAndAssign(withId.child, trackBy);
      if (childNode !== withId.child) {
        return { ...withId, child: childNode };
      }
      return withId;
    }
    default:
      return withId;
  }
}

function deriveLayoutId(node: VNode, trackBy: 'id' | ((node: VNode) => string | undefined)): string | undefined {
  if (typeof trackBy === 'function') {
    return trackBy(node);
  }
  if (node.kind === 'focus') {
    return `focus:${node.id}`;
  }
  if (node.kind === 'component' && node.key) {
    return `component:${node.key}`;
  }
  if (node.kind === 'event') {
    return `event:${node.id}`;
  }
  return undefined;
}

function withLayoutId(node: VNode, layoutId: string): VNode {
  return { ...node, layoutId } as VNode;
}

function childrenChanged(prev: readonly VNode[], next: readonly VNode[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return true;
  }
  return false;
}

function isLayoutTransitionConfig(value: LayoutTransitionConfig | Record<string, LayoutTransitionConfig>): value is LayoutTransitionConfig {
  return typeof (value as LayoutTransitionConfig).duration === 'number' || typeof (value as LayoutTransitionConfig).spring === 'object';
}
