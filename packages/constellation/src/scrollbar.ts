import {
  type Color,
  ensureReadableColor,
  type SemanticTheme,
  scrollbarGlyphs,
  style,
  type ThemeInput,
  type TokenContract,
} from '@celestial/core/corona';
import {
  Cmd,
  column,
  event,
  type Msg,
  row,
  setVNodeMeta,
  Sub,
  type ThemeContext,
  text,
  type VNode,
} from '@celestial/core/nebula';
import { clampRange, nonNegativeInteger, wheelDirection } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

export interface ScrollbarTokens {
  track: Color;
  thumb: Color;
  thumbHover: Color;
  thumbActive: Color;
  thumbFocus: Color;
}

export const scrollbarContract: TokenContract<ScrollbarTokens> = {
  track: (theme: SemanticTheme) =>
    ensureReadableColor(theme.colors.muted, [theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surfaceRaised], { minimum: 3 }),
  thumb: (theme: SemanticTheme) =>
    ensureReadableColor(theme.colors.border, [theme.colors.surface, theme.colors.surfaceAlt, theme.colors.surfaceRaised], { minimum: 3 }),
  thumbHover: (theme: SemanticTheme) => theme.colors.borderHover,
  thumbActive: (theme: SemanticTheme) => theme.colors.borderActive,
  thumbFocus: (theme: SemanticTheme) => theme.colors.tones.accent,
};

export type ScrollbarOrientation = 'vertical' | 'horizontal';

export interface ScrollbarConfig {
  id?: string;
  label?: string;
  total: number;
  viewport: number;
  trackLength?: number;
  scroll?: number;
  step?: number;
  orientation?: ScrollbarOrientation;
  focused?: boolean;
  onScroll?: (scroll: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ScrollbarMetrics {
  needsScroll: boolean;
  total: number;
  viewport: number;
  trackLength: number;
  maxOffset: number;
  scroll: number;
  thumbSize: number;
  thumbOffset: number;
}

export interface ScrollbarDrag {
  pointerStart: number;
  thumbStart: number;
  scrollStart: number;
}

export interface ScrollbarModel {
  total: number;
  viewport: number;
  trackLength: number;
  scroll: number;
  focused: boolean;
  hoveredCell: number | null;
  drag: ScrollbarDrag | null;
}

export type ScrollbarMsg =
  | Msg<'sb-focus'>
  | Msg<'sb-blur'>
  | Msg<'sb-hover', { cell: number }>
  | Msg<'sb-leave', { cell: number }>
  | Msg<'sb-press', { cell: number; pointer: number }>
  | Msg<'sb-drag', { pointer: number }>
  | Msg<'sb-release'>
  | Msg<'sb-cancel'>
  | Msg<'sb-wheel', { direction: -1 | 0 | 1 }>
  | Msg<'sb-arrow', { direction: -1 | 1 }>
  | Msg<'sb-page', { direction: -1 | 1 }>
  | Msg<'sb-home'>
  | Msg<'sb-end'>
  | Msg<'sb-set-scroll', { scroll: number }>
  | Msg<'sb-sync-geometry', { total: number; viewport: number; trackLength?: number }>
  | Msg<'noop'>;

function safeInteger(value: number, fallback: number, max: number): number {
  return Math.round(clampRange(value, 0, max, fallback));
}

export function getScrollbarMetrics(
  total: number,
  viewport: number,
  trackLength: number = viewport,
  scroll = 0,
): ScrollbarMetrics {
  const safeTotal = nonNegativeInteger(total);
  const safeViewport = nonNegativeInteger(viewport);
  const safeTrackLength = nonNegativeInteger(trackLength, safeViewport);
  const maxOffset = Math.max(0, safeTotal - safeViewport);
  const safeScroll = safeInteger(scroll, 0, maxOffset);
  const needsScroll = maxOffset > 0 && safeTrackLength > 0;

  if (!needsScroll) {
    return {
      needsScroll,
      total: safeTotal,
      viewport: safeViewport,
      trackLength: safeTrackLength,
      maxOffset,
      scroll: 0,
      thumbSize: safeTrackLength,
      thumbOffset: 0,
    };
  }

  const ratio = safeTotal === 0 ? 1 : Math.min(1, safeViewport / safeTotal);
  const thumbSize = Math.max(1, Math.min(safeTrackLength, Math.round(ratio * safeTrackLength)));
  const thumbTravel = Math.max(0, safeTrackLength - thumbSize);
  const thumbOffset = thumbTravel === 0 ? 0 : Math.round((safeScroll / maxOffset) * thumbTravel);

  return {
    needsScroll,
    total: safeTotal,
    viewport: safeViewport,
    trackLength: safeTrackLength,
    maxOffset,
    scroll: safeScroll,
    thumbSize,
    thumbOffset,
  };
}

function notifyScroll(config: ScrollbarConfig, scroll: number): void {
  try {
    config.onScroll?.(scroll);
  } catch {
    // Host callbacks are observational and cannot corrupt the Elm update loop.
  }
}

export function scrollbar(config: ScrollbarConfig): ComponentDescriptor<ScrollbarModel, ScrollbarMsg> {
  const interactionId = config.id ?? 'scrollbar';
  const orientation = config.orientation ?? 'vertical';
  const step = Math.max(1, nonNegativeInteger(config.step, 3));
  const pressTag = `${interactionId}:press`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const scrollTag = `${interactionId}:scroll`;

  function metrics(model: ScrollbarModel): ScrollbarMetrics {
    return getScrollbarMetrics(model.total, model.viewport, model.trackLength, model.scroll);
  }

  function withScroll(model: ScrollbarModel, value: number, notify = true): ScrollbarModel {
    const current = metrics(model);
    const scroll = safeInteger(value, current.scroll, current.maxOffset);
    if (scroll === current.scroll && model.scroll === current.scroll) return model;
    if (notify) notifyScroll(config, scroll);
    return { ...model, scroll };
  }

  function cancelDrag(model: ScrollbarModel): ScrollbarModel {
    if (!model.drag) return model;
    return { ...withScroll(model, model.drag.scrollStart), drag: null };
  }

  return {
    init(): [ScrollbarModel, Cmd<ScrollbarMsg>] {
      const initial = getScrollbarMetrics(config.total, config.viewport, config.trackLength, config.scroll);
      return [
        {
          total: initial.total,
          viewport: initial.viewport,
          trackLength: initial.trackLength,
          scroll: initial.scroll,
          focused: config.focused ?? false,
          hoveredCell: null,
          drag: null,
        },
        Cmd.none(),
      ];
    },

    update(message: ScrollbarMsg, model: ScrollbarModel): [ScrollbarModel, Cmd<ScrollbarMsg>] {
      switch (message.type) {
        case 'sb-focus':
          return [model.focused ? model : { ...model, focused: true }, Cmd.none()];
        case 'sb-blur': {
          const next = cancelDrag(model);
          return [{ ...next, focused: false, hoveredCell: null }, Cmd.none()];
        }
        case 'sb-hover': {
          const cell = safeInteger(message.cell, 0, Math.max(0, model.trackLength - 1));
          return [model.hoveredCell === cell ? model : { ...model, hoveredCell: cell }, Cmd.none()];
        }
        case 'sb-leave':
          return [model.hoveredCell === message.cell ? { ...model, hoveredCell: null } : model, Cmd.none()];
        case 'sb-press': {
          const current = metrics(model);
          if (!current.needsScroll) return [{ ...model, focused: true, drag: null }, Cmd.none()];
          const cell = safeInteger(message.cell, 0, current.trackLength - 1);
          const onThumb = cell >= current.thumbOffset && cell < current.thumbOffset + current.thumbSize;
          if (onThumb) {
            return [
              {
                ...model,
                focused: true,
                hoveredCell: cell,
                drag: {
                  pointerStart: Number.isFinite(message.pointer) ? message.pointer : 0,
                  thumbStart: current.thumbOffset,
                  scrollStart: current.scroll,
                },
              },
              Cmd.none(),
            ];
          }
          const direction = cell < current.thumbOffset ? -1 : 1;
          return [{ ...withScroll(model, current.scroll + direction * current.viewport), focused: true, drag: null }, Cmd.none()];
        }
        case 'sb-drag': {
          if (!model.drag) return [model, Cmd.none()];
          const current = metrics(model);
          const thumbTravel = Math.max(0, current.trackLength - current.thumbSize);
          if (thumbTravel === 0) return [model, Cmd.none()];
          const pointer = Number.isFinite(message.pointer) ? message.pointer : model.drag.pointerStart;
          const targetThumb = safeInteger(model.drag.thumbStart + pointer - model.drag.pointerStart, model.drag.thumbStart, thumbTravel);
          const next = Math.round((targetThumb / thumbTravel) * current.maxOffset);
          return [withScroll(model, next), Cmd.none()];
        }
        case 'sb-release':
          return [model.drag ? { ...model, drag: null } : model, Cmd.none()];
        case 'sb-cancel':
          return [cancelDrag(model), Cmd.none()];
        case 'sb-wheel':
          return [message.direction === 0 ? model : withScroll(model, model.scroll + message.direction * step), Cmd.none()];
        case 'sb-arrow':
          return [withScroll(model, model.scroll + message.direction), Cmd.none()];
        case 'sb-page':
          return [withScroll(model, model.scroll + message.direction * Math.max(1, model.viewport)), Cmd.none()];
        case 'sb-home':
          return [withScroll(model, 0), Cmd.none()];
        case 'sb-end':
          return [withScroll(model, metrics(model).maxOffset), Cmd.none()];
        case 'sb-set-scroll':
          return [withScroll(model, message.scroll, false), Cmd.none()];
        case 'sb-sync-geometry': {
          const next = getScrollbarMetrics(message.total, message.viewport, message.trackLength, model.scroll);
          return [
            {
              ...model,
              total: next.total,
              viewport: next.viewport,
              trackLength: next.trackLength,
              scroll: next.scroll,
              hoveredCell: model.hoveredCell !== null && model.hoveredCell < next.trackLength ? model.hoveredCell : null,
              drag: null,
            },
            Cmd.none(),
          ];
        }
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: ScrollbarModel): VNode {
      const tokens = useTokens(scrollbarContract, config, 'Scrollbar');
      const current = metrics(model);
      const cells: VNode[] = [];

      for (let cell = 0; cell < current.trackLength; cell++) {
        const onThumb = cell >= current.thumbOffset && cell < current.thumbOffset + current.thumbSize;
        const hovered = model.hoveredCell === cell;
        const active = model.drag !== null && onThumb;
        const cellColor = active
          ? tokens.thumbActive
          : onThumb && hovered
            ? tokens.thumbHover
            : onThumb && model.focused
              ? tokens.thumbFocus
              : onThumb
                ? tokens.thumb
                : tokens.track;
        const glyph = onThumb
          ? active
            ? scrollbarGlyphs.thumbActive
            : hovered
              ? scrollbarGlyphs.thumbHover
              : scrollbarGlyphs.thumbIdle
          : scrollbarGlyphs.track;
        const handlers = current.needsScroll
          ? { onMouseDown: pressTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag, onScroll: scrollTag }
          : {};
        cells.push(
          event(`${interactionId}:cell:${cell}`, text(glyph, style({ color: cellColor, dim: !onThumb })), handlers, {
            label: `${config.label ?? 'Scrollbar'} cell ${cell + 1}`,
            intent: 'scroll',
            affordances: current.needsScroll ? ['hover', 'click', 'drag', 'scroll'] : [],
            cursor: current.needsScroll ? (onThumb ? (model.drag ? 'grabbing' : 'grab') : 'pointer') : 'default',
          }),
        );
      }

      const node = orientation === 'vertical' ? column(...cells) : row(...cells);
      setVNodeMeta(node, {
        testId: interactionId,
        a11y: {
          role: 'slider',
          label: config.label ?? (orientation === 'vertical' ? 'Vertical scrollbar' : 'Horizontal scrollbar'),
          disabled: !current.needsScroll,
          valueMin: 0,
          valueMax: current.maxOffset,
          valueNow: current.scroll,
        },
      });
      return node;
    },

    subscriptions(model: ScrollbarModel): Sub<ScrollbarMsg> {
      const pointer = Sub.elementMouse<ScrollbarMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:cell:`)) return { type: 'noop' };
        const cell = Number(mouseEvent.elementId.slice(`${interactionId}:cell:`.length));
        if (!Number.isSafeInteger(cell)) return { type: 'noop' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'sb-hover', cell };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'sb-leave', cell };
        if (mouseEvent.handlerTag === pressTag) {
          return { type: 'sb-press', cell, pointer: orientation === 'vertical' ? mouseEvent.y : mouseEvent.x };
        }
        if (mouseEvent.handlerTag === scrollTag) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction === 0 ? { type: 'noop' } : { type: 'sb-wheel', direction };
        }
        return { type: 'noop' };
      });
      const subscriptions: Sub<ScrollbarMsg>[] = [pointer];

      if (model.drag) {
        subscriptions.push(
          Sub.mouse<ScrollbarMsg>((mouseEvent) => {
            if (mouseEvent.type === 'release') return { type: 'sb-release' };
            if (mouseEvent.type === 'move') return { type: 'sb-drag', pointer: orientation === 'vertical' ? mouseEvent.y : mouseEvent.x };
            return { type: 'noop' };
          }),
          Sub.key('escape', { type: 'sb-cancel' }),
        );
      }

      if (model.focused) {
        subscriptions.push(
          Sub.key(orientation === 'vertical' ? 'up' : 'left', { type: 'sb-arrow', direction: -1 }),
          Sub.key(orientation === 'vertical' ? 'down' : 'right', { type: 'sb-arrow', direction: 1 }),
          Sub.key('pageup', { type: 'sb-page', direction: -1 }),
          Sub.key('pagedown', { type: 'sb-page', direction: 1 }),
          Sub.key('home', { type: 'sb-home' }),
          Sub.key('end', { type: 'sb-end' }),
        );
      }

      return Sub.batch(...subscriptions);
    },
  };
}
