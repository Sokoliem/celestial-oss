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
  switch (msg.type) {
    case 'scroll-up':
      return {
        ...model,
        scrollY: Math.max(0, model.scrollY - (msg.amount ?? 1)),
      };

    case 'scroll-down':
      return {
        ...model,
        scrollY: Math.min(Math.max(0, model.contentHeight - model.viewportHeight), model.scrollY + (msg.amount ?? 1)),
      };

    case 'scroll-left':
      return {
        ...model,
        scrollX: Math.max(0, model.scrollX - (msg.amount ?? 1)),
      };

    case 'scroll-right':
      return {
        ...model,
        scrollX: Math.min(Math.max(0, model.contentWidth - model.viewportWidth), model.scrollX + (msg.amount ?? 1)),
      };

    case 'scroll-to':
      return {
        ...model,
        scrollY: Math.max(0, Math.min(msg.y, model.contentHeight - model.viewportHeight)),
        scrollX: msg.x !== undefined ? Math.max(0, Math.min(msg.x, model.contentWidth - model.viewportWidth)) : model.scrollX,
      };

    case 'scroll-page-up':
      return {
        ...model,
        scrollY: Math.max(0, model.scrollY - model.viewportHeight),
      };

    case 'scroll-page-down':
      return {
        ...model,
        scrollY: Math.min(Math.max(0, model.contentHeight - model.viewportHeight), model.scrollY + model.viewportHeight),
      };

    case 'scroll-to-top':
      return { ...model, scrollY: 0 };

    case 'scroll-to-bottom':
      return {
        ...model,
        scrollY: Math.max(0, model.contentHeight - model.viewportHeight),
      };

    case 'set-viewport-size':
      return {
        ...model,
        viewportHeight: msg.height,
        viewportWidth: msg.width,
      };

    case 'set-content-size':
      return {
        ...model,
        contentHeight: msg.height,
        contentWidth: msg.width,
      };

    default:
      return model;
  }
}

export function scrollRegionUpdateResult(msg: ScrollRegionMsg, model: ScrollRegionModel): StateUpdateResult<ScrollRegionModel> {
  return stateUpdateResult(scrollRegionUpdate(msg, model));
}

export function getScrollY(model: ScrollRegionModel): number {
  return model.scrollY;
}

export function getScrollX(model: ScrollRegionModel): number {
  return model.scrollX;
}

export function isScrolledToTop(model: ScrollRegionModel): boolean {
  return model.scrollY === 0;
}

export function isScrolledToBottom(model: ScrollRegionModel): boolean {
  return model.scrollY >= Math.max(0, model.contentHeight - model.viewportHeight);
}

export function getScrollProgress(model: ScrollRegionModel): number {
  if (model.contentHeight <= model.viewportHeight) return 1;
  const maxScroll = model.contentHeight - model.viewportHeight;
  if (maxScroll <= 0) return 1;
  return model.scrollY / maxScroll;
}

export function extractScrollState(regions: ScrollRegionModel[]): Record<string, { y: number; x: number }> {
  const state: Record<string, { y: number; x: number }> = {};
  for (const region of regions) {
    state[region.id] = { y: region.scrollY, x: region.scrollX };
  }
  return state;
}
