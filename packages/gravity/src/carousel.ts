import { type SpringAnimation, type SpringConfig, spring } from '@celestial/aurora';
import { DEFAULT_SPRING_CONFIG } from './atoms.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { ComponentNode, VNode } from './types.js';

const DEFAULT_SPRING: SpringConfig<number> = DEFAULT_SPRING_CONFIG;

export interface CarouselConfig {
  pages: readonly VNode[];
  activeIndex: number;
  transition?: 'slide' | 'fade' | 'none';
  peekAmount?: number;
  model?: CarouselModel;
}

export interface CarouselModel {
  activeIndex: number;
  targetIndex: number;
  offset: number;
  transition: 'slide' | 'fade' | 'none';
  animation: SpringAnimation<number> | null;
}

export type CarouselMsg =
  | { type: 'carousel-next' }
  | { type: 'carousel-prev' }
  | { type: 'carousel-go-to'; index: number }
  | { type: 'carousel-tick'; now: number };

export function createCarouselModel(activeIndex = 0, transition: CarouselModel['transition'] = 'slide'): CarouselModel {
  return {
    activeIndex,
    targetIndex: activeIndex,
    offset: activeIndex,
    transition,
    animation: null,
  };
}

export function carouselUpdate(msg: CarouselMsg, model: CarouselModel, pageCount: number): CarouselModel {
  if (pageCount <= 0) {
    return {
      ...model,
      activeIndex: 0,
      targetIndex: 0,
      offset: 0,
      animation: null,
    };
  }

  switch (msg.type) {
    case 'carousel-next':
      return startCarouselTransition(model, Math.min(pageCount - 1, model.targetIndex + 1));
    case 'carousel-prev':
      return startCarouselTransition(model, Math.max(0, model.targetIndex - 1));
    case 'carousel-go-to':
      return startCarouselTransition(model, clampIndex(msg.index, pageCount));
    case 'carousel-tick':
      return tickCarousel(model, msg.now);
  }
}

export function carousel(config: CarouselConfig): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const pages = config.pages;
      if (pages.length === 0) {
        return { kind: 'empty' };
      }

      const activeIndex = clampIndex(config.model?.activeIndex ?? config.activeIndex, pages.length);
      const peekAmount = Math.max(0, config.peekAmount ?? 0);
      const mainWidth = Math.max(1, measurementContext.container.cols - peekAmount * 2);
      const children: VNode[] = [];

      if (peekAmount > 0 && activeIndex > 0) {
        children.push({
          kind: 'box',
          width: peekAmount,
          children: [pages[activeIndex - 1]!],
        });
      }

      children.push({
        kind: 'box',
        width: mainWidth,
        children: [pages[activeIndex]!],
      });

      if (peekAmount > 0 && activeIndex < pages.length - 1) {
        children.push({
          kind: 'box',
          width: peekAmount,
          children: [pages[activeIndex + 1]!],
        });
      }

      return {
        kind: 'row',
        children,
      };
    },
  };
}

export function isCarouselAnimating(model: CarouselModel): boolean {
  return model.animation !== null && !model.animation.done();
}

export function getCarouselOffset(model: CarouselModel): number {
  return model.animation ? model.animation.value() : model.offset;
}

function startCarouselTransition(model: CarouselModel, targetIndex: number): CarouselModel {
  if (targetIndex === model.targetIndex && targetIndex === model.activeIndex && model.animation === null) {
    return model;
  }

  if (model.transition === 'none') {
    model.animation?.stop();
    return {
      ...model,
      activeIndex: targetIndex,
      targetIndex,
      offset: targetIndex,
      animation: null,
    };
  }

  const from = getCarouselOffset(model);
  model.animation?.stop();
  const animation = spring(targetIndex, {
    ...DEFAULT_SPRING,
    from,
  });

  return {
    ...model,
    targetIndex,
    offset: from,
    animation,
  };
}

function tickCarousel(model: CarouselModel, now: number): CarouselModel {
  if (!model.animation) {
    return model;
  }

  model.animation.tick(now);
  const offset = model.animation.value();

  if (model.animation.done()) {
    return {
      ...model,
      activeIndex: model.targetIndex,
      offset: model.targetIndex,
      animation: null,
    };
  }

  return {
    ...model,
    offset,
    activeIndex: clampIndex(Math.round(offset), Math.max(model.targetIndex, model.activeIndex) + 1),
  };
}

function clampIndex(index: number, pageCount: number): number {
  return Math.max(0, Math.min(pageCount - 1, index));
}
