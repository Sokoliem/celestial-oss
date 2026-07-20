export type PointerCaptureReason = 'drag' | 'resize' | 'scrollbar' | 'gesture' | 'custom' | (string & {});
export type PointerCaptureEndKind = 'released' | 'canceled' | 'lost';

export interface PointerCaptureSession<TData = unknown> {
  readonly id: string;
  readonly ownerId: string;
  readonly pointerId: string;
  readonly reason: PointerCaptureReason;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly localStartX?: number;
  readonly localStartY?: number;
  readonly localCurrentX?: number;
  readonly localCurrentY?: number;
  readonly regionId?: string;
  readonly layerId?: string;
  readonly data?: TData;
}

export interface PointerCaptureEnd<TData = unknown> extends PointerCaptureSession<TData> {
  readonly kind: PointerCaptureEndKind;
  readonly endedAt: number;
  readonly targetId?: string;
  readonly detail?: string;
}

export interface PointerCaptureState<TData = unknown> {
  readonly active: PointerCaptureSession<TData> | null;
  readonly lastEnd: PointerCaptureEnd<TData> | null;
}

export type PointerCaptureMsg<TData = unknown> =
  | {
      readonly type: 'capture-start';
      readonly ownerId: string;
      readonly x: number;
      readonly y: number;
      readonly id?: string;
      readonly pointerId?: string;
      readonly reason?: PointerCaptureReason;
      readonly timestamp?: number;
      readonly regionId?: string;
      readonly layerId?: string;
      readonly localX?: number;
      readonly localY?: number;
      readonly data?: TData;
    }
  | {
      readonly type: 'capture-move';
      readonly x: number;
      readonly y: number;
      readonly pointerId?: string;
      readonly timestamp?: number;
      readonly localX?: number;
      readonly localY?: number;
    }
  | {
      readonly type: 'capture-release';
      readonly x?: number;
      readonly y?: number;
      readonly pointerId?: string;
      readonly timestamp?: number;
      readonly targetId?: string;
      readonly detail?: string;
      readonly localX?: number;
      readonly localY?: number;
    }
  | { readonly type: 'capture-cancel'; readonly pointerId?: string; readonly timestamp?: number; readonly detail?: string }
  | { readonly type: 'capture-lost'; readonly pointerId?: string; readonly timestamp?: number; readonly detail?: string }
  | { readonly type: 'capture-clear' };

let captureIdCounter = 0;

function nextCaptureId(): string {
  captureIdCounter += 1;
  return `capture_${captureIdCounter}`;
}

function now(timestamp?: number): number {
  return timestamp ?? Date.now();
}

function matchesPointer(session: PointerCaptureSession, pointerId?: string): boolean {
  return pointerId === undefined || session.pointerId === pointerId;
}

function withPosition<TData>(
  session: PointerCaptureSession<TData>,
  options: { readonly x?: number; readonly y?: number; readonly localX?: number; readonly localY?: number; readonly timestamp?: number },
): PointerCaptureSession<TData> {
  if (options.x === undefined && options.y === undefined && options.localX === undefined && options.localY === undefined && options.timestamp === undefined) {
    return session;
  }
  return {
    ...session,
    currentX: options.x ?? session.currentX,
    currentY: options.y ?? session.currentY,
    ...(options.localX !== undefined ? { localCurrentX: options.localX } : {}),
    ...(options.localY !== undefined ? { localCurrentY: options.localY } : {}),
    updatedAt: now(options.timestamp),
  };
}

function endCapture<TData>(
  state: PointerCaptureState<TData>,
  kind: PointerCaptureEndKind,
  options: {
    readonly x?: number;
    readonly y?: number;
    readonly pointerId?: string;
    readonly timestamp?: number;
    readonly targetId?: string;
    readonly detail?: string;
    readonly localX?: number;
    readonly localY?: number;
  } = {},
): PointerCaptureState<TData> {
  if (!state.active || !matchesPointer(state.active, options.pointerId)) {
    return state;
  }

  const updated = withPosition(state.active, options);
  return {
    active: null,
    lastEnd: {
      ...updated,
      kind,
      endedAt: now(options.timestamp),
      ...(options.targetId ? { targetId: options.targetId } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
    },
  };
}

export function createPointerCaptureState<TData = unknown>(): PointerCaptureState<TData> {
  return {
    active: null,
    lastEnd: null,
  };
}

export function pointerCaptureUpdate<TData>(msg: PointerCaptureMsg<TData>, state: PointerCaptureState<TData>): PointerCaptureState<TData> {
  switch (msg.type) {
    case 'capture-start': {
      if (state.active) {
        return state;
      }
      const startedAt = now(msg.timestamp);
      return {
        active: {
          id: msg.id ?? nextCaptureId(),
          ownerId: msg.ownerId,
          pointerId: msg.pointerId ?? 'mouse',
          reason: msg.reason ?? 'custom',
          startX: msg.x,
          startY: msg.y,
          currentX: msg.x,
          currentY: msg.y,
          startedAt,
          updatedAt: startedAt,
          ...(msg.regionId ? { regionId: msg.regionId } : {}),
          ...(msg.layerId ? { layerId: msg.layerId } : {}),
          ...(msg.localX !== undefined ? { localStartX: msg.localX, localCurrentX: msg.localX } : {}),
          ...(msg.localY !== undefined ? { localStartY: msg.localY, localCurrentY: msg.localY } : {}),
          ...(msg.data !== undefined ? { data: msg.data } : {}),
        },
        lastEnd: null,
      };
    }

    case 'capture-move':
      if (!state.active || !matchesPointer(state.active, msg.pointerId)) {
        return state;
      }
      return {
        ...state,
        active: withPosition(state.active, msg),
      };

    case 'capture-release':
      return endCapture(state, 'released', msg);

    case 'capture-cancel':
      return endCapture(state, 'canceled', msg);

    case 'capture-lost':
      return endCapture(state, 'lost', msg);

    case 'capture-clear':
      if (!state.active && !state.lastEnd) {
        return state;
      }
      return createPointerCaptureState<TData>();
  }
}

export function isPointerCaptured<TData>(state: PointerCaptureState<TData>): boolean {
  return state.active !== null;
}

export function isPointerCaptureOwner<TData>(state: PointerCaptureState<TData>, ownerId: string): boolean {
  return state.active?.ownerId === ownerId;
}

export function getPointerCaptureOffset<TData>(state: PointerCaptureState<TData>): { readonly dx: number; readonly dy: number } | null {
  if (!state.active) {
    return null;
  }
  return {
    dx: state.active.currentX - state.active.startX,
    dy: state.active.currentY - state.active.startY,
  };
}

export function getPointerCaptureLocalOffset<TData>(state: PointerCaptureState<TData>): { readonly dx: number; readonly dy: number } | null {
  const active = state.active;
  if (
    !active ||
    active.localStartX === undefined ||
    active.localStartY === undefined ||
    active.localCurrentX === undefined ||
    active.localCurrentY === undefined
  ) {
    return null;
  }
  return {
    dx: active.localCurrentX - active.localStartX,
    dy: active.localCurrentY - active.localStartY,
  };
}
