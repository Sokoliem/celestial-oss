import { describe, expect, it } from 'vitest';
import { box, column, empty, row, scroll, text } from '../elements.js';
import { layout } from '../vdom.js';

function renderLines() {
  const grid = layout(
    row(empty(8, 1), box(scroll(column(text('first'), text('second')), { height: 2 }), undefined, { overflow: 'hidden', width: 10, height: 2 })),
    20,
    2,
  );

  return grid.cells.map((cells) => cells.map((cell) => cell.char).join(''));
}

describe('scroll in overflow-hidden containers', () => {
  it('keeps scroll child coordinates virtual when a clipped parent is offset', () => {
    const lines = renderLines();

    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });

  it('applies scroll offsets when overflow mode is scroll', () => {
    const grid = layout(
      box(scroll(column(text('first'), text('second'), text('third')), { height: 3 }), undefined, {
        overflow: 'scroll',
        width: 10,
        height: 2,
        scrollOffset: 1,
      }),
      10,
      2,
    );
    const lines = grid.cells.map((cells) => cells.map((cell) => cell.char).join(''));

    expect(lines[0]).toContain('second');
    expect(lines[1]).toContain('third');
  });
});
