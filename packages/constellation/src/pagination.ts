import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { clampRange } from './internal.js';
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
  const quotient = config.total / config.pageSize;
  const totalPages = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Number.isFinite(quotient) ? Math.ceil(quotient) : Number.MAX_SAFE_INTEGER));
  const interactionId = generateFocusGroupId('pagination');
  const prevTag = `${interactionId}:prev`;
  const nextTag = `${interactionId}:next`;
  const pageTag = `${interactionId}:page`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  function normalizePage(page: number, fallback = 1): number {
    return Math.trunc(clampRange(page, 1, totalPages, fallback));
  }

  function visiblePages(current: number): Array<number | 'ellipsis'> {
    const candidates = new Set<number>();
    for (const page of [1, 2, 3, current - 1, current, current + 1, totalPages - 1, totalPages]) {
      if (page >= 1 && page <= totalPages) candidates.add(page);
    }
    const pages = [...candidates].sort((a, b) => a - b);
    const result: Array<number | 'ellipsis'> = [];
    for (const page of pages) {
      const previous = result[result.length - 1];
      if (typeof previous === 'number' && page - previous > 1) result.push('ellipsis');
      result.push(page);
    }
    return result;
  }

  return {
    init(): [PaginationModel, Cmd<PaginationMsg>] {
      return [{ current: normalizePage(config.current ?? 1), totalPages }, Cmd.none()];
    },
    update(msg: PaginationMsg, model: PaginationModel): [PaginationModel, Cmd<PaginationMsg>] {
      const current = normalizePage(model.current);
      switch (msg.type) {
        case 'prev': {
          if (current <= 1) return [{ ...model, current, totalPages }, Cmd.none()];
          const p = current - 1;
          config.onChange?.(p);
          return [{ ...model, current: p, totalPages }, Cmd.none()];
        }
        case 'next': {
          if (current >= totalPages) return [{ ...model, current, totalPages }, Cmd.none()];
          const p = current + 1;
          config.onChange?.(p);
          return [{ ...model, current: p, totalPages }, Cmd.none()];
        }
        case 'goto': {
          const page = normalizePage(msg.page, current);
          if (page === current) return [{ ...model, current, totalPages }, Cmd.none()];
          config.onChange?.(page);
          return [{ ...model, current: page, totalPages }, Cmd.none()];
        }
        case 'hover': {
          const target = typeof msg.target === 'number' ? normalizePage(msg.target, current) : msg.target;
          return [{ ...model, current, totalPages, hovered: target }, Cmd.none()];
        }
        case 'leave':
          return [{ ...model, current, totalPages, hovered: null }, Cmd.none()];
        case 'noop':
          return [{ ...model, current, totalPages }, Cmd.none()];
      }
    },
    view(model: PaginationModel): VNode {
      const tokens = useTokens(paginationContract, config, 'Pagination');
      const current = normalizePage(model.current);
      const activeStyle = style({ color: tokens.active, bold: true });
      const dimStyle = style({ dim: true, color: tokens.muted });
      const pageStyle = style({ color: tokens.textSoft });
      const arrowStyle = style({ color: tokens.text });
      const hoverStyle = style({ color: tokens.active, bold: true, reverse: true });
      const parts: VNode[] = [
        event(
          `${interactionId}:prev`,
          text(current > 1 ? '< ' : '  ', model.hovered === 'prev' ? hoverStyle : current > 1 ? arrowStyle : dimStyle),
          current > 1 ? { onClick: prevTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag } : {},
          {
            label: 'Previous page',
            intent: 'navigate',
            affordances: current > 1 ? ['click'] : [],
            cursor: current > 1 ? 'pointer' : undefined,
            keyboardHint: 'Left',
          },
        ),
      ];
      for (const page of visiblePages(current)) {
        if (page === 'ellipsis') {
          parts.push(text('... ', dimStyle));
          continue;
        }
        parts.push(
          event(
            `${interactionId}:page:${page}`,
            text(`${page} `, model.hovered === page ? hoverStyle : page === current ? activeStyle : pageStyle),
            page === current ? {} : { onClick: pageTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            {
              label: `Page ${page}`,
              intent: 'navigate',
              affordances: page === current ? [] : ['click'],
              cursor: page === current ? undefined : 'pointer',
            },
          ),
        );
      }
      parts.push(
        event(
          `${interactionId}:next`,
          text(current < totalPages ? '>' : ' ', model.hovered === 'next' ? hoverStyle : current < totalPages ? arrowStyle : dimStyle),
          current < totalPages ? { onClick: nextTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag } : {},
          {
            label: 'Next page',
            intent: 'navigate',
            affordances: current < totalPages ? ['click'] : [],
            cursor: current < totalPages ? 'pointer' : undefined,
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
