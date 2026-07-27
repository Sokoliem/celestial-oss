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
  const current = normalizeRect(rect);
  return {
    phase: 'idle',
    activeEdge: null,
    hoveredEdge: null,
    original: { ...current },
    current,
    startX: 0,
    startY: 0,
    cursor: 'default',
  };
}

// ─── Edge Detection ──────────────────────────────────────────────────────

export function detectEdge(x: number, y: number, rect: ResizableRect, handleZone: number): ResizeEdge | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const normalized = normalizeRect(rect);
  const zone = finiteNonNegativeInteger(handleZone, 1);
  const left = normalized.x;
  const right = normalized.x + normalized.width;
  const top = normalized.y;
  const bottom = normalized.y + normalized.height;

  // Point must be within the rect (with handleZone tolerance outside)
  const inBoundsX = x >= left - zone && x <= right + zone;
  const inBoundsY = y >= top - zone && y <= bottom + zone;
  if (!inBoundsX || !inBoundsY) return null;

  const nearLeft = x >= left - zone && x <= left + zone;
  const nearRight = x >= right - zone && x <= right + zone;
  const nearTop = y >= top - zone && y <= top + zone;
  const nearBottom = y >= bottom - zone && y <= bottom + zone;

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
  const normalized = normalizeRect(rect);
  const minWidth = finitePositiveInteger(constraints.minWidth, 1);
  const minHeight = finitePositiveInteger(constraints.minHeight, 1);
  const maxWidth = Math.max(minWidth, finitePositiveInteger(constraints.maxWidth, Number.MAX_SAFE_INTEGER));
  const maxHeight = Math.max(minHeight, finitePositiveInteger(constraints.maxHeight, Number.MAX_SAFE_INTEGER));
  const snapGridX = finitePositiveInteger(constraints.snapGridX, 1);
  const snapGridY = finitePositiveInteger(constraints.snapGridY, 1);

  let width = clamp(Math.round(normalized.width / snapGridX) * snapGridX, minWidth, maxWidth);
  let height = clamp(Math.round(normalized.height / snapGridY) * snapGridY, minHeight, maxHeight);
  const aspectRatio = Number.isFinite(constraints.aspectRatio) && constraints.aspectRatio! > 0 ? constraints.aspectRatio! : null;
  if (aspectRatio !== null) {
    height = clamp(Math.round(width / aspectRatio), minHeight, maxHeight);
    width = clamp(Math.round(height * aspectRatio), minWidth, maxWidth);
    height = clamp(Math.round(width / aspectRatio), minHeight, maxHeight);
  }

  return { x: normalized.x, y: normalized.y, width, height };
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

function finiteInteger(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function finiteNonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value!)) : fallback;
}

function finitePositiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.max(1, Math.trunc(value!)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect: ResizableRect): ResizableRect {
  return {
    x: finiteInteger(rect?.x),
    y: finiteInteger(rect?.y),
    width: finitePositiveInteger(rect?.width, 1),
    height: finitePositiveInteger(rect?.height, 1),
  };
}

function constrainFromEdge(raw: ResizableRect, original: ResizableRect, edge: ResizeEdge, constraints: ResizeConstraints): ResizableRect {
  const constrained = applyConstraints(raw, constraints);
  const anchoredRight = original.x + original.width;
  const anchoredBottom = original.y + original.height;
  const fromLeft = edge === 'left' || edge === 'top-left' || edge === 'bottom-left';
  const fromTop = edge === 'top' || edge === 'top-left' || edge === 'top-right';
  return {
    ...constrained,
    x: fromLeft ? anchoredRight - constrained.width : original.x,
    y: fromTop ? anchoredBottom - constrained.height : original.y,
  };
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
      const edge = detectEdge(msg.x, msg.y, state.current, handleZone);
      if (!edge) return state;
      return {
        ...state,
        phase: 'resizing',
        activeEdge: edge,
        hoveredEdge: null,
        original: { ...normalizeRect(state.current) },
        current: normalizeRect(state.current),
        startX: finiteInteger(msg.x),
        startY: finiteInteger(msg.y),
        cursor: edgeToCursor(edge),
      };
    }

    case 'resize-drag': {
      if (state.phase !== 'resizing' || !state.activeEdge) return state;
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return state;
      const dx = finiteInteger(msg.x) - finiteInteger(state.startX);
      const dy = finiteInteger(msg.y) - finiteInteger(state.startY);
      const raw = applyEdgeDelta(state.original, state.activeEdge, dx, dy);
      const constrained = constrainFromEdge(raw, state.original, state.activeEdge, constraints);
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
      if (!Number.isFinite(msg.delta)) return state;
      const delta = finiteInteger(msg.delta);
      const dx = hasHorizontal ? delta : 0;
      const dy = hasVertical ? delta : 0;
      const original = normalizeRect(state.current);
      const raw = applyEdgeDelta(original, msg.edge, dx, dy);
      const constrained = constrainFromEdge(raw, original, msg.edge, constraints);
      return {
        ...state,
        current: constrained,
      };
    }
  }
}
