import { describe, expect, it } from 'vitest';
import { collectHitRegions } from '../hit-regions.js';
import { type EventNode, type HoverNode, type OverlayNode, planLayout, type VNode } from '../vdom.js';

describe('collectHitRegions', () => {
  it('collects EventNode rects with handlers', () => {
    const node: EventNode = {
      kind: 'event',
      id: 'btn-1',
      child: { kind: 'text', content: 'Click me' },
      handlers: { onClick: 'handle-click' },
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.length).toBe(1);
    expect(regions[0]!.id).toBe('btn-1');
    expect(regions[0]!.handlers.onClick).toBe('handle-click');
    expect(regions[0]!.eventPath).toEqual(['btn-1']);
    expect(regions[0]!.rect.x).toBe(0);
    expect(regions[0]!.rect.y).toBe(0);
  });

  it('collects HoverNode rects', () => {
    const node: HoverNode = {
      kind: 'hover',
      id: 'hover-area',
      child: { kind: 'text', content: 'Hover' },
      hovered: false,
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.length).toBe(1);
    expect(regions[0]!.id).toBe('hover-area');
    expect(regions[0]!.isHover).toBe(true);
    expect(regions[0]!.eventPath).toEqual([]);
  });

  it('collects regions from nested tree', () => {
    const node: VNode = {
      kind: 'column',
      children: [
        {
          kind: 'event',
          id: 'btn-a',
          child: { kind: 'text', content: 'A' },
          handlers: { onClick: 'click-a' },
        } as EventNode,
        {
          kind: 'event',
          id: 'btn-b',
          child: { kind: 'text', content: 'B' },
          handlers: { onClick: 'click-b' },
        } as EventNode,
      ],
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.length).toBe(2);
    expect(regions[0]!.id).toBe('btn-a');
    expect(regions[1]!.id).toBe('btn-b');
    // Second button is below first
    expect(regions[1]!.rect.y).toBeGreaterThan(regions[0]!.rect.y);
  });

  it('overlay EventNodes have correct zIndex', () => {
    const node: VNode = {
      kind: 'column',
      children: [
        {
          kind: 'event',
          id: 'base-btn',
          child: { kind: 'text', content: 'Base' },
          handlers: { onClick: 'base-click' },
        } as EventNode,
        {
          kind: 'overlay',
          child: {
            kind: 'event',
            id: 'overlay-btn',
            child: { kind: 'text', content: 'Pop' },
            handlers: { onClick: 'overlay-click' },
          } as EventNode,
          x: 0,
          y: 0,
          zIndex: 10,
        } as OverlayNode,
      ],
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.length).toBe(2);
    const baseRegion = regions.find((r) => r.id === 'base-btn')!;
    const overlayRegion = regions.find((r) => r.id === 'overlay-btn')!;
    expect(baseRegion.zIndex).toBe(0);
    expect(overlayRegion.zIndex).toBe(10);
  });

  it('keeps pointer-transparent overlays visual without intercepting base regions', () => {
    const node: VNode = {
      kind: 'column',
      children: [
        {
          kind: 'event',
          id: 'base-btn',
          child: { kind: 'text', content: 'Base' },
          handlers: { onClick: 'base-click' },
        } as EventNode,
        {
          kind: 'overlay',
          child: {
            kind: 'event',
            id: 'visual-preview',
            child: { kind: 'text', content: 'Preview' },
            handlers: { onClick: 'preview-click' },
          } as EventNode,
          x: 0,
          y: 0,
          zIndex: 10,
          pointerEvents: 'none',
        } as OverlayNode,
      ],
    };

    const regions = collectHitRegions(planLayout(node, 20, 5));

    expect(regions.map((region) => region.id)).toEqual(['base-btn']);
  });

  it('higher zIndex wins on overlap', () => {
    const node: VNode = {
      kind: 'column',
      children: [
        {
          kind: 'event',
          id: 'base-btn',
          child: { kind: 'text', content: 'Base' },
          handlers: { onClick: 'base' },
        } as EventNode,
        {
          kind: 'overlay',
          child: {
            kind: 'event',
            id: 'top-btn',
            child: { kind: 'text', content: 'Top' },
            handlers: { onClick: 'top' },
          } as EventNode,
          x: 0,
          y: 0,
          zIndex: 5,
        } as OverlayNode,
      ],
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    // Both regions exist
    expect(regions.length).toBe(2);
    // Sorted by zIndex — base (0) first, overlay (5) second
    expect(regions[0]!.zIndex).toBeLessThan(regions[1]!.zIndex);
  });

  it('collects from rows and boxes', () => {
    const node: VNode = {
      kind: 'row',
      children: [
        {
          kind: 'box',
          children: [
            {
              kind: 'event',
              id: 'boxed-btn',
              child: { kind: 'text', content: 'X' },
              handlers: { onRightClick: 'rc' },
            } as EventNode,
          ],
          border: {
            topLeft: '┌',
            top: '─',
            topRight: '┐',
            left: '│',
            right: '│',
            bottomLeft: '└',
            bottom: '─',
            bottomRight: '┘',
          },
        },
      ],
    };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.length).toBe(1);
    expect(regions[0]!.id).toBe('boxed-btn');
    expect(regions[0]!.handlers.onRightClick).toBe('rc');
  });

  it('returns empty array for tree without event/hover nodes', () => {
    const node: VNode = { kind: 'text', content: 'hello' };
    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);
    expect(regions).toEqual([]);
  });

  it('tracks nested event ancestry in eventPath', () => {
    const node: VNode = {
      kind: 'event',
      id: 'outer',
      handlers: { onClickCapture: 'outer-capture', onClick: 'outer-click' },
      child: {
        kind: 'event',
        id: 'inner',
        handlers: { onClick: 'inner-click' },
        child: { kind: 'text', content: 'X' },
      } as EventNode,
    } as EventNode;

    const plan = planLayout(node, 20, 5);
    const regions = collectHitRegions(plan);

    expect(regions.map((region) => ({ id: region.id, path: region.eventPath }))).toEqual([
      { id: 'outer', path: ['outer'] },
      { id: 'inner', path: ['outer', 'inner'] },
    ]);
  });
});
