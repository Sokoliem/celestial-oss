import { clampFinite, finiteCell, nonNegativeInteger, positiveInteger } from './internal.js';
import type { PointerCursor } from '@celestial/core/nebula';
import type { WindowBounds } from './primitives/geometry.js';

export interface FloatingViewportBounds {
  cols: number;
  rows: number;
  leftInset?: number;
  rightInset?: number;
  topInset?: number;
  bottomInset?: number;
}

export interface FloatingWindowDefaults {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface FloatingWindowFrame extends WindowBounds {}

export interface FloatingWindowDragState {
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
}

export type FloatingWindowResizeEdge = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export function floatingWindowResizeCursor(edge: FloatingWindowResizeEdge): PointerCursor {
  switch (edge) {
    case 'left':
    case 'right':
      return 'ew-resize';
    case 'top':
    case 'bottom':
      return 'ns-resize';
    case 'top-left':
    case 'bottom-right':
      return 'nwse-resize';
    case 'top-right':
    case 'bottom-left':
      return 'nesw-resize';
  }
}

export interface FloatingWindowResizeState {
  edge: FloatingWindowResizeEdge;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export interface FloatingWindowHitTestOptions {
  /** Thickness of the resize band along each outer edge. Default 1 cell. */
  handleSize?: number;
  /** Width of the rendered frame border. Default 1 cell. */
  borderWidth?: number;
  /** Height of the draggable title row inside the border. Default 1 cell. */
  titleBarHeight?: number;
  /** Cells reserved at the visual end of the title row (for chrome controls). */
  endInset?: number;
}

export interface FloatingViewportRect {
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  rightInset: number;
  bottomInset: number;
  maxWidth: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return clampFinite(value, min, max);
}

function isFiniteFrame(frame: FloatingWindowFrame): boolean {
  return Number.isFinite(frame.x) && Number.isFinite(frame.y) && Number.isFinite(frame.width) && Number.isFinite(frame.height);
}

/** Resolve the resize edge under a pointer, preferring corners. */
export function hitTestFloatingWindowResizeEdge(
  frame: FloatingWindowFrame,
  mouseX: number,
  mouseY: number,
  options: FloatingWindowHitTestOptions = {},
): FloatingWindowResizeEdge | null {
  if (!isFiniteFrame(frame) || !Number.isFinite(mouseX) || !Number.isFinite(mouseY) || frame.width <= 0 || frame.height <= 0) return null;
  if (mouseX < frame.x || mouseX >= frame.x + frame.width || mouseY < frame.y || mouseY >= frame.y + frame.height) return null;

  const handleSize = positiveInteger(options.handleSize, 1);
  const leftDistance = mouseX - frame.x;
  const rightDistance = frame.x + frame.width - 1 - mouseX;
  const topDistance = mouseY - frame.y;
  const bottomDistance = frame.y + frame.height - 1 - mouseY;
  const onLeft = leftDistance < handleSize && leftDistance <= rightDistance;
  const onRight = rightDistance < handleSize && rightDistance < leftDistance;
  const onTop = topDistance < handleSize && topDistance <= bottomDistance;
  const onBottom = bottomDistance < handleSize && bottomDistance < topDistance;

  if (onTop && onLeft) return 'top-left';
  if (onTop && onRight) return 'top-right';
  if (onBottom && onLeft) return 'bottom-left';
  if (onBottom && onRight) return 'bottom-right';
  if (onLeft) return 'left';
  if (onRight) return 'right';
  if (onTop) return 'top';
  if (onBottom) return 'bottom';
  return null;
}

/** True when the pointer is on the title row, excluding the outer border. */
export function hitTestFloatingWindowTitleBar(frame: FloatingWindowFrame, mouseX: number, mouseY: number, options: FloatingWindowHitTestOptions = {}): boolean {
  if (!isFiniteFrame(frame) || !Number.isFinite(mouseX) || !Number.isFinite(mouseY) || frame.width <= 0 || frame.height <= 0) return false;
  const borderWidth = nonNegativeInteger(options.borderWidth, 1);
  const titleBarHeight = positiveInteger(options.titleBarHeight, 1);
  const endInset = nonNegativeInteger(options.endInset, 0);
  return (
    mouseX >= frame.x + borderWidth &&
    mouseX < frame.x + frame.width - borderWidth - endInset &&
    mouseY >= frame.y + borderWidth &&
    mouseY < frame.y + borderWidth + titleBarHeight &&
    mouseY < frame.y + frame.height - borderWidth
  );
}

export function beginFloatingWindowResize(
  edge: FloatingWindowResizeEdge,
  frame: FloatingWindowFrame,
  mouseX: number,
  mouseY: number,
): FloatingWindowResizeState {
  return {
    edge,
    startMouseX: finiteCell(mouseX),
    startMouseY: finiteCell(mouseY),
    startX: finiteCell(frame.x),
    startY: finiteCell(frame.y),
    startWidth: positiveInteger(frame.width, 1),
    startHeight: positiveInteger(frame.height, 1),
  };
}

export function getFloatingViewportRect(viewport: FloatingViewportBounds): FloatingViewportRect {
  const cols = positiveInteger(viewport.cols, 1);
  const rows = positiveInteger(viewport.rows, 1);
  const leftInset = nonNegativeInteger(viewport.leftInset, 0, cols - 1);
  const rightInset = nonNegativeInteger(viewport.rightInset, 0, cols - leftInset - 1);
  const topInset = nonNegativeInteger(viewport.topInset, 0, rows - 1);
  const bottomInset = nonNegativeInteger(viewport.bottomInset, 0, rows - topInset - 1);
  return {
    cols,
    rows,
    minX: leftInset,
    minY: topInset,
    rightInset,
    bottomInset,
    maxWidth: Math.max(1, cols - leftInset - rightInset),
    maxHeight: Math.max(1, rows - topInset - bottomInset),
  };
}

/** Resolve the inset-aware area available to ordinary and maximized windows. */
export function getFloatingWorkArea(viewport: FloatingViewportBounds): FloatingWindowFrame {
  const rect = getFloatingViewportRect(viewport);
  return { x: rect.minX, y: rect.minY, width: rect.maxWidth, height: rect.maxHeight };
}

/** Resolve the full terminal viewport used by fullscreen windows. */
export function getFloatingFullscreenArea(viewport: FloatingViewportBounds): FloatingWindowFrame {
  return { x: 0, y: 0, width: positiveInteger(viewport.cols, 1), height: positiveInteger(viewport.rows, 1) };
}

function getNormalizedConstraints(
  viewport: FloatingViewportBounds,
  defaults: Pick<FloatingWindowDefaults, 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'>,
): { viewportRect: FloatingViewportRect; minWidth: number; minHeight: number; maxWidth: number; maxHeight: number } {
  const viewportRect = getFloatingViewportRect(viewport);
  const maxWidth = positiveInteger(defaults.maxWidth, viewportRect.maxWidth, viewportRect.maxWidth);
  const maxHeight = positiveInteger(defaults.maxHeight, viewportRect.maxHeight, viewportRect.maxHeight);
  const minWidth = positiveInteger(defaults.minWidth, 1, maxWidth);
  const minHeight = positiveInteger(defaults.minHeight, 1, maxHeight);
  return { viewportRect, minWidth, minHeight, maxWidth, maxHeight };
}

export function clampFloatingWindowFrame(
  viewport: FloatingViewportBounds,
  defaults: FloatingWindowDefaults,
  frame?: Partial<FloatingWindowFrame> | null,
): FloatingWindowFrame {
  const { viewportRect, minWidth, minHeight, maxWidth, maxHeight } = getNormalizedConstraints(viewport, defaults);
  const width = clamp(positiveInteger(frame?.width, positiveInteger(defaults.width, minWidth), maxWidth), minWidth, maxWidth);
  const height = clamp(positiveInteger(frame?.height, positiveInteger(defaults.height, minHeight), maxHeight), minHeight, maxHeight);
  const centeredX = Math.max(viewportRect.minX, viewportRect.minX + Math.floor((viewportRect.maxWidth - width) / 2));
  const centeredY = Math.max(viewportRect.minY, Math.floor((viewportRect.minY + viewportRect.maxHeight - height) / 2));
  const x = clamp(finiteCell(frame?.x, centeredX), viewportRect.minX, Math.max(viewportRect.minX, viewportRect.cols - viewportRect.rightInset - width));
  const y = clamp(finiteCell(frame?.y, centeredY), viewportRect.minY, Math.max(viewportRect.minY, viewportRect.rows - viewportRect.bottomInset - height));
  return { x, y, width, height };
}

export function translateFloatingWindowFrame(
  frame: FloatingWindowFrame,
  deltaX: number,
  deltaY: number,
  viewport: FloatingViewportBounds,
): FloatingWindowFrame {
  const viewportRect = getFloatingViewportRect(viewport);
  const width = positiveInteger(frame.width, 1, viewportRect.maxWidth);
  const height = positiveInteger(frame.height, 1, viewportRect.maxHeight);
  return {
    width,
    height,
    x: clamp(finiteCell(frame.x) + finiteCell(deltaX), viewportRect.minX, Math.max(viewportRect.minX, viewportRect.cols - viewportRect.rightInset - width)),
    y: clamp(
      finiteCell(frame.y, viewportRect.minY) + finiteCell(deltaY),
      viewportRect.minY,
      Math.max(viewportRect.minY, viewportRect.rows - viewportRect.bottomInset - height),
    ),
  };
}

export function translateFloatingWindowFromDragState(
  drag: FloatingWindowDragState,
  frame: Pick<FloatingWindowFrame, 'width' | 'height'>,
  mouseX: number,
  mouseY: number,
  viewport: FloatingViewportBounds,
  deadzone = 1,
): { frame: FloatingWindowFrame; dragging: boolean } {
  const deltaX = finiteCell(mouseX) - finiteCell(drag.startMouseX);
  const deltaY = finiteCell(mouseY) - finiteCell(drag.startMouseY);
  const safeDeadzone = nonNegativeInteger(deadzone, 1);
  const dragging = Math.abs(deltaX) >= safeDeadzone || Math.abs(deltaY) >= safeDeadzone;
  const viewportRect = getFloatingViewportRect(viewport);
  const width = positiveInteger(frame.width, 1, viewportRect.maxWidth);
  const height = positiveInteger(frame.height, 1, viewportRect.maxHeight);
  const startX = finiteCell(drag.startX);
  const startY = finiteCell(drag.startY, viewportRect.minY);
  const nextX = dragging ? startX + deltaX : startX;
  const nextY = dragging ? startY + deltaY : startY;

  return {
    frame: {
      x: clamp(nextX, viewportRect.minX, Math.max(viewportRect.minX, viewportRect.cols - viewportRect.rightInset - width)),
      y: clamp(nextY, viewportRect.minY, Math.max(viewportRect.minY, viewportRect.rows - viewportRect.bottomInset - height)),
      width,
      height,
    },
    dragging,
  };
}

export function resizeFloatingWindowFrame(
  resize: FloatingWindowResizeState,
  mouseX: number,
  mouseY: number,
  viewport: FloatingViewportBounds,
  defaults: Pick<FloatingWindowDefaults, 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'>,
): FloatingWindowFrame {
  const deltaX = finiteCell(mouseX) - finiteCell(resize.startMouseX);
  const deltaY = finiteCell(mouseY) - finiteCell(resize.startMouseY);
  const { viewportRect, minWidth, minHeight, maxWidth, maxHeight } = getNormalizedConstraints(viewport, defaults);

  const startX = clamp(finiteCell(resize.startX), viewportRect.minX, viewportRect.cols - 1);
  const startY = clamp(finiteCell(resize.startY, viewportRect.minY), viewportRect.minY, viewportRect.rows - viewportRect.bottomInset - 1);
  const startWidth = positiveInteger(resize.startWidth, minWidth, maxWidth);
  const startHeight = positiveInteger(resize.startHeight, minHeight, maxHeight);
  let nextX = startX;
  let nextY = startY;
  let nextWidth = startWidth;
  let nextHeight = startHeight;

  const growLeft = resize.edge === 'left' || resize.edge === 'top-left' || resize.edge === 'bottom-left';
  const growRight = resize.edge === 'right' || resize.edge === 'top-right' || resize.edge === 'bottom-right';
  const growTop = resize.edge === 'top' || resize.edge === 'top-left' || resize.edge === 'top-right';
  const growBottom = resize.edge === 'bottom' || resize.edge === 'bottom-left' || resize.edge === 'bottom-right';

  if (growLeft) {
    const rawX = startX + deltaX;
    const maxLeftX = startX + startWidth - minWidth;
    nextX = clamp(rawX, viewportRect.minX, maxLeftX);
    nextWidth = startWidth + (startX - nextX);
  }
  if (growRight) {
    const maxRightWidth = viewportRect.cols - viewportRect.rightInset - startX;
    nextWidth = clamp(startWidth + deltaX, minWidth, Math.min(maxWidth, maxRightWidth));
  }
  if (growTop) {
    const rawY = startY + deltaY;
    const maxTopY = startY + startHeight - minHeight;
    nextY = clamp(rawY, viewportRect.minY, maxTopY);
    nextHeight = startHeight + (startY - nextY);
  }
  if (growBottom) {
    const maxBottomHeight = viewportRect.rows - viewportRect.bottomInset - startY;
    nextHeight = clamp(startHeight + deltaY, minHeight, Math.min(maxHeight, maxBottomHeight));
  }

  const width = clamp(nextWidth, minWidth, maxWidth);
  const height = clamp(nextHeight, minHeight, maxHeight);
  return {
    x: clamp(nextX, viewportRect.minX, Math.max(viewportRect.minX, viewportRect.cols - viewportRect.rightInset - width)),
    y: clamp(nextY, viewportRect.minY, Math.max(viewportRect.minY, viewportRect.rows - viewportRect.bottomInset - height)),
    width,
    height,
  };
}
