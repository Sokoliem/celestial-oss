import { describe, expect, it } from 'vitest';
import {
  applyConstraints,
  createResizeHandleState,
  detectEdge,
  edgeToCursor,
  type ResizableRect,
  type ResizeHandleMsg,
  type ResizeHandleState,
  resizeHandleUpdate,
} from '../resize-handle.js';

const rect: ResizableRect = { x: 10, y: 10, width: 20, height: 15 };

function makeHoveringState(overrides: Partial<ResizeHandleState> = {}): ResizeHandleState {
  return {
    phase: 'hovering',
    activeEdge: null,
    hoveredEdge: 'right',
    original: { ...rect },
    current: { ...rect },
    startX: 0,
    startY: 0,
    cursor: 'ew-resize',
    ...overrides,
  };
}

function makeResizingState(overrides: Partial<ResizeHandleState> = {}): ResizeHandleState {
  return {
    phase: 'resizing',
    activeEdge: 'right',
    hoveredEdge: null,
    original: { ...rect },
    current: { ...rect },
    startX: 30,
    startY: 17,
    cursor: 'ew-resize',
    ...overrides,
  };
}

describe('resize-handle', () => {
  // ─── detectEdge ──────────────────────────────────────────────────────

  describe('detectEdge', () => {
    it('detects right edge within handleZone', () => {
      // x=30 is the right edge (10 + 20), cursor at x=30, y=17 (inside rect)
      expect(detectEdge(30, 17, rect, 1)).toBe('right');
    });

    it('detects left edge', () => {
      // x=10 is the left edge, cursor at x=10, y=17
      expect(detectEdge(10, 17, rect, 1)).toBe('left');
    });

    it('detects top edge', () => {
      // y=10 is the top edge, cursor at x=20, y=10
      expect(detectEdge(20, 10, rect, 1)).toBe('top');
    });

    it('detects bottom edge', () => {
      // y=25 is the bottom edge (10 + 15), cursor at x=20, y=25
      expect(detectEdge(20, 25, rect, 1)).toBe('bottom');
    });

    it('detects top-left corner', () => {
      // Near both top and left edges
      expect(detectEdge(10, 10, rect, 1)).toBe('top-left');
    });

    it('detects bottom-right corner', () => {
      // Near both bottom and right edges
      expect(detectEdge(30, 25, rect, 1)).toBe('bottom-right');
    });

    it('detects top-right corner', () => {
      expect(detectEdge(30, 10, rect, 1)).toBe('top-right');
    });

    it('detects bottom-left corner', () => {
      expect(detectEdge(10, 25, rect, 1)).toBe('bottom-left');
    });

    it('returns null for center of rect', () => {
      // x=20, y=17 is clearly in the middle
      expect(detectEdge(20, 17, rect, 1)).toBeNull();
    });

    it('returns null for point outside rect', () => {
      expect(detectEdge(0, 0, rect, 1)).toBeNull();
    });

    it('respects larger handleZone', () => {
      // With handleZone=3, cursor at x=28 (within 3 of right edge at 30) should detect right
      expect(detectEdge(28, 17, rect, 3)).toBe('right');
      // But with handleZone=1, x=28 is too far from right edge
      expect(detectEdge(28, 17, rect, 1)).toBeNull();
    });
  });

  // ─── edgeToCursor ────────────────────────────────────────────────────

  describe('edgeToCursor', () => {
    it('maps top/bottom to ns-resize', () => {
      expect(edgeToCursor('top')).toBe('ns-resize');
      expect(edgeToCursor('bottom')).toBe('ns-resize');
    });

    it('maps left/right to ew-resize', () => {
      expect(edgeToCursor('left')).toBe('ew-resize');
      expect(edgeToCursor('right')).toBe('ew-resize');
    });

    it('maps corners correctly', () => {
      expect(edgeToCursor('top-left')).toBe('nwse-resize');
      expect(edgeToCursor('bottom-right')).toBe('nwse-resize');
      expect(edgeToCursor('top-right')).toBe('nesw-resize');
      expect(edgeToCursor('bottom-left')).toBe('nesw-resize');
    });
  });

  // ─── applyConstraints ───────────────────────────────────────────────

  describe('applyConstraints', () => {
    it('clamps width to minWidth', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 3, height: 10 };
      const result = applyConstraints(r, { minWidth: 5 });
      expect(result.width).toBe(5);
    });

    it('clamps width to maxWidth', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 50, height: 10 };
      const result = applyConstraints(r, { maxWidth: 30 });
      expect(result.width).toBe(30);
    });

    it('clamps height to minHeight', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 10, height: 2 };
      const result = applyConstraints(r, { minHeight: 5 });
      expect(result.height).toBe(5);
    });

    it('clamps height to maxHeight', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 10, height: 50 };
      const result = applyConstraints(r, { maxHeight: 20 });
      expect(result.height).toBe(20);
    });

    it('enforces aspect ratio', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 20, height: 10 };
      // aspectRatio = 4 means width/height = 4, so height = 20/4 = 5
      const result = applyConstraints(r, { aspectRatio: 4 });
      expect(result.width).toBe(20);
      expect(result.height).toBe(5);
    });

    it('snaps to grid', () => {
      const r: ResizableRect = { x: 0, y: 0, width: 13, height: 17 };
      const result = applyConstraints(r, { snapGridX: 5, snapGridY: 10 });
      expect(result.width).toBe(15);
      expect(result.height).toBe(20);
    });

    it('passes through unconstrained rect', () => {
      const r: ResizableRect = { x: 5, y: 5, width: 20, height: 15 };
      const result = applyConstraints(r, {});
      expect(result).toEqual(r);
    });
  });

  // ─── resizeHandleUpdate ─────────────────────────────────────────────

  describe('resizeHandleUpdate', () => {
    describe('resize-move', () => {
      it('transitions idle -> hovering when cursor near edge', () => {
        const state = createResizeHandleState(rect);
        // Move cursor to right edge (x=30, y=17)
        const msg: ResizeHandleMsg = { type: 'resize-move', x: 30, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('hovering');
        expect(next.hoveredEdge).toBe('right');
        expect(next.cursor).toBe('ew-resize');
      });

      it('stays idle when cursor in center', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-move', x: 20, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('idle');
        expect(next.hoveredEdge).toBeNull();
      });

      it('updates hoveredEdge and cursor in hovering', () => {
        const state = makeHoveringState({ hoveredEdge: 'right', cursor: 'ew-resize' });
        // Move cursor to top edge
        const msg: ResizeHandleMsg = { type: 'resize-move', x: 20, y: 10 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('hovering');
        expect(next.hoveredEdge).toBe('top');
        expect(next.cursor).toBe('ns-resize');
      });

      it('transitions hovering -> idle when cursor moves to center', () => {
        const state = makeHoveringState();
        const msg: ResizeHandleMsg = { type: 'resize-move', x: 20, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('idle');
        expect(next.hoveredEdge).toBeNull();
        expect(next.cursor).toBe('default');
      });
    });

    describe('resize-start', () => {
      it('transitions hovering -> resizing', () => {
        const state = makeHoveringState({ hoveredEdge: 'right', cursor: 'ew-resize' });
        const msg: ResizeHandleMsg = { type: 'resize-start', x: 30, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('resizing');
        expect(next.activeEdge).toBe('right');
        expect(next.startX).toBe(30);
        expect(next.startY).toBe(17);
      });

      it('no-ops from idle', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-start', x: 30, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next).toBe(state);
      });

      it('records original rect and start position', () => {
        const state = makeHoveringState({ hoveredEdge: 'bottom' });
        const msg: ResizeHandleMsg = { type: 'resize-start', x: 20, y: 25 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.original).toEqual(rect);
        expect(next.startX).toBe(20);
        expect(next.startY).toBe(25);
      });
    });

    describe('resize-drag', () => {
      it('updates current rect for right edge drag', () => {
        const state = makeResizingState({
          activeEdge: 'right',
          startX: 30,
          startY: 17,
        });
        // Drag 5 pixels to the right
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 35, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.width).toBe(25); // 20 + 5
        expect(next.current.x).toBe(10); // unchanged
      });

      it('updates current rect for left edge drag', () => {
        const state = makeResizingState({
          activeEdge: 'left',
          startX: 10,
          startY: 17,
          cursor: 'ew-resize',
        });
        // Drag 3 pixels to the left (x decreases)
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 7, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.x).toBe(7); // 10 + (-3)
        expect(next.current.width).toBe(23); // 20 - (-3) = 23
      });

      it('updates current rect for bottom edge drag', () => {
        const state = makeResizingState({
          activeEdge: 'bottom',
          startX: 20,
          startY: 25,
          cursor: 'ns-resize',
        });
        // Drag 4 pixels down
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 20, y: 29 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.height).toBe(19); // 15 + 4
        expect(next.current.y).toBe(10); // unchanged
      });

      it('updates current rect for top edge drag', () => {
        const state = makeResizingState({
          activeEdge: 'top',
          startX: 20,
          startY: 10,
          cursor: 'ns-resize',
        });
        // Drag 2 pixels up
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 20, y: 8 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.y).toBe(8); // 10 + (-2)
        expect(next.current.height).toBe(17); // 15 - (-2) = 17
      });

      it('handles corner drag (bottom-right)', () => {
        const state = makeResizingState({
          activeEdge: 'bottom-right',
          startX: 30,
          startY: 25,
          cursor: 'nwse-resize',
        });
        // Drag 5 right, 3 down
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 35, y: 28 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.width).toBe(25); // 20 + 5
        expect(next.current.height).toBe(18); // 15 + 3
        expect(next.current.x).toBe(10); // unchanged
        expect(next.current.y).toBe(10); // unchanged
      });

      it('applies minWidth constraint', () => {
        const state = makeResizingState({
          activeEdge: 'right',
          startX: 30,
          startY: 17,
        });
        // Drag 18 pixels left, which would make width = 20 - 18 = 2
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 12, y: 17 };
        const next = resizeHandleUpdate(msg, state, { minWidth: 5 });
        expect(next.current.width).toBe(5);
      });

      it('no-ops when not resizing', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-drag', x: 35, y: 17 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next).toBe(state);
      });
    });

    describe('resize-end', () => {
      it('transitions resizing -> idle keeping current rect', () => {
        const modifiedRect = { x: 10, y: 10, width: 30, height: 15 };
        const state = makeResizingState({ current: modifiedRect });
        const msg: ResizeHandleMsg = { type: 'resize-end' };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('idle');
        expect(next.current).toEqual(modifiedRect);
        expect(next.activeEdge).toBeNull();
      });

      it('no-ops when not resizing', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-end' };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next).toBe(state);
      });
    });

    describe('resize-cancel', () => {
      it('transitions resizing -> idle restoring original', () => {
        const modifiedRect = { x: 10, y: 10, width: 30, height: 20 };
        const state = makeResizingState({
          original: { ...rect },
          current: modifiedRect,
        });
        const msg: ResizeHandleMsg = { type: 'resize-cancel' };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.phase).toBe('idle');
        expect(next.current).toEqual(rect);
        expect(next.activeEdge).toBeNull();
      });
    });

    describe('resize-key', () => {
      it('nudges edge by delta', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'right', delta: 3 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.width).toBe(23); // 20 + 3
      });

      it('applies constraints after nudge', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'right', delta: 100 };
        const next = resizeHandleUpdate(msg, state, { maxWidth: 40 });
        expect(next.current.width).toBe(40);
      });

      it('nudges left edge (moves x and adjusts width)', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'left', delta: -2 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.x).toBe(8); // 10 + (-2)
        expect(next.current.width).toBe(22); // 20 - (-2)
      });

      it('nudges top edge (moves y and adjusts height)', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'top', delta: -3 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.y).toBe(7); // 10 + (-3)
        expect(next.current.height).toBe(18); // 15 - (-3)
      });

      it('nudges bottom edge', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'bottom', delta: 4 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.height).toBe(19); // 15 + 4
      });

      it('shrinks via right edge with negative delta', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'right', delta: -5 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.width).toBe(15); // 20 + (-5) = 15
        expect(next.current.x).toBe(10); // unchanged
      });

      it('shrinks via bottom edge with negative delta', () => {
        const state = createResizeHandleState(rect);
        const msg: ResizeHandleMsg = { type: 'resize-key', edge: 'bottom', delta: -3 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next.current.height).toBe(12); // 15 + (-3) = 12
        expect(next.current.y).toBe(10); // unchanged
      });

      it('no-ops resize-move during resizing phase', () => {
        const state = makeResizingState();
        const msg: ResizeHandleMsg = { type: 'resize-move', x: 15, y: 15 };
        const next = resizeHandleUpdate(msg, state, {});
        expect(next).toBe(state);
      });
    });
  });
});
