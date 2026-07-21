import { describe, expect, it } from 'vitest';
import {
  beginFloatingWindowResize,
  clampFloatingWindowFrame,
  hitTestFloatingWindowResizeEdge,
  hitTestFloatingWindowTitleBar,
  resizeFloatingWindowFrame,
  translateFloatingWindowFromDragState,
  withFloatingWindows,
} from '../index.js';

describe('floating-window drag helpers', () => {
  it('distinguishes resize borders from the integrated title row', () => {
    const frame = { x: 10, y: 5, width: 30, height: 12 };
    expect(hitTestFloatingWindowResizeEdge(frame, 10, 5)).toBe('top-left');
    expect(hitTestFloatingWindowResizeEdge(frame, 39, 16)).toBe('bottom-right');
    expect(hitTestFloatingWindowResizeEdge(frame, 24, 6)).toBeNull();
    expect(hitTestFloatingWindowTitleBar(frame, 24, 6)).toBe(true);
    expect(hitTestFloatingWindowTitleBar(frame, 24, 7)).toBe(false);
  });

  it('reserves an end inset for titlebar controls', () => {
    const frame = { x: 10, y: 5, width: 30, height: 10 };
    expect(hitTestFloatingWindowTitleBar(frame, 29, 6, { endInset: 9 })).toBe(true);
    expect(hitTestFloatingWindowTitleBar(frame, 30, 6, { endInset: 9 })).toBe(false);
  });

  it('creates resize state from the canonical frame', () => {
    expect(beginFloatingWindowResize('left', { x: 4, y: 3, width: 20, height: 8 }, 4, 6)).toEqual({
      edge: 'left',
      startMouseX: 4,
      startMouseY: 6,
      startX: 4,
      startY: 3,
      startWidth: 20,
      startHeight: 8,
    });
  });

  it('normalizes minimum constraints that exceed the viewport when clamping', () => {
    const frame = clampFloatingWindowFrame(
      { cols: 20, rows: 10, bottomInset: 4 },
      {
        width: 36,
        height: 18,
        minWidth: 36,
        minHeight: 18,
        maxWidth: 18,
        maxHeight: 5,
      },
      { x: 8, y: 6, width: 40, height: 20 },
    );

    expect(frame.width).toBeLessThanOrEqual(18);
    expect(frame.height).toBeLessThanOrEqual(5);
    expect(frame.x + frame.width).toBeLessThanOrEqual(20);
    expect(frame.y + frame.height).toBeLessThanOrEqual(6);
  });

  it('honors all four application insets when clamping and resizing', () => {
    const viewport = { cols: 40, rows: 20, leftInset: 3, rightInset: 4, topInset: 2, bottomInset: 3 };
    const frame = clampFloatingWindowFrame(viewport, { width: 20, height: 10, minWidth: 5, minHeight: 3 }, { x: 99, y: 99, width: 20, height: 10 });
    const resized = resizeFloatingWindowFrame(
      { edge: 'bottom-right', startMouseX: 22, startMouseY: 11, startX: 3, startY: 2, startWidth: 20, startHeight: 10 },
      99,
      99,
      viewport,
      { minWidth: 5, minHeight: 3 },
    );

    expect(frame).toEqual({ x: 16, y: 7, width: 20, height: 10 });
    expect(resized).toEqual({ x: 3, y: 2, width: 33, height: 15 });
  });

  it('normalizes resize constraints that exceed the viewport', () => {
    const resized = resizeFloatingWindowFrame(
      {
        edge: 'bottom-right',
        startMouseX: 12,
        startMouseY: 4,
        startX: 2,
        startY: 1,
        startWidth: 18,
        startHeight: 5,
      },
      40,
      20,
      { cols: 20, rows: 10, bottomInset: 4 },
      {
        minWidth: 36,
        minHeight: 18,
        maxWidth: 18,
        maxHeight: 5,
      },
    );

    expect(resized.width).toBeLessThanOrEqual(18);
    expect(resized.height).toBeLessThanOrEqual(5);
    expect(resized.x + resized.width).toBeLessThanOrEqual(20);
    expect(resized.y + resized.height).toBeLessThanOrEqual(6);
  });

  it('translates drag from the drag-start frame instead of compounding deltas', () => {
    const first = translateFloatingWindowFromDragState(
      {
        startMouseX: 10,
        startMouseY: 4,
        startX: 12,
        startY: 6,
      },
      { width: 30, height: 12 },
      12,
      5,
      { cols: 120, rows: 40, bottomInset: 3 },
    );
    const second = translateFloatingWindowFromDragState(
      {
        startMouseX: 10,
        startMouseY: 4,
        startX: 12,
        startY: 6,
      },
      { width: 30, height: 12 },
      13,
      5,
      { cols: 120, rows: 40, bottomInset: 3 },
    );

    expect(first.frame.x).toBe(14);
    expect(second.frame.x).toBe(15);
  });

  it('keeps the frame at the drag start until the deadzone is exceeded', () => {
    const subThreshold = translateFloatingWindowFromDragState(
      {
        startMouseX: 10,
        startMouseY: 4,
        startX: 12,
        startY: 6,
      },
      { width: 30, height: 12 },
      10,
      4,
      { cols: 120, rows: 40, bottomInset: 3 },
    );

    expect(subThreshold.dragging).toBe(false);
    expect(subThreshold.frame).toEqual({ x: 12, y: 6, width: 30, height: 12 });
  });
});

describe('withFloatingWindows', () => {
  it('assigns a stable overlay layoutId by default', () => {
    const rendered = withFloatingWindows({ kind: 'text', content: 'base' }, [
      {
        id: 'search',
        title: 'Search',
        content: { kind: 'text', content: 'overlay' },
        x: 4,
        y: 2,
        width: 20,
        height: 6,
      },
    ]);

    const overlayNode = rendered.kind === 'component' ? rendered.render() : rendered;
    const floatingOverlay = overlayNode.kind === 'row' ? overlayNode.children[1] : null;
    expect(floatingOverlay?.kind).toBe('overlay');
    if (floatingOverlay?.kind === 'overlay') {
      expect(floatingOverlay.layoutId).toBe('floating-window:search');
    }
  });
});
