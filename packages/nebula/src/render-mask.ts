import type { Plugin } from './plugin.js';
import type { VNode } from './vdom.js';

export interface OutputMaskOptions {
  patterns?: readonly RegExp[];
  replacement?: string;
}

const DEFAULT_PATTERNS = [/\b(?:api[_-]?key|token|secret|password)=\S+/gi, /\bsk-[A-Za-z0-9_-]{8,}\b/g] as const;

function maskTextValue(value: string, patterns: readonly RegExp[], replacement: string): string {
  let next = value;
  for (const pattern of patterns) {
    next = next.replace(pattern, replacement);
  }
  return next;
}

export function maskVNode(node: VNode, options: OutputMaskOptions = {}): VNode {
  const patterns = options.patterns ?? DEFAULT_PATTERNS;
  const replacement = options.replacement ?? '[secure]';

  switch (node.kind) {
    case 'text':
      return {
        ...node,
        content: maskTextValue(node.content, patterns, replacement),
        href: node.href ? maskTextValue(node.href, patterns, replacement) : node.href,
      };
    case 'box':
      return { ...node, children: node.children.map((child) => maskVNode(child, options)) };
    case 'row':
    case 'column':
      return { ...node, children: node.children.map((child) => maskVNode(child, options)) };
    case 'scroll':
      return { ...node, child: maskVNode(node.child, options) };
    case 'focus':
      return { ...node, child: maskVNode(node.child, options) };
    case 'component':
      return { ...node, render: (context) => maskVNode(node.render(context), options) };
    case 'event':
      return { ...node, child: maskVNode(node.child, options) };
    case 'hover':
      return { ...node, child: maskVNode(node.child, options) };
    case 'image':
      return { ...node, content: maskTextValue(node.content, patterns, replacement) };
    case 'overlay':
      return { ...node, child: maskVNode(node.child, options) };
    case 'flex':
      return { ...node, child: maskVNode(node.child, options) };
    case 'memo':
      return { ...node, render: () => maskVNode(node.render(), options) };
    case 'suspense':
      return { ...node, child: maskVNode(node.child, options), fallback: maskVNode(node.fallback, options) };
    case 'portal':
      return { ...node, child: maskVNode(node.child, options) };
    case 'localState':
      return {
        ...node,
        view: (s: unknown, d: (a: unknown) => void) =>
          maskVNode((node.view as (s: unknown, d: (a: unknown) => void) => import('./vdom.js').VNode)(s, d), options),
      };
    case 'lazy':
      return { ...node, placeholder: maskVNode(node.placeholder, options) };
    case 'tabGroup':
      return { ...node, children: node.children.map((child) => maskVNode(child, options)) };
    case 'empty':
      return node;
  }
}

export function createOutputMaskPlugin<Model, M>(options: OutputMaskOptions = {}): Plugin<Model, M> {
  return {
    name: 'output-mask',
    wrap(config) {
      return {
        ...config,
        view: (model) => maskVNode(config.view(model), options),
      };
    },
  };
}

export { DEFAULT_PATTERNS, maskTextValue };
