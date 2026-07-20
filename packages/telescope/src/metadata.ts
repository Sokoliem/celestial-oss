import { getVNodeMeta, setVNodeMeta, type VNode, type VNodeMeta } from '@celestial/core/nebula';

export type { VNodeMeta };

export function getMeta(node: VNode): VNodeMeta | undefined {
  return getVNodeMeta(node);
}

export function setMeta(node: VNode, meta: Partial<VNodeMeta>): void {
  setVNodeMeta(node, meta);
}
