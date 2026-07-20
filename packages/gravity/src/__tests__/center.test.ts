import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { center, setTerminalSize } from '../index.js';

describe('center', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 80, rows: 24 });
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('returns a ComponentNode', () => {
    const child: VNode = { kind: 'text', content: 'hello' };
    const result = center(child);

    expect(result.kind).toBe('component');
    expect(typeof result.render).toBe('function');
  });

  it('renders a column layout (vertical centering)', () => {
    const child: VNode = { kind: 'text', content: 'hello' };
    const result = center(child);
    const rendered = result.render();

    expect(rendered.kind).toBe('column');
  });

  it('column has 3 children: spacer, content row, spacer', () => {
    const child: VNode = { kind: 'text', content: 'hello' };
    const result = center(child);
    const rendered = result.render() as ColumnNode;

    expect(rendered.children).toHaveLength(3);
  });

  it('middle child renders a row with 3 children for horizontal centering', () => {
    const child: VNode = { kind: 'text', content: 'hello' };
    const result = center(child);
    const outerCol = result.render() as ColumnNode;

    // The middle child is a box wrapping the inner component
    const middleBox = outerCol.children[1] as BoxNode;
    expect(middleBox.kind).toBe('box');

    // The box contains the inner component; render it
    const innerComponent = middleBox.children![0] as { kind: 'component'; render: () => VNode };
    expect(innerComponent.kind).toBe('component');

    const innerRow = innerComponent.render() as RowNode;
    expect(innerRow.kind).toBe('row');
    expect(innerRow.children).toHaveLength(3);
  });

  it('works without options', () => {
    const child: VNode = { kind: 'text', content: 'no opts' };
    const result = center(child);
    const rendered = result.render();

    expect(rendered.kind).toBe('column');
    expect((rendered as ColumnNode).children).toHaveLength(3);
  });

  it('wraps child in a box when width is specified', () => {
    const child: VNode = { kind: 'text', content: 'sized' };
    const result = center(child, { width: 20 });
    const outerCol = result.render() as ColumnNode;

    const middleBox = outerCol.children[1] as BoxNode;
    const innerComponent = middleBox.children![0] as { kind: 'component'; render: () => VNode };
    const innerRow = innerComponent.render() as RowNode;

    // The center child of the row is a box containing a box with width constraint
    const centerBox = innerRow.children[1] as BoxNode;
    expect(centerBox.kind).toBe('box');

    // Drill into the constraint box
    const constraintBox = centerBox.children![0] as BoxNode;
    expect(constraintBox.kind).toBe('box');
    expect(constraintBox.width).toBe(20);
  });

  it('wraps child in a box when height is specified', () => {
    const child: VNode = { kind: 'text', content: 'sized' };
    const result = center(child, { height: 10 });
    const outerCol = result.render() as ColumnNode;

    const middleBox = outerCol.children[1] as BoxNode;
    const innerComponent = middleBox.children![0] as { kind: 'component'; render: () => VNode };
    const innerRow = innerComponent.render() as RowNode;

    const centerBox = innerRow.children[1] as BoxNode;
    const constraintBox = centerBox.children![0] as BoxNode;
    expect(constraintBox.kind).toBe('box');
    expect(constraintBox.height).toBe(10);
  });

  it('wraps child in a box when both width and height are specified', () => {
    const child: VNode = { kind: 'text', content: 'sized' };
    const result = center(child, { width: 30, height: 12 });
    const outerCol = result.render() as ColumnNode;

    const middleBox = outerCol.children[1] as BoxNode;
    const innerComponent = middleBox.children![0] as { kind: 'component'; render: () => VNode };
    const innerRow = innerComponent.render() as RowNode;

    const centerBox = innerRow.children[1] as BoxNode;
    const constraintBox = centerBox.children![0] as BoxNode;
    expect(constraintBox.width).toBe(30);
    expect(constraintBox.height).toBe(12);
  });

  it('grow spacers take equal space in the row', () => {
    const child: VNode = { kind: 'text', content: 'x' };
    const result = center(child);
    const outerCol = result.render() as ColumnNode;

    const middleBox = outerCol.children[1] as BoxNode;
    const innerComponent = middleBox.children![0] as { kind: 'component'; render: () => VNode };
    const innerRow = innerComponent.render() as RowNode;

    // Odd remainders are consumed while keeping the two sides within one cell.
    const leftSpacer = innerRow.children[0] as BoxNode;
    const rightSpacer = innerRow.children[2] as BoxNode;
    const leftWidth = leftSpacer.width as number;
    const rightWidth = rightSpacer.width as number;
    expect(Math.abs(leftWidth - rightWidth)).toBeLessThanOrEqual(1);
    expect(leftWidth + rightWidth + 1).toBe(80);
  });

  it('grow spacers take equal space in the column', () => {
    const child: VNode = { kind: 'text', content: 'x' };
    const result = center(child);
    const outerCol = result.render() as ColumnNode;

    // Top and bottom spacers should have equal height (both grow: 1)
    const topSpacer = outerCol.children[0] as BoxNode;
    const bottomSpacer = outerCol.children[2] as BoxNode;
    expect(topSpacer.height).toBe(bottomSpacer.height);
  });
});
