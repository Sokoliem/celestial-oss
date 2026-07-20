import { describe, expect, it } from 'vitest';
import type { EventHandlers, EventNode, HoverNode } from '../vdom.js';
import { type ColumnNode, layout, measure, planLayout, type RowNode, rasterize, type TextNode, type VNode } from '../vdom.js';

// ─── EventNode measure ──────────────────────────────────────────────────────

describe('EventNode - measure', () => {
  it('should delegate measurement to child node', () => {
    const child: TextNode = { kind: 'text', content: 'hello' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn-1',
      child,
      handlers: { onClick: 'clicked' },
    };
    const size = measure(node);
    expect(size).toEqual({ width: 5, height: 1 });
  });

  it('should measure multi-line child correctly', () => {
    const child: TextNode = { kind: 'text', content: 'line1\nline2\nline3' };
    const node: EventNode = {
      kind: 'event',
      id: 'multi',
      child,
      handlers: { onMouseEnter: 'enter', onMouseLeave: 'leave' },
    };
    const size = measure(node);
    expect(size).toEqual({ width: 5, height: 3 });
  });

  it('should measure row child correctly', () => {
    const child: RowNode = {
      kind: 'row',
      children: [
        { kind: 'text', content: 'AB' },
        { kind: 'text', content: 'CD' },
      ],
    };
    const node: EventNode = {
      kind: 'event',
      id: 'row-event',
      child,
      handlers: { onClick: 'row-click' },
    };
    const size = measure(node);
    expect(size).toEqual({ width: 4, height: 1 });
  });

  it('should measure empty child correctly', () => {
    const child: VNode = { kind: 'empty', width: 3, height: 2 };
    const node: EventNode = {
      kind: 'event',
      id: 'empty-event',
      child,
      handlers: {},
    };
    const size = measure(node);
    expect(size).toEqual({ width: 3, height: 2 });
  });
});

// ─── EventNode planLayout ───────────────────────────────────────────────────

describe('EventNode - planLayout', () => {
  it('should delegate planning to child and inherit rect', () => {
    const child: TextNode = { kind: 'text', content: 'click me' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn',
      child,
      handlers: { onClick: 'clicked' },
    };
    const plan = planLayout(node, 20, 5);

    expect(plan.root.children.length).toBe(1);
    expect(plan.root.children[0]!.node).toBe(child);
  });

  it('should be indexed when it has a layoutId', () => {
    const child: TextNode = { kind: 'text', content: 'hi' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn',
      child,
      handlers: { onClick: 'clicked' },
      layoutId: 'my-event',
    };
    const plan = planLayout(node, 20, 5);

    expect(plan.index.has('my-event')).toBe(true);
  });

  it('should not be indexed without a layoutId', () => {
    const child: TextNode = { kind: 'text', content: 'hi' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn',
      child,
      handlers: { onClick: 'clicked' },
    };
    const plan = planLayout(node, 20, 5);

    // The event node itself shouldn't be indexed (no layoutId)
    // Only auto-generated IDs which are not indexed
    expect(plan.index.size).toBe(0);
  });

  it('should correctly position within a row', () => {
    const eventNode: EventNode = {
      kind: 'event',
      id: 'btn',
      child: { kind: 'text', content: 'OK' },
      handlers: { onClick: 'ok' },
    };
    const row: RowNode = {
      kind: 'row',
      children: [{ kind: 'text', content: 'AB' }, eventNode],
    };
    const plan = planLayout(row, 20, 1);

    // EventNode should be at x=2 (after 'AB')
    const eventEntry = plan.root.children[1]!;
    expect(eventEntry.rect.x).toBe(2);
  });
});

// ─── EventNode rasterize ────────────────────────────────────────────────────

describe('EventNode - rasterize', () => {
  it('should render child text correctly', () => {
    const child: TextNode = { kind: 'text', content: 'ABC' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn',
      child,
      handlers: { onClick: 'clicked' },
    };
    const plan = planLayout(node, 10, 1);
    const grid = rasterize(plan);

    expect(grid.cells[0]![0]!.char).toBe('A');
    expect(grid.cells[0]![1]!.char).toBe('B');
    expect(grid.cells[0]![2]!.char).toBe('C');
  });

  it('should produce same output as direct layout of child', () => {
    const child: TextNode = { kind: 'text', content: 'hello' };
    const node: EventNode = {
      kind: 'event',
      id: 'btn',
      child,
      handlers: { onClick: 'clicked' },
    };

    const eventGrid = layout(node, 10, 1);
    const directGrid = layout(child, 10, 1);

    for (let c = 0; c < 10; c++) {
      expect(eventGrid.cells[0]![c]).toEqual(directGrid.cells[0]![c]);
    }
  });

  it('should handle nested event inside column', () => {
    const eventNode: EventNode = {
      kind: 'event',
      id: 'btn',
      child: { kind: 'text', content: 'Click' },
      handlers: { onClick: 'clicked' },
    };
    const col: ColumnNode = {
      kind: 'column',
      children: [{ kind: 'text', content: 'Title' }, eventNode],
    };
    const grid = layout(col, 10, 5);

    // First row: 'Title'
    expect(grid.cells[0]![0]!.char).toBe('T');
    // Second row: 'Click' (from event child)
    expect(grid.cells[1]![0]!.char).toBe('C');
    expect(grid.cells[1]![1]!.char).toBe('l');
  });
});

// ─── HoverNode measure ─────────────────────────────────────────────────────

describe('HoverNode - measure', () => {
  it('should delegate measurement to child node', () => {
    const child: TextNode = { kind: 'text', content: 'hover me' };
    const node: HoverNode = {
      kind: 'hover',
      id: 'hov-1',
      child,
      hovered: false,
    };
    const size = measure(node);
    expect(size).toEqual({ width: 8, height: 1 });
  });

  it('should measure correctly regardless of hover state', () => {
    const child: TextNode = { kind: 'text', content: 'test' };
    const hoveredNode: HoverNode = { kind: 'hover', id: 'h1', child, hovered: true };
    const notHoveredNode: HoverNode = { kind: 'hover', id: 'h2', child, hovered: false };

    expect(measure(hoveredNode)).toEqual(measure(notHoveredNode));
  });

  it('should measure column child correctly', () => {
    const child: ColumnNode = {
      kind: 'column',
      children: [
        { kind: 'text', content: 'AAA' },
        { kind: 'text', content: 'BB' },
      ],
    };
    const node: HoverNode = {
      kind: 'hover',
      id: 'h-col',
      child,
      hovered: false,
    };
    const size = measure(node);
    expect(size).toEqual({ width: 3, height: 2 });
  });
});

// ─── HoverNode planLayout ───────────────────────────────────────────────────

describe('HoverNode - planLayout', () => {
  it('should delegate planning to child', () => {
    const child: TextNode = { kind: 'text', content: 'hover' };
    const node: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child,
      hovered: false,
    };
    const plan = planLayout(node, 20, 5);

    expect(plan.root.children.length).toBe(1);
    expect(plan.root.children[0]!.node).toBe(child);
  });

  it('should be indexed when it has a layoutId', () => {
    const child: TextNode = { kind: 'text', content: 'hi' };
    const node: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child,
      hovered: false,
      layoutId: 'my-hover',
    };
    const plan = planLayout(node, 20, 5);

    expect(plan.index.has('my-hover')).toBe(true);
  });

  it('should correctly position within a row', () => {
    const hoverNode: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child: { kind: 'text', content: 'OK' },
      hovered: false,
    };
    const row: RowNode = {
      kind: 'row',
      children: [{ kind: 'text', content: 'AB' }, hoverNode],
    };
    const plan = planLayout(row, 20, 1);

    const hoverEntry = plan.root.children[1]!;
    expect(hoverEntry.rect.x).toBe(2);
  });
});

// ─── HoverNode rasterize ───────────────────────────────────────────────────

describe('HoverNode - rasterize', () => {
  it('should render child text correctly', () => {
    const child: TextNode = { kind: 'text', content: 'XYZ' };
    const node: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child,
      hovered: false,
    };
    const grid = layout(node, 10, 1);

    expect(grid.cells[0]![0]!.char).toBe('X');
    expect(grid.cells[0]![1]!.char).toBe('Y');
    expect(grid.cells[0]![2]!.char).toBe('Z');
  });

  it('should produce same output as direct layout of child', () => {
    const child: TextNode = { kind: 'text', content: 'hover me' };
    const node: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child,
      hovered: true,
    };

    const hoverGrid = layout(node, 20, 1);
    const directGrid = layout(child, 20, 1);

    for (let c = 0; c < 20; c++) {
      expect(hoverGrid.cells[0]![c]).toEqual(directGrid.cells[0]![c]);
    }
  });

  it('should handle nested hover inside column', () => {
    const hoverNode: HoverNode = {
      kind: 'hover',
      id: 'h1',
      child: { kind: 'text', content: 'Item' },
      hovered: false,
    };
    const col: ColumnNode = {
      kind: 'column',
      children: [{ kind: 'text', content: 'Menu' }, hoverNode],
    };
    const grid = layout(col, 10, 5);

    expect(grid.cells[0]![0]!.char).toBe('M');
    expect(grid.cells[1]![0]!.char).toBe('I');
    expect(grid.cells[1]![1]!.char).toBe('t');
  });
});

// ─── EventHandlers ──────────────────────────────────────────────────────────

describe('EventHandlers', () => {
  it('should support all handler types', () => {
    const handlers: EventHandlers = {
      onClickCapture: 'click-capture-msg',
      onClick: 'click-msg',
      onRightClickCapture: 'right-click-capture-msg',
      onRightClick: 'right-click-msg',
      onMouseEnter: 'enter-msg',
      onMouseLeave: 'leave-msg',
      onMouseDownCapture: 'down-capture-msg',
      onMouseDown: 'down-msg',
      onMouseUpCapture: 'up-capture-msg',
      onMouseUp: 'up-msg',
      onMouseMoveCapture: 'move-capture-msg',
      onMouseMove: 'move-msg',
      onScrollCapture: 'scroll-capture-msg',
      onScroll: 'scroll-msg',
    };
    const node: EventNode = {
      kind: 'event',
      id: 'full',
      child: { kind: 'text', content: 'test' },
      handlers,
    };
    expect(node.handlers.onClickCapture).toBe('click-capture-msg');
    expect(node.handlers.onClick).toBe('click-msg');
    expect(node.handlers.onRightClickCapture).toBe('right-click-capture-msg');
    expect(node.handlers.onRightClick).toBe('right-click-msg');
    expect(node.handlers.onMouseEnter).toBe('enter-msg');
    expect(node.handlers.onMouseLeave).toBe('leave-msg');
    expect(node.handlers.onMouseDownCapture).toBe('down-capture-msg');
    expect(node.handlers.onMouseDown).toBe('down-msg');
    expect(node.handlers.onMouseUpCapture).toBe('up-capture-msg');
    expect(node.handlers.onMouseUp).toBe('up-msg');
    expect(node.handlers.onMouseMoveCapture).toBe('move-capture-msg');
    expect(node.handlers.onMouseMove).toBe('move-msg');
    expect(node.handlers.onScrollCapture).toBe('scroll-capture-msg');
    expect(node.handlers.onScroll).toBe('scroll-msg');
  });

  it('should allow partial handlers', () => {
    const handlers: EventHandlers = {
      onClick: 'just-click',
    };
    const node: EventNode = {
      kind: 'event',
      id: 'partial',
      child: { kind: 'text', content: 'test' },
      handlers,
    };
    expect(node.handlers.onClick).toBe('just-click');
    expect(node.handlers.onMouseEnter).toBeUndefined();
  });

  it('should allow empty handlers', () => {
    const handlers: EventHandlers = {};
    const node: EventNode = {
      kind: 'event',
      id: 'none',
      child: { kind: 'text', content: 'test' },
      handlers,
    };
    expect(node.handlers.onClick).toBeUndefined();
  });

  it('should accept modifier-aware handler maps for click variants', () => {
    const handlers: EventHandlers = {
      onClick: { default: 'select', shift: 'range-select', ctrl: 'toggle', alt: 'secondary', shiftCtrl: 'add-range' },
      onRightClick: { default: 'menu' },
    };
    const node: EventNode = {
      kind: 'event',
      id: 'modifier-aware',
      child: { kind: 'text', content: 'test' },
      handlers,
    };
    expect(node.handlers.onClick).toEqual({ default: 'select', shift: 'range-select', ctrl: 'toggle', alt: 'secondary', shiftCtrl: 'add-range' });
    expect(node.handlers.onRightClick).toEqual({ default: 'menu' });
  });
});
