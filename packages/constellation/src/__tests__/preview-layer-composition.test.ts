import { column, stackedLayers, text, type VNode } from '@celestial/core/nebula';
import { renderToLines } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { commandPalette, confirmDialog, modal } from '../index.js';

const WIDTH = 80;
const HEIGHT = 20;

function applicationBase(): VNode {
  return column(...Array.from({ length: HEIGHT }, (_, index) => text(`BASE-${index}`.padEnd(70, '.') + 'EDGE')));
}

describe('curated layered surface composition', () => {
  const palette = commandPalette({
    commands: [{ id: 'open', label: 'Open item', msg: 'open' }],
  });
  const [closedPalette] = palette.init();
  const [openPalette] = palette.update({ type: 'cp-open' }, closedPalette);

  it.each([
    ['modal', () => modal({ title: 'Layered modal', content: text('Modal body') }).view({ open: true })],
    [
      'confirm dialog',
      () =>
        confirmDialog({ title: 'Layered confirm', message: 'Continue?' }).view({
          open: true,
          selectedButton: 'cancel',
        }),
    ],
    ['command palette', () => palette.view(openPalette)],
  ] as const)('%s preserves untouched application cells when stacked', (_name, surface) => {
    const lines = renderToLines(stackedLayers(applicationBase(), surface()), { width: WIDTH, height: HEIGHT });

    expect(lines[0]).toContain('EDGE');
    expect(lines.at(-1)).toContain('BASE-19');
  });
});
