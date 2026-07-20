import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flex, flexItem, setTerminalSize, when } from '../index.js';

describe('flex', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 100, rows: 24 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('flexItem creates FlexChild with defaults', () => {
    const node: VNode = { kind: 'text', content: 'hello' };
    const child = flexItem(node);

    expect(child.node).toBe(node);
    expect(child.options.grow).toBe(0);
    expect(child.options.shrink).toBe(1);
    expect(child.options.basis).toBe('auto');
  });

  it('flexItem allows overriding options', () => {
    const node: VNode = { kind: 'text', content: 'hello' };
    const child = flexItem(node, { grow: 2, basis: 30 });

    expect(child.options.grow).toBe(2);
    expect(child.options.basis).toBe(30);
    expect(child.options.shrink).toBe(1); // default preserved
  });

  it('flex returns ComponentNode', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'hello' })],
    });

    expect(result.kind).toBe('component');
    expect(typeof result.render).toBe('function');
  });

  it('flex ComponentNode render() returns RowNode for direction row', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'hello' })],
    });

    const rendered = result.render();
    expect(rendered.kind).toBe('row');
  });

  it('flex ComponentNode render() returns ColumnNode for direction column', () => {
    const result = flex({
      direction: 'column',
      children: [flexItem({ kind: 'text', content: 'hello' })],
    });

    const rendered = result.render();
    expect(rendered.kind).toBe('column');
  });

  it('flex children wrapped in BoxNode with explicit width (row direction)', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'hello' }), flexItem({ kind: 'text', content: 'world' })],
    });

    const rendered = result.render() as RowNode;
    expect(rendered.kind).toBe('row');

    for (const child of rendered.children) {
      expect(child.kind).toBe('box');
      expect((child as BoxNode).width).toBeDefined();
    }
  });

  it('flex children wrapped in BoxNode with explicit height (column direction)', () => {
    const result = flex({
      direction: 'column',
      children: [flexItem({ kind: 'text', content: 'hello' }), flexItem({ kind: 'text', content: 'world' })],
    });

    const rendered = result.render() as ColumnNode;
    expect(rendered.kind).toBe('column');

    for (const child of rendered.children) {
      expect(child.kind).toBe('box');
      expect((child as BoxNode).height).toBeDefined();
    }
  });

  it('flex with 2 equal-basis children splits space evenly', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'ab' }, { basis: 20 }), flexItem({ kind: 'text', content: 'cd' }, { basis: 20 })],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    // Both should have basis of 20, no grow, so both stay at 20
    expect(widths[0]).toBe(20);
    expect(widths[1]).toBe(20);
  });

  it('flex with grow:1 child takes remaining space after fixed children', () => {
    // 100 cols total, one fixed at 20, one grows
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'fixed' }, { basis: 20, grow: 0 }), flexItem({ kind: 'text', content: 'grow' }, { basis: 20, grow: 1 })],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    expect(widths[0]).toBe(20); // fixed, no grow
    expect(widths[1]).toBe(80); // takes remaining 80 (100 - 20)
  });

  it('flex with shrink:0 child does not shrink below basis', () => {
    // Terminal is 100, children basis totals 120 (exceeds available)
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'no-shrink' }, { basis: 60, shrink: 0 }),
        flexItem({ kind: 'text', content: 'shrink' }, { basis: 60, shrink: 1 }),
      ],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    expect(widths[0]).toBe(60); // shrink:0 stays at basis
    expect(widths[1]).toBe(40); // absorbs all the shrinking: 60 - 20 = 40
  });

  it('flex with basis:20 uses explicit basis (not natural size)', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'a very long text here' }, { basis: 20 })],
    });

    const rendered = result.render() as RowNode;
    const width = (rendered.children[0] as BoxNode).width;

    // Basis is 20, no grow/shrink needed since 20 < 100
    expect(width).toBe(20);
  });

  it('flex with minSize prevents over-shrinking', () => {
    // Terminal: 100, total basis: 120, deficit: 20
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'a' }, { basis: 60, shrink: 1, minSize: 55 }),
        flexItem({ kind: 'text', content: 'b' }, { basis: 60, shrink: 1 }),
      ],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    // Without minSize, each would shrink by 10 (to 50 each).
    // With minSize=55 on first, it can only shrink by 5, so second absorbs more.
    expect(widths[0]).toBeGreaterThanOrEqual(55);
  });

  it('re-checks minSize after redistribution from other clamped items', () => {
    setTerminalSize({ cols: 70, rows: 24 });

    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'a' }, { basis: 30, shrink: 1, minSize: 29 }),
        flexItem({ kind: 'text', content: 'b' }, { basis: 30, shrink: 1, minSize: 22 }),
        flexItem({ kind: 'text', content: 'c' }, { basis: 30, shrink: 1 }),
      ],
    });

    const widths = (result.render() as RowNode).children.map((c) => (c as BoxNode).width);
    expect(widths).toEqual([29, 22, 19]);
  });

  it('flex with maxSize prevents over-growing', () => {
    // Terminal: 100, total basis: 40, surplus: 60
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'a' }, { basis: 20, grow: 1, maxSize: 30 }),
        flexItem({ kind: 'text', content: 'b' }, { basis: 20, grow: 1 }),
      ],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    // Without maxSize: each gets +30 → 50, 50
    // With maxSize=30 on first: first caps at 30, second gets remaining
    expect(widths[0]).toBe(30);
    expect(widths[1]).toBe(70); // 20 + 30 (its share) + 20 (overflow from first)
  });

  it('re-checks maxSize after redistribution from other clamped items', () => {
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'a' }, { basis: 20, grow: 1, maxSize: 21 }),
        flexItem({ kind: 'text', content: 'b' }, { basis: 20, grow: 1, maxSize: 35 }),
        flexItem({ kind: 'text', content: 'c' }, { basis: 20, grow: 1 }),
      ],
    });

    const widths = (result.render() as RowNode).children.map((c) => (c as BoxNode).width);
    expect(widths).toEqual([21, 35, 44]);
  });

  it('flex with gap subtracts gap from available space', () => {
    // 100 cols, gap=10, 2 children → 1 gap → available = 90
    const result = flex({
      direction: 'row',
      gap: 10,
      children: [flexItem({ kind: 'text', content: 'a' }, { basis: 20, grow: 1 }), flexItem({ kind: 'text', content: 'b' }, { basis: 20, grow: 1 })],
    });

    const rendered = result.render() as RowNode;
    expect(rendered.gap).toBe(10);

    const widths = rendered.children.map((c) => (c as BoxNode).width);
    const totalChildWidth = (widths[0] as number) + (widths[1] as number);

    // Available space = 100 - 10 (one gap) = 90
    expect(totalChildWidth).toBe(90);
  });

  it('wraps row flex items into multiple lines when basis exceeds container width', () => {
    setTerminalSize({ cols: 12, rows: 24 });

    const result = flex({
      direction: 'row',
      wrap: 'wrap',
      gap: { row: 2, col: 1 },
      children: [
        flexItem({ kind: 'text', content: 'one' }, { basis: 5 }),
        flexItem({ kind: 'text', content: 'two' }, { basis: 5 }),
        flexItem({ kind: 'text', content: 'three' }, { basis: 5 }),
      ],
    });

    const rendered = result.render() as ColumnNode;
    expect(rendered.kind).toBe('column');
    expect(rendered.gap).toBe(2);
    expect(rendered.children).toHaveLength(2);
    expect((rendered.children[0] as RowNode).children).toHaveLength(2);
    expect((rendered.children[1] as RowNode).children).toHaveLength(1);
  });

  it('wrap-reverse reverses produced flex lines', () => {
    setTerminalSize({ cols: 10, rows: 24 });

    const result = flex({
      direction: 'row',
      wrap: 'wrap-reverse',
      children: [flexItem({ kind: 'text', content: 'first' }, { basis: 8 }), flexItem({ kind: 'text', content: 'second' }, { basis: 8 })],
    });

    const rendered = result.render() as ColumnNode;
    const firstRenderedLine = rendered.children[0] as RowNode;
    const firstBox = firstRenderedLine.children[0] as BoxNode;
    expect((firstBox.children[0] as VNode & { content?: string }).content).toBe('second');
  });

  it('flex direction column distributes height instead of width', () => {
    setTerminalSize({ cols: 100, rows: 40 });

    const result = flex({
      direction: 'column',
      children: [flexItem({ kind: 'text', content: 'top' }, { basis: 10, grow: 1 }), flexItem({ kind: 'text', content: 'bottom' }, { basis: 10, grow: 1 })],
    });

    const rendered = result.render() as ColumnNode;
    const heights = rendered.children.map((c) => (c as BoxNode).height);

    // 40 rows, total basis 20, surplus 20, both grow equally
    expect(heights[0]).toBe(20);
    expect(heights[1]).toBe(20);
  });

  it('flex with hide:true omits the child entirely', () => {
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'visible' }, { basis: 20 }),
        flexItem({ kind: 'text', content: 'hidden' }, { basis: 20, hide: true }),
        flexItem({ kind: 'text', content: 'also visible' }, { basis: 20 }),
      ],
    });

    const rendered = result.render() as RowNode;
    expect(rendered.children.length).toBe(2);
  });

  it('flex orders items before rendering without mutating source order', () => {
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'first' }, { basis: 5, order: 2 }),
        flexItem({ kind: 'text', content: 'second' }, { basis: 6, order: -1 }),
        flexItem({ kind: 'text', content: 'third' }, { basis: 5, order: 2 }),
      ],
    });

    const rendered = result.render() as RowNode;
    const contents = rendered.children.map((child) => ((child as BoxNode).children[0] as VNode & { content?: string }).content);
    expect(contents).toEqual(['second', 'first', 'third']);
  });

  it('flex with when() condition hides child based on terminal width', () => {
    setTerminalSize({ cols: 50, rows: 24 });

    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'always' }, { basis: 20 }),
        flexItem(
          { kind: 'text', content: 'wide-only' },
          {
            basis: 20,
            hide: when({ min: 80 }), // hide when width >= 80 → visible since we're at 50... wait
            // Actually: hide evaluates to true when condition is met.
            // when({min: 80}) at cols=50 → resolveWhen returns false → hide=false → visible
            // Let's test the opposite: hide when NOT wide enough
          },
        ),
      ],
    });

    // At 50 cols, when({min: 80}) is false → hide is false → child visible
    const rendered1 = result.render() as RowNode;
    expect(rendered1.children.length).toBe(2);

    // At 100 cols, when({min: 80}) is true → hide is true → child hidden
    setTerminalSize({ cols: 100, rows: 24 });
    const rendered2 = result.render() as RowNode;
    expect(rendered2.children.length).toBe(1);
  });

  it('flex supports predicate-based hide conditions', () => {
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'always' }, { basis: 20 }),
        flexItem({ kind: 'text', content: 'narrow-only-hidden' }, { basis: 20, hide: when((width) => width < 80) }),
      ],
    });

    setTerminalSize({ cols: 50, rows: 24 });
    expect((result.render() as RowNode).children).toHaveLength(1);

    setTerminalSize({ cols: 100, rows: 24 });
    expect((result.render() as RowNode).children).toHaveLength(2);
  });

  it('flex with direction as WhenConditional resolves direction based on width', () => {
    setTerminalSize({ cols: 50, rows: 24 });

    const result = flex({
      direction: when({ min: 80 }, 'row', 'column'),
      children: [flexItem({ kind: 'text', content: 'a' }, { basis: 10 }), flexItem({ kind: 'text', content: 'b' }, { basis: 10 })],
    });

    // At 50 cols, condition not met → column
    const rendered1 = result.render();
    expect(rendered1.kind).toBe('column');

    // At 100 cols, condition met → row
    setTerminalSize({ cols: 100, rows: 24 });
    const rendered2 = result.render();
    expect(rendered2.kind).toBe('row');
  });

  it('flex with auto basis measures natural size', () => {
    const result = flex({
      direction: 'row',
      children: [
        flexItem({ kind: 'text', content: 'hello' }), // auto → width=5
        flexItem({ kind: 'text', content: 'world' }), // auto → width=5
      ],
    });

    const rendered = result.render() as RowNode;
    const widths = rendered.children.map((c) => (c as BoxNode).width);

    // Both have auto basis (5 chars), no grow → stay at 5
    expect(widths[0]).toBe(5);
    expect(widths[1]).toBe(5);
  });

  it('flex wraps layouts in a scroll box when overflow is configured', () => {
    setTerminalSize({ cols: 20, rows: 4 });

    const result = flex({
      direction: 'column',
      overflow: 'scroll',
      scrollOffset: 2,
      children: [flexItem({ kind: 'text', content: 'one' }), flexItem({ kind: 'text', content: 'two' })],
    });

    const rendered = result.render() as BoxNode;
    expect(rendered.kind).toBe('box');
    expect(rendered.overflow).toBe('scroll');
    expect(rendered.scrollOffset).toBe(2);
    expect(rendered.width).toBe(20);
    expect(rendered.height).toBe(4);
    expect(rendered.children[0]).toMatchObject({ kind: 'column' });
  });

  it('flex returns empty node when all children are hidden', () => {
    const result = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'a' }, { hide: true }), flexItem({ kind: 'text', content: 'b' }, { hide: true })],
    });

    const rendered = result.render();
    expect(rendered.kind).toBe('empty');
  });
});
