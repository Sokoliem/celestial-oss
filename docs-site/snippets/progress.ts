import { color, style } from '@celestial/core/corona';
import { column, progressBar, row, spinnerEl, text } from '@celestial/core/nebula';

/**
 * progressBar takes a 0..1 ratio and renders one text node; spinnerEl renders
 * a single braille frame — drive frames from a Sub.tick in a live app.
 */
export const buildStatus = column(
  text('Compiling packages…', style({ dim: true, color: color.gray })),
  row(progressBar(0.75, { width: 24, style: style({ color: color.brightCyan }) }), text(' 75%', style({ dim: true }))),
  text(''),
  row(spinnerEl({ text: '⠋' }, style({ color: color.brightCyan, bold: true })), text(' Bundling tree with esbuild…')),
  row(text('✔ ', style({ color: color.brightGreen, bold: true })), text('Grapheme segmentation verified')),
);
