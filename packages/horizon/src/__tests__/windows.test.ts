import { describe, expect, it } from 'vitest';
import { createWindowManager, getFrontmostWindow, windowManagerUpdate } from '../index.js';

describe('window manager', () => {
  it('focus-window brings target to front', () => {
    const manager = createWindowManager([
      { id: 'a', content: { kind: 'text', content: 'a' }, x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', content: { kind: 'text', content: 'b' }, x: 1, y: 1, width: 10, height: 10 },
    ]);

    const next = windowManagerUpdate({ type: 'focus-window', id: 'a' }, manager);
    expect(getFrontmostWindow(next)?.id).toBe('a');
  });

  it('maximize and restore preserve previous bounds', () => {
    const manager = createWindowManager([{ id: 'a', content: { kind: 'text', content: 'a' }, x: 2, y: 3, width: 20, height: 8 }], { cols: 100, rows: 40 });

    const maximized = windowManagerUpdate({ type: 'maximize-window', id: 'a' }, manager);
    expect(maximized.windows[0]?.maximized).toBe(true);
    expect(maximized.windows[0]?.x).toBe(0);

    const restored = windowManagerUpdate({ type: 'restore-window', id: 'a' }, maximized);
    expect(restored.windows[0]?.maximized).toBe(false);
    expect(restored.windows[0]?.x).toBe(2);
    expect(restored.windows[0]?.height).toBe(8);
  });

  it('minimize hides window from active set', () => {
    const manager = createWindowManager([{ id: 'a', content: { kind: 'text', content: 'a' }, x: 0, y: 0, width: 10, height: 10 }]);

    const next = windowManagerUpdate({ type: 'minimize-window', id: 'a' }, manager);
    expect(next.windows[0]?.minimized).toBe(true);
  });

  it('snap-move-window aligns windows to snap targets', () => {
    const manager = createWindowManager(
      [
        { id: 'a', content: { kind: 'text', content: 'a' }, x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', content: { kind: 'text', content: 'b' }, x: 20, y: 0, width: 10, height: 10 },
      ],
      { cols: 80, rows: 24 },
    );

    const next = windowManagerUpdate({ type: 'snap-move-window', id: 'a', x: 18, y: 1, config: { windowThreshold: 2, edgeThreshold: 2 } }, manager);
    expect(next.windows[0]?.x).toBe(20);
    expect(next.windows[0]?.y).toBe(0);
    expect(next.snapGuides.length).toBeGreaterThan(0);
  });
});
