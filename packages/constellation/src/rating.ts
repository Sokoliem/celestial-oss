/**
 * Rating — A character-based rating input component with hover-state tracking.
 *
 * Renders rating displays using stars, hearts, blocks, or diamonds.
 * Supports interactive mode with hover preview and keyboard navigation.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, event, row, Sub, text } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { clampRange, positiveInteger } from './internal.js';
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
  | { type: 'confirm' }
  | { type: 'noop' };

const STYLE_CHARS: Record<RatingStyle, { filled: string; empty: string; half?: string }> = {
  star: { filled: '★', empty: '☆', half: '▌' },
  heart: { filled: '♥', empty: '♡' },
  block: { filled: '█', empty: '░' },
  diamond: { filled: '◆', empty: '◇' },
};

/**
 * Create a rating component.
 *
 * @param config - Rating configuration including value, style, and callbacks.
 * @returns A ComponentDescriptor for the rating.
 */
export function rating(config: RatingConfig = {}): ComponentDescriptor<RatingModel, RatingMsg> {
  const max = positiveInteger(config.max, 5, 10_000);
  const initialValue = clampRange(config.value ?? 0, 0, max, 0);
  const ratingStyle = config.style && config.style in STYLE_CHARS ? config.style : 'star';
  const size = config.size === 'sm' || config.size === 'lg' ? config.size : 'md';
  const interactive = config.interactive ?? false;
  const allowHalf = config.allowHalf ?? false;
  const interactionId = generateFocusGroupId('rating');
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  function normalizeIndex(index: number | null, itemCount = max): number | null {
    if (index === null || !Number.isFinite(index)) return null;
    const normalized = Math.trunc(index);
    return normalized >= 0 && normalized < itemCount ? normalized : null;
  }

  return {
    init(): [RatingModel, Cmd<RatingMsg>] {
      return [
        {
          value: initialValue,
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
      const modelMax = positiveInteger(model.max, max, 10_000);
      const currentValue = clampRange(model.value, 0, modelMax, 0);
      const normalizedModel = { ...model, value: currentValue, max: modelMax };
      switch (msg.type) {
        case 'hover':
          return [{ ...normalizedModel, hoveredIndex: normalizeIndex(msg.index, modelMax) }, Cmd.none()];
        case 'click': {
          const index = normalizeIndex(msg.index, modelMax);
          if (index === null) return [{ ...normalizedModel, hoveredIndex: null }, Cmd.none()];
          const hoveredIndex = normalizeIndex(model.hoveredIndex, modelMax);
          const newValue = allowHalf && hoveredIndex !== null ? (index < currentValue ? index + 1 : index + 0.5) : index + 1;
          const clampedValue = clampRange(newValue, 0, modelMax, currentValue);
          if (clampedValue !== currentValue) config.onChange?.(clampedValue);
          return [{ ...normalizedModel, value: clampedValue, hoveredIndex: null, focused: interactive || model.focused }, Cmd.none()];
        }
        case 'increment': {
          const newValue = currentValue + (allowHalf ? 0.5 : 1);
          const clampedValue = clampRange(newValue, 0, modelMax, currentValue);
          if (clampedValue !== currentValue) config.onChange?.(clampedValue);
          return [{ ...normalizedModel, value: clampedValue }, Cmd.none()];
        }
        case 'decrement': {
          const newValue = currentValue - (allowHalf ? 0.5 : 1);
          const clampedValue = clampRange(newValue, 0, modelMax, currentValue);
          if (clampedValue !== currentValue) config.onChange?.(clampedValue);
          return [{ ...normalizedModel, value: clampedValue }, Cmd.none()];
        }
        case 'focus':
          return [{ ...normalizedModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...normalizedModel, focused: false, hoveredIndex: null }, Cmd.none()];
        case 'confirm':
          return [{ ...normalizedModel, hoveredIndex: null }, Cmd.none()];
        case 'noop':
          return [normalizedModel, Cmd.none()];
      }
    },

    view(model: RatingModel): VNode {
      const tokens = useTokens(ratingContract, config, 'Rating');
      const chars = STYLE_CHARS[model.style] ?? STYLE_CHARS[ratingStyle];
      const itemCount = positiveInteger(model.max, max, 10_000);
      const value = clampRange(model.value, 0, itemCount, 0);
      const hoveredIndex = normalizeIndex(model.hoveredIndex, itemCount);

      const filledStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });
      const emptyStyle = style({ color: tokens.empty, dim: true });
      const halfStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });
      const hoverFillStyle = model.focused ? style({ bold: true, color: tokens.filled }) : style({ color: tokens.filled });

      const displayValue = hoveredIndex !== null && model.interactive ? hoveredIndex + 1 : value;

      const items: VNode[] = [];
      for (let i = 0; i < itemCount; i++) {
        const index = i;
        let glyph: VNode;
        if (allowHalf && i + 0.5 === displayValue) {
          glyph = row(text(chars.filled, filledStyle), text(chars.half ?? '', halfStyle), text(chars.empty, emptyStyle));
        } else if (index < displayValue) {
          const isHovered = hoveredIndex !== null && index <= hoveredIndex;
          glyph = text(chars.filled, isHovered ? hoverFillStyle : filledStyle);
        } else {
          glyph = text(chars.empty, emptyStyle);
        }
        items.push(
          interactive
            ? event(
                `${interactionId}:item:${index}`,
                glyph,
                { onClick: clickTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
                { label: `${index + 1} of ${itemCount}`, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer' },
              )
            : glyph,
        );
      }

      return row(...items);
    },

    subscriptions(model: RatingModel): Sub<RatingMsg> {
      if (!interactive) return Sub.none();
      const pointer = Sub.elementMouse<RatingMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:item:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:item:`.length));
        if (mouseEvent.handlerTag === clickTag) return { type: 'click', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'hover', index: null };
        return { type: 'noop' };
      });
      if (!model.focused) return pointer;
      return Sub.batch<RatingMsg>(
        pointer,
        Sub.key('left', { type: 'decrement' }),
        Sub.key('right', { type: 'increment' }),
        Sub.key('enter', { type: 'confirm' }),
        Sub.key('escape', { type: 'blur' }),
      );
    },
  };
}
