import type { HitRegionInfo } from '../hit-regions.js';
import { usesAutomaticHoverFeedback } from '../interaction-feedback.js';
import { resolveMouseHandler } from '../mouse.js';
import type { ElementMouseEvent, MouseEventData, Sub } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';
import { walkSubscriptionLeaves } from './subscription-walk.js';

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
    currentTarget: HitRegionInfo,
    targetId: string,
    phase: ElementMouseEvent['phase'],
    path: readonly string[],
    mouseEv: MouseEventData,
    propagation: { stopped: boolean },
  ): ElementMouseEvent {
    const targetRect = currentTarget.layoutRect ?? currentTarget.rect;
    return {
      handlerTag: tag,
      elementId: currentTarget.id,
      phase,
      targetId,
      currentTargetId: currentTarget.id,
      path,
      type: mouseEv.type,
      deltaY: mouseEv.type === 'scroll-up' ? -1 : mouseEv.type === 'scroll-down' ? 1 : 0,
      x: mouseEv.x,
      y: mouseEv.y,
      localX: mouseEv.x - targetRect.x,
      localY: mouseEv.y - targetRect.y,
      currentTargetRect: targetRect,
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
    currentTarget: HitRegionInfo,
    targetId: string,
    phase: ElementMouseEvent['phase'],
    path: readonly string[],
    mouseEv: MouseEventData,
    propagation: { stopped: boolean },
  ): void {
    ctx.dispatchElementMouseEvent(sub, createElementMouseEvent(tag, currentTarget, targetId, phase, path, mouseEv, propagation));
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
        const needsFeedbackRender = usesAutomaticHoverFeedback(ctx.lastHoveredRegion);
        if (ctx.lastHoveredRegion.handlers.onMouseLeave) {
          fireElementEvent(
            sub,
            ctx.lastHoveredRegion.handlers.onMouseLeave,
            ctx.lastHoveredRegion,
            ctx.lastHoveredRegion.id,
            'target',
            ctx.lastHoveredRegion.eventPath,
            mouseEv,
            { stopped: false },
          );
        }
        ctx.lastHoveredId = null;
        ctx.lastHoveredRegion = null;
        if (needsFeedbackRender) ctx.scheduleRender();
      }
      return;
    }

    const hit = findTopmostHit(mouseEv.x, mouseEv.y);
    const currentId = hit?.id ?? null;

    if (currentId !== ctx.lastHoveredId) {
      const needsFeedbackRender =
        usesAutomaticHoverFeedback(ctx.lastHoveredRegion) || usesAutomaticHoverFeedback(hit);
      if (ctx.lastHoveredId !== null && ctx.lastHoveredRegion?.handlers.onMouseLeave) {
        fireElementEvent(
          sub,
          ctx.lastHoveredRegion.handlers.onMouseLeave,
          ctx.lastHoveredRegion,
          ctx.lastHoveredRegion.id,
          'target',
          ctx.lastHoveredRegion.eventPath,
          mouseEv,
          { stopped: false },
        );
      }
      if (hit?.handlers.onMouseEnter) {
        fireElementEvent(sub, hit.handlers.onMouseEnter, hit, hit.id, 'target', hit.eventPath, mouseEv, { stopped: false });
      }
      ctx.lastHoveredId = currentId;
      ctx.lastHoveredRegion = hit ?? null;
      if (needsFeedbackRender) ctx.scheduleRender();
    }

    if (!hit) return;
    const path = hit.eventPath;
    if (path.length === 0) return;

    const propagation = { stopped: false };
    for (let i = 0; i < path.length - 1; i++) {
      const region = findEventPathHit(path.slice(0, i + 1));
      if (!region) continue;
      const handlerTag = getCaptureHandlerTag(region, mouseEv);
      if (!handlerTag) continue;
      fireElementEvent(sub, handlerTag, region, hit.id, 'capture', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }

    const targetHandlerTag = getTargetHandlerTag(hit, mouseEv);
    if (targetHandlerTag) {
      fireElementEvent(sub, targetHandlerTag, hit, hit.id, 'target', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }

    for (let i = path.length - 2; i >= 0; i--) {
      const region = findEventPathHit(path.slice(0, i + 1));
      if (!region) continue;
      const handlerTag = getTargetHandlerTag(region, mouseEv);
      if (!handlerTag) continue;
      fireElementEvent(sub, handlerTag, region, hit.id, 'bubble', path, mouseEv, propagation);
      if (propagation.stopped) return;
    }
  };

  ctx.dispatchElementMouseEvent = (sub: Sub<M>, event: ElementMouseEvent): void => {
    walkSubscriptionLeaves(ctx, sub, 'subscriptions', (kind, emit) => {
      if (kind.kind === 'elementMouse') emit(kind.toMsg(event));
    });
  };
}
