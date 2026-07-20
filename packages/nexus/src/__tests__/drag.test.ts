import { describe, expect, it } from 'vitest';
import { createDragState, type DragMsg, type DragState, type DropTarget, dragUpdate, getDragOffset, getDroppedResult, isDragging, isDropped } from '../drag.js';

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
});
