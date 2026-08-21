import { extractNodeText } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { card, cardGrid } from '../card.js';

describe('card', () => {
  it('initializes with hovered false', () => {
    const comp = card({ title: 'Test Card' });
    const [model] = comp.init();
    expect(model.hovered).toBe(false);
  });

  it('handles hover message', () => {
    const comp = card({ title: 'Test Card' });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover' }, model);
    expect(hovered.hovered).toBe(true);
  });

  it('handles leave message', () => {
    const comp = card({ title: 'Test Card' });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover' }, model);
    const [left] = comp.update({ type: 'leave' }, hovered);
    expect(left.hovered).toBe(false);
  });

  it('handles click message', () => {
    let clicked = false;
    const comp = card({
      title: 'Test Card',
      onClick: () => {
        clicked = true;
      },
    });
    const [model] = comp.init();
    comp.update({ type: 'click' }, model);
    expect(clicked).toBe(true);
  });

  it('renders view without crashing', () => {
    const comp = card({ title: 'Test Card' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('renders with subtitle', () => {
    const comp = card({ title: 'Title', subtitle: 'Subtitle' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('uses one content-sized frame instead of drawing a duplicated fixed-width border', () => {
    const comp = card({
      title: 'Core facade',
      subtitle: 'One entry point',
      content: { kind: 'text', content: 'Six foundations.' },
      variant: 'outlined',
      size: 'sm',
    });
    const view = comp.view(comp.init()[0]);

    expect(view.kind).toBe('box');
    expect(extractNodeText(view)).toContain('Core facade');
    expect(extractNodeText(view)).toContain('Six foundations.');
    if (view.kind === 'box') {
      expect(view.fit).toBe('content');
      expect(view.border?.topLeft).toBe('┌');
    }
  });

  it('normalizes unsafe dimensions and snapshots content arrays', () => {
    const content: Array<{ readonly kind: 'text'; content: string }> = [{ kind: 'text', content: 'Original' }];
    const comp = card({ content, width: Number.POSITIVE_INFINITY, height: -1, padding: Number.NaN });
    content[0] = { kind: 'text', content: 'Mutated' };
    const view = comp.view(comp.init()[0]);
    expect(extractNodeText(view)).toContain('Original');
    if (view.kind === 'box') {
      expect(view.width).toBe(1);
      expect(view.height).toBe(1);
    }
  });
});

describe('cardGrid', () => {
  it('initializes with no card hovered', () => {
    const comp = cardGrid({
      cards: [{ title: 'Card 1' }, { title: 'Card 2' }],
    });
    const [model] = comp.init();
    expect(model.hoveredIndex).toBe(-1);
  });

  it('renders view without crashing', () => {
    const comp = cardGrid({
      cards: [{ title: 'Card 1' }, { title: 'Card 2' }],
    });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('normalizes zero columns, applies gap, and snapshots cards', () => {
    const cards = [{ title: 'Original' }, { title: 'Second' }];
    const comp = cardGrid({ cards, columns: 0, gap: 2 });
    cards[0]!.title = 'Mutated';
    const view = comp.view(comp.init()[0]);
    expect(extractNodeText(view)).toContain('Original');
    if (view.kind === 'column') expect(view.gap).toBe(2);
  });

  it('routes card clicks through the grid descriptor', () => {
    let clicked = false;
    const comp = cardGrid({ cards: [{ title: 'Action', onClick: () => (clicked = true) }] });
    comp.update({ type: 'click-card', index: 0 }, comp.init()[0]);
    expect(clicked).toBe(true);
  });
});
