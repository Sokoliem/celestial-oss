import type { BoxNode, EventNode, OverlayNode, TextNode, VNode } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { anchor, popover, popoverCaret, resolveAnchorPlacement } from '../anchor.js';

const TERMINAL = { cols: 80, rows: 24 };

function resolveTree(node: VNode, cols = TERMINAL.cols, rows = TERMINAL.rows): VNode {
  if (node.kind === 'component') {
    return resolveTree(node.render({ terminal: { cols, rows }, available: { cols, rows }, container: { cols, rows } }), cols, rows);
  }
  return node;
}

describe('resolveAnchorPlacement', () => {
  const trigger = { x: 10, y: 10, width: 4, height: 1 };
  const popoverSize = { width: 8, height: 4 };

  it('positions bottom-start under the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'bottom-start' });
    expect(placement.placement).toBe('bottom-start');
    expect(placement.x).toBe(10);
    expect(placement.y).toBe(11);
  });

  it('positions bottom-center centered on the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'bottom-center' });
    // trigger center x = 10 + 4/2 = 12; popover left = 12 - 8/2 = 8
    expect(placement.x).toBe(8);
    expect(placement.y).toBe(11);
  });

  it('positions bottom-end with trailing edge aligned to the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'bottom-end' });
    // trigger right = 14; popover left = 14 - 8 = 6
    expect(placement.x).toBe(6);
  });

  it('positions top-start above the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'top-start' });
    expect(placement.x).toBe(10);
    expect(placement.y).toBe(10 - 4);
  });

  it('positions left-start with trailing edge at the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'left-start' });
    expect(placement.x).toBe(10 - 8);
    expect(placement.y).toBe(10);
  });

  it('positions right-start at the trigger trailing edge', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'right-start' });
    expect(placement.x).toBe(14);
    expect(placement.y).toBe(10);
  });

  it('positions right-center vertically aligned to the trigger center', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'right-center' });
    // trigger center y = 10 + 0; popover top = 10 - (4-1)/2 = 10 - 1 = 9 (floor)
    expect(placement.x).toBe(14);
    expect(placement.y).toBe(10 + Math.floor((1 - 4) / 2));
  });

  it('positions right-end with the trailing edge aligned to the trigger bottom', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'right-end' });
    expect(placement.y).toBe(10 + 1 - 4);
  });

  it('positions left-end mirroring right-end on the X axis', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'left-end' });
    expect(placement.x).toBe(10 - 8);
    expect(placement.y).toBe(10 + 1 - 4);
  });

  it('positions left-center vertically aligned to the trigger center', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'left-center' });
    expect(placement.y).toBe(10 + Math.floor((1 - 4) / 2));
  });

  it('positions top-center horizontally centered on the trigger', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'top-center' });
    expect(placement.x).toBe(8);
  });

  it('positions top-end with the trailing edge aligned to the trigger right', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'top-end' });
    expect(placement.x).toBe(6);
  });

  it('flips bottom → top when bottom would overflow', () => {
    const lowTrigger = { x: 10, y: 22, width: 4, height: 1 };
    const placement = resolveAnchorPlacement(lowTrigger, popoverSize, TERMINAL, { placement: 'bottom-start', flip: true });
    expect(placement.side).toBe('top');
    expect(placement.y).toBe(22 - 4);
  });

  it('shifts the popover into bounds when alignment would clip it', () => {
    const rightTrigger = { x: 78, y: 10, width: 1, height: 1 };
    const placement = resolveAnchorPlacement(rightTrigger, popoverSize, TERMINAL, { placement: 'bottom-start', shift: true });
    expect(placement.x + popoverSize.width).toBeLessThanOrEqual(TERMINAL.cols);
  });

  it('flip then shift composes: flip side first, then clamp', () => {
    const trigger2 = { x: 78, y: 22, width: 1, height: 1 };
    const placement = resolveAnchorPlacement(trigger2, popoverSize, TERMINAL, { placement: 'bottom-start', flip: true, shift: true });
    expect(placement.side).toBe('top');
    expect(placement.x + popoverSize.width).toBeLessThanOrEqual(TERMINAL.cols);
    expect(placement.y).toBeGreaterThanOrEqual(0);
  });

  it('honors offset on bottom', () => {
    const placement = resolveAnchorPlacement(trigger, popoverSize, TERMINAL, { placement: 'bottom-start', offset: 2 });
    expect(placement.y).toBe(10 + 1 + 2);
  });
});

describe('anchor()', () => {
  it('emits an overlay positioned at the resolved placement', () => {
    const node = anchor({
      trigger: { x: 5, y: 3, width: 6, height: 1 },
      placement: 'bottom-start',
      child: { kind: 'box', width: 10, height: 4, children: [] },
    });

    const tree = resolveTree(node) as OverlayNode;
    expect(tree.kind).toBe('overlay');
    expect(tree.x).toBe(5);
    expect(tree.y).toBe(4);
    expect(tree.width).toBe(10);
    expect(tree.height).toBe(4);
  });

  it('returns empty when regionId resolves to null', () => {
    const node = anchor({
      regionId: 'missing',
      resolveRegion: () => null,
      child: { kind: 'box', width: 10, height: 4, children: [] },
    });

    const tree = resolveTree(node);
    expect(tree.kind).toBe('empty');
  });

  it('uses the region resolver when supplied', () => {
    const node = anchor({
      regionId: 'btn',
      resolveRegion: (id) => (id === 'btn' ? { x: 10, y: 5, width: 4, height: 1 } : null),
      placement: 'bottom-start',
      child: { kind: 'box', width: 8, height: 3, children: [] },
    });
    const tree = resolveTree(node) as OverlayNode;
    expect(tree.kind).toBe('overlay');
    expect(tree.x).toBe(10);
    expect(tree.y).toBe(6);
  });
});

describe('popover()', () => {
  it('wraps the body in an opaque box with the default fallback background', () => {
    const node = popover({
      trigger: { x: 5, y: 3, width: 6, height: 1 },
      escapeId: 'help-popover',
      child: { kind: 'text', content: 'help body' },
    });

    const overlay = resolveTree(node) as OverlayNode;
    expect(overlay.kind).toBe('overlay');

    const eventWrapper = overlay.child as EventNode;
    expect(eventWrapper.kind).toBe('event');
    expect(eventWrapper.id).toBe('popover:help-popover');
    expect(eventWrapper.metadata?.intent).toBe('dismiss');
    expect((eventWrapper.metadata?.extra as { escapeId: string }).escapeId).toBe('help-popover');
    expect((eventWrapper.metadata?.extra as { background: string }).background).toBe('#000000');

    const opaqueBox = eventWrapper.child as BoxNode;
    expect(opaqueBox.kind).toBe('box');
    expect(opaqueBox.style?.bg).toBe('#000000');
  });

  it('honors a caller-supplied opaque background color', () => {
    const node = popover({
      trigger: { x: 5, y: 3, width: 6, height: 1 },
      escapeId: 'theme-popover',
      background: '#1a1d23',
      child: { kind: 'text', content: 'body' },
    });

    const overlay = resolveTree(node) as OverlayNode;
    const wrapper = overlay.child as EventNode;
    const opaqueBox = wrapper.child as BoxNode;
    expect(opaqueBox.style?.bg).toBe('#1a1d23');
    expect((wrapper.metadata?.extra as { background: string }).background).toBe('#1a1d23');
  });
});

describe('popoverCaret', () => {
  it('emits an upward triangle when the popover sits below the trigger', () => {
    const node = popoverCaret({ placement: 'bottom-start' }) as TextNode;
    expect(node.kind).toBe('text');
    expect(node.content).toBe('▲');
  });

  it('emits a downward triangle when the popover sits above the trigger', () => {
    const node = popoverCaret({ placement: 'top-center' }) as TextNode;
    expect(node.content).toBe('▼');
  });

  it('emits a left-pointing triangle when the popover sits to the right of the trigger', () => {
    const node = popoverCaret({ placement: 'right-start' }) as TextNode;
    expect(node.content).toBe('◀');
  });

  it('emits a right-pointing triangle when the popover sits to the left of the trigger', () => {
    const node = popoverCaret({ placement: 'left-end' }) as TextNode;
    expect(node.content).toBe('▶');
  });

  it('honors a caller-supplied glyph override', () => {
    const node = popoverCaret({ placement: 'bottom-center', glyph: '↑' }) as TextNode;
    expect(node.content).toBe('↑');
  });

  it('uses the resolved placement (auto-flip aware)', () => {
    // Trigger near the top of the screen — bottom-placement fits, no flip.
    const placementA = resolveAnchorPlacement(
      { x: 10, y: 2, width: 4, height: 1 },
      { width: 8, height: 4 },
      { cols: 80, rows: 24 },
      { placement: 'bottom-start', flip: true },
    );
    expect(placementA.side).toBe('bottom');
    expect((popoverCaret({ placement: placementA.placement }) as TextNode).content).toBe('▲');

    // Trigger flush to the bottom — bottom would overflow; flip to top.
    const placementB = resolveAnchorPlacement(
      { x: 10, y: 23, width: 4, height: 1 },
      { width: 8, height: 4 },
      { cols: 80, rows: 24 },
      { placement: 'bottom-start', flip: true },
    );
    expect(placementB.side).toBe('top');
    expect((popoverCaret({ placement: placementB.placement }) as TextNode).content).toBe('▼');
  });
});
