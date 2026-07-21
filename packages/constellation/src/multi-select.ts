import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { positiveInteger } from './internal.js';
import { moveOptionHighlight } from './option-list-view.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface MultiSelectTokens {
  text: Color;
  highlight: Color;
  tag: Color;
  tagBg: Color;
  placeholder: Color;
  border: Color;
  borderActive: Color;
  checkmark: Color;
  labelStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const multiSelectContract: TokenContract<MultiSelectTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  tag: (t: SemanticTheme) => t.colors.text,
  tagBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  placeholder: (t: SemanticTheme) => t.colors.placeholder,
  border: (t: SemanticTheme) => t.colors.border,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  checkmark: (t: SemanticTheme) => t.colors.highlight,
  labelStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MultiSelectOption {
  label: string;
  value: string;
}

export interface MultiSelectConfig {
  options: MultiSelectOption[];
  selected?: number[];
  maxVisibleOptions?: number;
  placeholder?: string;
  onChange?: (values: string[]) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface MultiSelectModel {
  open: boolean;
  highlighted: number;
  selected: Set<number>;
  focused: boolean;
  hoveredIndex?: number | null;
}

export type MultiSelectMsg =
  | Msg<'toggle-open'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'toggle-item'>
  | Msg<'toggle-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'close'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Component ──────────────────────────────────────────────────────────────

export function multiSelect(config: MultiSelectConfig): ComponentDescriptor<MultiSelectModel, MultiSelectMsg> {
  const options = config.options.slice(0, 100_000).map((option) => ({ ...option }));
  const placeholder = config.placeholder ?? 'Select...';
  const maxVisible = positiveInteger(config.maxVisibleOptions, 10);
  const interactionId = generateFocusGroupId(`multi-select-${placeholder}`);
  const toggleOpenTag = `${interactionId}:toggle-open`;
  const toggleItemTag = `${interactionId}:toggle-item`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  const validIndex = (index: number): number | null => {
    if (!Number.isFinite(index)) return null;
    const normalized = Math.trunc(index);
    return normalized >= 0 && normalized < options.length ? normalized : null;
  };

  const normalizeSelected = (selected: Set<number>): Set<number> =>
    selected instanceof Set ? new Set([...selected].map(validIndex).filter((index): index is number => index !== null)) : new Set<number>();

  function selectedValues(selected: Set<number>): string[] {
    return options.filter((_, i) => selected.has(i)).map((o) => o.value);
  }

  return {
    init(): [MultiSelectModel, Cmd<MultiSelectMsg>] {
      const selected = normalizeSelected(new Set<number>(config.selected ?? []));
      return [{ open: false, highlighted: 0, selected, focused: false }, Cmd.none()];
    },

    update(msg: MultiSelectMsg, model: MultiSelectModel): [MultiSelectModel, Cmd<MultiSelectMsg>] {
      const highlighted = validIndex(model.highlighted) ?? (options.length > 0 ? 0 : -1);
      const selected = normalizeSelected(model.selected);
      const normalizedModel = { ...model, highlighted, selected };
      const toggleIndex = (index: number): [MultiSelectModel, Cmd<MultiSelectMsg>] => {
        const valid = validIndex(index);
        if (valid === null) return [normalizedModel, Cmd.none()];
        const next = new Set(selected);
        next.has(valid) ? next.delete(valid) : next.add(valid);
        config.onChange?.(selectedValues(next));
        return [{ ...normalizedModel, selected: next, highlighted: valid, focused: true }, Cmd.none()];
      };
      switch (msg.type) {
        case 'toggle-open':
          return [{ ...normalizedModel, open: !model.open, focused: true }, Cmd.none()];
        case 'up':
          return [{ ...normalizedModel, highlighted: moveOptionHighlight(highlighted, options.length, 'up') }, Cmd.none()];
        case 'down':
          return [{ ...normalizedModel, highlighted: moveOptionHighlight(highlighted, options.length, 'down') }, Cmd.none()];
        case 'toggle-item':
          return toggleIndex(highlighted);
        case 'toggle-at':
          return toggleIndex(msg.index);
        case 'hover-at': {
          const index = validIndex(msg.index);
          return index === null ? [normalizedModel, Cmd.none()] : [{ ...normalizedModel, highlighted: index, hoveredIndex: index }, Cmd.none()];
        }
        case 'leave':
          return [{ ...normalizedModel, hoveredIndex: null }, Cmd.none()];
        case 'close':
          return [{ ...normalizedModel, open: false }, Cmd.none()];
        case 'focus':
          return [{ ...normalizedModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...normalizedModel, focused: false, open: false, hoveredIndex: null }, Cmd.none()];
        case 'noop':
          return [normalizedModel, Cmd.none()];
      }
    },

    view(model: MultiSelectModel): VNode {
      const tokens = useTokens(multiSelectContract, config, 'MultiSelect');
      const selected = normalizeSelected(model.selected);
      const highlighted = validIndex(model.highlighted) ?? (options.length > 0 ? 0 : -1);
      const labelSt = applyTypography(tokens.labelStyle);
      const placeholderSt = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder });
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const tagStyle = style({ color: tokens.tag, background: tokens.tagBg });
      const checkStyle = style({ color: tokens.checkmark });

      if (!model.open) {
        // Closed: show tags or placeholder
        if (selected.size === 0) {
          return event(
            `${interactionId}:trigger`,
            row(text(placeholder, placeholderSt)),
            { onClick: toggleOpenTag },
            { label: placeholder, intent: 'open', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Enter' },
          );
        }
        const tags = options.filter((_, i) => selected.has(i)).map((o) => text(`[${o.label}]`, tagStyle));
        return event(
          `${interactionId}:trigger`,
          row(...tags),
          { onClick: toggleOpenTag },
          { label: `${selected.size} selected`, intent: 'open', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Enter' },
        );
      }

      // Open: show option list with checkmarks
      const start = highlighted >= maxVisible ? highlighted - maxVisible + 1 : 0;
      const items = options.slice(start, start + maxVisible).map((opt, localIndex) => {
        const i = start + localIndex;
        const checked = selected.has(i);
        const prefix = checked ? '[✓] ' : '[ ] ';
        const active = i === highlighted || i === model.hoveredIndex;
        const s = active ? hlStyle : labelSt;
        const prefixStyle = checked ? checkStyle : s;
        return event(
          `${interactionId}:option:${i}`,
          row(text(prefix, prefixStyle), text(opt.label, s)),
          { onClick: toggleItemTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: opt.label, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
        );
      });
      return column(...items);
    },

    subscriptions(model: MultiSelectModel): Sub<MultiSelectMsg> {
      const pointer = Sub.elementMouse<MultiSelectMsg>((mouseEvent) => {
        if (mouseEvent.elementId === `${interactionId}:trigger` && mouseEvent.handlerTag === toggleOpenTag) return { type: 'toggle-open' };
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === toggleItemTag) return { type: 'toggle-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return pointer;
      if (!model.open) {
        return Sub.batch(pointer, Sub.key('enter', { type: 'toggle-open' }));
      }
      return Sub.batch<MultiSelectMsg>(
        pointer,
        Sub.key('up', { type: 'up' }),
        Sub.key('down', { type: 'down' }),
        Sub.key('enter', { type: 'toggle-item' }),
        Sub.key('space', { type: 'toggle-item' }),
        Sub.key('escape', { type: 'close' }),
      );
    },
  };
}
