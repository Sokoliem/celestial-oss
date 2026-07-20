import { describe, expect, it } from 'vitest';
import { portal } from '../elements.js';
import { collectFocusNodes } from '../focus.js';
import type { BoxNode, ColumnNode, FocusNode, VNode } from '../vdom.js';
import { measure, planLayout, rasterize } from '../vdom.js';

function mkText(content: string): VNode {
  return { kind: 'text', content };
}

function mkBox(child: VNode, opts?: Partial<BoxNode>): BoxNode {
  return {
    kind: 'box',
    children: [child],
    ...opts,
  } as BoxNode;
}

function mkFocus(id: string, child: VNode): FocusNode {
  return { kind: 'focus', id, child, focused: false };
}

describe('portal() VNode', () => {
  describe('measure()', () => {
    it('should measure as zero-size (portals do not participate in flow)', () => {
      const node = portal('target', mkText('dropdown'));
      const size = measure(node, 80);
      expect(size.width).toBe(0);
      expect(size.height).toBe(0);
    });
  });

  describe('planLayout()', () => {
    it('should produce a zero-size entry in the flow', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [mkText('above'), portal('my-target', mkText('portal content')), mkText('below')],
      };
      const plan = planLayout(col, 80, 24);
      // Portal entry should be zero-size
      const portalEntry = plan.root.children[1]!;
      expect(portalEntry.node.kind).toBe('portal');
      expect(portalEntry.rect.width).toBe(0);
      expect(portalEntry.rect.height).toBe(0);
    });

    it('should render portal content at target position', () => {
      // Create a layout with a target and a portal
      const col: ColumnNode = {
        kind: 'column',
        children: [{ ...mkText('target area'), layoutId: 'my-target' } as VNode, portal('my-target', mkText('PORTAL'))],
      };
      const plan = planLayout(col, 80, 24);

      // Portal content should appear in the overlays
      const portalOverlay = plan.overlays.find((ov) => {
        const text = ov.entry.node;
        return text.kind === 'text' && text.content === 'PORTAL';
      });
      expect(portalOverlay).toBeDefined();
    });

    it('should gracefully handle missing target', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [mkText('content'), portal('nonexistent-target', mkText('orphan'))],
      };
      // Should not throw
      const plan = planLayout(col, 80, 24);
      expect(plan.root).toBeDefined();
      // Portal content should not appear in overlays since target is missing
      expect(plan.overlays.length).toBe(0);
    });

    it('should escape parent overflow:hidden clipping', () => {
      const clippedBox = mkBox(
        {
          kind: 'column',
          children: [{ ...mkText('target'), layoutId: 'clip-target' } as VNode, portal('clip-target', mkText('ESCAPED'))],
        } as VNode,
        { overflow: 'hidden', width: 5, height: 2 },
      );
      const plan = planLayout(clippedBox, 80, 24);
      // Portal content appears as overlay, so it escapes the overflow:hidden box
      const portalOverlay = plan.overlays.find((ov) => {
        const text = ov.entry.node;
        return text.kind === 'text' && text.content === 'ESCAPED';
      });
      expect(portalOverlay).toBeDefined();
    });
  });

  describe('focus collection', () => {
    it('should collect focus nodes inside portal at declaration site', () => {
      const node: ColumnNode = {
        kind: 'column',
        children: [portal('target', mkFocus('portal-btn', mkText('click me')))],
      };
      const focusNodes = collectFocusNodes(node);
      expect(focusNodes.length).toBe(1);
      expect(focusNodes[0]!.id).toBe('portal-btn');
    });
  });

  describe('rasterization', () => {
    it('should rasterize portal content via overlays', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [{ ...mkText('X'), layoutId: 'render-target' } as VNode, portal('render-target', mkText('P'))],
      };
      const plan = planLayout(col, 80, 24);
      const grid = rasterize(plan);
      // The portal content 'P' should overwrite 'X' at position (0,0)
      expect(grid.cells[0]![0]!.char).toBe('P');
    });

    it('preserves target cells beneath unpainted transparent portal cells', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [{ ...mkText('BASE'), layoutId: 'render-target' } as VNode, portal('render-target', mkText('T P'), { transparent: true })],
      };
      const plan = planLayout(col, 4, 1);
      const grid = rasterize(plan);

      expect(plan.overlays[0]?.transparent).toBe(true);
      expect(grid.cells[0]!.map((cell) => cell.char).join('')).toBe('TAPE');
    });
  });
});
