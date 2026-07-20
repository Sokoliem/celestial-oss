import { type DecayAnimation, decay } from '@celestial/aurora';
import { type SnapPoint, snapToNearest } from '@celestial/nebula';
import { createDragState, type DragMsg, type DragState, type DropTarget, dragUpdate } from './drag.js';

const DEFAULT_DECELERATION = 0.92;
const DEFAULT_REST_DELTA = 2;

export interface InertialDragConfig {
  deceleration?: number;
  restDelta?: number;
  clampX?: readonly [number, number];
  clampY?: readonly [number, number];
  snapPointsX?: readonly SnapPoint[];
  snapPointsY?: readonly SnapPoint[];
}

export interface InertialDragState<D = unknown> {
  drag: DragState<D>;
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  startOffsetX: number;
  startOffsetY: number;
  lastTimestamp: number | null;
  decayX: DecayAnimation | null;
  decayY: DecayAnimation | null;
}

type TimedDragStartMsg<D> = Extract<DragMsg<D>, { type: 'drag-start' }> & { timestamp?: number };
type TimedDragMoveMsg = Extract<DragMsg, { type: 'drag-move' }> & { timestamp?: number };

export type InertialDragMsg<D = unknown> =
  | TimedDragStartMsg<D>
  | TimedDragMoveMsg
  | Extract<DragMsg<D>, { type: 'drag-over' | 'drag-leave' | 'drop' | 'drag-cancel' }>
  | { type: 'drag-fling'; velocityX?: number; velocityY?: number; timestamp?: number }
  | { type: 'drag-tick'; now: number };

export function createInertialDragState<D>(offsetX = 0, offsetY = 0): InertialDragState<D> {
  return {
    drag: createDragState<D>(),
    offsetX,
    offsetY,
    velocityX: 0,
    velocityY: 0,
    startOffsetX: offsetX,
    startOffsetY: offsetY,
    lastTimestamp: null,
    decayX: null,
    decayY: null,
  };
}

export function inertialDragUpdate<D>(
  msg: InertialDragMsg<D>,
  state: InertialDragState<D>,
  targets: DropTarget<D>[],
  config: InertialDragConfig = {},
): InertialDragState<D> {
  switch (msg.type) {
    case 'drag-start':
      return handleDragStart(msg, state, targets);
    case 'drag-move':
      return handleDragMove(msg, state, targets, config);
    case 'drag-over':
    case 'drag-leave':
    case 'drop':
    case 'drag-cancel':
      return {
        ...state,
        drag: dragUpdate(msg, state.drag, targets),
      };
    case 'drag-fling':
      return handleDragFling(msg, state, config);
    case 'drag-tick':
      return handleDragTick(state, msg.now, config);
  }
}

export function getInertialDragOffset(state: InertialDragState<unknown>): { x: number; y: number } {
  return {
    x: state.offsetX,
    y: state.offsetY,
  };
}

export function isInertialDragging(state: InertialDragState<unknown>): boolean {
  return state.drag.phase === 'dragging';
}

export function isInertialDragAnimating(state: InertialDragState<unknown>): boolean {
  return (state.decayX !== null && !state.decayX.done()) || (state.decayY !== null && !state.decayY.done());
}

function handleDragStart<D>(msg: TimedDragStartMsg<D>, state: InertialDragState<D>, targets: DropTarget<D>[]): InertialDragState<D> {
  state.decayX?.stop();
  state.decayY?.stop();

  return {
    ...state,
    drag: dragUpdate({ type: 'drag-start', sourceId: msg.sourceId, data: msg.data, x: msg.x, y: msg.y }, state.drag, targets),
    startOffsetX: state.offsetX,
    startOffsetY: state.offsetY,
    velocityX: 0,
    velocityY: 0,
    lastTimestamp: msg.timestamp ?? null,
    decayX: null,
    decayY: null,
  };
}

function handleDragMove<D>(msg: TimedDragMoveMsg, state: InertialDragState<D>, targets: DropTarget<D>[], config: InertialDragConfig): InertialDragState<D> {
  const drag = dragUpdate({ type: 'drag-move', x: msg.x, y: msg.y }, state.drag, targets);
  if (drag.phase !== 'dragging') {
    return {
      ...state,
      drag,
    };
  }

  const nextOffsetX = clampOffset(state.startOffsetX + (drag.currentX - drag.startX), config.clampX);
  const nextOffsetY = clampOffset(state.startOffsetY + (drag.currentY - drag.startY), config.clampY);

  const dt = msg.timestamp !== undefined && state.lastTimestamp !== null ? Math.max(1, msg.timestamp - state.lastTimestamp) : null;
  const velocityX = dt === null ? state.velocityX : ((nextOffsetX - state.offsetX) / dt) * 1000;
  const velocityY = dt === null ? state.velocityY : ((nextOffsetY - state.offsetY) / dt) * 1000;

  return {
    ...state,
    drag,
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
    velocityX,
    velocityY,
    lastTimestamp: msg.timestamp ?? state.lastTimestamp,
  };
}

function handleDragFling<D>(
  msg: Extract<InertialDragMsg<D>, { type: 'drag-fling' }>,
  state: InertialDragState<D>,
  config: InertialDragConfig,
): InertialDragState<D> {
  const velocityX = msg.velocityX ?? state.velocityX;
  const velocityY = msg.velocityY ?? state.velocityY;
  const decayX = createAxisDecay(state.offsetX, velocityX, config.clampX, config);
  const decayY = createAxisDecay(state.offsetY, velocityY, config.clampY, config);

  if (!decayX && !decayY) {
    return finalizeDecays(
      {
        ...state,
        drag: createDragState<D>(),
        velocityX: 0,
        velocityY: 0,
        lastTimestamp: msg.timestamp ?? state.lastTimestamp,
        decayX: null,
        decayY: null,
      },
      config,
    );
  }

  return {
    ...state,
    drag: createDragState<D>(),
    velocityX,
    velocityY,
    lastTimestamp: msg.timestamp ?? state.lastTimestamp,
    decayX,
    decayY,
  };
}

function handleDragTick<D>(state: InertialDragState<D>, now: number, config: InertialDragConfig): InertialDragState<D> {
  if (!state.decayX && !state.decayY) {
    return state;
  }

  state.decayX?.tick(now);
  state.decayY?.tick(now);

  const nextState: InertialDragState<D> = {
    ...state,
    offsetX: clampOffset(state.decayX ? state.decayX.value() : state.offsetX, config.clampX),
    offsetY: clampOffset(state.decayY ? state.decayY.value() : state.offsetY, config.clampY),
    velocityX: state.decayX ? state.decayX.velocity() : 0,
    velocityY: state.decayY ? state.decayY.velocity() : 0,
  };

  return finalizeDecays(nextState, config);
}

function finalizeDecays<D>(state: InertialDragState<D>, config: InertialDragConfig): InertialDragState<D> {
  const doneX = !state.decayX || state.decayX.done();
  const doneY = !state.decayY || state.decayY.done();

  if (!doneX || !doneY) {
    return state;
  }

  return {
    ...state,
    offsetX: snapOffset(state.offsetX, config.snapPointsX, config.clampX),
    offsetY: snapOffset(state.offsetY, config.snapPointsY, config.clampY),
    velocityX: 0,
    velocityY: 0,
    decayX: null,
    decayY: null,
  };
}

function createAxisDecay(offset: number, velocity: number, clamp: readonly [number, number] | undefined, config: InertialDragConfig): DecayAnimation | null {
  if (Math.abs(velocity) < (config.restDelta ?? DEFAULT_REST_DELTA)) {
    return null;
  }

  return decay(offset, {
    velocity,
    deceleration: config.deceleration ?? DEFAULT_DECELERATION,
    restDelta: config.restDelta ?? DEFAULT_REST_DELTA,
    clamp,
  });
}

function clampOffset(offset: number, clamp: readonly [number, number] | undefined): number {
  if (!clamp) {
    return offset;
  }

  return Math.max(clamp[0], Math.min(clamp[1], offset));
}

function snapOffset(offset: number, snapPoints: readonly SnapPoint[] | undefined, clamp: readonly [number, number] | undefined): number {
  const snapped = snapPoints && snapPoints.length > 0 ? snapToNearest(offset, snapPoints) : offset;
  return clampOffset(snapped, clamp);
}
