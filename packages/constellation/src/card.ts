import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, columnWithGap, event, rowWithGap, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { applyTypography, useTokens } from './theme.js';
import { type ComponentDescriptor, normalizeContent } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface CardTokens {
  title: Color;
  subtitle: Color;
  hover: Color;
  bg: Color;
  border: Color;
  titleStyle: TypographyToken;
  subtitleStyle: TypographyToken;
  hoverState: StateToken;
}

export const cardContract: TokenContract<CardTokens> = {
  title: (t: SemanticTheme) => t.colors.text,
  subtitle: (t: SemanticTheme) => t.colors.textSoft,
  hover: (t: SemanticTheme) => t.colors.highlight,
  bg: (t: SemanticTheme) => t.colors.surfaceRaised,
  border: (t: SemanticTheme) => t.colors.border,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  subtitleStyle: (t: SemanticTheme) => t.typography.caption,
  hoverState: (t: SemanticTheme) => t.states.hover,
};

export type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost';
export type CardSize = 'sm' | 'md' | 'lg';

export interface CardConfig {
  title?: string;
  subtitle?: string;
  content?: VNode | VNode[];
  children?: VNode | VNode[];
  footer?: VNode | VNode[];
  variant?: CardVariant;
  size?: CardSize;
  padding?: number;
  /** Optional fixed outer width. By default the card hugs its content. */
  width?: number;
  /** Optional fixed outer height. */
  height?: number;
  onClick?: () => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface CardModel {
  hovered: boolean;
}

export type CardMsg = Msg<'hover' | 'leave' | 'click' | 'noop'>;
type Msg<T extends string> = { type: T };

const VARIANT_BORDER: Record<CardVariant, (typeof border)[keyof Pick<typeof border, 'rounded' | 'double' | 'square' | 'hidden'>]> = {
  default: border.rounded,
  elevated: border.double,
  outlined: border.square,
  ghost: border.hidden,
};

const SIZE_PADDING: Record<CardSize, number> = {
  sm: 1,
  md: 2,
  lg: 4,
};

export function card(config: CardConfig): ComponentDescriptor<CardModel, CardMsg> {
  const variant = config.variant && config.variant in VARIANT_BORDER ? config.variant : 'default';
  const size = config.size === 'sm' || config.size === 'lg' ? config.size : 'md';
  const padding = nonNegativeInteger(config.padding, SIZE_PADDING[size]);
  const width = config.width === undefined ? undefined : positiveInteger(config.width, 1);
  const height = config.height === undefined ? undefined : positiveInteger(config.height, 1);
  const title = config.title;
  const subtitle = config.subtitle;
  const body = [...normalizeContent(config.content !== undefined ? config.content : config.children)];
  const footer = [...normalizeContent(config.footer)];
  const onClick = config.onClick;
  const interactionId = generateFocusGroupId(`card-${title ?? 'untitled'}`);
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const isInteractive = onClick !== undefined;

  return {
    init(): [CardModel, Cmd<CardMsg>] {
      return [{ hovered: false }, Cmd.none()];
    },

    update(msg: CardMsg, model: CardModel): [CardModel, Cmd<CardMsg>] {
      switch (msg.type) {
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'click':
          onClick?.();
          return [model, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: CardModel): VNode {
      const tokens = useTokens(cardContract, config, 'Card');
      const hoverState = model.hovered && isInteractive ? tokens.hoverState : undefined;
      const children: VNode[] = [];

      if (title) {
        const titleStyle = applyTypography(tokens.titleStyle);
        children.push(text(title, titleStyle));
      }

      if (subtitle) {
        const subtitleStyle = applyTypography(tokens.subtitleStyle);
        children.push(text(subtitle, subtitleStyle));
      }

      children.push(...body, ...footer);

      const frame = box(
        column(...children),
        style({
          border: VARIANT_BORDER[variant],
          color: model.hovered && isInteractive ? tokens.hover : tokens.border,
          background: hoverState?.bg ?? (variant === 'outlined' || variant === 'ghost' ? undefined : tokens.bg),
          bold: hoverState?.bold,
          padding,
        }),
        { width, height, fit: width !== undefined || height !== undefined ? 'fill' : 'content', overflow: 'hidden' },
      );

      if (!isInteractive) return frame;
      return event(
        interactionId,
        frame,
        { onClick: clickTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: title ?? 'Card', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
      );
    },

    subscriptions(): Sub<CardMsg> {
      if (!isInteractive) return Sub.none();
      return Sub.elementMouse((mouseEvent) => {
        if (mouseEvent.elementId !== interactionId) return { type: 'noop' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        if (mouseEvent.handlerTag === clickTag) return { type: 'click' };
        return { type: 'noop' };
      });
    },
  };
}

export interface CardGridConfig {
  cards: CardConfig[];
  columns?: number;
  gap?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface CardGridModel {
  hoveredIndex: number;
}

export type CardGridMsg = { type: 'hover-card'; index: number } | { type: 'leave-card' } | { type: 'click-card'; index: number } | { type: 'noop' };

export function cardGrid(config: CardGridConfig): ComponentDescriptor<CardGridModel, CardGridMsg> {
  const cards = config.cards.slice(0, 10_000).map((item) => ({ ...item }));
  const columns = positiveInteger(config.columns, 2, Math.max(1, cards.length));
  const gap = nonNegativeInteger(config.gap, 0);
  const interactionId = generateFocusGroupId('card-grid');
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const descriptors = cards.map((item) => card({ ...item, themeCtx: item.themeCtx ?? config.themeCtx, theme: item.theme ?? config.theme }));

  return {
    init(): [CardGridModel, Cmd<CardGridMsg>] {
      return [{ hoveredIndex: -1 }, Cmd.none()];
    },
    update(msg: CardGridMsg, model: CardGridModel): [CardGridModel, Cmd<CardGridMsg>] {
      if (msg.type === 'hover-card') {
        const index = Number.isFinite(msg.index) ? Math.trunc(msg.index) : -1;
        return [{ hoveredIndex: index >= 0 && index < cards.length ? index : -1 }, Cmd.none()];
      }
      if (msg.type === 'leave-card') {
        return [{ hoveredIndex: -1 }, Cmd.none()];
      }
      if (msg.type === 'click-card') {
        const index = Number.isFinite(msg.index) ? Math.trunc(msg.index) : -1;
        cards[index]?.onClick?.();
      }
      return [model, Cmd.none()];
    },
    view(model: CardGridModel): VNode {
      const rows: VNode[] = [];
      for (let i = 0; i < cards.length; i += columns) {
        const rowCards = cards.slice(i, i + columns);
        const cardNodes = rowCards.map((cardConfig, j) => {
          const actualIndex = i + j;
          const cardModel = { hovered: model.hoveredIndex === actualIndex };
          const node = descriptors[actualIndex]!.view(cardModel);
          if (!cardConfig.onClick) return node;
          return event(
            `${interactionId}:card:${actualIndex}`,
            node,
            { onClick: clickTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: cardConfig.title ?? 'Card', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
          );
        });
        rows.push(rowWithGap(gap, ...cardNodes));
      }
      return columnWithGap(gap, ...rows);
    },
    subscriptions(): Sub<CardGridMsg> {
      return Sub.elementMouse<CardGridMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:card:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:card:`.length));
        if (mouseEvent.handlerTag === clickTag) return { type: 'click-card', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-card', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave-card' };
        return { type: 'noop' };
      });
    },
  };
}
