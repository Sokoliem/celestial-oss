import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSafeArea,
  clearWorkArea,
  flex,
  flexItem,
  grid,
  gridItem,
  measureIntrinsicSize,
  reserveSafeArea,
  reserveWorkArea,
  resolveDesktopMeasurementContext,
  resolveResponsiveEnvironment,
  setTerminalSize,
} from '../index.js';

describe('desktop parity layout contracts', () => {
  beforeEach(() => {
    setTerminalSize({ cols: 30, rows: 10 });
    clearSafeArea();
    clearWorkArea();
  });

  afterEach(() => {
    setTerminalSize(null);
    clearSafeArea();
    clearWorkArea();
  });

  it('resolves responsive environment with safe-area and work-area insets', () => {
    reserveSafeArea({ edge: 'top', size: 1, source: 'menu' });
    reserveWorkArea({ edge: 'left', size: 4, source: 'rail' });

    const environment = resolveResponsiveEnvironment();
    expect(environment.terminal).toEqual({ cols: 30, rows: 10 });
    expect(environment.safeArea.top).toBe(1);
    expect(environment.workArea.left).toBe(4);
    expect(environment.available).toEqual({ cols: 26, rows: 9 });

    const context = resolveDesktopMeasurementContext();
    expect(context.container).toEqual({ cols: 26, rows: 9 });
  });

  it('justifies row flex children with stable leading and trailing space', () => {
    const rendered = flex({
      direction: 'row',
      justifyContent: 'center',
      children: [flexItem({ kind: 'text', content: 'aa' }, { basis: 4 }), flexItem({ kind: 'text', content: 'bb' }, { basis: 4 })],
    }).render() as RowNode;

    expect(rendered.children).toHaveLength(4);
    expect((rendered.children[0] as BoxNode).width).toBe(11);
    expect((rendered.children[3] as BoxNode).width).toBe(11);
  });

  it('aligns row flex children within the container cross axis', () => {
    const rendered = flex({
      direction: 'row',
      alignItems: 'center',
      children: [flexItem({ kind: 'text', content: 'aa' }, { basis: 4 })],
    }).render() as RowNode;

    const child = rendered.children[0] as BoxNode;
    const padding = child.style?.padding as [number, number, number, number] | undefined;
    expect(child.height).toBe(10);
    expect(padding?.[0]).toBe(4);
  });

  it('accounts for flex item margins and intrinsic text size', () => {
    const rendered = flex({
      direction: 'row',
      children: [flexItem({ kind: 'text', content: 'abcd' }, { basis: 'auto', margin: { left: 2, right: 3 } })],
    }).render() as RowNode;

    const child = rendered.children[0] as BoxNode;
    expect(child.width).toBe(9);
    expect(measureIntrinsicSize({ kind: 'text', content: 'abcd' })).toEqual({ width: 4, height: 1 });
  });

  it('dense grid placement backfills earlier gaps without reordering children', () => {
    const rendered = grid({
      cols: 3,
      autoFlow: 'dense',
      children: [
        gridItem({ kind: 'text', content: 'a' }, { colSpan: 2 }),
        gridItem({ kind: 'text', content: 'b' }, { colSpan: 2 }),
        gridItem({ kind: 'text', content: 'c' }, {}),
      ],
    }).render() as ColumnNode;

    const firstRow = rendered.children[0] as RowNode;
    const backfilled = firstRow.children[1] as BoxNode;
    const content = (backfilled.children[0] as VNode & { content?: string }).content;
    expect(content).toBe('c');
  });

  it('uses auto row and column track sizes when explicit templates are omitted', () => {
    const rendered = grid({
      cols: 2,
      autoRows: 2,
      autoColumns: 5,
      children: [gridItem({ kind: 'text', content: 'a' }, {}), gridItem({ kind: 'text', content: 'b' }, {})],
    }).render() as ColumnNode;

    const firstRow = rendered.children[0] as RowNode;
    expect((firstRow.children[0] as BoxNode).width).toBe(5);
    expect((firstRow.children[0] as BoxNode).height).toBe(2);
    expect((firstRow.children[1] as BoxNode).width).toBe(5);
  });
});
