import { createTestApp, type TestAppHandle } from '@celestial/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiInspectorApp, type ApiInspectorModel, type ApiInspectorMsg } from '../app.js';
import { createApiRuntime, type ApiResponse, type ApiRuntime } from '../server.js';

function findText(frame: string, needle: string): { col: number; row: number } {
  const lines = frame.split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${needle} in frame:\n${frame}`);
  return { row, col: lines[row]!.indexOf(needle) };
}

describe('API inspector app', () => {
  const handles: Array<TestAppHandle<ApiInspectorModel, ApiInspectorMsg>> = [];
  const runtimes: ApiRuntime[] = [];

  afterEach(async () => {
    for (const handle of handles.splice(0)) handle.stop();
    for (const runtime of runtimes.splice(0)) await runtime.dispose();
  });

  for (const size of [
    { cols: 80, rows: 24 },
    { cols: 140, rows: 40 },
  ]) {
    it(`sends requests and manages layered history at ${size.cols}x${size.rows}`, async () => {
      const apiRuntime = createApiRuntime();
      runtimes.push(apiRuntime);
      const handle = createTestApp(createApiInspectorApp({ runtime: apiRuntime, initialSize: size }), size);
      handles.push(handle);

      await vi.waitFor(() => expect(handle.model.serverState).toBe('ready'));
      expect(handle.lastFrame()).toContain('Celestial API Inspector');
      expect(handle.snapshot().audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);

      handle.pressKey('s');
      await vi.waitFor(() => expect(handle.model.response?.status).toBe(200));
      expect(handle.lastFrame()).toContain('200 OK');
      expect(handle.model.history).toHaveLength(1);

      const historyPoint = findText(handle.lastFrame(), 'History 1');
      handle.click(historyPoint.col, historyPoint.row);
      expect(handle.model.historyOpen).toBe(true);
      const historyFrame = handle.lastFrame();
      const drawerWidth = Math.min(size.cols, Math.min(48, Math.max(34, Math.floor(size.cols * 0.42))));
      const historyTitle = findText(historyFrame, 'Request history');
      expect(historyFrame).toContain('Celestial API Inspector');
      expect(historyFrame.match(/GET \/health\s+200/g)).toHaveLength(1);
      expect(historyTitle.col).toBeGreaterThanOrEqual(size.cols - drawerWidth + 2);
      await handle.waitForUpdate();
      handle.click(0, 0);
      expect(handle.model.historyOpen).toBe(false);
      handle.dispatch({ type: 'toggle-history' });
      handle.pressKey('escape');
      expect(handle.model.historyOpen).toBe(false);

      handle.dispatch({ type: 'set-path', value: '/error' });
      handle.dispatch({ type: 'send' });
      await vi.waitFor(() => expect(handle.model.response?.status).toBe(500));
      expect(handle.lastFrame()).toContain('500 Internal Server Error');

      handle.pressKey('tab');
      expect(handle.model.focus).toBe('path');
      const pathPoint = findText(handle.lastFrame(), '/error');
      handle.click(pathPoint.col, pathPoint.row);
      expect(handle.model.focus).toBe('path');
    });
  }

  it('caps history at 20 entries and restores a selected request', () => {
    const apiRuntime = createApiRuntime();
    runtimes.push(apiRuntime);
    const handle = createTestApp(createApiInspectorApp({ runtime: apiRuntime, initialSize: { cols: 100, rows: 30 } }), { cols: 100, rows: 30 });
    handles.push(handle);
    const response: ApiResponse = { status: 200, statusText: 'OK', durationMs: 1, headers: {}, body: '{}' };
    for (let index = 0; index < 25; index += 1) {
      handle.dispatch({
        type: 'request-result',
        request: { method: 'GET', path: `/item/${index}`, body: '' },
        result: { ok: true, value: response },
      });
    }
    expect(handle.model.history).toHaveLength(20);
    expect(handle.model.history[0]?.request.path).toBe('/item/24');
    handle.dispatch({ type: 'toggle-history' });
    handle.dispatch({ type: 'select-history', index: 0 });
    expect(handle.model.path.value).toBe('/item/24');
    expect(handle.model.historyOpen).toBe(false);
  });
});
