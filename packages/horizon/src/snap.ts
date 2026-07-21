import { finiteCell, MAX_LAYOUT_ITEMS, nonNegativeInteger, positiveInteger } from './internal.js';
import type { WindowBounds } from './primitives/geometry.js';
import type { ManagedWindow } from './windows.js';

export interface SnapConfig {
  gridSize?: number;
  edgeThreshold?: number;
  windowThreshold?: number;
  enabled?: boolean;
}

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number;
  start: number;
  end: number;
  kind: 'edge' | 'grid' | 'window';
}

const DEFAULT_SNAP_CONFIG: Required<SnapConfig> = {
  gridSize: 4,
  edgeThreshold: 2,
  windowThreshold: 2,
  enabled: true,
};

export function computeSnappedPosition(
  pos: { x: number; y: number },
  windowBounds: WindowBounds,
  allWindows: readonly ManagedWindow[],
  terminalBounds: { cols: number; rows: number },
  config: SnapConfig = {},
): { x: number; y: number; guides: SnapGuide[] } {
  const cols = nonNegativeInteger(terminalBounds.cols);
  const rows = nonNegativeInteger(terminalBounds.rows);
  const bounds: WindowBounds = {
    x: finiteCell(windowBounds.x),
    y: finiteCell(windowBounds.y),
    width: positiveInteger(windowBounds.width, 1),
    height: positiveInteger(windowBounds.height, 1),
  };
  const resolved: Required<SnapConfig> = {
    enabled: config.enabled ?? DEFAULT_SNAP_CONFIG.enabled,
    gridSize: nonNegativeInteger(config.gridSize, DEFAULT_SNAP_CONFIG.gridSize),
    edgeThreshold: nonNegativeInteger(config.edgeThreshold, DEFAULT_SNAP_CONFIG.edgeThreshold),
    windowThreshold: nonNegativeInteger(config.windowThreshold, DEFAULT_SNAP_CONFIG.windowThreshold),
  };
  if (!resolved.enabled) {
    return { x: finiteCell(pos.x), y: finiteCell(pos.y), guides: [] };
  }

  let x = finiteCell(pos.x);
  let y = finiteCell(pos.y);
  const guides: SnapGuide[] = [];

  const rightEdge = Math.max(0, cols - bounds.width);
  const bottomEdge = Math.max(0, rows - bounds.height);

  const snappedLeft = snapToTarget(x, 0, resolved.edgeThreshold);
  if (snappedLeft.snapped) {
    x = snappedLeft.value;
    guides.push({ orientation: 'vertical', position: 0, start: 0, end: rows, kind: 'edge' });
  }

  const snappedRight = snapToTarget(x, rightEdge, resolved.edgeThreshold);
  if (snappedRight.snapped) {
    x = snappedRight.value;
    guides.push({ orientation: 'vertical', position: cols, start: 0, end: rows, kind: 'edge' });
  }

  const snappedTop = snapToTarget(y, 0, resolved.edgeThreshold);
  if (snappedTop.snapped) {
    y = snappedTop.value;
    guides.push({ orientation: 'horizontal', position: 0, start: 0, end: cols, kind: 'edge' });
  }

  const snappedBottom = snapToTarget(y, bottomEdge, resolved.edgeThreshold);
  if (snappedBottom.snapped) {
    y = snappedBottom.value;
    guides.push({ orientation: 'horizontal', position: rows, start: 0, end: cols, kind: 'edge' });
  }

  if (resolved.gridSize > 0) {
    const gridX = Math.round(x / resolved.gridSize) * resolved.gridSize;
    const gridY = Math.round(y / resolved.gridSize) * resolved.gridSize;

    const snappedGridX = snapToTarget(x, gridX, resolved.edgeThreshold);
    if (snappedGridX.snapped) {
      x = Math.max(0, Math.min(rightEdge, snappedGridX.value));
      guides.push({ orientation: 'vertical', position: x, start: 0, end: rows, kind: 'grid' });
    }

    const snappedGridY = snapToTarget(y, gridY, resolved.edgeThreshold);
    if (snappedGridY.snapped) {
      y = Math.max(0, Math.min(bottomEdge, snappedGridY.value));
      guides.push({ orientation: 'horizontal', position: y, start: 0, end: cols, kind: 'grid' });
    }
  }

  for (const otherWindow of allWindows.slice(0, MAX_LAYOUT_ITEMS)) {
    if (![otherWindow.x, otherWindow.y, otherWindow.width, otherWindow.height].every(Number.isFinite)) continue;
    const normalizedOther: ManagedWindow = {
      ...otherWindow,
      x: finiteCell(otherWindow.x),
      y: finiteCell(otherWindow.y),
      width: positiveInteger(otherWindow.width, 1),
      height: positiveInteger(otherWindow.height, 1),
    };
    const candidateX = snapAxisToWindow(x, bounds, normalizedOther, resolved.windowThreshold, 'x');
    if (candidateX) {
      x = Math.max(0, Math.min(rightEdge, candidateX.value));
      guides.push(candidateX.guide);
    }

    const candidateY = snapAxisToWindow(y, bounds, normalizedOther, resolved.windowThreshold, 'y');
    if (candidateY) {
      y = Math.max(0, Math.min(bottomEdge, candidateY.value));
      guides.push(candidateY.guide);
    }
  }

  return {
    x: Math.max(0, Math.min(rightEdge, x)),
    y: Math.max(0, Math.min(bottomEdge, y)),
    guides,
  };
}

function snapAxisToWindow(
  value: number,
  windowBounds: WindowBounds,
  otherWindow: ManagedWindow,
  threshold: number,
  axis: 'x' | 'y',
): { value: number; guide: SnapGuide } | null {
  const size = axis === 'x' ? windowBounds.width : windowBounds.height;
  const start = axis === 'x' ? otherWindow.x : otherWindow.y;
  const end = start + (axis === 'x' ? otherWindow.width : otherWindow.height);
  const guideOrientation = axis === 'x' ? 'vertical' : 'horizontal';
  const guideStart = axis === 'x' ? Math.min(windowBounds.y, otherWindow.y) : Math.min(windowBounds.x, otherWindow.x);
  const guideEnd =
    axis === 'x'
      ? Math.max(windowBounds.y + windowBounds.height, otherWindow.y + otherWindow.height)
      : Math.max(windowBounds.x + windowBounds.width, otherWindow.x + otherWindow.width);

  const candidates = [
    { value: start, position: start },
    { value: end, position: end },
    { value: start - size, position: start },
    { value: end - size, position: end },
  ];

  let best: { value: number; position: number; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate.value);
    if (distance > threshold) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }

  if (!best) {
    return null;
  }

  return {
    value: best.value,
    guide: {
      orientation: guideOrientation,
      position: best.position,
      start: guideStart,
      end: guideEnd,
      kind: 'window',
    },
  };
}

function snapToTarget(value: number, target: number, threshold: number): { value: number; snapped: boolean } {
  if (Math.abs(value - target) > threshold) {
    return { value, snapped: false };
  }

  return { value: target, snapped: true };
}
