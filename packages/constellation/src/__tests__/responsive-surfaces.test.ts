import { visualWidth } from '@celestial/core/corona';
import { text } from '@celestial/core/nebula';
import { renderToLines } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { commandPalette } from '../command-palette.js';
import { confirmDialog } from '../confirm-dialog.js';
import { drawer } from '../drawer.js';
import { modal } from '../modal.js';
import { createToastManager } from '../toast.js';
import { measureTooltipBubble } from '../tooltip.js';

const terminalWidths = [24, 32, 46] as const;

describe('responsive transient surfaces', () => {
  it.each(terminalWidths)('keeps the complete confirmation message at %i columns', (width) => {
    const component = confirmDialog({
      title: 'Publish preview?',
      message: 'The release boundary and package contents were verified.',
      confirmLabel: 'Publish now',
      cancelLabel: 'Review again',
    });
    const [model] = component.init();
    const lines = renderToLines(component.view(model), { width, height: 32 });

    expect(lines.join('\n')).toContain('verified.');
    expect(lines.every((line) => visualWidth(line) <= width)).toBe(true);
  });

  it.each(terminalWidths)('wraps unconstrained modal text at %i columns', (width) => {
    const component = modal({
      title: 'Release readiness',
      content: text('The final character remains visible when this modal is resized.'),
    });
    const [model] = component.init();
    const lines = renderToLines(component.view(model), { width, height: 32 });

    expect(lines.join('\n')).toContain('resized.');
    expect(lines.every((line) => visualWidth(line) <= width)).toBe(true);
  });

  it.each([16, 24, 44] as const)('reflows toast copy without clipping at %i columns', (width) => {
    const manager = createToastManager({ width });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Deployment artifacts were verified safely.', level: 'success' });
    const lines = renderToLines(manager.view(shown), { width, height: 32 });
    const normalized = lines
      .join('')
      .replaceAll('[x]', '')
      .replace(/[^\p{L}.]/gu, '');

    expect(normalized).toContain('Deploymentartifactswereverifiedsafely.');
    expect(lines.every((line) => visualWidth(line) <= width)).toBe(true);
  });

  it('allocates wrapped toast rows in a layered viewport', () => {
    const manager = createToastManager({ width: 24, margin: 0 });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Deployment artifacts were verified safely.', level: 'success' });
    const layered = manager.layer(text('base'), shown, { cols: 24, rows: 20 });

    expect(layered.kind).toBe('row');
    if (layered.kind !== 'row') return;
    const toastLayer = layered.children[1];
    expect(toastLayer?.kind).toBe('overlay');
    if (toastLayer?.kind !== 'overlay') return;
    expect(toastLayer.height).toBeGreaterThan(3);
    expect(renderToLines(layered, { width: 24, height: 20 }).join('\n')).toContain('safely.');
  });

  it('measures tooltip wrapping in terminal cells', () => {
    const measurement = measureTooltipBubble({ content: '界界 界界', maxWidth: 12 });

    expect(measurement.lines).toEqual(['界界', '界界']);
    expect(measurement.lines.every((line) => visualWidth(line) <= 8)).toBe(true);
  });

  it('keeps a wide-glyph drawer title from overwriting its close affordance', () => {
    const component = drawer({ title: '界界界界界', content: text('Details'), width: 16, height: 8 });
    const lines = renderToLines(component.view({ open: true, width: 16, height: 8, focusTrapActive: false }), { width: 16, height: 8 });

    expect(lines[1]).toContain('[x]');
    expect(lines[1]).toMatch(/║$/);
  });

  it('wraps command-palette instructions and long labels in a narrow viewport', () => {
    const component = commandPalette({
      commands: [{ id: 'verify', label: 'Verify every published package artifact', msg: 'verify' }],
    });
    const [initial] = component.init();
    const [opened] = component.update({ type: 'cp-open' }, initial);
    const lines = renderToLines(component.view(opened), { width: 24, height: 24 });
    const rendered = lines.join('\n');

    expect(rendered).toContain('artifact');
    expect(rendered).toContain('close');
    expect(lines.every((line) => visualWidth(line) <= 24)).toBe(true);
  });

  it('keeps the command palette content-sized when the viewport is wider', () => {
    const component = commandPalette({
      commands: [{ id: 'verify', label: 'Verify package', msg: 'verify' }],
    });
    const [initial] = component.init();
    const [opened] = component.update({ type: 'cp-open' }, initial);
    const lines = renderToLines(component.view(opened), { width: 80, height: 12 });

    expect(visualWidth(lines[0]!.trimEnd())).toBe(42);
  });
});
