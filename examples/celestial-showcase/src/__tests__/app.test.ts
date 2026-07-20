import { createScreen, createTestApp, fireMouse, type TestAppHandle } from '@celestial/test';
import { afterEach, describe, expect, it } from 'vitest';
import { createCelestialShowcaseApp, SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS } from '../app.js';
import { UI_BUILDER_NAMES } from '../components.js';
import { viewportTier } from '../labs.js';
import type { CelestialShowcaseModel, CelestialShowcaseMsg } from '../types.js';

function findText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

describe('Celestial Flight Deck', () => {
  const handles: Array<TestAppHandle<CelestialShowcaseModel, CelestialShowcaseMsg>> = [];

  function flightDeck(cols: number, rows: number) {
    const size = { cols, rows };
    const handle = createTestApp(createCelestialShowcaseApp({ initialSize: size, fast: true }), size);
    handles.push(handle);
    return handle;
  }

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.stop();
  });

  for (const size of [
    { cols: 70, rows: 32, marker: 'COMPACT / single' },
    { cols: 79, rows: 36, marker: 'COMPACT / single' },
    { cols: 80, rows: 36, marker: 'MEDIUM / split' },
    { cols: 100, rows: 36, marker: 'MEDIUM / split' },
    { cols: 119, rows: 36, marker: 'MEDIUM / split' },
    { cols: 120, rows: 42, marker: 'WIDE / floating' },
    { cols: 140, rows: 42, marker: 'WIDE / floating' },
  ]) {
    it(`renders an accessible ${viewportTier(size.cols)} shell at ${size.cols}x${size.rows}`, () => {
      const handle = flightDeck(size.cols, size.rows);
      const frame = handle.lastFrame();

      expect(frame).toContain('CELESTIAL FLIGHT DECK');
      expect(frame).toContain(size.marker);
      expect(frame).toContain('Atlas + Corona');
      expect(frame).toContain('Aurora + Nebula');
      expect(frame).toContain('Gravity + Nexus');
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
      expect(handle.snapshot().audit.violations.filter((violation) => violation.rule === 'color-contrast')).toEqual([]);
    });
  }

  it('shows a resize-required view below the supported viewport and restores preserved state', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    const screen = createScreen(handle);
    handle.pressKey('2');
    await handle.waitForUpdate();
    handle.dispatch({ type: 'component-page', page: 6 });

    screen.fireResize(SHOWCASE_MIN_COLS - 10, SHOWCASE_MIN_ROWS - 8);
    expect(handle.lastFrame()).toContain('Resize required');
    expect(handle.lastFrame()).toContain(`minimum ${SHOWCASE_MIN_COLS}x${SHOWCASE_MIN_ROWS}`);
    expect(handle.model.activeLab).toBe('components');
    expect(handle.model.componentPage).toBe(6);

    screen.fireResize(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    expect(handle.lastFrame()).toContain('Feedback and layers - 7 builders');
    expect(handle.model.activeLab).toBe('components');
    expect(handle.model.componentPage).toBe(6);
  });

  it('keeps long lab and status copy complete at the minimum width', async () => {
    const handle = flightDeck(SHOWCASE_MIN_COLS, 40);

    expect(handle.lastFrame()).toContain('namespaces.');
    for (const [lab, tail] of [
      ['workflows', 'model.'],
      ['visuals', 'lane.'],
      ['mouse', 'propagation.'],
      ['layers', 'surface.'],
      ['windows', 'windows.'],
      ['smoke', 'Help button.'],
    ] as const) {
      handle.dispatch({ type: 'switch-lab', lab });
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain(tail);
    }

    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'maximize' });
    expect(handle.lastFrame()).toContain('telemetry.');
  });

  it.each([
    ['modal', 'Escape.'],
    ['confirm', 'verified?'],
    ['tooltip', 'dismissible.'],
    ['palette', 'close'],
    ['toast', 'base.'],
    ['drawer', 'dismissal'],
  ] as const)('retains the complete %s surface after resizing to the minimum viewport', async (surface, tail) => {
    const handle = flightDeck(100, 36);
    const screen = createScreen(handle);
    handle.dispatch({ type: 'open-surface', surface });
    await handle.waitForUpdate();

    screen.fireResize(SHOWCASE_MIN_COLS, SHOWCASE_MIN_ROWS);
    expect(handle.lastFrame()).toContain(tail);
    expect(handle.model.cols).toBe(SHOWCASE_MIN_COLS);
    expect(handle.model.rows).toBe(SHOWCASE_MIN_ROWS);
  });

  it('shows every curated UI builder and changes a component through its mouse region', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('2');
    await handle.waitForUpdate();

    const builders = new Set<string>();
    for (let page = 0; page < 8; page += 1) {
      const frame = handle.lastFrame();
      for (const builder of UI_BUILDER_NAMES) {
        if (frame.includes(`${builder}()`)) builders.add(builder);
      }
      if (page < 7) {
        handle.pressKey(']');
        await handle.waitForUpdate();
      }
    }
    expect([...builders].sort()).toEqual([...UI_BUILDER_NAMES].sort());

    handle.dispatch({ type: 'component-page', page: 0 });
    await handle.waitForUpdate();
    const checkbox = findText(handle.lastFrame(), 'Run headless checks');
    const checkedBefore = handle.model.checkbox.checked;
    handle.click(checkbox.col, checkbox.row);

    expect(handle.model.checkbox.checked).toBe(!checkedBefore);
    expect(handle.model.completed.has('component')).toBe(true);
  });

  it('routes hover, direct radio selection, slider positioning, and table multi-select through source regions', async () => {
    const handle = flightDeck(140, 48);
    handle.pressKey('2');
    await handle.waitForUpdate();

    const checkbox = findText(handle.lastFrame(), 'Run headless checks');
    fireMouse(handle.terminal, { type: 'move', col: checkbox.col, row: checkbox.row });
    expect(handle.model.checkbox.hovered).toBe(true);

    const dense = findText(handle.lastFrame(), 'Dense');
    handle.click(dense.col, dense.row);
    expect(handle.model.radio.selected).toBe(2);

    const sliderElement = handle.snapshot().elements.find((element) => element.testId === 'Density');
    expect(sliderElement).toBeDefined();
    handle.click(sliderElement!.col + 'Density '.length, sliderElement!.row);
    expect(handle.model.slider.value).toBe(0);

    handle.dispatch({ type: 'component-page', page: 3 });
    await handle.waitForUpdate();
    const previewCrumb = findText(handle.lastFrame(), 'Preview');
    fireMouse(handle.terminal, { type: 'move', col: previewCrumb.col, row: previewCrumb.row });
    expect(handle.model.breadcrumb.hoveredIndex).toBe(1);
    const celestialCrumb = findText(handle.lastFrame(), 'Celestial');
    handle.click(celestialCrumb.col, celestialCrumb.row);
    expect(handle.model.breadcrumb.selectedIndex).toBe(0);

    handle.dispatch({ type: 'component-page', page: 4 });
    await handle.waitForUpdate();
    const runtimeRow = findText(handle.lastFrame(), 'Elm runtime');
    const uiRow = findText(handle.lastFrame(), 'Curated UI');
    handle.click(runtimeRow.col, runtimeRow.row);
    handle.click(uiRow.col, uiRow.row);
    expect(handle.model.table.selectedKeys).toEqual(new Set(['runtime', 'components']));

    const testingRow = findText(handle.lastFrame(), 'Headless + PTY');
    handle.click(testingRow.col, testingRow.row, 'left', { shift: true });
    expect(handle.model.table.selectedKeys).toEqual(new Set(['components', 'windows', 'testing']));
    expect(handle.model.table.rangeSelectionKeys).toEqual(new Set(['components', 'windows', 'testing']));
    expect(handle.lastFrame()).toContain('range 2-4');
  });

  it('routes live mouse coordinates through raw and semantic hit regions after a lab switch', async () => {
    const handle = flightDeck(70, 36);
    handle.pressKey('5');
    await handle.waitForUpdate();
    const target = findText(handle.lastFrame(), 'MOUSE TARGET');

    handle.click(target.col + 2, target.row + 2);

    expect(handle.model.pointer.clicks).toBe(1);
    expect(handle.model.pointer.target).toBe('click');
    expect(handle.model.completed.has('mouse-click')).toBe(true);
    expect(handle.messageCoverage().byType['raw-mouse']).toBeGreaterThan(0);
    expect(handle.messageCoverage().byType['element-mouse']).toBeGreaterThan(0);

    const source = findText(handle.lastFrame(), 'verification receipt');
    const dropTarget = findText(handle.lastFrame(), 'Drag the receipt here.');
    handle.drag(source.col + 2, source.row, dropTarget.col + 2, dropTarget.row);
    await handle.waitForUpdate();

    expect(handle.model.droppedReceipts).toBe(1);
    expect(handle.model.lastDroppedReceipt).toBe('verification receipt accepted');
    expect(handle.model.completed.has('mouse-drag')).toBe(true);
  });

  it('advances an Orbit workflow and renders the rich visual stack', async () => {
    const handle = flightDeck(140, 48);

    handle.pressKey('3');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('ORBIT WORKFLOWS');
    expect(handle.lastFrame()).toContain('Release preferences');
    expect(handle.lastFrame()).toContain('Step 1 of 3: Scope');

    const next = findText(handle.lastFrame(), 'Advance step');
    handle.click(next.col, next.row);
    await handle.waitForUpdate();
    expect(handle.model.wizard.currentStep).toBe(1);
    expect(handle.model.completed.has('workflow')).toBe(true);
    expect(handle.lastFrame()).toContain('Step 2 of 3: Verify');

    handle.pressKey('4');
    await handle.waitForUpdate();
    expect(handle.lastFrame()).toContain('RICH TERMINAL RENDERING');
    expect(handle.lastFrame()).toContain('Spectrum / TypeScript');
    expect(handle.lastFrame()).toContain('Stellar line chart');
    expect(handle.lastFrame()).toContain('Pulsar');
    expect(handle.model.completed.has('visual')).toBe(true);
  });

  it('preserves the base app beneath layers and provides contextual Escape-dismissible help', async () => {
    const handle = flightDeck(100, 36);
    handle.pressKey('6');
    await handle.waitForUpdate();
    const modalLauncher = findText(handle.lastFrame(), 'modal');
    fireMouse(handle.terminal, { type: 'move', col: modalLauncher.col, row: modalLauncher.row });
    expect(handle.model.hoveredRegion).toBe('action:modal');

    handle.dispatch({ type: 'open-surface', surface: 'confirm' });
    await handle.waitForUpdate();
    const confirmAction = findText(handle.lastFrame(), '[Record]');
    fireMouse(handle.terminal, { type: 'move', col: confirmAction.col, row: confirmAction.row });
    expect(handle.model.confirm.hoveredButton).toBe('confirm');
    handle.click(confirmAction.col, confirmAction.row);
    expect(handle.model.confirm.open).toBe(false);

    handle.dispatch({ type: 'open-surface', surface: 'palette' });
    await handle.waitForUpdate();
    const paletteAction = findText(handle.lastFrame(), 'Open Windows lab');
    handle.click(paletteAction.col, paletteAction.row);
    await handle.waitForUpdate();
    expect(handle.model.activeLab).toBe('windows');
    handle.pressKey('6');
    await handle.waitForUpdate();

    handle.dispatch({ type: 'open-surface', surface: 'toast' });
    await handle.waitForUpdate();
    const toast = findText(handle.lastFrame(), 'Layer receipt captured');
    expect(toast.row).toBeLessThanOrEqual(3);
    expect(toast.col).toBeGreaterThan(handle.model.cols / 2);
    handle.pressKey('escape');
    await handle.waitForUpdate();

    for (const surface of ['modal', 'confirm', 'drawer', 'tooltip', 'palette', 'toast'] as const) {
      handle.dispatch({ type: 'open-surface', surface });
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain('Every action adds a real transparent layer');
      expect(handle.lastFrame()).toContain('[Help] [Commands]');
      expect(handle.model.completed.has('layer')).toBe(true);
      handle.pressKey('escape');
      await handle.waitForUpdate();
      expect(handle.lastFrame()).toContain('Base application - should never disappear');
    }
    expect(handle.model.modal.open).toBe(false);
    expect(handle.model.confirm.open).toBe(false);
    expect(handle.model.drawer.open).toBe(false);
    expect(handle.model.tooltip.visible).toBe(false);
    expect(handle.model.palette.palette.open).toBe(false);
    expect(handle.model.toast.toasts).toHaveLength(0);

    handle.dispatch({ type: 'open-surface', surface: 'tooltip' });
    await handle.waitForUpdate();
    const tooltip = findText(handle.lastFrame(), 'Tooltip content is tokenized');
    handle.click(tooltip.col, tooltip.row);
    expect(handle.model.tooltip.visible).toBe(true);
    handle.click(0, handle.model.rows - 2);
    expect(handle.model.tooltip.visible).toBe(false);

    handle.pressKey('?');
    await handle.waitForUpdate();
    const helpFrame = handle.lastFrame();
    expect(handle.model.helpOpen).toBe(true);
    expect(helpFrame).toContain('Layers help');
    expect(helpFrame).toContain('LAYERS LAB');
    expect(helpFrame).toContain('LAYER COMPOSITION');
    expect(handle.model.completed.has('help')).toBe(true);
    handle.pressKey('escape');
    expect(handle.model.helpOpen).toBe(false);
  });

  it('drags and manages Horizon windows, then preserves state across adaptive representations', async () => {
    const handle = flightDeck(140, 42);
    const screen = createScreen(handle);
    handle.pressKey('7');
    await handle.waitForUpdate();

    const before = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    fireMouse(handle.terminal, { type: 'move', col: before.x + 2, row: before.y + 1 });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.chrome?.hoveredTarget).toBe('titlebar');
    fireMouse(handle.terminal, { type: 'move', col: before.x, row: before.y + 3 });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.chrome?.hoveredTarget).toBe('resize:left');
    const blankTitlebarCol = before.x + before.width - 11;
    handle.drag(blankTitlebarCol, before.y + 1, blankTitlebarCol + 8, before.y + 4);
    await handle.waitForUpdate();
    const after = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    expect({ x: after.x, y: after.y }).toEqual({ x: before.x + 8, y: before.y + 3 });
    expect(handle.model.completed.has('mouse-drag')).toBe(true);
    expect(handle.model.completed.has('window')).toBe(true);

    const widthBeforeResize = after.width;
    const heightBeforeResize = after.height;
    handle.drag(after.x + after.width - 1, after.y + after.height - 1, after.x + after.width + 4, after.y + after.height + 2);
    await handle.waitForUpdate();
    const resized = handle.model.windows.windows.find((window) => window.id === 'telemetry')!;
    expect(resized.width).toBe(widthBeforeResize + 5);
    expect(resized.height).toBe(heightBeforeResize + 3);

    const title = findText(handle.lastFrame(), 'Telemetry instrument');
    const titleLine = handle.lastFrame().split('\n')[title.row]!;
    const maximizeCol = titleLine.indexOf('[ ]', title.col);
    expect(maximizeCol).toBeGreaterThan(title.col);
    handle.click(maximizeCol + 1, title.row);
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.mode).toBe('maximized');
    handle.dispatch({ type: 'window-action', id: 'telemetry', action: 'restore' });
    expect(handle.model.windows.windows.find((window) => window.id === 'telemetry')?.mode).toBe('normal');

    screen.fireResize(100, 36);
    expect(handle.lastFrame()).toContain('MEDIUM / split');
    screen.fireResize(70, 32);
    expect(handle.lastFrame()).toContain('COMPACT / single');
    expect(handle.model.windows.windows.some((window) => window.id === 'telemetry')).toBe(true);
    expect(handle.model.completed.has('adaptive')).toBe(true);
  });
});
