import { column, flex, planLayout, text, type VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { floating } from '../stack.js';

function textNode(content: string): VNode {
  return { kind: 'text', content };
}

/** Recursively resolve component nodes to get the final VNode tree */
function resolve(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolve(node.render());
  }
  return node;
}

/** Deep-resolve all component nodes in a tree */
function deepResolve(node: VNode): VNode {
  const resolved = resolve(node);

  switch (resolved.kind) {
    case 'row':
      return { ...resolved, children: resolved.children.map(deepResolve) };
    case 'column':
      return { ...resolved, children: resolved.children.map(deepResolve) };
    case 'box':
      return { ...resolved, children: resolved.children.map(deepResolve) };
    case 'focus':
      return { ...resolved, child: deepResolve(resolved.child) };
    case 'scroll':
      return { ...resolved, child: deepResolve(resolved.child) };
    case 'overlay':
      return { ...resolved, child: deepResolve(resolved.child) };
    default:
      return resolved;
  }
}

describe('floating', () => {
  describe('basic rendering', () => {
    it('should return a component node', () => {
      const result = floating({
        base: textNode('background'),
        overlay: textNode('popup'),
        x: 5,
        y: 3,
        width: 20,
        height: 10,
      });

      expect(result.kind).toBe('component');
    });

    it('should render base content when resolved', () => {
      const result = floating({
        base: textNode('background'),
        overlay: textNode('popup'),
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      });

      const tree = deepResolve(result);

      // The resolved tree should contain the base text somewhere
      const allText = collectTextContent(tree);
      expect(allText).toContain('background');
    });

    it('should render overlay content when resolved', () => {
      const result = floating({
        base: textNode('background'),
        overlay: textNode('popup'),
        x: 5,
        y: 3,
        width: 20,
        height: 10,
      });

      const tree = deepResolve(result);

      // The resolved tree should contain the overlay text
      const allText = collectTextContent(tree);
      expect(allText).toContain('popup');
    });
  });

  describe('overlay positioning', () => {
    it('should position overlay at specified coordinates', () => {
      const result = floating({
        base: textNode('bg'),
        overlay: textNode('fg'),
        x: 10,
        y: 5,
        width: 20,
        height: 8,
      });

      const tree = deepResolve(result);

      // The tree should contain an overlay node with correct positioning
      const overlays = collectOverlayNodes(tree);
      const overlay = overlays[0];

      expect(overlay).toBeDefined();
      expect(overlay.x).toBe(10);
      expect(overlay.y).toBe(5);
    });

    it('should constrain overlay to specified dimensions', () => {
      const result = floating({
        base: textNode('bg'),
        overlay: textNode('fg'),
        x: 0,
        y: 0,
        width: 30,
        height: 15,
      });

      const tree = deepResolve(result);

      // The overlay node should have the specified dimensions
      const overlays = collectOverlayNodes(tree);
      const overlay = overlays[0];

      expect(overlay).toBeDefined();
      expect(overlay.width).toBe(30);
      expect(overlay.height).toBe(15);
      expect(overlay.transparent).toBe(true);
    });
  });

  describe('z-ordering', () => {
    it('should include both base and overlay in the tree structure', () => {
      const base = textNode('base-layer');
      const overlay = textNode('overlay-layer');

      const result = floating({
        base,
        overlay,
        x: 0,
        y: 0,
        width: 10,
        height: 5,
      });

      const tree = deepResolve(result);
      const allText = collectTextContent(tree);

      // Both layers should be present
      expect(allText).toContain('base-layer');
      expect(allText).toContain('overlay-layer');
    });
  });

  describe('layout invariants', () => {
    it('does not change the base rectangle when a floating layer opens', () => {
      const base = column(text('header'), flex(text('body')), text('status'));
      const plain = planLayout(base, 80, 24);
      const layered = planLayout(floating({ base, overlay: text('popup'), x: 10, y: 4, width: 30, height: 8 }), 80, 24);
      const rendered = layered.root.children[0];
      const flexEntry = rendered?.children[0];
      const layeredBase = flexEntry?.children[0];

      expect(layeredBase?.rect).toEqual(plain.root.rect);
      expect(layered.overlays[0]?.entry.rect).toEqual({ x: 10, y: 4, width: 30, height: 8 });
    });
  });
});

/** Collect all text content from a VNode tree */
function collectTextContent(node: VNode): string[] {
  const texts: string[] = [];

  function walk(n: VNode): void {
    switch (n.kind) {
      case 'text':
        texts.push(n.content);
        break;
      case 'row':
      case 'column':
        n.children.forEach(walk);
        break;
      case 'box':
        n.children.forEach(walk);
        break;
      case 'focus':
      case 'flex':
        walk(n.child);
        break;
      case 'scroll':
        walk(n.child);
        break;
      case 'component':
        walk(n.render());
        break;
      case 'overlay':
        walk(n.child);
        break;
      case 'empty':
        break;
    }
  }

  walk(node);
  return texts;
}

/** Collect all overlay nodes from a VNode tree */
function collectOverlayNodes(node: VNode): any[] {
  const overlays: any[] = [];

  function walk(n: VNode): void {
    switch (n.kind) {
      case 'overlay':
        overlays.push(n);
        walk(n.child);
        break;
      case 'row':
      case 'column':
        n.children.forEach(walk);
        break;
      case 'box':
        n.children.forEach(walk);
        break;
      case 'focus':
      case 'flex':
        walk(n.child);
        break;
      case 'scroll':
        walk(n.child);
        break;
      case 'component':
        walk(n.render());
        break;
    }
  }

  walk(node);
  return overlays;
}
