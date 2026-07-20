import { createScreen, createTestApp, type TestAppHandle } from '@celestial/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHorizonWorkbenchApp, type HorizonWorkbenchModel, type HorizonWorkbenchMsg } from '../app.js';

function findText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

function findTextOnLine(frame: string, lineNeedle: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => {
    const anchor = line.indexOf(lineNeedle);
    return anchor >= 0 && line.indexOf(needle, anchor) >= 0;
  });
  if (row < 0) throw new Error(`Could not find ${needle} on the ${lineNeedle} line in frame:\n${frame}`);
  const anchor = lines[row]!.indexOf(lineNeedle);
  return { row, col: lines[row]!.indexOf(needle, anchor) };
}

describe('Horizon workbench app', () => {
  const handles: Array<TestAppHandle<HorizonWorkbenchModel, HorizonWorkbenchMsg>> = [];

  afterEach(() => {
    for (const handle of handles.splice(0)) handle.stop();
  });

  for (const size of [
    { cols: 70, rows: 24 },
    { cols: 100, rows: 30 },
    { cols: 140, rows: 40 },
  ]) {
    it(`uses the expected responsive layout at ${size.cols}x${size.rows}`, () => {
      const handle = createTestApp(createHorizonWorkbenchApp({ initialSize: size, fast: true }), size);
      handles.push(handle);
      expect(handle.lastFrame()).toContain('Celestial Horizon Workbench');
      expect(handle.lastFrame()).toContain('Build workspace');
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);

      handle.pressKey('2');
      expect(handle.model.workspaces.activeIndex).toBe(1);
      expect(handle.lastFrame()).toContain('Observe workspace');

      handle.pressKey('tab');
      expect(handle.model.focusedPane).toBe(1);
      handle.pressKey('tab', { shift: true });
      expect(handle.model.focusedPane).toBe(0);

      for (let index = 0; index < 20; index += 1) handle.pressKey('[');
      expect(handle.model.ratio).toBe(0.25);
      for (let index = 0; index < 20; index += 1) handle.pressKey(']');
      expect(handle.model.ratio).toBe(0.75);

      handle.pressKey('i');
      expect(handle.model.inspectorOpen).toBe(true);
      expect(handle.lastFrame()).toContain('Inspector');
      if (size.cols < 80) {
        const inspectorFrame = handle.lastFrame();
        expect(inspectorFrame).toContain('Celestial Horizon Workbench');
        expect(inspectorFrame.match(/Workspace: Observe/g)).toHaveLength(1);
        expect(findText(inspectorFrame, 'Inspector').col).toBeGreaterThan(0);
      }
      handle.pressKey('escape');
      expect(handle.model.inspectorOpen).toBe(false);

      handle.pressKey('p', { ctrl: true });
      expect(handle.model.palette.palette.open).toBe(true);
      handle.pressKey('escape');
      expect(handle.model.palette.palette.open).toBe(false);
    });
  }

  it('supports workspace mouse selection and floating window chrome', async () => {
    const size = { cols: 140, rows: 40 };
    const handle = createTestApp(createHorizonWorkbenchApp({ initialSize: size, fast: true }), size);
    handles.push(handle);

    const review = findText(handle.lastFrame(), 'Review');
    handle.click(review.col, review.row);
    expect(handle.model.workspaces.activeIndex).toBe(2);

    const outputBeforeInspector = handle.terminal.output.length;
    handle.pressKey('i');
    expect(handle.model.windows.windows.some((window) => window.id === 'inspector')).toBe(true);
    handle.pressKey('m');
    expect(handle.model.windows.windows.find((window) => window.id === 'inspector')?.mode).toBe('maximized');
    handle.pressKey('m');
    expect(handle.model.windows.windows.find((window) => window.id === 'inspector')?.mode).toBe('normal');

    await vi.waitFor(() => expect(handle.terminal.output.length).toBeGreaterThan(outputBeforeInspector));

    const close = findTextOnLine(handle.lastFrame(), 'Inspector', '[x]');
    handle.click(close.col, close.row);
    expect(handle.model.inspectorOpen).toBe(false);
    expect(handle.model.windows.windows).toHaveLength(0);
  });

  it('moves between wide, medium, and narrow breakpoints on resize and resets state', () => {
    const handle = createTestApp(createHorizonWorkbenchApp({ initialSize: { cols: 140, rows: 40 }, fast: true }), { cols: 140, rows: 40 });
    handles.push(handle);
    const screen = createScreen(handle);
    screen.fireResize(100, 30);
    expect(handle.model.cols).toBe(100);
    screen.fireResize(70, 24);
    expect(handle.model.cols).toBe(70);
    handle.pressKey('3');
    handle.pressKey('i');
    expect(handle.lastFrame()).toContain('Inspector');
    handle.pressKey('r');
    expect(handle.model.workspaces.activeIndex).toBe(0);
    expect(handle.model.inspectorOpen).toBe(false);
    expect(handle.model.ratio).toBe(0.52);
  });
});
