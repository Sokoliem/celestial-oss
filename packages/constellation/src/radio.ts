import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface RadioTokens {
  text: Color;
  selected: Color;
  unselected: Color;
  highlight: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const radioContract: TokenContract<RadioTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  selected: (t: SemanticTheme) => t.colors.tones.success,
  unselected: (t: SemanticTheme) => t.colors.muted,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.body,
};

export interface RadioOption {
  label: string;
  value: string;
}
export interface RadioGroupConfig {
  options: RadioOption[];
  selected?: number;
  focused?: boolean;
  onChange?: (value: string, index: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface RadioGroupModel {
  selected: number;
  highlighted: number;
  focused: boolean;
  hoveredIndex?: number | null;
}
export type RadioGroupMsg =
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'select-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

export function radioGroup(config: RadioGroupConfig): ComponentDescriptor<RadioGroupModel, RadioGroupMsg> {
  const options = config.options;
  const interactionId = generateFocusGroupId('radio-group');
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  return {
    init(): [RadioGroupModel, Cmd<RadioGroupMsg>] {
      return [{ selected: config.selected ?? 0, highlighted: config.selected ?? 0, focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: RadioGroupMsg, model: RadioGroupModel): [RadioGroupModel, Cmd<RadioGroupMsg>] {
      switch (msg.type) {
        case 'up':
          return [{ ...model, highlighted: Math.max(0, model.highlighted - 1) }, Cmd.none()];
        case 'down':
          return [{ ...model, highlighted: Math.min(options.length - 1, model.highlighted + 1) }, Cmd.none()];
        case 'select': {
          const opt = options[model.highlighted];
          if (opt) config.onChange?.(opt.value, model.highlighted);
          return [{ ...model, selected: model.highlighted }, Cmd.none()];
        }
        case 'select-at': {
          const index = Math.max(0, Math.min(options.length - 1, msg.index));
          const opt = options[index];
          if (!opt) return [model, Cmd.none()];
          config.onChange?.(opt.value, index);
          return [{ ...model, selected: index, highlighted: index, focused: true }, Cmd.none()];
        }
        case 'hover-at':
          return options[msg.index] ? [{ ...model, hoveredIndex: msg.index }, Cmd.none()] : [model, Cmd.none()];
        case 'leave':
          return [{ ...model, hoveredIndex: null }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: RadioGroupModel): VNode {
      const tokens = useTokens(radioContract, config, 'RadioGroup');
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const selStyle = style({ color: tokens.selected });
      const items = options.map((opt, i) => {
        const ind = i === model.selected ? '(●)' : '( )';
        const isHovered = i === model.hoveredIndex;
        const isHighlighted = i === model.highlighted;
        const prefix = isHovered || isHighlighted ? '▸ ' : '  ';
        const s = isHovered
          ? style({ color: tokens.borderHover, bold: true, reverse: true })
          : isHighlighted
            ? hlStyle
            : i === model.selected
              ? selStyle
              : applyTypography(tokens.labelStyle);
        const item = text(`${prefix}${ind} ${opt.label}`, s);
        setVNodeMeta(item, {
          testId: opt.value,
          a11y: { role: 'radio', label: opt.label, checked: i === model.selected },
        });
        return event(
          `${interactionId}:option:${i}`,
          item,
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: opt.label, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Up/Down, Enter' },
        );
      });
      return column(...items);
    },
    subscriptions(model: RadioGroupModel): Sub<RadioGroupMsg> {
      const mouse = Sub.elementMouse<RadioGroupMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === selectTag) return { type: 'select-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<RadioGroupMsg>(mouse, Sub.key('up', { type: 'up' }), Sub.key('down', { type: 'down' }), Sub.key('enter', { type: 'select' }));
    },
  };
}
