import { describe, expect, it } from 'vitest';
import { collectHitRegions, event, planLayout, type RowNode, text } from '@celestial/nebula';
import {
  createDragState,
  type DragMsg,
  dragPreview,
  type DragState,
  type DropTarget,
  dragUpdate,
  getDragOffset,
  getDroppedResult,
  isDragging,
  isDropped,
  resolveDragPreviewRect,
} from '../drag.js';

function makeTargets(ids: string[], canDrop = true): DropTarget<string>[] {
  return ids.map((id) => ({ id, canDrop: () => canDrop }));
}

function makeDraggingState(overrides: Partial<DragState<string> & { phase: 'dragging' }> = {}): DragState<string> {
  return {
    phase: 'dragging',
    sourceId: 'src-1',
    data: 'payload',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    hoveredTargetId: null,
    ...overrides,
  };
}

describe('drag', () => {
  describe('createDragState', () => {
    it('returns idle', () => {
      const state = createDragState<string>();
      expect(state).toEqual({ phase: 'idle' });
    });
  });

  describe('drag-start', () => {
    it('transitions from idle to dragging with correct data', () => {
      const state = createDragState<string>();
      const msg: DragMsg<string> = {
        type: 'drag-start',
        sourceId: 'item-1',
        data: 'hello',
        x: 10,
        y: 20,
      };
      const next = dragUpdate(msg, state, []);
      expect(next).toEqual({
        phase: 'dragging',
        sourceId: 'item-1',
        data: 'hello',
        startX: 10,
        startY: 20,
        currentX: 10,
        currentY: 20,
        hoveredTargetId: null,
      });
    });

    it('is a no-op when not idle', () => {
      const state = makeDraggingState();
      const msg: DragMsg<string> = {
        type: 'drag-start',
        sourceId: 'item-2',
        data: 'other',
        x: 5,
        y: 5,
      };
      const next = dragUpdate(msg, state, []);
      expect(next).toBe(state);
    });

    it('captures source bounds from the routed input frame', () => {
      const next = dragUpdate(
        {
          type: 'drag-start',
          sourceId: 'item-1',
          data: 'hello',
          x: 12,
          y: 7,
          sourceRect: { x: 10, y: 5, width: 18, height: 6 },
        },
        createDragState<string>(),
        [],
      );

      expect(next).toMatchObject({
        phase: 'dragging',
        sourceRect: { x: 10, y: 5, width: 18, height: 6 },
      });
    });
  });

  describe('drag-move', () => {
    it('updates position when dragging', () => {
      const state = makeDraggingState({ startX: 10, startY: 10 });
      const msg: DragMsg<string> = { type: 'drag-move', x: 30, y: 40 };
      const next = dragUpdate(msg, state, []);
      expect(next).toEqual({
        ...state,
        currentX: 30,
        currentY: 40,
      });
    });

    it('is a no-op when idle', () => {
      const state = createDragState<string>();
      const msg: DragMsg<string> = { type: 'drag-move', x: 10, y: 10 };
      const next = dragUpdate(msg, state, []);
      expect(next).toBe(state);
    });
  });

  describe('drag-over', () => {
    it('sets hoveredTargetId for valid target', () => {
      const state = makeDraggingState();
      const targets = makeTargets(['zone-a']);
      const msg: DragMsg<string> = { type: 'drag-over', targetId: 'zone-a' };
      const next = dragUpdate(msg, state, targets);
      expect(next).toEqual({ ...state, hoveredTargetId: 'zone-a' });
    });

    it('rejects target where canDrop returns false', () => {
      const state = makeDraggingState();
      const targets: DropTarget<string>[] = [{ id: 'zone-a', canDrop: () => false }];
      const msg: DragMsg<string> = { type: 'drag-over', targetId: 'zone-a' };
      const next = dragUpdate(msg, state, targets);
      expect(next).toBe(state);
    });

    it('is a no-op with unknown targetId', () => {
      const state = makeDraggingState();
      const targets = makeTargets(['zone-a']);
      const msg: DragMsg<string> = { type: 'drag-over', targetId: 'zone-unknown' };
      const next = dragUpdate(msg, state, targets);
      expect(next).toBe(state);
    });
  });

  describe('drag-leave', () => {
    it('clears hoveredTargetId', () => {
      const state = makeDraggingState({ hoveredTargetId: 'zone-a' });
      const msg: DragMsg<string> = { type: 'drag-leave' };
      const next = dragUpdate(msg, state, []);
      expect(next).toEqual({ ...state, hoveredTargetId: null });
    });
  });

  describe('drop', () => {
    it('transitions to dropped with valid target', () => {
      const state = makeDraggingState({ data: 'my-data' });
      const targets = makeTargets(['zone-a']);
      const msg: DragMsg<string> = { type: 'drop', targetId: 'zone-a' };
      const next = dragUpdate(msg, state, targets);
      expect(next).toEqual({
        phase: 'dropped',
        sourceId: 'src-1',
        targetId: 'zone-a',
        data: 'my-data',
      });
    });

    it('stays dragging when canDrop returns false', () => {
      const state = makeDraggingState();
      const targets: DropTarget<string>[] = [{ id: 'zone-a', canDrop: () => false }];
      const msg: DragMsg<string> = { type: 'drop', targetId: 'zone-a' };
      const next = dragUpdate(msg, state, targets);
      expect(next).toBe(state);
    });

    it('is a no-op when idle', () => {
      const state = createDragState<string>();
      const msg: DragMsg<string> = { type: 'drop', targetId: 'zone-a' };
      const next = dragUpdate(msg, state, []);
      expect(next).toBe(state);
    });
  });

  describe('drag-cancel', () => {
    it('returns to idle from dragging', () => {
      const state = makeDraggingState();
      const msg: DragMsg<string> = { type: 'drag-cancel' };
      const next = dragUpdate(msg, state, []);
      expect(next).toEqual({ phase: 'idle' });
    });
  });

  describe('isDragging', () => {
    it('returns true when dragging', () => {
      expect(isDragging(makeDraggingState())).toBe(true);
    });

    it('returns false when idle', () => {
      expect(isDragging(createDragState())).toBe(false);
    });

    it('returns false when dropped', () => {
      const state: DragState<string> = {
        phase: 'dropped',
        sourceId: 'src-1',
        targetId: 'zone-a',
        data: 'payload',
      };
      expect(isDragging(state)).toBe(false);
    });
  });

  describe('getDragOffset', () => {
    it('returns correct offset during drag', () => {
      const state = makeDraggingState({
        startX: 10,
        startY: 20,
        currentX: 30,
        currentY: 50,
      });
      expect(getDragOffset(state)).toEqual({ dx: 20, dy: 30 });
    });

    it('returns null when idle', () => {
      expect(getDragOffset(createDragState())).toBeNull();
    });
  });

  describe('drag-reset', () => {
    it('returns to idle from dropped', () => {
      const state: DragState<string> = {
        phase: 'dropped',
        sourceId: 'src-1',
        targetId: 'zone-a',
        data: 'payload',
      };
      const next = dragUpdate({ type: 'drag-reset' }, state, []);
      expect(next).toEqual({ phase: 'idle' });
    });

    it('returns to idle from dragging', () => {
      const state = makeDraggingState();
      const next = dragUpdate({ type: 'drag-reset' }, state, []);
      expect(next).toEqual({ phase: 'idle' });
    });

    it('is a no-op when already idle', () => {
      const state = createDragState<string>();
      const next = dragUpdate({ type: 'drag-reset' }, state, []);
      expect(next).toBe(state);
    });

    it('allows a fresh drag-start after a drop is acknowledged', () => {
      const dropped: DragState<string> = {
        phase: 'dropped',
        sourceId: 'src-1',
        targetId: 'zone-a',
        data: 'payload',
      };
      const idle = dragUpdate({ type: 'drag-reset' }, dropped, []);
      const next = dragUpdate({ type: 'drag-start', sourceId: 'src-2', data: 'next', x: 1, y: 2 }, idle, []);
      expect(next.phase).toBe('dragging');
    });
  });

  describe('isDropped', () => {
    it('returns true for dropped state', () => {
      const state: DragState<string> = {
        phase: 'dropped',
        sourceId: 's',
        targetId: 't',
        data: 'd',
      };
      expect(isDropped(state)).toBe(true);
    });

    it('returns false for idle and dragging', () => {
      expect(isDropped(createDragState<string>())).toBe(false);
      expect(isDropped(makeDraggingState())).toBe(false);
    });
  });

  describe('getDroppedResult', () => {
    it('returns the result for dropped state', () => {
      const state: DragState<string> = {
        phase: 'dropped',
        sourceId: 's',
        targetId: 't',
        data: 'payload',
      };
      expect(getDroppedResult(state)).toEqual({ sourceId: 's', targetId: 't', data: 'payload' });
    });

    it('returns null for idle and dragging', () => {
      expect(getDroppedResult(createDragState<string>())).toBeNull();
      expect(getDroppedResult(makeDraggingState())).toBeNull();
    });
  });

  describe('drag preview', () => {
    it('translates from the captured source frame without changing its footprint', () => {
      const state = makeDraggingState({
        startX: 12,
        startY: 7,
        currentX: 18,
        currentY: 10,
        sourceRect: { x: 10, y: 5, width: 18, height: 6 },
      });

      expect(resolveDragPreviewRect(state, { cols: 80, rows: 24 })).toEqual({
        x: 16,
        y: 8,
        width: 18,
        height: 6,
      });
    });

    it('clamps hostile offsets and insets while preserving oversized preview dimensions', () => {
      const state = makeDraggingState({
        startX: 0,
        startY: 0,
        currentX: Number.POSITIVE_INFINITY,
        currentY: -100,
        sourceRect: { x: 8, y: 4, width: 30, height: 12 },
      });

      expect(
        resolveDragPreviewRect(state, {
          cols: 20,
          rows: 10,
          leftInset: 3,
          rightInset: 99,
          topInset: 2,
          bottomInset: 99,
        }),
      ).toEqual({ x: 3, y: 2, width: 30, height: 12 });
    });

    it('preserves the flow slot and emits a passive pointer-transparent overlay', () => {
      const source = event('source', text('source'), { onMouseDown: 'start' });
      const preview = event('preview', text('preview'), { onMouseMove: 'move' });
      const rendered = dragPreview({
        state: makeDraggingState({
          sourceId: 'receipt',
          startX: 4,
          startY: 3,
          currentX: 9,
          currentY: 5,
          sourceRect: { x: 2, y: 1, width: 8, height: 3 },
        }),
        sourceId: 'receipt',
        source,
        preview,
        viewport: { cols: 40, rows: 12 },
      });

      expect(rendered.kind).toBe('row');
      const rowNode = rendered as RowNode;
      expect(rowNode.children[0]).toMatchObject({ kind: 'empty', width: 8, height: 3 });
      expect(rowNode.children[1]).toMatchObject({
        kind: 'overlay',
        x: 7,
        y: 3,
        width: 8,
        height: 3,
        zIndex: 1_000,
        pointerEvents: 'none',
        focusMode: 'passive',
      });

      const plan = planLayout(rendered, 40, 12);
      expect(plan.overlays[0]?.entry.rect).toEqual({ x: 7, y: 3, width: 8, height: 3 });
      expect(collectHitRegions(plan)).toEqual([]);
    });

    it('leaves the source untouched outside a matching drag with captured bounds', () => {
      const source = text('source');
      expect(
        dragPreview({
          state: createDragState(),
          sourceId: 'receipt',
          source,
          viewport: { cols: 40, rows: 12 },
        }),
      ).toBe(source);
      expect(
        dragPreview({
          state: makeDraggingState({ sourceId: 'other' }),
          sourceId: 'receipt',
          source,
          viewport: { cols: 40, rows: 12 },
        }),
      ).toBe(source);
      expect(
        dragPreview({
          state: makeDraggingState({ sourceId: 'receipt' }),
          sourceId: 'receipt',
          source,
          viewport: { cols: 40, rows: 12 },
        }),
      ).toBe(source);
    });
  });
});
