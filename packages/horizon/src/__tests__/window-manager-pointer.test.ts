import { text } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import {
  createWindowManagerPointerState,
  windowManagerPointerUpdate,
} from '../window-manager-pointer.js';
import { createWindowManager } from '../windows.js';

const mouse = (type: 'press' | 'move' | 'release', x: number, y: number, button: 0 | 2 | 'none' = type === 'move' ? 'none' : 0) => ({
  type,
  x,
  y,
  button,
  ctrl: false,
  alt: false,
  shift: false,
} as const);

function setup() {
  const manager = createWindowManager([
    {
      id: 'editor',
      title: 'Editor',
      content: text('body'),
      x: 10,
      y: 5,
      width: 30,
      height: 12,
      minWidth: 20,
      minHeight: 8,
      maxWidth: 50,
      maxHeight: 20,
      draggable: true,
      resizable: true,
      closable: true,
      minimizable: true,
      maximizable: true,
      fullscreenable: true,
    },
  ], { cols: 80, rows: 30 });
  return { manager, state: createWindowManagerPointerState(manager.bounds) };
}

describe('window manager pointer controller', () => {
  it('owns directional resize capture and manager constraints end to end', () => {
    let { manager, state } = setup();
    let result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('press', 39, 10) }, state, manager);
    state = result.state;
    manager = result.manager;
    expect(result.cursor).toBe('ew-resize');
    expect(state.mouse.active).toMatchObject({ kind: 'resize-float', floatId: 'editor', edge: 'right' });

    result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('move', 500, 10) }, state, manager);
    state = result.state;
    manager = result.manager;
    expect(manager.windows[0]).toMatchObject({ x: 10, width: 50 });
    expect(result.cursor).toBe('ew-resize');

    result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('release', 500, 10) }, state, manager);
    expect(result.state.mouse.active).toEqual({ kind: 'none' });
    expect(result.cursor).toBe('default');
  });

  it('rolls a live move back on cancellation', () => {
    let { manager, state } = setup();
    let result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('press', 15, 6) }, state, manager);
    state = result.state;
    manager = result.manager;
    expect(state.mouse.active).toMatchObject({ kind: 'drag-float', floatId: 'editor' });

    result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('move', 25, 10) }, state, manager);
    state = result.state;
    manager = result.manager;
    expect(manager.windows[0]).toMatchObject({ x: 20, y: 9 });

    result = windowManagerPointerUpdate({ type: 'cancel' }, state, manager);
    expect(result.manager.windows[0]).toMatchObject({ x: 10, y: 5, width: 30, height: 12 });
    expect(result.state.mouse.active).toEqual({ kind: 'none' });
  });

  it('keeps chrome controls out of the draggable title target', () => {
    const { manager, state } = setup();
    const result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('press', 38, 6) }, state, manager);

    expect(result.state.mouse.active).toEqual({ kind: 'none' });
    expect(result.manager.windows[0]?.focused).toBe(true);
  });

  it('ignores secondary clicks while still exposing hover cursors', () => {
    const { manager, state } = setup();
    const hovered = windowManagerPointerUpdate({ type: 'pointer', event: mouse('move', 10, 10) }, state, manager);
    const clicked = windowManagerPointerUpdate({ type: 'pointer', event: mouse('press', 10, 10, 2) }, hovered.state, hovered.manager);

    expect(hovered.cursor).toBe('ew-resize');
    expect(clicked.state.mouse.active).toEqual({ kind: 'none' });
  });

  it('cancels active geometry before applying new terminal bounds', () => {
    let { manager, state } = setup();
    let result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('press', 39, 10) }, state, manager);
    state = result.state;
    manager = result.manager;
    result = windowManagerPointerUpdate({ type: 'pointer', event: mouse('move', 45, 10) }, state, manager);

    const resized = windowManagerPointerUpdate(
      { type: 'resize', bounds: { cols: 60, rows: 24, topInset: 2, bottomInset: 1 } },
      result.state,
      result.manager,
    );

    expect(resized.state.mouse.active).toEqual({ kind: 'none' });
    expect(resized.manager.bounds).toMatchObject({ cols: 60, rows: 24, topInset: 2, bottomInset: 1 });
    expect(resized.manager.windows[0]).toMatchObject({ width: 30, height: 12 });
  });
});
