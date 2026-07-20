import type { VNode } from '@celestial/core/nebula';

let idCounter = 0;

export function generateFocusGroupId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

export function _resetIdCounter(): void {
  idCounter = 0;
}

export function assignFocusGroup(node: VNode, group: string): VNode {
  switch (node.kind) {
    case 'focus':
      return { ...node, group, child: assignFocusGroup(node.child, group) };
    case 'box':
      return { ...node, children: node.children.map((child) => assignFocusGroup(child, group)) };
    case 'row':
      return { ...node, children: node.children.map((child) => assignFocusGroup(child, group)) };
    case 'column':
      return { ...node, children: node.children.map((child) => assignFocusGroup(child, group)) };
    case 'scroll':
      return { ...node, child: assignFocusGroup(node.child, group) };
    case 'event':
      return { ...node, child: assignFocusGroup(node.child, group) };
    case 'hover':
      return { ...node, child: assignFocusGroup(node.child, group) };
    case 'overlay':
      return { ...node, child: assignFocusGroup(node.child, group) };
    case 'flex':
      return { ...node, child: assignFocusGroup(node.child, group) };
    case 'component':
      return { ...node, render: (context) => assignFocusGroup(node.render(context), group) };
    default:
      return node;
  }
}
