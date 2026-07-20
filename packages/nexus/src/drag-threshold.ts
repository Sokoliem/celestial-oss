export interface DragThresholdConfig {
  dragThresholdPx?: number;
}

export const DEFAULT_DRAG_THRESHOLD_CONFIG: Required<DragThresholdConfig> = {
  dragThresholdPx: 3,
};

export function resolveDragThresholdConfig(config?: DragThresholdConfig): Required<DragThresholdConfig> {
  return { ...DEFAULT_DRAG_THRESHOLD_CONFIG, ...config };
}

export function getDragDistance(start: { x: number; y: number }, current: { x: number; y: number }): number {
  return Math.max(Math.abs(current.x - start.x), Math.abs(current.y - start.y));
}

export function shouldStartDrag(start: { x: number; y: number }, current: { x: number; y: number }, config?: DragThresholdConfig): boolean {
  return getDragDistance(start, current) >= resolveDragThresholdConfig(config).dragThresholdPx;
}
