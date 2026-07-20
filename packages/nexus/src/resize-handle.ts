// ─── Types ───────────────────────────────────────────────────────────────

export type ResizeEdge = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type ResizeCursor = 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' | 'default';

export interface ResizeConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;
  snapGridX?: number;
  snapGridY?: number;
}

export interface ResizableRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizePhase = 'idle' | 'hovering' | 'resizing';

export interface ResizeHandleState {
  phase: ResizePhase;
  activeEdge: ResizeEdge | null;
  hoveredEdge: ResizeEdge | null;
  original: ResizableRect;
  current: ResizableRect;
  startX: number;
  startY: number;
  cursor: ResizeCursor;
}

export type ResizeHandleMsg =
  | { type: 'resize-move'; x: number; y: number }
  | { type: 'resize-start'; x: number; y: number }
  | { type: 'resize-drag'; x: number; y: number }
  | { type: 'resize-end' }
  | { type: 'resize-cancel' }
  | { type: 'resize-key'; edge: ResizeEdge; delta: number };

// ─── Factory ─────────────────────────────────────────────────────────────

export function createResizeHandleState(rect: ResizableRect): ResizeHandleState {
  return {
    phase: 'idle',
    activeEdge: null,
    hoveredEdge: null,
    original: { ...rect },
    current: { ...rect },
    startX: 0,
    startY: 0,
    cursor: 'default',
  };
}

// ─── Edge Detection ──────────────────────────────────────────────────────

export function detectEdge(x: number, y: number, rect: ResizableRect, handleZone: number): ResizeEdge | null {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Point must be within the rect (with handleZone tolerance outside)
  const inBoundsX = x >= left - handleZone && x <= right + handleZone;
  const inBoundsY = y >= top - handleZone && y <= bottom + handleZone;
  if (!inBoundsX || !inBoundsY) return null;

  const nearLeft = x >= left - handleZone && x <= left + handleZone;
  const nearRight = x >= right - handleZone && x <= right + handleZone;
  const nearTop = y >= top - handleZone && y <= top + handleZone;
  const nearBottom = y >= bottom - handleZone && y <= bottom + handleZone;

  // Corners take priority when near two edges simultaneously
  if (nearTop && nearLeft) return 'top-left';
  if (nearTop && nearRight) return 'top-right';
  if (nearBottom && nearLeft) return 'bottom-left';
  if (nearBottom && nearRight) return 'bottom-right';

  // Single edges
  if (nearTop) return 'top';
  if (nearBottom) return 'bottom';
  if (nearLeft) return 'left';
  if (nearRight) return 'right';

  // Inside the rect but not near any edge
  return null;
}

// ─── Cursor Mapping ──────────────────────────────────────────────────────

export function edgeToCursor(edge: ResizeEdge): ResizeCursor {
  switch (edge) {
    case 'top':
    case 'bottom':
      return 'ns-resize';
    case 'left':
    case 'right':
      return 'ew-resize';
    case 'top-left':
    case 'bottom-right':
      return 'nwse-resize';
    case 'top-right':
    case 'bottom-left':
      return 'nesw-resize';
  }
}

// ─── Constraints ─────────────────────────────────────────────────────────

export function applyConstraints(rect: ResizableRect, constraints: ResizeConstraints): ResizableRect {
  let { x, y, width, height } = rect;

  // 1. Clamp width
  if (constraints.minWidth !== undefined && width < constraints.minWidth) {
    width = constraints.minWidth;
  }
  if (constraints.maxWidth !== undefined && width > constraints.maxWidth) {
    width = constraints.maxWidth;
  }

  // 2. Clamp height
  if (constraints.minHeight !== undefined && height < constraints.minHeight) {
    height = constraints.minHeight;
  }
  if (constraints.maxHeight !== undefined && height > constraints.maxHeight) {
    height = constraints.maxHeight;
  }

  // 3. Enforce aspect ratio (adjust height to match width / aspectRatio)
  if (constraints.aspectRatio !== undefined && constraints.aspectRatio > 0) {
    height = width / constraints.aspectRatio;
  }

  // 4. Snap to grid
  if (constraints.snapGridX !== undefined && constraints.snapGridX > 0) {
    width = Math.round(width / constraints.snapGridX) * constraints.snapGridX;
  }
  if (constraints.snapGridY !== undefined && constraints.snapGridY > 0) {
    height = Math.round(height / constraints.snapGridY) * constraints.snapGridY;
  }

  return { x, y, width, height };
}

// ─── Edge Delta Application ──────────────────────────────────────────────

function applyEdgeDelta(rect: ResizableRect, edge: ResizeEdge, dx: number, dy: number): ResizableRect {
  let { x, y, width, height } = rect;

  switch (edge) {
    case 'right':
      width += dx;
      break;
    case 'left':
      x += dx;
      width -= dx;
      break;
    case 'bottom':
      height += dy;
      break;
    case 'top':
      y += dy;
      height -= dy;
      break;
    case 'top-left':
      x += dx;
      width -= dx;
      y += dy;
      height -= dy;
      break;
    case 'top-right':
      width += dx;
      y += dy;
      height -= dy;
      break;
    case 'bottom-left':
      x += dx;
      width -= dx;
      height += dy;
      break;
    case 'bottom-right':
      width += dx;
      height += dy;
      break;
  }

  return { x, y, width, height };
}

// ─── Reducer ─────────────────────────────────────────────────────────────

export function resizeHandleUpdate(msg: ResizeHandleMsg, state: ResizeHandleState, constraints: ResizeConstraints, handleZone: number = 1): ResizeHandleState {
  switch (msg.type) {
    case 'resize-move': {
      const edge = detectEdge(msg.x, msg.y, state.current, handleZone);

      if (edge) {
        return {
          ...state,
          phase: 'hovering',
          hoveredEdge: edge,
          cursor: edgeToCursor(edge),
        };
      }

      // No edge detected — return to idle
      if (state.phase === 'hovering' || state.phase === 'idle') {
        return {
          ...state,
          phase: 'idle',
          hoveredEdge: null,
          cursor: 'default',
        };
      }

      return state;
    }

    case 'resize-start': {
      if (state.phase !== 'hovering') return state;
      return {
        ...state,
        phase: 'resizing',
        activeEdge: state.hoveredEdge,
        hoveredEdge: null,
        original: { ...state.current },
        startX: msg.x,
        startY: msg.y,
      };
    }

    case 'resize-drag': {
      if (state.phase !== 'resizing' || !state.activeEdge) return state;
      const dx = msg.x - state.startX;
      const dy = msg.y - state.startY;
      const raw = applyEdgeDelta(state.original, state.activeEdge, dx, dy);
      const constrained = applyConstraints(raw, constraints);
      return {
        ...state,
        current: constrained,
      };
    }

    case 'resize-end': {
      if (state.phase !== 'resizing') return state;
      return {
        ...state,
        phase: 'idle',
        activeEdge: null,
        hoveredEdge: null,
        cursor: 'default',
      };
    }

    case 'resize-cancel': {
      if (state.phase !== 'resizing') return state;
      return {
        ...state,
        phase: 'idle',
        activeEdge: null,
        hoveredEdge: null,
        current: { ...state.original },
        cursor: 'default',
      };
    }

    case 'resize-key': {
      const hasHorizontal =
        msg.edge === 'left' ||
        msg.edge === 'right' ||
        msg.edge === 'top-left' ||
        msg.edge === 'top-right' ||
        msg.edge === 'bottom-left' ||
        msg.edge === 'bottom-right';
      const hasVertical =
        msg.edge === 'top' ||
        msg.edge === 'bottom' ||
        msg.edge === 'top-left' ||
        msg.edge === 'top-right' ||
        msg.edge === 'bottom-left' ||
        msg.edge === 'bottom-right';
      const dx = hasHorizontal ? msg.delta : 0;
      const dy = hasVertical ? msg.delta : 0;
      const raw = applyEdgeDelta(state.current, msg.edge, dx, dy);
      const constrained = applyConstraints(raw, constraints);
      return {
        ...state,
        current: constrained,
      };
    }
  }
}
