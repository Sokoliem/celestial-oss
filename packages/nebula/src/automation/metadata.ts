import type { AriaAttrs } from '../a11y.js';
import type { VNode } from '../vdom.js';

export interface VNodeMeta {
  id?: string;
  classes?: readonly string[];
  states?: readonly string[];
  label?: string;
  testId?: string;
  a11y?: AriaAttrs;
}

const nodeMetadata = new WeakMap<VNode, VNodeMeta>();

export function getVNodeMeta(node: VNode): VNodeMeta | undefined {
  return nodeMetadata.get(node);
}

export function setVNodeMeta(node: VNode, meta: Partial<VNodeMeta>): void {
  const existing = nodeMetadata.get(node);
  nodeMetadata.set(node, { ...existing, ...meta });
}

export function withMetadata(meta: Partial<VNodeMeta>, node: VNode): VNode {
  setVNodeMeta(node, meta);
  return node;
}

export function withClass(className: string, node: VNode): VNode {
  const existing = getVNodeMeta(node)?.classes ?? [];
  if (existing.includes(className)) {
    return node;
  }

  setVNodeMeta(node, { classes: [...existing, className] });
  return node;
}

export function withState(state: string, enabled: boolean, node: VNode): VNode {
  const existing = getVNodeMeta(node)?.states ?? [];
  const next = enabled ? (existing.includes(state) ? [...existing] : [...existing, state]) : existing.filter((value) => value !== state);

  setVNodeMeta(node, { states: next });
  return node;
}
