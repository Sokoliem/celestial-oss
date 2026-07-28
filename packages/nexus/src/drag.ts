import { empty, overlay, row, type LayoutRect, type VNode } from '@celestial/nebula';

export type DragPhase = 'idle' | 'dragging' | 'dropped';

export type DragState<D = unknown> =
  | { phase: 'idle' }
  | {
      phase: 'dragging';
      sourceId: string;
      data: D;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      hoveredTargetId: string | null;
      /** Source bounds captured from the input frame that started the drag. */
      sourceRect?: LayoutRect;
    }
  | {
      phase: 'dropped';
      sourceId: string;
      targetId: string;
      data: D;
    };

export interface DropTarget<D = unknown> {
  id: string;
  canDrop: (data: D) => boolean;
}

export type DragMsg<D = unknown> =
  | { type: 'drag-start'; sourceId: string; data: D; x: number; y: number; sourceRect?: LayoutRect }
  | { type: 'drag-move'; x: number; y: number }
  | { type: 'drag-over'; targetId: string }
  | { type: 'drag-leave' }
  | { type: 'drop'; targetId: string }
  | { type: 'drag-cancel' }
  | { type: 'drag-reset' };

export function createDragState<D>(): DragState<D> {
  return { phase: 'idle' };
}

export function dragUpdate<D>(msg: DragMsg<D>, state: DragState<D>, targets: DropTarget<D>[]): DragState<D> {
  switch (msg.type) {
    case 'drag-start': {
      if (state.phase !== 'idle') return state;
      return {
        phase: 'dragging',
        sourceId: msg.sourceId,
        data: msg.data,
        startX: msg.x,
        startY: msg.y,
        currentX: msg.x,
        currentY: msg.y,
        hoveredTargetId: null,
        ...(msg.sourceRect ? { sourceRect: msg.sourceRect } : {}),
      };
    }

    case 'drag-move': {
      if (state.phase !== 'dragging') return state;
      return {
        ...state,
        currentX: msg.x,
        currentY: msg.y,
      };
    }

    case 'drag-over': {
      if (state.phase !== 'dragging') return state;
      const target = targets.find((t) => t.id === msg.targetId);
      if (!target?.canDrop(state.data)) return state;
      return {
        ...state,
        hoveredTargetId: msg.targetId,
      };
    }

    case 'drag-leave': {
      if (state.phase !== 'dragging') return state;
      return {
        ...state,
        hoveredTargetId: null,
      };
    }

    case 'drop': {
      if (state.phase !== 'dragging') return state;
      const dropTarget = targets.find((t) => t.id === msg.targetId);
      if (!dropTarget?.canDrop(state.data)) return state;
      return {
        phase: 'dropped',
        sourceId: state.sourceId,
        targetId: msg.targetId,
        data: state.data,
      };
    }

    case 'drag-cancel': {
      if (state.phase !== 'dragging') return state;
      return { phase: 'idle' };
    }

    case 'drag-reset': {
      if (state.phase === 'idle') return state;
      return { phase: 'idle' };
    }
  }
}

/** Check if drag is currently active */
export function isDragging<D>(state: DragState<D>): boolean {
  return state.phase === 'dragging';
}

/** Check if a drop has completed and is awaiting acknowledgement (drag-reset). */
export function isDropped<D>(state: DragState<D>): boolean {
  return state.phase === 'dropped';
}

/**
 * Extract the result of a completed drop. Returns null unless the state is in
 * the `dropped` phase. Pair with `drag-reset` to acknowledge the drop and
 * return to idle.
 */
export function getDroppedResult<D>(state: DragState<D>): { sourceId: string; targetId: string; data: D } | null {
  if (state.phase !== 'dropped') return null;
  return {
    sourceId: state.sourceId,
    targetId: state.targetId,
    data: state.data,
  };
}

/** Get the drag offset from start position */
export function getDragOffset<D>(state: DragState<D>): { dx: number; dy: number } | null {
  if (state.phase !== 'dragging') return null;
  return {
    dx: state.currentX - state.startX,
    dy: state.currentY - state.startY,
  };
}

export interface DragPreviewViewport {
  readonly cols: number;
  readonly rows: number;
  readonly leftInset?: number;
  readonly rightInset?: number;
  readonly topInset?: number;
  readonly bottomInset?: number;
}

export interface DragPreviewConfig<D> {
  /** Drag state whose source bounds were captured at drag-start. */
  readonly state: DragState<D>;
  /** In-flow source rendered while this source is not being dragged. */
  readonly source: VNode;
  /** Pointer-transparent visual rendered above the application while dragging. */
  readonly preview?: VNode;
  /** Only move the source whose drag payload identifies this source id. */
  readonly sourceId: string;
  /** Terminal work area used to keep the preview reachable. */
  readonly viewport: DragPreviewViewport;
  /** Overlay stacking priority. Defaults to 1,000. */
  readonly zIndex?: number;
  /** Preserve cells not painted by the preview. Defaults to false. */
  readonly transparent?: boolean;
}

function finiteInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function nonNegativeInteger(value: number | undefined): number {
  return Math.max(0, finiteInteger(value ?? 0, 0));
}

function normalizedSourceRect(rect: LayoutRect | undefined): LayoutRect | null {
  if (!rect) return null;
  const x = finiteInteger(rect.x, Number.NaN);
  const y = finiteInteger(rect.y, Number.NaN);
  const width = nonNegativeInteger(rect.width);
  const height = nonNegativeInteger(rect.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || width === 0 || height === 0) return null;
  return { x, y, width, height };
}

/**
 * Resolve the absolute drag-preview frame from the captured source bounds.
 *
 * Translation always uses the original bounds, so repeated move events cannot
 * compound. Insets are normalized against hostile or undersized viewports;
 * oversized previews keep their dimensions and pin to the available origin.
 */
export function resolveDragPreviewRect<D>(state: DragState<D>, viewport: DragPreviewViewport): LayoutRect | null {
  if (state.phase !== 'dragging') return null;
  const source = normalizedSourceRect(state.sourceRect);
  if (!source) return null;

  const cols = nonNegativeInteger(viewport.cols);
  const rows = nonNegativeInteger(viewport.rows);
  const left = Math.min(nonNegativeInteger(viewport.leftInset), cols);
  const right = Math.min(nonNegativeInteger(viewport.rightInset), Math.max(0, cols - left));
  const top = Math.min(nonNegativeInteger(viewport.topInset), rows);
  const bottom = Math.min(nonNegativeInteger(viewport.bottomInset), Math.max(0, rows - top));
  const dx = finiteInteger(state.currentX - state.startX, 0);
  const dy = finiteInteger(state.currentY - state.startY, 0);
  const maxX = Math.max(left, cols - right - source.width);
  const maxY = Math.max(top, rows - bottom - source.height);

  return {
    x: Math.max(left, Math.min(maxX, source.x + dx)),
    y: Math.max(top, Math.min(maxY, source.y + dy)),
    width: source.width,
    height: source.height,
  };
}

/**
 * Compose a stable in-flow drag source with a moving visual preview.
 *
 * During a drag, an exact-size placeholder preserves surrounding layout while
 * the preview follows the pointer in a passive, pointer-transparent overlay.
 * If no source bounds were captured, the source remains in place rather than
 * jumping to guessed coordinates.
 */
export function dragPreview<D>(config: DragPreviewConfig<D>): VNode {
  if (config.state.phase !== 'dragging' || config.state.sourceId !== config.sourceId) {
    return config.source;
  }

  const rect = resolveDragPreviewRect(config.state, config.viewport);
  if (!rect) return config.source;

  return row(
    empty(rect.width, rect.height),
    overlay(config.preview ?? config.source, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      zIndex: config.zIndex ?? 1_000,
      transparent: config.transparent ?? false,
      pointerEvents: 'none',
      focusMode: 'passive',
    }),
  );
}
