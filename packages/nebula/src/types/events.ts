export interface MouseEventData {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';
  button: 0 | 1 | 2 | 'none';
  x: number;
  y: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export interface ElementMouseEvent {
  handlerTag: string;
  elementId: string;
  phase: 'capture' | 'target' | 'bubble';
  targetId: string;
  currentTargetId: string;
  path: readonly string[];
  /** Original terminal mouse event type. Present for runtime-dispatched events. */
  type?: MouseEventData['type'];
  /** Normalized vertical wheel delta: -1 for scroll-up, 1 for scroll-down, 0 otherwise. */
  deltaY?: -1 | 0 | 1;
  x: number;
  y: number;
  /** Pointer position relative to the current target's top-left cell. */
  localX?: number;
  /** Pointer position relative to the current target's top-left cell. */
  localY?: number;
  /** Layout bounds of the current target from the frame that routed this event. */
  currentTargetRect?: import('../vdom.js').LayoutRect;
  button: MouseEventData['button'];
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  stopPropagation(): void;
  isPropagationStopped(): boolean;
}

/** Timing info delivered on each animation frame by Sub.animationFrame */
export interface FrameInfo {
  /** Monotonic frame counter (0, 1, 2, ...) */
  readonly frame: number;
  /** Wall-clock timestamp in ms (Date.now() at frame start) */
  readonly timestamp: number;
  /** Milliseconds since previous frame */
  readonly delta: number;
}

export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}
