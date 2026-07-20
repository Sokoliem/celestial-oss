import type { FloatingWindowFrame } from './floating-window-drag.js';
import { finiteCell, finiteNumber, MAX_LAYOUT_ITEMS, positiveInteger } from './internal.js';
import type { Rect } from './primitives/geometry.js';

export type SnapZoneKind = 'edge-half' | 'edge-third' | 'quadrant' | 'center' | 'grid' | 'custom';

export interface SnapZone {
  id: string;
  kind: SnapZoneKind;
  trigger: Rect;
  targetFrame: FloatingWindowFrame;
  label?: string;
  priority?: number;
}

export interface SnapPreview {
  zone: SnapZone;
  frame: FloatingWindowFrame;
  visible: boolean;
}

export interface SnapZoneOptions {
  threshold?: number;
  includeThirds?: boolean;
  includeCenter?: boolean;
  customZones?: readonly SnapZone[];
}

function rectContains(rect: Rect, x: number, y: number): boolean {
  if (![rect.x, rect.y, rect.width, rect.height, x, y].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return false;
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function frame(x: number, y: number, width: number, height: number): FloatingWindowFrame {
  return {
    x: Math.max(0, finiteCell(x)),
    y: Math.max(0, finiteCell(y)),
    width: positiveInteger(width, 1),
    height: positiveInteger(height, 1),
  };
}

function normalizeCustomZone(zone: SnapZone, cols: number, rows: number): SnapZone | null {
  if (
    !zone ||
    typeof zone.id !== 'string' ||
    zone.id.length === 0 ||
    !['edge-half', 'edge-third', 'quadrant', 'center', 'grid', 'custom'].includes(zone.kind)
  ) {
    return null;
  }
  const triggerWidth = positiveInteger(zone.trigger?.width, 1, cols);
  const triggerHeight = positiveInteger(zone.trigger?.height, 1, rows);
  const triggerX = Math.max(0, Math.min(cols - triggerWidth, finiteCell(zone.trigger?.x)));
  const triggerY = Math.max(0, Math.min(rows - triggerHeight, finiteCell(zone.trigger?.y)));
  const width = positiveInteger(zone.targetFrame?.width, 1, cols);
  const height = positiveInteger(zone.targetFrame?.height, 1, rows);
  const x = Math.max(0, Math.min(cols - width, finiteCell(zone.targetFrame?.x)));
  const y = Math.max(0, Math.min(rows - height, finiteCell(zone.targetFrame?.y)));
  return {
    id: zone.id,
    kind: zone.kind,
    trigger: { x: triggerX, y: triggerY, width: triggerWidth, height: triggerHeight },
    targetFrame: { x, y, width, height },
    label: typeof zone.label === 'string' ? zone.label : undefined,
    priority: finiteNumber(zone.priority, 0),
  };
}

export function computeSnapZones(bounds: { cols: number; rows: number }, options: SnapZoneOptions = {}): SnapZone[] {
  const cols = positiveInteger(bounds.cols, 1);
  const rows = positiveInteger(bounds.rows, 1);
  const threshold = positiveInteger(options.threshold, Math.min(3, cols, rows), Math.max(1, Math.min(cols, rows)));
  const halfWidth = Math.max(1, Math.floor(cols / 2));
  const halfHeight = Math.max(1, Math.floor(rows / 2));
  const thirdWidth = Math.max(1, Math.floor(cols / 3));
  const thirdHeight = Math.max(1, Math.floor(rows / 3));

  const zones: SnapZone[] = [
    {
      id: 'edge:left-half',
      kind: 'edge-half',
      trigger: { x: 0, y: 0, width: threshold, height: rows },
      targetFrame: frame(0, 0, halfWidth, rows),
      label: 'Left half',
      priority: 10,
    },
    {
      id: 'edge:right-half',
      kind: 'edge-half',
      trigger: { x: cols - threshold, y: 0, width: threshold, height: rows },
      targetFrame: frame(cols - halfWidth, 0, halfWidth, rows),
      label: 'Right half',
      priority: 10,
    },
    {
      id: 'edge:top-half',
      kind: 'edge-half',
      trigger: { x: 0, y: 0, width: cols, height: threshold },
      targetFrame: frame(0, 0, cols, halfHeight),
      label: 'Top half',
      priority: 9,
    },
    {
      id: 'edge:bottom-half',
      kind: 'edge-half',
      trigger: { x: 0, y: rows - threshold, width: cols, height: threshold },
      targetFrame: frame(0, rows - halfHeight, cols, halfHeight),
      label: 'Bottom half',
      priority: 9,
    },
    {
      id: 'quadrant:top-left',
      kind: 'quadrant',
      trigger: { x: 0, y: 0, width: threshold, height: threshold },
      targetFrame: frame(0, 0, halfWidth, halfHeight),
      label: 'Top left quadrant',
      priority: 20,
    },
    {
      id: 'quadrant:top-right',
      kind: 'quadrant',
      trigger: { x: cols - threshold, y: 0, width: threshold, height: threshold },
      targetFrame: frame(cols - halfWidth, 0, halfWidth, halfHeight),
      label: 'Top right quadrant',
      priority: 20,
    },
    {
      id: 'quadrant:bottom-left',
      kind: 'quadrant',
      trigger: { x: 0, y: rows - threshold, width: threshold, height: threshold },
      targetFrame: frame(0, rows - halfHeight, halfWidth, halfHeight),
      label: 'Bottom left quadrant',
      priority: 20,
    },
    {
      id: 'quadrant:bottom-right',
      kind: 'quadrant',
      trigger: { x: cols - threshold, y: rows - threshold, width: threshold, height: threshold },
      targetFrame: frame(cols - halfWidth, rows - halfHeight, halfWidth, halfHeight),
      label: 'Bottom right quadrant',
      priority: 20,
    },
  ];

  if (options.includeThirds ?? true) {
    zones.push(
      {
        id: 'third:left',
        kind: 'edge-third',
        trigger: { x: threshold, y: 0, width: threshold, height: rows },
        targetFrame: frame(0, 0, thirdWidth, rows),
        label: 'Left third',
        priority: 5,
      },
      {
        id: 'third:center',
        kind: 'edge-third',
        trigger: { x: Math.floor(cols / 2) - threshold, y: 0, width: threshold * 2, height: threshold },
        targetFrame: frame(thirdWidth, 0, cols - thirdWidth * 2, rows),
        label: 'Center third',
        priority: 5,
      },
      {
        id: 'third:right',
        kind: 'edge-third',
        trigger: { x: cols - threshold * 2, y: 0, width: threshold, height: rows },
        targetFrame: frame(cols - thirdWidth, 0, thirdWidth, rows),
        label: 'Right third',
        priority: 5,
      },
      {
        id: 'third:top',
        kind: 'edge-third',
        trigger: { x: 0, y: threshold, width: cols, height: threshold },
        targetFrame: frame(0, 0, cols, thirdHeight),
        label: 'Top third',
        priority: 4,
      },
      {
        id: 'third:bottom',
        kind: 'edge-third',
        trigger: { x: 0, y: rows - threshold * 2, width: cols, height: threshold },
        targetFrame: frame(0, rows - thirdHeight, cols, thirdHeight),
        label: 'Bottom third',
        priority: 4,
      },
    );
  }

  if (options.includeCenter ?? true) {
    const centerWidth = Math.max(1, Math.floor(cols * 0.7));
    const centerHeight = Math.max(1, Math.floor(rows * 0.7));
    zones.push({
      id: 'center:balanced',
      kind: 'center',
      trigger: {
        x: Math.floor(cols / 2) - threshold,
        y: Math.floor(rows / 2) - threshold,
        width: threshold * 2,
        height: threshold * 2,
      },
      targetFrame: frame(Math.floor((cols - centerWidth) / 2), Math.floor((rows - centerHeight) / 2), centerWidth, centerHeight),
      label: 'Centered',
      priority: 1,
    });
  }

  const builtIn = zones.map((zone) => normalizeCustomZone(zone, cols, rows)).filter((zone): zone is SnapZone => zone !== null);
  const custom = (options.customZones ?? [])
    .slice(0, MAX_LAYOUT_ITEMS)
    .map((zone) => normalizeCustomZone(zone, cols, rows))
    .filter((zone): zone is SnapZone => zone !== null);
  return [...builtIn, ...custom].sort((left, right) => finiteNumber(right.priority, 0) - finiteNumber(left.priority, 0));
}

export function previewSnapZone(pointer: { x: number; y: number }, _frame: FloatingWindowFrame, zones: readonly SnapZone[]): SnapPreview | null {
  if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return null;
  const zone = zones.slice(0, MAX_LAYOUT_ITEMS).find((candidate) => candidate?.trigger && rectContains(candidate.trigger, pointer.x, pointer.y));
  if (!zone) return null;
  const stableZone: SnapZone = {
    ...zone,
    trigger: { ...zone.trigger },
    targetFrame: frame(zone.targetFrame.x, zone.targetFrame.y, zone.targetFrame.width, zone.targetFrame.height),
  };
  return {
    zone: stableZone,
    frame: { ...stableZone.targetFrame },
    visible: true,
  };
}

export function applySnapZone(_frame: FloatingWindowFrame, zone: SnapZone): FloatingWindowFrame {
  return frame(zone.targetFrame?.x, zone.targetFrame?.y, zone.targetFrame?.width, zone.targetFrame?.height);
}
