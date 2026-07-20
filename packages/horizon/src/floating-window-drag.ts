import type { WindowBounds } from './primitives/geometry.js';

export interface FloatingViewportBounds {
  cols: number;
  rows: number;
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

interface FloatingViewportRect {
  minX: number;
  minY: number;
  maxWidth: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Resolve the resize edge under a pointer, preferring corners. */
export function hitTestFloatingWindowResizeEdge(
  frame: FloatingWindowFrame,
  mouseX: number,
  mouseY: number,
  options: FloatingWindowHitTestOptions = {},
): FloatingWindowResizeEdge | null {
  if (frame.width <= 0 || frame.height <= 0) return null;
  if (mouseX < frame.x || mouseX >= frame.x + frame.width || mouseY < frame.y || mouseY >= frame.y + frame.height) return null;

  const handleSize = Math.max(1, Math.floor(options.handleSize ?? 1));
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
  const borderWidth = Math.max(0, Math.floor(options.borderWidth ?? 1));
  const titleBarHeight = Math.max(1, Math.floor(options.titleBarHeight ?? 1));
  const endInset = Math.max(0, Math.floor(options.endInset ?? 0));
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
    startMouseX: mouseX,
    startMouseY: mouseY,
    startX: frame.x,
    startY: frame.y,
    startWidth: frame.width,
    startHeight: frame.height,
  };
}

function getViewportRect(viewport: FloatingViewportBounds): FloatingViewportRect {
  const topInset = Math.max(0, viewport.topInset ?? 0);
  const bottomInset = Math.max(0, viewport.bottomInset ?? 0);
  return {
    minX: 0,
    minY: topInset,
    maxWidth: Math.max(1, viewport.cols),
    maxHeight: Math.max(1, viewport.rows - topInset - bottomInset),
  };
}

function getNormalizedConstraints(
  viewport: FloatingViewportBounds,
  defaults: Pick<FloatingWindowDefaults, 'minWidth' | 'minHeight' | 'maxWidth' | 'maxHeight'>,
): { viewportRect: FloatingViewportRect; minWidth: number; minHeight: number; maxWidth: number; maxHeight: number } {
  const viewportRect = getViewportRect(viewport);
  const maxWidth = Math.max(1, Math.min(defaults.maxWidth ?? viewportRect.maxWidth, viewportRect.maxWidth));
  const maxHeight = Math.max(1, Math.min(defaults.maxHeight ?? viewportRect.maxHeight, viewportRect.maxHeight));
  const minWidth = Math.min(Math.max(1, defaults.minWidth), maxWidth);
  const minHeight = Math.min(Math.max(1, defaults.minHeight), maxHeight);
  return { viewportRect, minWidth, minHeight, maxWidth, maxHeight };
}

export function clampFloatingWindowFrame(
  viewport: FloatingViewportBounds,
  defaults: FloatingWindowDefaults,
  frame?: Partial<FloatingWindowFrame> | null,
): FloatingWindowFrame {
  const { viewportRect, minWidth, minHeight, maxWidth, maxHeight } = getNormalizedConstraints(viewport, defaults);
  const width = clamp(frame?.width ?? defaults.width, minWidth, maxWidth);
  const height = clamp(frame?.height ?? defaults.height, minHeight, maxHeight);
  const centeredX = Math.max(viewportRect.minX, Math.floor((viewport.cols - width) / 2));
  const centeredY = Math.max(viewportRect.minY, Math.floor((viewportRect.minY + viewportRect.maxHeight - height) / 2));
  const x = clamp(frame?.x ?? centeredX, viewportRect.minX, Math.max(viewportRect.minX, viewport.cols - width));
  const y = clamp(frame?.y ?? centeredY, viewportRect.minY, Math.max(viewportRect.minY, viewport.rows - (viewport.bottomInset ?? 0) - height));
  return { x, y, width, height };
}

export function translateFloatingWindowFrame(
  frame: FloatingWindowFrame,
  deltaX: number,
  deltaY: number,
  viewport: FloatingViewportBounds,
): FloatingWindowFrame {
  const viewportRect = getViewportRect(viewport);
  return {
    ...frame,
    x: clamp(frame.x + deltaX, viewportRect.minX, Math.max(viewportRect.minX, viewport.cols - frame.width)),
    y: clamp(frame.y + deltaY, viewportRect.minY, Math.max(viewportRect.minY, viewport.rows - (viewport.bottomInset ?? 0) - frame.height)),
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
  const deltaX = mouseX - drag.startMouseX;
  const deltaY = mouseY - drag.startMouseY;
  const dragging = Math.abs(deltaX) >= deadzone || Math.abs(deltaY) >= deadzone;
  const viewportRect = getViewportRect(viewport);
  const nextX = dragging ? drag.startX + deltaX : drag.startX;
  const nextY = dragging ? drag.startY + deltaY : drag.startY;

  return {
    frame: {
      x: clamp(nextX, viewportRect.minX, Math.max(viewportRect.minX, viewport.cols - frame.width)),
      y: clamp(nextY, viewportRect.minY, Math.max(viewportRect.minY, viewport.rows - (viewport.bottomInset ?? 0) - frame.height)),
      width: frame.width,
      height: frame.height,
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
  const deltaX = mouseX - resize.startMouseX;
  const deltaY = mouseY - resize.startMouseY;
  const { viewportRect, minWidth, minHeight, maxWidth, maxHeight } = getNormalizedConstraints(viewport, defaults);

  let nextX = resize.startX;
  let nextY = resize.startY;
  let nextWidth = resize.startWidth;
  let nextHeight = resize.startHeight;

  const growLeft = resize.edge === 'left' || resize.edge === 'top-left' || resize.edge === 'bottom-left';
  const growRight = resize.edge === 'right' || resize.edge === 'top-right' || resize.edge === 'bottom-right';
  const growTop = resize.edge === 'top' || resize.edge === 'top-left' || resize.edge === 'top-right';
  const growBottom = resize.edge === 'bottom' || resize.edge === 'bottom-left' || resize.edge === 'bottom-right';

  if (growLeft) {
    const rawX = resize.startX + deltaX;
    const maxLeftX = resize.startX + resize.startWidth - minWidth;
    nextX = clamp(rawX, viewportRect.minX, maxLeftX);
    nextWidth = resize.startWidth + (resize.startX - nextX);
  }
  if (growRight) {
    const maxRightWidth = viewport.cols - resize.startX;
    nextWidth = clamp(resize.startWidth + deltaX, minWidth, Math.min(maxWidth, maxRightWidth));
  }
  if (growTop) {
    const rawY = resize.startY + deltaY;
    const maxTopY = resize.startY + resize.startHeight - minHeight;
    nextY = clamp(rawY, viewportRect.minY, maxTopY);
    nextHeight = resize.startHeight + (resize.startY - nextY);
  }
  if (growBottom) {
    const maxBottomHeight = viewport.rows - (viewport.bottomInset ?? 0) - resize.startY;
    nextHeight = clamp(resize.startHeight + deltaY, minHeight, Math.min(maxHeight, maxBottomHeight));
  }

  return {
    x: nextX,
    y: nextY,
    width: clamp(nextWidth, minWidth, maxWidth),
    height: clamp(nextHeight, minHeight, maxHeight),
  };
}
