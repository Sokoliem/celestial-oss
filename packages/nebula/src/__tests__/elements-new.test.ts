import { color, style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { badge, box, column, conditional, divider, flex, list, progressBar, stackedLayers, text, truncatedText } from '../elements.js';
import { planLayout, rasterize } from '../vdom.js';

describe('new element builders', () => {
  it('progressBar renders a determinate bar', () => {
    const node = progressBar(0.5, { width: 4 });
    expect(node.kind).toBe('text');
    expect(node.content).toBe('██░░');
  });

  it('divider fills the available width around a label', () => {
    const node = divider({ label: 'Section' });
    expect(node.kind).toBe('component');

    const rendered = node.render({
      terminal: { cols: 20, rows: 1 },
      available: { cols: 20, rows: 1 },
      container: { cols: 20, rows: 1 },
    });

    expect(rendered.kind).toBe('text');
    expect((rendered as { content: string }).content).toBe('───── Section ──────');
  });

  it('conditional returns the requested branch', () => {
    expect((conditional(true, text('yes'), text('no')) as { content: string }).content).toBe('yes');
    expect((conditional(false, text('yes'), text('no')) as { content: string }).content).toBe('no');
  });

  it('list wraps rendered children in the requested direction', () => {
    const rowList = list(['A', 'B'], (item) => text(item), { direction: 'row', gap: 2 });
    expect(rowList.kind).toBe('row');
    expect(rowList.gap).toBe(2);

    const columnList = list(['A', 'B'], (item) => text(item));
    expect(columnList.kind).toBe('column');
  });

  it('badge defaults to bold styling', () => {
    const node = badge('NEW');
    expect(node.kind).toBe('text');
    expect(node.content).toBe('[NEW]');
    expect(node.style?.bold).toBe(true);
  });

  it('truncatedText clamps long content with an ellipsis', () => {
    const node = truncatedText('Celestial Nebula', 8);
    expect(node.kind).toBe('text');
    expect(node.content).toBe('Celesti…');
  });

  it('truncatedText clamps by terminal cells without splitting wide glyphs', () => {
    expect(truncatedText('界界界', 5).content).toBe('界界…');
    expect(truncatedText('界界界', 3).content).toBe('界…');
    expect(truncatedText('界界界', 2).content).toBe('…');
    expect(truncatedText('abc', 0).content).toBe('');
  });

  it('divider centers labels by terminal cells', () => {
    const node = divider({ label: '界' });
    expect(node.kind).toBe('component');

    const rendered = node.render({
      terminal: { cols: 10, rows: 1 },
      available: { cols: 10, rows: 1 },
      container: { cols: 10, rows: 1 },
    });

    expect((rendered as { content: string }).content).toBe('─── 界 ───');
  });

  it('stackedLayers overlays later layers on top of the base layer', () => {
    const vnode = stackedLayers(text('base'), text('T P'));
    const plan = planLayout(vnode, 4, 1);
    const grid = rasterize(plan);

    expect(plan.overlays).toHaveLength(1);
    expect(plan.overlays[0]?.transparent).toBe(true);
    expect(grid.cells[0]![0]!.char).toBe('T');
    expect(grid.cells[0]![1]!.char).toBe('a');
    expect(grid.cells[0]![2]!.char).toBe('P');
    expect(grid.cells[0]![3]!.char).toBe('e');
  });

  it('stackedLayers preserves the base layout rectangle', () => {
    const base = column(text('header'), flex(text('body')), text('status'));
    const plain = planLayout(base, 80, 24);
    const layered = planLayout(stackedLayers(base, text('drawer')), 80, 24);
    const flexEntry = layered.root.children[0];
    const layeredBase = flexEntry?.children[0];

    expect(plain.root.rect).toEqual({ x: 0, y: 0, width: 80, height: 24 });
    expect(layeredBase?.rect).toEqual(plain.root.rect);
    expect(layered.root.rect.height).toBe(plain.root.rect.height);
  });

  it('fit-content boxes do not expand a painted background into unused space', () => {
    const vnode = box(text('card'), style({ background: color.black }), { fit: 'content' });
    const plan = planLayout(vnode, 20, 10);

    expect(plan.root.rect.width).toBe(4);
    expect(plan.root.rect.height).toBe(1);
  });
});
