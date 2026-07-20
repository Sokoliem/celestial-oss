import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
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
  const size = config.size ?? 'md';
  const variant = config.variant ?? 'default';
  const interactionId = generateFocusGroupId(`toggle-${config.label}`);
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  return {
    init(): [ToggleModel, Cmd<ToggleMsg>] {
      return [{ checked: config.checked ?? false, focused: config.focused ?? false }, Cmd.none()];
    },

    update(msg: ToggleMsg, model: ToggleModel): [ToggleModel, Cmd<ToggleMsg>] {
      switch (msg.type) {
        case 'toggle': {
          const c = !model.checked;
          config.onChange?.(c);
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
      const trackStyle = style({ color: model.hovered ? tokens.borderHover : trackColor, bold: model.focused || model.hovered, reverse: model.hovered });

      const labelColor = model.checked ? tokens.text : tokens.textSoft;
      const labelStyle = style({ color: labelColor });

      const node = row(text(trackChar, trackStyle), text(' ', labelStyle), text(config.label, labelStyle));
      setVNodeMeta(node, {
        testId: config.label,
        a11y: { role: 'switch', label: config.label, checked: model.checked },
      });
      return event(
        interactionId,
        node,
        { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: config.label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
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

export type ToggleGroupMsg = Msg<'toggle'> | Msg<'up'> | Msg<'down'> | Msg<'left'> | Msg<'right'> | Msg<'focus'> | Msg<'blur'>;

export function toggleGroup(config: ToggleGroupConfig): ComponentDescriptor<ToggleGroupModel, ToggleGroupMsg> {
  const options = config.options;
  const layout = config.layout ?? 'column';

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
      switch (msg.type) {
        case 'toggle': {
          const opt = options[model.highlighted];
          if (!opt) return [model, Cmd.none()];
          const c = new Set(model.checked);
          c.has(opt.value) ? c.delete(opt.value) : c.add(opt.value);
          config.onChange?.([...c]);
          return [{ ...model, checked: c }, Cmd.none()];
        }
        case 'up':
          return [{ ...model, highlighted: Math.max(0, model.highlighted - 1) }, Cmd.none()];
        case 'down':
          return [{ ...model, highlighted: Math.min(options.length - 1, model.highlighted + 1) }, Cmd.none()];
        case 'left':
          return [{ ...model, highlighted: Math.max(0, model.highlighted - 1) }, Cmd.none()];
        case 'right':
          return [{ ...model, highlighted: Math.min(options.length - 1, model.highlighted + 1) }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: ToggleGroupModel): VNode {
      const tokens = useTokens(toggleContract, config, 'ToggleGroup');
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const onStyle = style({ color: tokens.on });
      const offStyle = style({ color: tokens.off });

      const items = options.map((opt, i) => {
        const isChecked = model.checked.has(opt.value);
        const isHl = i === model.highlighted;
        const s = isHl ? hlStyle : isChecked ? onStyle : offStyle;
        const indicator = isChecked ? '[●]' : '[ ]';
        const item = row(text(indicator, s), text(' ', s), text(opt.label, s));
        setVNodeMeta(item, {
          testId: opt.value,
          a11y: { role: 'switch', label: opt.label, checked: isChecked },
        });
        return item;
      });

      return layout === 'column' ? column(...items) : row(...items);
    },

    subscriptions(model: ToggleGroupModel): Sub<ToggleGroupMsg> {
      if (!model.focused) return Sub.none();
      const isRow = layout === 'row';
      const subs: Sub<ToggleGroupMsg>[] = [Sub.key('space', { type: 'toggle' })];
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
