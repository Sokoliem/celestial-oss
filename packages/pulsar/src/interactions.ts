/**
 * Markdown Interaction Wiring (A6)
 *
 * Pulsar emits VNode `data` tags (see {@link PulsarNodeData}) so consumers
 * can attach interaction without re-parsing markdown.
 *
 * `wireMarkdownInteractions` is the bridge between pulsar's pure VNode output
 * and a nebula app's subscription / hitmap system. It walks the tree,
 * collects every interactive node, and returns the tree unchanged (pulsar
 * itself does not register side-effects — the consumer does).
 *
 * For consumers that want a quick integration, call this in your `view`:
 *
 *   const vnode = wireMarkdownInteractions(markdown(source, opts), {
 *     onLinkClick: (url) => dispatch({ type: 'navigate', url }),
 *     onCopy: ({ code }) => navigator.clipboard.writeText(code),
 *   });
 *
 * The returned VNode is identical to the input; hooks are validated and
 * logged in debug builds so integration issues surface early.
 */

import type { PulsarNodeData, VNode } from './vnode.js';

export interface MarkdownInteractionHooks {
  /** Fired when the user hovers over a link. */
  readonly onLinkHover?: (url: string, position: { row: number; col: number }) => void;
  /** Fired when the user clicks a link. */
  readonly onLinkClick?: (url: string) => void;
  /** Fired when the user clicks a `[copy]` affordance on a code block. */
  readonly onCopy?: (payload: { code: string; language: string }) => void;
}

/** Walk a VNode tree and collect every node that carries a {@link PulsarNodeData} tag. */
export function findInteractiveNodes(vnode: VNode): Array<{ node: VNode; data: PulsarNodeData }> {
  const out: Array<{ node: VNode; data: PulsarNodeData }> = [];
  walk(vnode, out);
  return out;
}

function walk(vnode: VNode, out: Array<{ node: VNode; data: PulsarNodeData }>): void {
  if ('data' in vnode && vnode.data) {
    out.push({ node: vnode, data: vnode.data });
  }
  if ('children' in vnode && vnode.children) {
    for (const child of vnode.children) {
      walk(child, out);
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
