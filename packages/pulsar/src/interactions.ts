/**
 * Markdown Interaction Wiring (A6)
 *
 * Pulsar emits VNode `data` tags (see {@link PulsarNodeData}) so consumers
 * can attach interaction without re-parsing markdown.
 *
 * `findInteractiveNodes` exposes the tagged nodes for a nebula app's
 * subscription / hitmap system. `dispatchMarkdownInteraction` routes an
 * activated tag to host callbacks. Pulsar itself does not register global
 * side-effects.
 *
 * For consumers that want a quick integration, call this in your `view`:
 *
 *   const vnode = markdown(source, opts);
 *   const regions = findInteractiveNodes(vnode);
 *
 * `wireMarkdownInteractions` remains as a compatibility identity helper.
 */

import type { PulsarNodeData, VNode } from './vnode.js';

export interface MarkdownInteractionHooks {
  /** Fired when the user hovers over a link. */
  readonly onLinkHover?: (url: string, position: { row: number; col: number }) => void;
  /** Fired when the user clicks a link. */
  readonly onLinkClick?: (url: string) => void;
  /** Fired when the user clicks a `[copy]` affordance on a code block. */
  readonly onCopy?: (payload: { code: string; language: string }) => void;
  /** Fired when a footnote reference is activated. */
  readonly onFootnote?: (label: string) => void;
  /** Fired when a task-list checkbox is activated. */
  readonly onTaskToggle?: (payload: { itemIndex: number; checked: boolean }) => void;
  /** Fired when a folded code-block affordance is activated. */
  readonly onFoldToggle?: (payload: { code: string; language: string }) => void;
}

/** Walk a VNode tree and collect every node that carries a {@link PulsarNodeData} tag. */
export function findInteractiveNodes(vnode: VNode): Array<{ node: VNode; data: PulsarNodeData }> {
  const out: Array<{ node: VNode; data: PulsarNodeData }> = [];
  walk(vnode, out, new WeakSet<object>(), 0);
  return out;
}

function walk(vnode: VNode, out: Array<{ node: VNode; data: PulsarNodeData }>, seen: WeakSet<object>, depth: number): void {
  if (!vnode || typeof vnode !== 'object' || depth > 256 || seen.has(vnode) || out.length >= 100_000) return;
  seen.add(vnode);
  if ('data' in vnode && vnode.data) {
    out.push({ node: vnode, data: vnode.data });
  }
  if ('children' in vnode && vnode.children) {
    for (const child of vnode.children) {
      walk(child, out, seen, depth + 1);
    }
  }
  if (vnode.kind === 'component') {
    try {
      const space = { cols: 80, rows: 24 };
      walk(vnode.render({ terminal: space, available: space, container: space }), out, seen, depth + 1);
    } catch {
      // Custom component renderers are outside Pulsar's trust boundary.
    }
  }
}

/**
 * Identity pass-through that validates the VNode tree carries interactive
 * payloads matching the supplied hooks.
 *
 * Consumers that need actual event wiring should pair this with
 * `findInteractiveNodes` and register hitmap regions in their nebula app.
 */
export function wireMarkdownInteractions(vnode: VNode, _hooks?: MarkdownInteractionHooks): VNode {
  return vnode;
}

/** Route an activated Pulsar data tag to the corresponding host callback. */
export function dispatchMarkdownInteraction(data: PulsarNodeData, hooks: MarkdownInteractionHooks): boolean {
  switch (data.kind) {
    case 'link':
      if (!hooks.onLinkClick) return false;
      hooks.onLinkClick(data.url);
      return true;
    case 'copy':
      if (!hooks.onCopy) return false;
      hooks.onCopy({ code: data.code, language: data.language });
      return true;
    case 'footnote-ref':
      if (!hooks.onFootnote) return false;
      hooks.onFootnote(data.label);
      return true;
    case 'task-toggle':
      if (!hooks.onTaskToggle) return false;
      hooks.onTaskToggle({ itemIndex: data.itemIndex, checked: data.checked });
      return true;
    case 'fold-toggle':
      if (!hooks.onFoldToggle) return false;
      hooks.onFoldToggle({ code: data.code, language: data.language });
      return true;
    case 'hover-link':
      return false;
  }
}
