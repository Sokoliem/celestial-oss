import type { HitRegionInfo, MouseEventData, RegionIntent, RegionMetadata } from '@celestial/nebula';
import { resolveMouseHandler } from '@celestial/nebula';

export type RegionRoutePhase = 'capture' | 'target';

export interface RegionRouteLayer {
  readonly id: string;
  readonly blocksBelow?: boolean;
}

export type RegionRouteEvent = Pick<MouseEventData, 'type' | 'button' | 'x' | 'y' | 'ctrl' | 'alt' | 'shift'>;

export interface RegionRouteMatch {
  readonly region: HitRegionInfo;
  readonly handlerTag?: string;
  readonly phase: RegionRoutePhase;
  readonly layer: RegionRouteLayer;
  readonly localX: number;
  readonly localY: number;
  readonly intent?: RegionIntent;
  readonly metadata?: RegionMetadata;
}

export interface RegionRouterOptions {
  readonly getLayer?: (region: HitRegionInfo) => RegionRouteLayer | string | null | undefined;
  readonly canRoute?: (region: HitRegionInfo, event: RegionRouteEvent) => boolean;
  readonly includeHoverRegions?: boolean;
  readonly requireHandler?: boolean;
}

export interface RegionRouter {
  readonly regions: readonly HitRegionInfo[];
  hitTest(x: number, y: number, event?: Partial<RegionRouteEvent>): RegionRouteMatch | null;
  hitTestAll(x: number, y: number, event?: Partial<RegionRouteEvent>): RegionRouteMatch[];
  route(event: RegionRouteEvent, phase?: RegionRoutePhase): RegionRouteMatch | null;
}

function contains(region: HitRegionInfo, x: number, y: number): boolean {
  return x >= region.rect.x && x < region.rect.x + region.rect.width && y >= region.rect.y && y < region.rect.y + region.rect.height;
}

function defaultLayer(region: HitRegionInfo): RegionRouteLayer {
  const scope = region.metadata?.scope;
  if (scope) {
    return { id: scope.split(':', 1)[0] ?? scope };
  }
  return { id: `z:${region.zIndex}` };
}

function normalizeLayer(value: ReturnType<NonNullable<RegionRouterOptions['getLayer']>>, region: HitRegionInfo): RegionRouteLayer {
  if (typeof value === 'string') {
    return { id: value };
  }
  return value ?? defaultLayer(region);
}

function defaultEvent(x: number, y: number, event?: Partial<RegionRouteEvent>): RegionRouteEvent {
  return {
    type: event?.type ?? 'move',
    button: event?.button ?? 'none',
    x,
    y,
    ctrl: event?.ctrl ?? false,
    alt: event?.alt ?? false,
    shift: event?.shift ?? false,
  };
}

function resolveFirstHandler(event: RegionRouteEvent, ...handlers: ReadonlyArray<Parameters<typeof resolveMouseHandler>[0] | undefined>): string | undefined {
  for (const handler of handlers) {
    const resolved = resolveMouseHandler(handler, event);
    if (resolved) return resolved;
  }
  return undefined;
}

export function resolveRegionHandler(region: HitRegionInfo, event: RegionRouteEvent, phase: RegionRoutePhase = 'target'): string | undefined {
  const handlers = region.handlers;
  const capture = phase === 'capture';
  switch (event.type) {
    case 'press':
      if (event.button === 0) {
        return capture
          ? resolveFirstHandler(event, handlers.onClickCapture, handlers.onMouseDownCapture)
          : resolveFirstHandler(event, handlers.onClick, handlers.onMouseDown);
      }
      if (event.button === 2) {
        return capture
          ? resolveFirstHandler(event, handlers.onRightClickCapture, handlers.onMouseDownCapture)
          : resolveFirstHandler(event, handlers.onRightClick, handlers.onMouseDown);
      }
      return capture ? resolveFirstHandler(event, handlers.onMouseDownCapture) : resolveFirstHandler(event, handlers.onMouseDown);
    case 'release':
      return capture ? resolveFirstHandler(event, handlers.onMouseUpCapture) : resolveFirstHandler(event, handlers.onMouseUp);
    case 'move':
      return capture ? resolveFirstHandler(event, handlers.onMouseMoveCapture) : resolveFirstHandler(event, handlers.onMouseMove);
    case 'scroll-up':
    case 'scroll-down':
      return capture ? resolveFirstHandler(event, handlers.onScrollCapture) : resolveFirstHandler(event, handlers.onScroll);
  }
}

function compareTopmost(left: HitRegionInfo, right: HitRegionInfo): number {
  return left.zIndex - right.zIndex;
}

export function createRegionRouter(regions: readonly HitRegionInfo[], options: RegionRouterOptions = {}): RegionRouter {
  const ordered = [...regions].sort(compareTopmost);
  const includeHover = options.includeHoverRegions === true;
  const requireHandler = options.requireHandler !== false;

  function toMatch(region: HitRegionInfo, event: RegionRouteEvent, phase: RegionRoutePhase): RegionRouteMatch | null {
    if (!includeHover && region.isHover) return null;
    if (options.canRoute && !options.canRoute(region, event)) return null;

    const handlerTag = resolveRegionHandler(region, event, phase);
    if (requireHandler && !handlerTag) return null;

    return {
      region,
      handlerTag,
      phase,
      layer: normalizeLayer(options.getLayer?.(region), region),
      localX: event.x - region.rect.x,
      localY: event.y - region.rect.y,
      intent: region.metadata?.intent,
      metadata: region.metadata,
    };
  }

  function hitTestAll(x: number, y: number, event?: Partial<RegionRouteEvent>): RegionRouteMatch[] {
    const resolvedEvent = defaultEvent(x, y, event);
    const matches: RegionRouteMatch[] = [];

    for (let index = ordered.length - 1; index >= 0; index--) {
      const region = ordered[index]!;
      if (!contains(region, x, y)) continue;
      const layer = normalizeLayer(options.getLayer?.(region), region);
      const match = toMatch(region, resolvedEvent, 'target');
      if (match) {
        matches.push(match);
      }
      if (layer.blocksBelow) {
        break;
      }
    }

    return matches;
  }

  return {
    regions: ordered,
    hitTest(x: number, y: number, event?: Partial<RegionRouteEvent>): RegionRouteMatch | null {
      return hitTestAll(x, y, event)[0] ?? null;
    },
    hitTestAll,
    route(event: RegionRouteEvent, phase: RegionRoutePhase = 'target'): RegionRouteMatch | null {
      for (let index = ordered.length - 1; index >= 0; index--) {
        const region = ordered[index]!;
        if (!contains(region, event.x, event.y)) continue;
        const layer = normalizeLayer(options.getLayer?.(region), region);
        const match = toMatch(region, event, phase);
        if (match) return match;
        if (layer.blocksBelow) return null;
      }
      return null;
    },
  };
}
