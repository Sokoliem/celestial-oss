import type { MouseEvent } from './mouse.js';

export interface TouchPoint {
  id: number;
  x: number;
  y: number;
}

export interface TouchReport {
  type: 'start' | 'move' | 'end' | 'cancel';
  touches: readonly TouchPoint[];
  changedTouches?: readonly TouchPoint[];
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export type NormalizedTouchEvent = MouseEvent & { touchId: number };

function getReportedTouches(report: TouchReport): readonly TouchPoint[] {
  if (report.changedTouches && report.changedTouches.length > 0) {
    return report.changedTouches;
  }
  return report.touches;
}

function mapType(type: TouchReport['type']): NormalizedTouchEvent['type'] {
  switch (type) {
    case 'start':
      return 'press';
    case 'move':
      return 'move';
    case 'end':
    case 'cancel':
      return 'release';
  }
}

export function normalizeTouchReport(report: TouchReport): NormalizedTouchEvent[] {
  const touches = getReportedTouches(report);
  if (touches.length === 0) return [];

  const type = mapType(report.type);
  const button: NormalizedTouchEvent['button'] = type === 'move' ? 'none' : 0;

  return touches.map((touch) => ({
    type,
    button,
    x: touch.x,
    y: touch.y,
    ctrl: report.ctrl === true,
    alt: report.alt === true,
    shift: report.shift === true,
    touchId: touch.id,
  }));
}
