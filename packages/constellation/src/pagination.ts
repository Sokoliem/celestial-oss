import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface PaginationTokens {
  text: Color;
  active: Color;
  muted: Color;
  textSoft: Color;
  border: Color;
}

export const paginationContract: TokenContract<PaginationTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  active: (t: SemanticTheme) => t.colors.interactive,
  muted: (t: SemanticTheme) => t.colors.muted,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  border: (t: SemanticTheme) => t.colors.border,
};

export interface PaginationConfig {
  total: number;
  pageSize: number;
  current?: number;
  onChange?: (page: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface PaginationModel {
  current: number;
  totalPages: number;
  hovered?: 'prev' | 'next' | number | null;
}
export type PaginationMsg =
  | Msg<'prev'>
  | Msg<'next'>
  | Msg<'goto', { page: number }>
  | Msg<'hover', { target: 'prev' | 'next' | number }>
  | Msg<'leave'>
  | Msg<'noop'>;

export function pagination(config: PaginationConfig): ComponentDescriptor<PaginationModel, PaginationMsg> {
  if (!Number.isFinite(config.total) || config.total < 0) throw new Error('Pagination total must be a finite, non-negative number.');
  if (!Number.isFinite(config.pageSize) || config.pageSize <= 0) throw new Error('Pagination pageSize must be a finite number greater than zero.');
  const interactionId = generateFocusGroupId('pagination');
  const prevTag = `${interactionId}:prev`;
  const nextTag = `${interactionId}:next`;
  const pageTag = `${interactionId}:page`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  /** Compute totalPages dynamically from current config values. */
  function computeTotalPages(): number {
    return Math.max(1, Math.ceil(config.total / config.pageSize));
  }

  return {
    init(): [PaginationModel, Cmd<PaginationMsg>] {
      const totalPages = computeTotalPages();
      return [{ current: Math.max(1, Math.min(totalPages, config.current ?? 1)), totalPages }, Cmd.none()];
    },
    update(msg: PaginationMsg, model: PaginationModel): [PaginationModel, Cmd<PaginationMsg>] {
      const totalPages = computeTotalPages();
      switch (msg.type) {
        case 'prev': {
          if (model.current <= 1) return [model, Cmd.none()];
          const p = model.current - 1;
          config.onChange?.(p);
          return [{ ...model, current: p, totalPages }, Cmd.none()];
        }
        case 'next': {
          if (model.current >= totalPages) return [model, Cmd.none()];
          const p = model.current + 1;
          config.onChange?.(p);
          return [{ ...model, current: p, totalPages }, Cmd.none()];
        }
        case 'goto': {
          const page = Math.max(1, Math.min(totalPages, msg.page));
          if (page === model.current) return [model, Cmd.none()];
          config.onChange?.(page);
          return [{ ...model, current: page, totalPages }, Cmd.none()];
        }
        case 'hover':
          return [{ ...model, hovered: msg.target }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: null }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: PaginationModel): VNode {
      const tokens = useTokens(paginationContract, config, 'Pagination');
      const totalPages = computeTotalPages();
      const activeStyle = style({ color: tokens.active, bold: true });
      const dimStyle = style({ dim: true, color: tokens.muted });
      const pageStyle = style({ color: tokens.textSoft });
      const arrowStyle = style({ color: tokens.text });
      const hoverStyle = style({ color: tokens.active, bold: true, reverse: true });
      const parts: VNode[] = [
        event(
          `${interactionId}:prev`,
          text(model.current > 1 ? '< ' : '  ', model.hovered === 'prev' ? hoverStyle : model.current > 1 ? arrowStyle : dimStyle),
          model.current > 1 ? { onClick: prevTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag } : {},
          {
            label: 'Previous page',
            intent: 'navigate',
            affordances: model.current > 1 ? ['click'] : [],
            cursor: model.current > 1 ? 'pointer' : undefined,
            keyboardHint: 'Left',
          },
        ),
      ];
      let leftEllipsisShown = false;
      let rightEllipsisShown = false;
      for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && i > 3 && i < totalPages - 1 && Math.abs(i - model.current) > 1) {
          if (i < model.current && !leftEllipsisShown) {
            parts.push(text('... ', dimStyle));
            leftEllipsisShown = true;
          }
          if (i > model.current && !rightEllipsisShown) {
            parts.push(text('... ', dimStyle));
            rightEllipsisShown = true;
          }
          continue;
        }
        parts.push(
          event(
            `${interactionId}:page:${i}`,
            text(`${i} `, model.hovered === i ? hoverStyle : i === model.current ? activeStyle : pageStyle),
            i === model.current ? {} : { onClick: pageTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            {
              label: `Page ${i}`,
              intent: 'navigate',
              affordances: i === model.current ? [] : ['click'],
              cursor: i === model.current ? undefined : 'pointer',
            },
          ),
        );
      }
      parts.push(
        event(
          `${interactionId}:next`,
          text(model.current < totalPages ? '>' : ' ', model.hovered === 'next' ? hoverStyle : model.current < totalPages ? arrowStyle : dimStyle),
          model.current < totalPages ? { onClick: nextTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag } : {},
          {
            label: 'Next page',
            intent: 'navigate',
            affordances: model.current < totalPages ? ['click'] : [],
            cursor: model.current < totalPages ? 'pointer' : undefined,
            keyboardHint: 'Right',
          },
        ),
      );
      return row(...parts);
    },
    subscriptions(): Sub<PaginationMsg> {
      return Sub.batch<PaginationMsg>(
        Sub.elementMouse((mouseEvent) => {
          if (mouseEvent.handlerTag === prevTag && mouseEvent.elementId === `${interactionId}:prev`) return { type: 'prev' };
          if (mouseEvent.handlerTag === nextTag && mouseEvent.elementId === `${interactionId}:next`) return { type: 'next' };
          if (mouseEvent.handlerTag === pageTag && mouseEvent.elementId.startsWith(`${interactionId}:page:`)) {
            return { type: 'goto', page: Number(mouseEvent.elementId.slice(`${interactionId}:page:`.length)) };
          }
          if (mouseEvent.handlerTag === hoverTag) {
            if (mouseEvent.elementId === `${interactionId}:prev`) return { type: 'hover', target: 'prev' };
            if (mouseEvent.elementId === `${interactionId}:next`) return { type: 'hover', target: 'next' };
            if (mouseEvent.elementId.startsWith(`${interactionId}:page:`)) {
              return { type: 'hover', target: Number(mouseEvent.elementId.slice(`${interactionId}:page:`.length)) };
            }
          }
          if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
          return { type: 'noop' };
        }),
        Sub.key('left', { type: 'prev' }),
        Sub.key('right', { type: 'next' }),
      );
    },
  };
}
