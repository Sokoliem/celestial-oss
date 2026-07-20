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
  | { type: 'drag-start'; sourceId: string; data: D; x: number; y: number }
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
