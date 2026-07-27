declare module '@celestial/nebula' {
  export type Signal<T> = () => T;

  export interface KeyEvent {
    readonly key: string;
  }

  export interface StreamSource<T = unknown> {
    onData(cb: (value: T) => void): void;
    teardown?(): void;
  }

  export interface Sub<T = unknown> {
    readonly __msg?: T;
  }

  export interface KeyChord {
    readonly key: string;
    readonly ctrl?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
  }

  export interface Keybinding<M> {
    readonly id: string;
    readonly keys: readonly KeyChord[];
    readonly action: M;
    readonly mode?: string;
    readonly description?: string;
    readonly priority?: number;
  }

  export interface KeybindingLayer<M> {
    readonly id: string;
    readonly bindings: readonly Keybinding<M>[];
  }

  export interface KeybindingState<M> {
    readonly mode: string;
    readonly layers: readonly KeybindingLayer<M>[];
    readonly pendingChord: readonly KeyChord[];
    readonly chordTimeoutMs: number;
    readonly chordStartTime: number;
  }

  export interface SnapPoint {
    readonly offset: number;
    readonly id?: string;
  }

  export interface MomentumState {
    readonly velocity: number;
    readonly offset: number;
    readonly lastTimestamp: number;
    readonly isAnimating: boolean;
  }

  export type MouseEventType = 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down';

  export type PointerCursor =
    | 'alias'
    | 'cell'
    | 'copy'
    | 'crosshair'
    | 'default'
    | 'e-resize'
    | 'ew-resize'
    | 'grab'
    | 'grabbing'
    | 'help'
    | 'move'
    | 'n-resize'
    | 'ne-resize'
    | 'nesw-resize'
    | 'no-drop'
    | 'not-allowed'
    | 'ns-resize'
    | 'nw-resize'
    | 'nwse-resize'
    | 'pointer'
    | 'progress'
    | 's-resize'
    | 'se-resize'
    | 'sw-resize'
    | 'text'
    | 'vertical-text'
    | 'w-resize'
    | 'wait'
    | 'zoom-in'
    | 'zoom-out';

  export interface MouseEventData {
    readonly type: MouseEventType;
    readonly button: 0 | 1 | 2 | 'none';
    readonly x: number;
    readonly y: number;
    readonly ctrl: boolean;
    readonly alt: boolean;
    readonly shift: boolean;
  }

  export interface MouseModifierHandler {
    readonly default?: string;
    readonly shift?: string;
    readonly ctrl?: string;
    readonly alt?: string;
    readonly shiftCtrl?: string;
    readonly shiftAlt?: string;
    readonly ctrlAlt?: string;
    readonly shiftCtrlAlt?: string;
  }

  export type MouseHandler = string | MouseModifierHandler;

  export interface EventHandlers {
    readonly onClick?: MouseHandler;
    readonly onRightClick?: MouseHandler;
    readonly onMouseDown?: MouseHandler;
    readonly onMouseUp?: MouseHandler;
    readonly onMouseMove?: MouseHandler;
    readonly onScroll?: MouseHandler;
    readonly onClickCapture?: MouseHandler;
    readonly onRightClickCapture?: MouseHandler;
    readonly onMouseDownCapture?: MouseHandler;
    readonly onMouseUpCapture?: MouseHandler;
    readonly onMouseMoveCapture?: MouseHandler;
    readonly onScrollCapture?: MouseHandler;
  }

  export type RegionIntent =
    | 'close'
    | 'submit'
    | 'cancel'
    | 'confirm'
    | 'dismiss'
    | 'navigate'
    | 'select'
    | 'toggle'
    | 'edit'
    | 'scroll'
    | 'drag'
    | 'open'
    | 'menu'
    | 'help'
    | (string & {});

  export interface RegionMetadata {
    readonly label?: string;
    readonly summary?: string;
    readonly detail?: string;
    readonly affordances?: ReadonlyArray<'hover' | 'click' | 'drag' | 'resize' | 'edit' | 'observe' | 'scroll'>;
    readonly cursor?: PointerCursor;
    readonly value?: string;
    readonly state?: string;
    readonly intent?: RegionIntent;
    readonly scope?: string;
    readonly extra?: Record<string, unknown>;
  }

  export interface LayoutRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  export interface HitRegionInfo {
    readonly id: string;
    readonly handlers: EventHandlers;
    readonly rect: LayoutRect;
    readonly zIndex: number;
    readonly isHover: boolean;
    readonly eventPath: readonly string[];
    readonly metadata?: RegionMetadata;
  }

  export const Sub: {
    stream<T>(config: { id: string; setup: () => StreamSource<unknown>; toMsg: (value: unknown) => T }): Sub<T>;
    filter<T, U extends T>(sub: Sub<T>, predicate: (value: T) => value is U): Sub<U>;
    keyEvent<T>(handler: (event: KeyEvent) => T | undefined): Sub<T | undefined>;
    none<T>(): Sub<T>;
    batch<T>(...subs: Sub<T>[]): Sub<T>;
  };

  export function createSignalContext(): {
    signal<T>(initial: T): [Signal<T>, (value: T) => void];
  };

  export function createMomentumState(initialOffset?: number): MomentumState;
  export function applyScrollDelta(state: MomentumState, delta: number, timestamp: number, maxOffset: number): MomentumState;
  export function tickMomentum(state: MomentumState, maxOffset: number, friction?: number): MomentumState;
  export function scrollTo(offset: number, maxOffset: number): number;
  export function snapToNearest(offset: number, snapPoints: readonly SnapPoint[]): number;
  export function resolveMouseHandler(handler: MouseHandler | undefined, event: Pick<MouseEventData, 'shift' | 'ctrl' | 'alt'>): string | undefined;
  export function isPointerCursor(value: unknown): value is PointerCursor;
}
