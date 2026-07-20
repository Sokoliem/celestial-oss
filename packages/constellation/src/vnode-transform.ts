import type { VNode } from '@celestial/core/nebula';

/**
 * Transform a VNode tree without dropping deferred or layered descendants.
 *
 * Component helpers such as modal wrapping and focus scoping need to reach
 * nodes that are materialized later by component, memo, local-state, and lazy
 * boundaries. Keeping that traversal in one place prevents new VNode kinds
 * from silently escaping component-level contracts.
 */
export function transformVNode(node: VNode, transform: (node: VNode) => VNode): VNode {
  let mapped: VNode;

  switch (node.kind) {
    case 'row':
    case 'column':
    case 'box':
    case 'tabGroup':
      mapped = { ...node, children: node.children.map((child) => transformVNode(child, transform)) };
      break;
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      mapped = { ...node, child: transformVNode(node.child, transform) };
      break;
    case 'component':
      mapped = { ...node, render: (context) => transformVNode(node.render(context), transform) };
      break;
    case 'memo':
      mapped = { ...node, render: () => transformVNode(node.render(), transform) };
      break;
    case 'suspense':
      mapped = {
        ...node,
        child: transformVNode(node.child, transform),
        fallback: transformVNode(node.fallback, transform),
      };
      break;
    case 'localState':
      mapped = {
        ...node,
        view: (state, dispatch) => transformVNode(node.view(state, dispatch), transform),
      };
      break;
    case 'lazy':
      mapped = {
        ...node,
        placeholder: transformVNode(node.placeholder, transform),
        loader: async () => {
          const render = await node.loader();
          return () => transformVNode(render(), transform);
        },
      };
      break;
    case 'text':
    case 'empty':
    case 'image':
      mapped = node;
      break;
  }

  return transform(mapped);
}
