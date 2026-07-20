import type { FloatingWindowFrame } from './floating-window-drag.js';
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
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

function frame(x: number, y: number, width: number, height: number): FloatingWindowFrame {
  return {
    x: Math.max(0, Math.floor(x)),
    y: Math.max(0, Math.floor(y)),
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  };
}

export function computeSnapZones(bounds: { cols: number; rows: number }, options: SnapZoneOptions = {}): SnapZone[] {
  const threshold = Math.max(1, Math.floor(options.threshold ?? 3));
  const cols = Math.max(1, bounds.cols);
  const rows = Math.max(1, bounds.rows);
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

  return [...zones, ...(options.customZones ?? [])].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

export function previewSnapZone(pointer: { x: number; y: number }, _frame: FloatingWindowFrame, zones: readonly SnapZone[]): SnapPreview | null {
  const zone = zones.find((candidate) => rectContains(candidate.trigger, pointer.x, pointer.y));
  if (!zone) return null;
  return {
    zone,
    frame: zone.targetFrame,
    visible: true,
  };
}

export function applySnapZone(_frame: FloatingWindowFrame, zone: SnapZone): FloatingWindowFrame {
  return { ...zone.targetFrame };
}
