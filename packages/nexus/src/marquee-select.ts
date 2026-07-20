import type { HitRegion } from './hitmap.js';

export interface MarqueeSelectState {
  active: boolean;
  hasSelection: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type MarqueeSelectMsg =
  | { type: 'marquee-start'; x: number; y: number }
  | { type: 'marquee-move'; x: number; y: number }
  | { type: 'marquee-end'; x?: number; y?: number }
  | { type: 'marquee-cancel' };

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createMarqueeSelectState(): MarqueeSelectState {
  return {
    active: false,
    hasSelection: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  };
}

export function marqueeSelectUpdate(msg: MarqueeSelectMsg, state: MarqueeSelectState): MarqueeSelectState {
  switch (msg.type) {
    case 'marquee-start':
      return {
        active: true,
        hasSelection: true,
        startX: msg.x,
        startY: msg.y,
        endX: msg.x,
        endY: msg.y,
      };
    case 'marquee-move':
      if (!state.active) {
        return state;
      }
      return {
        ...state,
        endX: msg.x,
        endY: msg.y,
      };
    case 'marquee-end':
      if (!state.active) {
        return state;
      }
      return {
        ...state,
        active: false,
        endX: msg.x ?? state.endX,
        endY: msg.y ?? state.endY,
      };
    case 'marquee-cancel':
      return createMarqueeSelectState();
  }
}

export function getMarqueeRect(state: MarqueeSelectState): MarqueeRect | null {
  if (!state.active && !state.hasSelection) {
    return null;
  }

  const left = Math.min(state.startX, state.endX);
  const right = Math.max(state.startX, state.endX);
  const top = Math.min(state.startY, state.endY);
  const bottom = Math.max(state.startY, state.endY);

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function hitTestMarquee<M>(rect: MarqueeRect, regions: readonly HitRegion<M>[]): HitRegion<M>[] {
  return regions.filter((region) => intersects(rect, region));
}

export function renderMarqueeRect(rect: MarqueeRect): string[] {
  if (rect.width <= 0 || rect.height <= 0) {
    return [];
  }

  if (rect.height === 1) {
    return [rect.width === 1 ? '□' : `┈${'┈'.repeat(Math.max(0, rect.width - 2))}┈`];
  }

  if (rect.width === 1) {
    return ['┊', ...Array.from({ length: Math.max(0, rect.height - 2) }, () => '┊'), '┊'];
  }

  const top = `┌${'┈'.repeat(rect.width - 2)}┐`;
  const middle = `┊${' '.repeat(rect.width - 2)}┊`;
  const bottom = `└${'┈'.repeat(rect.width - 2)}┘`;

  return [top, ...Array.from({ length: rect.height - 2 }, () => middle), bottom];
}

function intersects<M>(rect: MarqueeRect, region: HitRegion<M>): boolean {
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const regionRight = region.x + region.width;
  const regionBottom = region.y + region.height;

  return rect.x < regionRight && rectRight > region.x && rect.y < regionBottom && rectBottom > region.y;
}
