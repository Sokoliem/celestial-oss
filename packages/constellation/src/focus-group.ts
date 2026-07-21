import type { VNode } from '@celestial/core/nebula';
import { transformVNode } from './vnode-transform.js';

let idCounter = 0;

export function generateFocusGroupId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

export function _resetIdCounter(): void {
  idCounter = 0;
}

export function assignFocusGroup(node: VNode, group: string): VNode {
  return transformVNode(node, (current) => (current.kind === 'focus' ? { ...current, group } : current));
}
