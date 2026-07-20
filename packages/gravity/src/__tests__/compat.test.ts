import type { BoxNode, ColumnNode, RowNode, VNode } from '@celestial/nebula';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoZoom, breakpoint, flex, flexItem, getTerminalSize, grid, gridItem, lod, responsive, setTerminalSize, when, zoom } from '../index.js';

describe('gravity compatibility API', () => {
  beforeEach(() => {
    setTerminalSize(120, 30);
  });

  afterEach(() => {
    setTerminalSize(null);
  });

  it('supports flexItem(options, node) and variadic flex children', () => {
    const result = flex(
      { direction: 'row', gap: { row: 2, col: 3 } },
      flexItem({ basis: 20 }, { kind: 'text', content: 'left' }),
      flexItem({ grow: 1, basis: 10 }, { kind: 'text', content: 'right' }),
    );

    const rendered = result.render() as RowNode;
    expect(rendered.kind).toBe('row');
    expect(rendered.gap).toBe(3);
    expect((rendered.children[0] as BoxNode).width).toBe(20);
  });

  it('supports reverse flex directions', () => {
    const result = flex({ direction: 'row-reverse' }, flexItem({ kind: 'text', content: 'first' }), flexItem({ kind: 'text', content: 'second' }));

    const rendered = result.render() as RowNode;
    expect((rendered.children[0] as BoxNode).children[0]).toEqual({ kind: 'text', content: 'second' });
    expect((rendered.children[1] as BoxNode).children[0]).toEqual({ kind: 'text', content: 'first' });
  });

  it('supports docs-style gridItem(options, node) and grid(config, ...children)', () => {
    const result = grid(
      {
        columns: '1fr 2fr 1fr',
        gap: { row: 1, col: 2 },
        areas: ['header header header', 'sidebar main aside'],
      },
      gridItem({ area: 'header' }, { kind: 'text', content: 'Header' }),
      gridItem({ area: 'main' }, { kind: 'text', content: 'Main' }),
    );

    const rendered = result.render() as ColumnNode;
    const headerRow = rendered.children[0] as RowNode;
    const contentRow = rendered.children[1] as RowNode;

    expect(rendered.gap).toBe(1);
    expect(headerRow.gap).toBe(2);
    expect((headerRow.children[0] as BoxNode).width).toBe(120);
    expect((contentRow.children[1] as BoxNode).width).toBe(58);
  });

  it('supports responsive breakpoint maps and predicate when conditions', () => {
    const result = responsive({ sm: 40, md: 80, lg: 120, xl: 160 }, (name) => ({ kind: 'text', content: name }));

    // 79 cols is below the md threshold (80), so the active breakpoint is 'sm'
    setTerminalSize(79, 24);
    expect(result.render()).toEqual({ kind: 'text', content: 'sm' });

    const conditional = when((width) => width >= 100, 'wide', 'narrow');
    expect(conditional._tag).toBe('when-conditional');
    expect(conditional.ifFalse).toBe('narrow');
  });

  it('supports callable breakpoint helper', () => {
    setTerminalSize(130, 24);
    const selected = breakpoint({
      sm: { kind: 'text', content: 'small' },
      lg: { kind: 'text', content: 'large' },
      default: { kind: 'text', content: 'fallback' },
    });

    expect(selected).toEqual({ kind: 'text', content: 'large' });
    // compact → xs → { max: 39 } with canonical thresholds (sm=40)
    expect(breakpoint.compact?.max).toBe(39);
  });

  it('supports setTerminalSize(cols, rows)', () => {
    setTerminalSize(90, 12);
    expect(getTerminalSize()).toEqual({ cols: 90, rows: 12 });
  });

  it('supports object-style lod, zoom, and autoZoom helpers', () => {
    const card = lod({
      data: { label: 'CPU' },
      levels: [
        { minWidth: 0, render: ({ label }) => ({ kind: 'text', content: `${label}:c` }) },
        { minWidth: 20, render: ({ label }) => ({ kind: 'text', content: `${label}:s` }) },
        { minWidth: 40, render: ({ label }) => ({ kind: 'text', content: `${label}:d` }) },
      ],
    });

    const zoomed = zoom({ content: card, scale: 0.5 }) as VNode;
    expect(zoomed).toEqual({ kind: 'text', content: 'CPU:s' });

    const auto = autoZoom({ content: card, targetWidth: 50, targetHeight: 10 }) as VNode;
    expect(auto).toEqual({ kind: 'text', content: 'CPU:d' });
  });
});
