import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS } from './internal.js';
import { resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ToggleTokens {
  on: Color;
  off: Color;
  text: Color;
  textSoft: Color;
  muted: Color;
  highlight: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const toggleContract: TokenContract<ToggleTokens> = {
  on: (t: SemanticTheme) => t.colors.interactive,
  off: (t: SemanticTheme) => t.colors.muted,
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  highlight: (t: SemanticTheme) => t.colors.interactive,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.body,
};

export interface ToggleConfig {
  label: string;
  checked?: boolean;
  focused?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  onChange?: (checked: boolean) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ToggleModel {
  checked: boolean;
  focused: boolean;
  hovered?: boolean;
}

export type ToggleMsg = Msg<'toggle'> | Msg<'hover'> | Msg<'leave'> | Msg<'focus'> | Msg<'blur'> | Msg<'noop'>;

const TRACK_CHARS = {
  off: { sm: '[ ]', md: '[  ]', lg: '[   ]' },
  on: { sm: '[●]', md: '[ ● ]', lg: '[  ●  ]' },
} as const;

export function toggle(config: ToggleConfig): ComponentDescriptor<ToggleModel, ToggleMsg> {
  const label = String(config.label);
  const size = config.size === 'sm' || config.size === 'lg' ? config.size : 'md';
  const variant = config.variant === 'success' || config.variant === 'warning' || config.variant === 'danger' ? config.variant : 'default';
  const initialChecked = Boolean(config.checked);
  const initialFocused = Boolean(config.focused);
  const onChange = config.onChange;
  const interactionId = generateFocusGroupId(`toggle-${label}`);
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  return {
    init(): [ToggleModel, Cmd<ToggleMsg>] {
      return [{ checked: initialChecked, focused: initialFocused }, Cmd.none()];
    },

    update(msg: ToggleMsg, model: ToggleModel): [ToggleModel, Cmd<ToggleMsg>] {
      switch (msg.type) {
        case 'toggle': {
          const c = !model.checked;
          onChange?.(c);
          return [{ ...model, checked: c, focused: true }, Cmd.none()];
        }
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: ToggleModel): VNode {
      const tokens = useTokens(toggleContract, config, 'Toggle');
      const theme = resolveTheme(config);

      const variantColors: Record<string, Color> = {
        default: tokens.on,
        success: theme.colors.tones.success,
        warning: theme.colors.tones.warning,
        danger: theme.colors.tones.danger,
      };

      const trackColor = model.checked ? variantColors[variant]! : tokens.off;
      const trackChar = model.checked ? TRACK_CHARS.on[size] : TRACK_CHARS.off[size];
      const trackStyle = style({ color: model.hovered ? tokens.borderHover : trackColor, bold: model.focused });

      const labelColor = model.checked ? tokens.text : tokens.textSoft;
      const labelStyle = style({ color: labelColor });

      const node = row(text(trackChar, trackStyle), text(' ', labelStyle), text(label, labelStyle));
      setVNodeMeta(node, {
        testId: label,
        a11y: { role: 'switch', label, checked: model.checked },
      });
      return event(
        interactionId,
        node,
        { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
      );
    },

    subscriptions(model: ToggleModel): Sub<ToggleMsg> {
      const mouse = Sub.elementMouse<ToggleMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== interactionId) return { type: 'noop' };
        if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<ToggleMsg>(mouse, Sub.key('space', { type: 'toggle' }));
    },
  };
}

export interface ToggleGroupOption {
  label: string;
  value: string;
  checked?: boolean;
}

export interface ToggleGroupConfig {
  options: ToggleGroupOption[];
  focused?: boolean;
  layout?: 'row' | 'column';
  onChange?: (selected: string[]) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ToggleGroupModel {
  checked: Set<string>;
  highlighted: number;
  focused: boolean;
}

export type ToggleGroupMsg =
  | Msg<'toggle'>
  | Msg<'toggle-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'left'>
  | Msg<'right'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

export function toggleGroup(config: ToggleGroupConfig): ComponentDescriptor<ToggleGroupModel, ToggleGroupMsg> {
  const options = config.options.slice(0, MAX_RENDER_CELLS).map((option) => ({ ...option }));
  const layout = config.layout === 'row' ? 'row' : 'column';
  const interactionId = generateFocusGroupId('toggle-group');
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const validValues = new Set(options.map((option) => option.value));
  const normalizeModel = (model: ToggleGroupModel): ToggleGroupModel => ({
    checked: new Set([...model.checked].filter((value) => validValues.has(value))),
    highlighted: options.length === 0 ? 0 : boundedInteger(model.highlighted, 0, 0, options.length - 1),
    focused: Boolean(model.focused),
  });

  return {
    init(): [ToggleGroupModel, Cmd<ToggleGroupMsg>] {
      return [
        {
          checked: new Set(options.filter((o) => o.checked).map((o) => o.value)),
          highlighted: 0,
          focused: config.focused ?? false,
        },
        Cmd.none(),
      ];
    },

    update(msg: ToggleGroupMsg, model: ToggleGroupModel): [ToggleGroupModel, Cmd<ToggleGroupMsg>] {
      const safeModel = normalizeModel(model);
      switch (msg.type) {
        case 'toggle': {
          const opt = options[safeModel.highlighted];
          if (!opt) return [model, Cmd.none()];
          const c = new Set(safeModel.checked);
          c.has(opt.value) ? c.delete(opt.value) : c.add(opt.value);
          config.onChange?.([...c]);
          return [{ ...safeModel, checked: c, focused: true }, Cmd.none()];
        }
        case 'up':
          return [{ ...safeModel, highlighted: Math.max(0, safeModel.highlighted - 1) }, Cmd.none()];
        case 'down':
          return [{ ...safeModel, highlighted: Math.min(Math.max(0, options.length - 1), safeModel.highlighted + 1) }, Cmd.none()];
        case 'left':
          return [{ ...safeModel, highlighted: Math.max(0, safeModel.highlighted - 1) }, Cmd.none()];
        case 'right':
          return [{ ...safeModel, highlighted: Math.min(Math.max(0, options.length - 1), safeModel.highlighted + 1) }, Cmd.none()];
        case 'toggle-at': {
          if (!Number.isInteger(msg.index)) return [model, Cmd.none()];
          const opt = options[msg.index];
          if (!opt) return [model, Cmd.none()];
          const checked = new Set(safeModel.checked);
          checked.has(opt.value) ? checked.delete(opt.value) : checked.add(opt.value);
          config.onChange?.([...checked]);
          return [{ ...safeModel, checked, highlighted: msg.index, focused: true }, Cmd.none()];
        }
        case 'hover-at':
          return Number.isInteger(msg.index) && options[msg.index] ? [{ ...safeModel, highlighted: msg.index }, Cmd.none()] : [model, Cmd.none()];
        case 'leave':
        case 'noop':
          return [model, Cmd.none()];
        case 'focus':
          return [{ ...safeModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...safeModel, focused: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: ToggleGroupModel): VNode {
      const safeModel = normalizeModel(model);
      const tokens = useTokens(toggleContract, config, 'ToggleGroup');
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const onStyle = style({ color: tokens.on });
      const offStyle = style({ color: tokens.off });

      const items = options.map((opt, i) => {
        const isChecked = safeModel.checked.has(opt.value);
        const isHl = i === safeModel.highlighted;
        const s = isHl ? hlStyle : isChecked ? onStyle : offStyle;
        const indicator = isChecked ? '[●]' : '[ ]';
        const item = row(text(indicator, s), text(' ', s), text(opt.label, s));
        setVNodeMeta(item, {
          testId: opt.value,
          a11y: { role: 'switch', label: opt.label, checked: isChecked },
        });
        return event(
          `${interactionId}:option:${i}`,
          item,
          { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: opt.label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
        );
      });

      return layout === 'column' ? column(...items) : row(...items);
    },

    subscriptions(model: ToggleGroupModel): Sub<ToggleGroupMsg> {
      const mouse = Sub.elementMouse<ToggleGroupMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      const isRow = layout === 'row';
      const subs: Sub<ToggleGroupMsg>[] = [mouse, Sub.key('space', { type: 'toggle' })];
      if (isRow) {
        subs.push(Sub.key('left', { type: 'left' }));
        subs.push(Sub.key('right', { type: 'right' }));
      } else {
        subs.push(Sub.key('up', { type: 'up' }));
        subs.push(Sub.key('down', { type: 'down' }));
      }
      return Sub.batch<ToggleGroupMsg>(...subs);
    },
  };
}
