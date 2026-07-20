import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
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
  const variant = config.variant ?? 'default';
  const size = config.size ?? 'md';
  const padding = config.padding ?? SIZE_PADDING[size];
  const interactionId = generateFocusGroupId(`card-${config.title ?? 'untitled'}`);
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const isInteractive = config.onClick !== undefined;

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
          config.onClick?.();
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

      if (config.title) {
        const titleStyle = applyTypography(tokens.titleStyle);
        children.push(text(config.title, titleStyle));
      }

      if (config.subtitle) {
        const subtitleStyle = applyTypography(tokens.subtitleStyle);
        children.push(text(config.subtitle, subtitleStyle));
      }

      if (config.content) {
        children.push(...normalizeContent(config.content));
      } else if (config.children) {
        children.push(...normalizeContent(config.children));
      }

      if (config.footer) {
        children.push(...normalizeContent(config.footer));
      }

      const frame = box(
        column(...children),
        style({
          border: VARIANT_BORDER[variant],
          color: model.hovered && isInteractive ? tokens.hover : tokens.border,
          background: hoverState?.bg ?? (variant === 'outlined' || variant === 'ghost' ? undefined : tokens.bg),
          bold: hoverState?.bold,
          padding,
        }),
        { width: config.width, height: config.height, fit: config.width || config.height ? 'fill' : 'content', overflow: 'hidden' },
      );

      if (!isInteractive) return frame;
      return event(
        interactionId,
        frame,
        { onClick: clickTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: config.title ?? 'Card', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
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

export function cardGrid(config: CardGridConfig): ComponentDescriptor<{ hoveredIndex: number }, CardMsg> {
  const columns = config.columns ?? 2;

  return {
    init(): [{ hoveredIndex: number }, Cmd<CardMsg>] {
      return [{ hoveredIndex: -1 }, Cmd.none()];
    },
    update(msg: CardMsg, model: { hoveredIndex: number }): [{ hoveredIndex: number }, Cmd<CardMsg>] {
      if (msg.type === 'hover') {
        return [{ hoveredIndex: (msg as any).index }, Cmd.none()];
      }
      if (msg.type === 'leave') {
        return [{ hoveredIndex: -1 }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: { hoveredIndex: number }): VNode {
      const rows: VNode[] = [];
      for (let i = 0; i < config.cards.length; i += columns) {
        const rowCards = config.cards.slice(i, i + columns);
        const cardNodes = rowCards.map((c, j) => {
          const actualIndex = i + j;
          const cardModel = { hovered: model.hoveredIndex === actualIndex };
          return card({ ...c, themeCtx: c.themeCtx ?? config.themeCtx, theme: c.theme ?? config.theme }).view(cardModel);
        });
        rows.push(row(...cardNodes));
      }
      return column(...rows);
    },
  };
}
