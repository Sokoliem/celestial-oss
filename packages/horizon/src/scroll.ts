import { clampFinite, nonNegativeInteger } from './internal.js';
import { type StateUpdateResult, stateUpdateResult } from './state/update.js';

export interface ScrollRegionModel {
  id: string;
  scrollY: number;
  scrollX: number;
  contentHeight: number;
  contentWidth: number;
  viewportHeight: number;
  viewportWidth: number;
}

export type ScrollRegionMsg =
  | { type: 'scroll-up'; amount?: number }
  | { type: 'scroll-down'; amount?: number }
  | { type: 'scroll-left'; amount?: number }
  | { type: 'scroll-right'; amount?: number }
  | { type: 'scroll-to'; y: number; x?: number }
  | { type: 'scroll-page-up' }
  | { type: 'scroll-page-down' }
  | { type: 'scroll-to-top' }
  | { type: 'scroll-to-bottom' }
  | { type: 'set-viewport-size'; height: number; width: number }
  | { type: 'set-content-size'; height: number; width: number };

export function createScrollRegionModel(id: string): ScrollRegionModel {
  return {
    id,
    scrollY: 0,
    scrollX: 0,
    contentHeight: 0,
    contentWidth: 0,
    viewportHeight: 0,
    viewportWidth: 0,
  };
}

export function scrollRegionUpdate(msg: ScrollRegionMsg, model: ScrollRegionModel): ScrollRegionModel {
  const contentHeight = nonNegativeInteger(model.contentHeight);
  const contentWidth = nonNegativeInteger(model.contentWidth);
  const viewportHeight = nonNegativeInteger(model.viewportHeight);
  const viewportWidth = nonNegativeInteger(model.viewportWidth);
  const maxY = Math.max(0, contentHeight - viewportHeight);
  const maxX = Math.max(0, contentWidth - viewportWidth);
  const scrollY = clampFinite(model.scrollY, 0, maxY);
  const scrollX = clampFinite(model.scrollX, 0, maxX);
  const amount = 'amount' in msg ? nonNegativeInteger(msg.amount, 1) : 1;
  switch (msg.type) {
    case 'scroll-up':
      return {
        ...model,
        scrollY: Math.max(0, scrollY - amount),
      };

    case 'scroll-down':
      return {
        ...model,
        scrollY: Math.min(maxY, scrollY + amount),
      };

    case 'scroll-left':
      return {
        ...model,
        scrollX: Math.max(0, scrollX - amount),
      };

    case 'scroll-right':
      return {
        ...model,
        scrollX: Math.min(maxX, scrollX + amount),
      };

    case 'scroll-to':
      return {
        ...model,
        scrollY: clampFinite(msg.y, 0, maxY),
        scrollX: msg.x !== undefined ? clampFinite(msg.x, 0, maxX) : scrollX,
      };

    case 'scroll-page-up':
      return {
        ...model,
        scrollY: Math.max(0, scrollY - viewportHeight),
      };

    case 'scroll-page-down':
      return {
        ...model,
        scrollY: Math.min(maxY, scrollY + viewportHeight),
      };

    case 'scroll-to-top':
      return { ...model, scrollY: 0 };

    case 'scroll-to-bottom':
      return {
        ...model,
        scrollY: maxY,
      };

    case 'set-viewport-size': {
      const nextHeight = nonNegativeInteger(msg.height);
      const nextWidth = nonNegativeInteger(msg.width);
      return {
        ...model,
        viewportHeight: nextHeight,
        viewportWidth: nextWidth,
        scrollY: clampFinite(scrollY, 0, Math.max(0, contentHeight - nextHeight)),
        scrollX: clampFinite(scrollX, 0, Math.max(0, contentWidth - nextWidth)),
      };
    }

    case 'set-content-size': {
      const nextHeight = nonNegativeInteger(msg.height);
      const nextWidth = nonNegativeInteger(msg.width);
      return {
        ...model,
        contentHeight: nextHeight,
        contentWidth: nextWidth,
        scrollY: clampFinite(scrollY, 0, Math.max(0, nextHeight - viewportHeight)),
        scrollX: clampFinite(scrollX, 0, Math.max(0, nextWidth - viewportWidth)),
      };
    }

    default:
      return model;
  }
}

export function scrollRegionUpdateResult(msg: ScrollRegionMsg, model: ScrollRegionModel): StateUpdateResult<ScrollRegionModel> {
  return stateUpdateResult(scrollRegionUpdate(msg, model));
}

export function getScrollY(model: ScrollRegionModel): number {
  return clampFinite(model.scrollY, 0, Math.max(0, nonNegativeInteger(model.contentHeight) - nonNegativeInteger(model.viewportHeight)));
}

export function getScrollX(model: ScrollRegionModel): number {
  return clampFinite(model.scrollX, 0, Math.max(0, nonNegativeInteger(model.contentWidth) - nonNegativeInteger(model.viewportWidth)));
}

export function isScrolledToTop(model: ScrollRegionModel): boolean {
  return getScrollY(model) === 0;
}

export function isScrolledToBottom(model: ScrollRegionModel): boolean {
  const maxScroll = Math.max(0, nonNegativeInteger(model.contentHeight) - nonNegativeInteger(model.viewportHeight));
  return clampFinite(model.scrollY, 0, maxScroll) >= maxScroll;
}

export function getScrollProgress(model: ScrollRegionModel): number {
  const contentHeight = nonNegativeInteger(model.contentHeight);
  const viewportHeight = nonNegativeInteger(model.viewportHeight);
  if (contentHeight <= viewportHeight) return 1;
  const maxScroll = contentHeight - viewportHeight;
  if (maxScroll <= 0) return 1;
  return clampFinite(model.scrollY, 0, maxScroll) / maxScroll;
}

export function extractScrollState(regions: ScrollRegionModel[]): Record<string, { y: number; x: number }> {
  const state: Record<string, { y: number; x: number }> = Object.create(null) as Record<string, { y: number; x: number }>;
  for (const region of regions) {
    if (!region || typeof region.id !== 'string') continue;
    state[region.id] = { y: nonNegativeInteger(region.scrollY), x: nonNegativeInteger(region.scrollX) };
  }
  return state;
}
