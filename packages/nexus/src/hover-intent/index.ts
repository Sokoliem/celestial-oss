import { reduceMotion as detectReduceMotion } from '@celestial/corona';
import { createSignalContext, type KeyEvent, type Signal, type StreamSource, Sub } from '@celestial/nebula';
import {
  createHoverIntentState,
  type HoverIntentEvent,
  type HoverIntentState,
  hoverIntentUpdate,
  resolveHoverIntentConfig as resolveBaseHoverIntentConfig,
} from '../hover-intent.js';

export type HoverState = 'idle' | 'tooltip' | 'overlay';

export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'auto';

export interface ScrollSnapshot {
  scrollLeft: number;
  scrollTop: number;
}

export interface ScrollPreservation {
  capture(): ScrollSnapshot;
  restore(snapshot: ScrollSnapshot): void;
}

export interface ScrollableTarget {
  scrollLeft: number;
  scrollTop: number;
}

export function preserveScroll(target: ScrollableTarget): ScrollPreservation {
  return {
    capture: () => ({ scrollLeft: target.scrollLeft, scrollTop: target.scrollTop }),
    restore: (snapshot) => {
      target.scrollLeft = snapshot.scrollLeft;
      target.scrollTop = snapshot.scrollTop;
    },
  };
}

export interface HoverTarget {
  readonly id: string;
  readonly contains?: (x: number, y: number) => boolean;
  readonly scrollPreservation?: ScrollPreservation;
}

export type HoverTargetRef = string | HoverTarget;

export interface HoverIntentTooltipConfig<Msg> {
  readonly dwellMs?: number;
  readonly onEnter: () => Msg;
  readonly onLeave: () => Msg;
  readonly placement?: Placement;
}

export interface HoverIntentOverlayConfig<Msg> {
  readonly dwellMs?: number;
  readonly onOpen: () => Msg;
  readonly onClose: () => Msg;
  readonly placement?: Placement;
  readonly preserveScroll?: boolean;
}

export interface HoverIntentConfig<Msg> {
  readonly target: HoverTargetRef;
  readonly tooltip?: HoverIntentTooltipConfig<Msg>;
  readonly overlay?: HoverIntentOverlayConfig<Msg>;
  readonly respectReduceMotion?: boolean;
}

export type HoverIntentInput =
  | { type: 'move'; x: number; y: number; timestamp: number; regionId?: string | null }
  | { type: 'tick'; timestamp: number }
  | { type: 'key'; key: string };

export interface HoverIntentHandle<Msg> {
  readonly subscription: Sub<Msg>;
  readonly state: Signal<HoverState>;
  dispatch(input: HoverIntentInput, opts?: { emit?: boolean }): readonly Msg[];
  forceState(state: HoverState, opts?: { emit?: boolean }): readonly Msg[];
  dispose(): void;
}

interface ResolvedHoverIntentConfig<Msg> {
  readonly target: HoverTarget;
  readonly tooltip?: HoverIntentTooltipConfig<Msg> & { readonly dwellMs: number };
  readonly overlay?: HoverIntentOverlayConfig<Msg> & { readonly dwellMs: number };
  readonly respectReduceMotion: boolean;
}

const DEFAULT_TOOLTIP_DWELL_MS = 300;
const DEFAULT_OVERLAY_DWELL_MS = 800;
const DEFAULT_EXIT_GRACE_MS = 100;

export function resolveHoverIntentConfig<Msg>(config: HoverIntentConfig<Msg>): ResolvedHoverIntentConfig<Msg> {
  const target = typeof config.target === 'string' ? { id: config.target } : config.target;
  return {
    target,
    tooltip: config.tooltip ? { ...config.tooltip, dwellMs: config.tooltip.dwellMs ?? DEFAULT_TOOLTIP_DWELL_MS } : undefined,
    overlay: config.overlay ? { ...config.overlay, dwellMs: config.overlay.dwellMs ?? DEFAULT_OVERLAY_DWELL_MS } : undefined,
    respectReduceMotion: config.respectReduceMotion ?? true,
  };
}

interface InternalController<Msg> {
  dispatch(input: HoverIntentInput, opts?: { emit?: boolean }): readonly Msg[];
  forceState(state: HoverState, opts?: { emit?: boolean }): readonly Msg[];
  dispose(): void;
}

export function hoverIntent<Msg>(config: HoverIntentConfig<Msg>): HoverIntentHandle<Msg> {
  const resolved = resolveHoverIntentConfig(config);
  const signalContext = createSignalContext();
  const [state, setState] = signalContext.signal<HoverState>('idle');
  const emitByDefault = createOutputEmitter<Msg>();
  const reduceMotionEnabled = resolved.respectReduceMotion && detectReduceMotion();
  const engineConfig = resolveBaseHoverIntentConfig({
    dwellMs: reduceMotionEnabled ? 0 : (resolved.tooltip?.dwellMs ?? DEFAULT_TOOLTIP_DWELL_MS),
    exitGraceMs: DEFAULT_EXIT_GRACE_MS,
    movementTolerance: 1,
  });

  let lowLevel: HoverIntentState = createHoverIntentState();
  let phase: HoverState = 'idle';
  let tooltipOpenedAt: number | null = null;
  let scrollSnapshot: ScrollSnapshot | null = null;
  let disposed = false;

  const controller: InternalController<Msg> = {
    dispatch: (input, opts) => dispatchInput(input, opts?.emit ?? true),
    forceState: (next, opts) => forceVisibleState(next, opts?.emit ?? false),
    dispose: () => {
      disposed = true;
      emitByDefault.clear();
      phase = 'idle';
      tooltipOpenedAt = null;
      scrollSnapshot = null;
      lowLevel = createHoverIntentState();
      setState('idle');
    },
  };

  const handle: HoverIntentHandle<Msg> = {
    subscription: Sub.stream({
      id: `nexus.hover-intent:${resolved.target.id}`,
      setup: () => emitByDefault.source,
      toMsg: (value: unknown) => value as Msg,
    }),
    state,
    dispatch: (input, opts) => controller.dispatch(input, opts),
    forceState: (next, opts) => controller.forceState(next, opts),
    dispose: () => controller.dispose(),
  };

  return handle;

  function dispatchInput(input: HoverIntentInput, emit: boolean): readonly Msg[] {
    if (disposed) {
      return [];
    }

    const outputs: Msg[] = [];
    switch (input.type) {
      case 'move':
        handleMove(input, outputs, emit);
        break;
      case 'tick':
        handleTick(input.timestamp, outputs, emit);
        break;
      case 'key':
        handleKey(input.key, outputs, emit);
        break;
    }
    return outputs;
  }

  function handleMove(input: Extract<HoverIntentInput, { type: 'move' }>, outputs: Msg[], emit: boolean): void {
    const inside = isInside(input.x, input.y, input.regionId);
    const nextRegionId = inside ? resolved.target.id : null;

    const next = hoverIntentUpdate(
      {
        type: 'hover-cursor-move',
        x: input.x,
        y: input.y,
        regionId: nextRegionId,
        timestamp: input.timestamp,
      },
      lowLevel,
      engineConfig,
    );
    lowLevel = next.state;

    for (const event of next.events) {
      handleLowLevelEvent(event, input.timestamp, outputs, emit);
    }

    if (inside && reduceMotionEnabled) {
      handleTick(input.timestamp, outputs, emit);
    }
  }

  function handleTick(timestamp: number, outputs: Msg[], emit: boolean): void {
    if (phase === 'idle' && lowLevel.phase === 'idle') {
      return;
    }

    const next = hoverIntentUpdate({ type: 'hover-tick', timestamp }, lowLevel, engineConfig);
    lowLevel = next.state;

    for (const event of next.events) {
      handleLowLevelEvent(event, timestamp, outputs, emit);
    }

    if (phase === 'tooltip' && resolved.overlay) {
      const startedAt = tooltipOpenedAt ?? timestamp;
      const dwellMs = reduceMotionEnabled ? 0 : resolved.overlay.dwellMs;
      if (timestamp - startedAt >= dwellMs) {
        openOverlay(timestamp, outputs, emit);
      }
    }
  }

  function handleKey(key: string, outputs: Msg[], emit: boolean): void {
    if (normalizeKey(key) !== 'escape') {
      return;
    }

    if (phase === 'overlay') {
      closeOverlayKeepTooltip(outputs, emit);
      return;
    }

    if (phase === 'tooltip') {
      closeTooltip(outputs, emit);
    }
  }

  function handleLowLevelEvent(event: HoverIntentEvent, timestamp: number, outputs: Msg[], emit: boolean): void {
    if (event.event === 'hover-enter') {
      openTooltip(timestamp, outputs, emit);
      return;
    }

    if (event.event === 'hover-exit') {
      closeAll(outputs, emit);
    }
  }

  function openTooltip(timestamp: number, outputs: Msg[], emit: boolean): void {
    if (phase === 'tooltip' || phase === 'overlay') {
      return;
    }

    phase = 'tooltip';
    tooltipOpenedAt = timestamp;
    setState(phase);
    if (resolved.tooltip) {
      pushOutput(resolved.tooltip.onEnter(), outputs, emit);
    }
  }

  function openOverlay(timestamp: number, outputs: Msg[], emit: boolean): void {
    if (!resolved.overlay || phase === 'overlay') {
      return;
    }

    if (phase === 'idle') {
      openTooltip(timestamp, outputs, emit);
    }

    if (resolved.overlay.preserveScroll && resolved.target.scrollPreservation && scrollSnapshot === null) {
      scrollSnapshot = resolved.target.scrollPreservation.capture();
    }

    phase = 'overlay';
    setState(phase);
    pushOutput(resolved.overlay.onOpen(), outputs, emit);
  }

  function closeTooltip(outputs: Msg[], emit: boolean): void {
    if (phase === 'idle') {
      return;
    }

    if (phase === 'overlay') {
      closeOverlay(outputs, emit);
      return;
    }

    phase = 'idle';
    tooltipOpenedAt = null;
    setState(phase);
    if (resolved.tooltip) {
      pushOutput(resolved.tooltip.onLeave(), outputs, emit);
    }
  }

  function closeOverlayKeepTooltip(outputs: Msg[], emit: boolean): void {
    if (phase !== 'overlay' || !resolved.overlay) {
      return;
    }

    restoreScrollIfNeeded();
    phase = 'tooltip';
    setState(phase);
    pushOutput(resolved.overlay.onClose(), outputs, emit);
  }

  function closeOverlay(outputs: Msg[], emit: boolean): void {
    if (phase === 'idle') {
      return;
    }

    if (phase === 'overlay' && resolved.overlay) {
      restoreScrollIfNeeded();
      pushOutput(resolved.overlay.onClose(), outputs, emit);
    }

    if (resolved.tooltip) {
      pushOutput(resolved.tooltip.onLeave(), outputs, emit);
    }

    phase = 'idle';
    tooltipOpenedAt = null;
    setState(phase);
  }

  function closeAll(outputs: Msg[], emit: boolean): void {
    closeOverlay(outputs, emit);
  }

  function restoreScrollIfNeeded(): void {
    if (resolved.overlay?.preserveScroll && resolved.target.scrollPreservation && scrollSnapshot) {
      resolved.target.scrollPreservation.restore(scrollSnapshot);
    }
    scrollSnapshot = null;
  }

  function forceVisibleState(next: HoverState, emit: boolean): readonly Msg[] {
    const outputs: Msg[] = [];
    if (next === 'idle') {
      closeAll(outputs, emit);
      return outputs;
    }

    if (next === 'tooltip') {
      if (phase === 'overlay') {
        closeOverlayKeepTooltip(outputs, emit);
      }
      openTooltip(Date.now(), outputs, emit);
      return outputs;
    }

    openTooltip(Date.now(), outputs, emit);
    openOverlay(Date.now(), outputs, emit);
    return outputs;
  }

  function isInside(x: number, y: number, regionId?: string | null): boolean {
    if (regionId !== undefined) {
      return regionId === resolved.target.id;
    }

    if (resolved.target.contains) {
      return resolved.target.contains(x, y);
    }

    return false;
  }

  function pushOutput(msg: Msg, outputs: Msg[], emit: boolean): void {
    outputs.push(msg);
    if (emit) {
      emitByDefault.push(msg);
    }
  }
}

export function hoverIntentKeys<Msg>(handle: HoverIntentHandle<Msg>, bindings: { tooltipKey?: string; overlayKey?: string; closeKey?: string }): Sub<Msg> {
  const subs: Sub<Msg>[] = [];

  if (bindings.tooltipKey) {
    subs.push(
      createKeyTriggerSub(bindings.tooltipKey, () => {
        handle.forceState('tooltip', { emit: true });
      }),
    );
  }

  if (bindings.overlayKey) {
    subs.push(
      createKeyTriggerSub(bindings.overlayKey, () => {
        handle.forceState('overlay', { emit: true });
      }),
    );
  }

  if (bindings.closeKey) {
    subs.push(
      createKeyTriggerSub(bindings.closeKey, () => {
        handle.dispatch({ type: 'key', key: 'escape' }, { emit: true });
      }),
    );
  }

  return subs.length === 0 ? Sub.none<Msg>() : Sub.batch(...subs);
}

function createKeyTriggerSub<Msg>(expectedKey: string, trigger: () => void): Sub<Msg> {
  const normalizedExpectedKey = normalizeKey(expectedKey);
  return Sub.filter(
    Sub.keyEvent<Msg | undefined>((event: KeyEvent) => {
      if (normalizeKey(event.key) !== normalizedExpectedKey) {
        return undefined;
      }
      trigger();
      return undefined;
    }),
    (msg) => msg !== undefined,
  ) as Sub<Msg>;
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function createOutputEmitter<Msg>() {
  let onData: ((msg: Msg) => void) | null = null;
  const source: StreamSource = {
    onData: (cb) => {
      onData = cb as (msg: Msg) => void;
    },
    teardown: () => {
      onData = null;
    },
  };

  return {
    source,
    push(msg: Msg): void {
      onData?.(msg);
    },
    clear(): void {
      onData = null;
    },
  };
}
