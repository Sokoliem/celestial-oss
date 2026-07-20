/**
 * Rating — A character-based rating input component with hover-state tracking.
 *
 * Renders rating displays using stars, hearts, blocks, or diamonds.
 * Supports interactive mode with hover preview and keyboard navigation.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, row, Sub, text } from '@celestial/nebula';
import { useTokens } from './theme.js';
import type { ComponentDescriptor, RatingStyle } from './types.js';

// ─── Token contract ─────────────────────��────────────────────────────────���──

export interface RatingTokens {
  filled: Color;
  empty: Color;
  text: Color;
  textSoft: Color;
}

export const ratingContract: TokenContract<RatingTokens> = {
  filled: (t: SemanticTheme) => t.colors.tones.warning,
  empty: (t: SemanticTheme) => t.colors.muted,
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
};

export type RatingSize = 'sm' | 'md' | 'lg';

export interface RatingConfig {
  value?: number;
  max?: number;
  style?: RatingStyle;
  size?: RatingSize;
  interactive?: boolean;
  allowHalf?: boolean;
  onChange?: (value: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface RatingModel {
  value: number;
  hoveredIndex: number | null;
  max: number;
  style: RatingStyle;
  size: RatingSize;
  interactive: boolean;
  focused: boolean;
}

export type RatingMsg =
  | { type: 'hover'; index: number | null }
  | { type: 'click'; index: number }
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'confirm' };

const STYLE_CHARS: Record<RatingStyle, { filled: string; empty: string; half?: string }> = {
  star: { filled: '★', empty: '☆', half: '▌' },
  heart: { filled: '♥', empty: '♡' },
  block: { filled: '█', empty: '░' },
  diamond: { filled: '◆', empty: '◇' },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Create a rating component.
 *
 * @param config - Rating configuration including value, style, and callbacks.
 * @returns A ComponentDescriptor for the rating.
 */
export function rating(config: RatingConfig = {}): ComponentDescriptor<RatingModel, RatingMsg> {
  const initialValue = config.value ?? 0;
  const max = config.max ?? 5;
  const ratingStyle = config.style ?? 'star';
  const size = config.size ?? 'md';
  const interactive = config.interactive ?? false;
  const allowHalf = config.allowHalf ?? false;

  return {
    init(): [RatingModel, Cmd<RatingMsg>] {
      return [
        {
          value: clamp(initialValue, 0, max),
          hoveredIndex: null,
          max,
          style: ratingStyle,
          size,
          interactive,
          focused: false,
        },
        Cmd.none(),
      ];
    },

    update(msg: RatingMsg, model: RatingModel): [RatingModel, Cmd<RatingMsg>] {
      switch (msg.type) {
        case 'hover':
          return [{ ...model, hoveredIndex: msg.index }, Cmd.none()];
        case 'click': {
          const newValue = allowHalf && model.hoveredIndex !== null ? (msg.index < model.value ? msg.index + 1 : msg.index + 0.5) : msg.index + 1;
          const clampedValue = clamp(newValue, 0, max);
          if (clampedValue !== model.value) config.onChange?.(clampedValue);
          return [{ ...model, value: clampedValue, hoveredIndex: null }, Cmd.none()];
        }
        case 'increment': {
          const newValue = model.value + (allowHalf ? 0.5 : 1);
          const clampedValue = clamp(newValue, 0, max);
          if (clampedValue !== model.value) config.onChange?.(clampedValue);
          return [{ ...model, value: clampedValue }, Cmd.none()];
        }
        case 'decrement': {
          const newValue = model.value - (allowHalf ? 0.5 : 1);
          const clampedValue = clamp(newValue, 0, max);
          if (clampedValue !== model.value) config.onChange?.(clampedValue);
          return [{ ...model, value: clampedValue }, Cmd.none()];
        }
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, hoveredIndex: null }, Cmd.none()];
        case 'confirm':
          return [{ ...model, hoveredIndex: null }, Cmd.none()];
      }
    },

    view(model: RatingModel): VNode {
      const tokens = useTokens(ratingContract, config, 'Rating');
      const chars = STYLE_CHARS[model.style];

      const filledStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });
      const emptyStyle = style({ color: tokens.empty, dim: true });
      const halfStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });
      const hoverFillStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });

      const displayValue = model.hoveredIndex !== null && model.interactive ? model.hoveredIndex + 1 : model.value;

      const items: VNode[] = [];
      for (let i = 0; i < model.max; i++) {
        const index = i;
        if (allowHalf && i + 0.5 === displayValue) {
          items.push(row(text(chars.filled, filledStyle), text(chars.half ?? '', halfStyle), text(chars.empty, emptyStyle)));
        } else if (index < displayValue) {
          const isHovered = model.hoveredIndex !== null && index <= model.hoveredIndex;
          items.push(text(chars.filled, isHovered ? hoverFillStyle : filledStyle));
        } else {
          items.push(text(chars.empty, emptyStyle));
        }
      }

      return row(...items);
    },

    subscriptions(model: RatingModel): Sub<RatingMsg> {
      if (!model.focused || !model.interactive) return Sub.none();
      return Sub.batch<RatingMsg>(
        Sub.key('left', { type: 'decrement' }),
        Sub.key('right', { type: 'increment' }),
        Sub.key('enter', { type: 'confirm' }),
        Sub.key('escape', { type: 'blur' }),
      );
    },
  };
}
