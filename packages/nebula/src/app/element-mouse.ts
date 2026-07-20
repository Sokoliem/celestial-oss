import type { HitRegionInfo } from '../hit-regions.js';
import { resolveMouseHandler } from '../mouse.js';
import { type ElementMouseEvent, type MouseEventData, type Sub, subKind } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';
import { applySubMap } from './sub-map.js';

export function installElementMouse<Model, M>(ctx: RuntimeContext<Model, M>): void {
  function findTopmostHit(x: number, y: number): HitRegionInfo | null {
    for (let i = ctx.currentHitRegions.length - 1; i >= 0; i--) {
      const r = ctx.currentHitRegions[i]!;
      if (x >= r.rect.x && x < r.rect.x + r.rect.width && y >= r.rect.y && y < r.rect.y + r.rect.height) {
        return r;
      }
    }
    return null;
  }

  function createElementMouseEvent(
    tag: string,
    currentTargetId: string,
    targetId: string,
    phase: ElementMouseEvent['phase'],
    path: readonly string[],
    mouseEv: MouseEventData,
    propagation: { stopped: boolean },
  ): ElementMouseEvent {
    return {
      handlerTag: tag,
      elementId: currentTargetId,
      phase,
      targetId,
      currentTargetId,
      path,
      type: mouseEv.type,
      deltaY: mouseEv.type === 'scroll-up' ? -1 : mouseEv.type === 'scroll-down' ? 1 : 0,
      x: mouseEv.x,
      y: mouseEv.y,
      button: mouseEv.button,
      ctrl: mouseEv.ctrl,
      alt: mouseEv.alt,
      shift: mouseEv.shift,
      stopPropagation() {
        propagation.stopped = true;
      },
      isPropagationStopped() {
        return propagation.stopped;
      },
    };
  }

  function fireElementEvent(
    sub: Sub<M>,
    tag: string,
    currentTargetId: string,
    targetId: string,
    phase: ElementMouseEvent['phase'],
    path: readonly string[],
    mouseEv: MouseEventData,
    propagation: { stopped: boolean },
  ): void {
    ctx.combinatorIdCounter = 0;
    ctx.dispatchElementMouseEvent(sub, createElementMouseEvent(tag, currentTargetId, targetId, phase, path, mouseEv, propagation));
  }

  function getCaptureHandlerTag(hit: HitRegionInfo, mouseEv: MouseEventData): string | undefined {
    if (mouseEv.type === 'press') {
      if (mouseEv.button === 0)
        return resolveMouseHandler(hit.handlers.onClickCapture, mouseEv) ?? resolveMouseHandler(hit.handlers.onMouseDownCapture, mouseEv);
      if (mouseEv.button === 2)
        return resolveMouseHandler(hit.handlers.onRightClickCapture, mouseEv) ?? resolveMouseHandler(hit.handlers.onMouseDownCapture, mouseEv);
      return resolveMouseHandler(hit.handlers.onMouseDownCapture, mouseEv);
    }
    if (mouseEv.type === 'release') return resolveMouseHandler(hit.handlers.onMouseUpCapture, mouseEv);
    if (mouseEv.type === 'move') return resolveMouseHandler(hit.handlers.onMouseMoveCapture, mouseEv);
    if (mouseEv.type === 'scroll-up' || mouseEv.type === 'scroll-down') return resolveMouseHandler(hit.handlers.onScrollCapture, mouseEv);
    return undefined;
  }

  function getTargetHandlerTag(hit: HitRegionInfo, mouseEv: MouseEventData): string | undefined {
    if (mouseEv.type === 'press') {
      if (mouseEv.button === 0) return resolveMouseHandler(hit.handlers.onClick, mouseEv) ?? resolveMouseHandler(hit.handlers.onMouseDown, mouseEv);
      if (mouseEv.button === 2) return resolveMouseHandler(hit.handlers.onRightClick, mouseEv) ?? resolveMouseHandler(hit.handlers.onMouseDown, mouseEv);
      return resolveMouseHandler(hit.handlers.onMouseDown, mouseEv);
    }
    if (mouseEv.type === 'release') return resolveMouseHandler(hit.handlers.onMouseUp, mouseEv);
    if (mouseEv.type === 'move') return resolveMouseHandler(hit.handlers.onMouseMove, mouseEv);
    if (mouseEv.type === 'scroll-up' || mouseEv.type === 'scroll-down') return resolveMouseHandler(hit.handlers.onScroll, mouseEv);
    return undefined;
  }

  function findEventPathHit(path: readonly string[]): HitRegionInfo | null {
    if (path.length === 0) return null;
    for (let i = ctx.currentHitRegions.length - 1; i >= 0; i--) {
      const region = ctx.currentHitRegions[i]!;
      if (!region.isHover && region.eventPath.length === path.length && region.eventPath.every((id, index) => id === path[index])) {
        return region;
      }
    }
    return null;
  }

  ctx.dispatchAutoElementMouse = (sub: Sub<M>, mouseEv: MouseEventData): void => {
    if (ctx.currentHitRegions.length === 0) {
      if (ctx.lastHoveredId !== null && ctx.lastHoveredRegion) {
        if (ctx.lastHoveredRegion.handlers.onMouseLeave) {
          fireElementEvent(
            sub,
            ctx.lastHoveredRegion.handlers.onMouseLeave,
            ctx.lastHoveredRegion.id,
            ctx.lastHoveredRegion.id,
            'target',
            ctx.lastHoveredRegion.eventPath,
            mouseEv,
            { stopped: false },
          );
        }
        ctx.lastHoveredId = null;
        ctx.lastHoveredRegion = null;
      }
      return;
    }

    const hit = findTopmostHit(mouseEv.x, mouseEv.y);
    const currentId = hit?.id ?? null;

    if (currentId !== ctx.lastHoveredId) {
      if (ctx.lastHoveredId !== null && ctx.lastHoveredRegion?.handlers.onMouseLeave) {
        fireElementEvent(
          sub,
          ctx.lastHoveredRegion.handlers.onMouseLeave,
          ctx.lastHoveredRegion.id,
          ctx.lastHoveredRegion.id,
          'target',
          ctx.lastHoveredRegion.eventPath,
          mouseEv,
          { stopped: false },
        );
      }
      if (hit?.handlers.onMouseEnter) {
        fireElementEvent(sub, hit.handlers.onMouseEnter, hit.id, hit.id, 'target', hit.eventPath, mouseEv, { stopped: false });
      }
      ctx.lastHoveredId = currentId;
      ctx.lastHoveredRegion = hit ?? null;
    }

    if (!hit) return;
    const path = hit.eventPath;
    if (path.length === 0) return;

    const propagation = { stopped: false };
    for (let i = 0; i < path.length - 1; i++) {
      const currentTargetId = path[i]!;
      const region = findEventPathHit(path.slice(0, i + 1));
      if (!region) continue;
      const handlerTag = getCaptureHandlerTag(region, mouseEv);
      if (!handlerTag) continue;
      fireElementEvent(sub, handlerTag, currentTargetId, hit.id, 'capture', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }

    const targetHandlerTag = getTargetHandlerTag(hit, mouseEv);
    if (targetHandlerTag) {
      fireElementEvent(sub, targetHandlerTag, hit.id, hit.id, 'target', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }

    for (let i = path.length - 2; i >= 0; i--) {
      const currentTargetId = path[i]!;
      const region = findEventPathHit(path.slice(0, i + 1));
      if (!region) continue;
      const handlerTag = getTargetHandlerTag(region, mouseEv);
      if (!handlerTag) continue;
      fireElementEvent(sub, handlerTag, currentTargetId, hit.id, 'bubble', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }
  };

  ctx.dispatchElementMouseEvent = (sub: Sub<M>, event: ElementMouseEvent): void => {
    const kind = subKind(sub);
    switch (kind.kind) {
      case 'elementMouse':
        ctx.dispatchFn(kind.toMsg(event));
        break;
      case 'batch':
        for (const s of kind.subs) ctx.dispatchElementMouseEvent(s, event);
        break;
      case 'map':
        ctx.dispatchElementMouseEvent(applySubMap(kind.sub, kind.fn), event);
        break;
      case 'debounce':
      case 'throttle':
      case 'filter':
      case 'distinct':
        ctx.walkCombinator(kind, (inner) => ctx.dispatchElementMouseEvent(inner, event));
        break;
      default:
        break;
    }
  };
}
