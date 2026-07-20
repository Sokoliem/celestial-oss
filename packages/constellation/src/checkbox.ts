import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface CheckboxTokens {
  text: Color;
  checked: Color;
  unchecked: Color;
  highlight: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const checkboxContract: TokenContract<CheckboxTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  checked: (t: SemanticTheme) => t.colors.tones.success,
  unchecked: (t: SemanticTheme) => t.colors.muted,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.body,
};

export interface CheckboxConfig {
  label: string;
  checked?: boolean;
  focused?: boolean;
  onChange?: (checked: boolean) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface CheckboxModel {
  checked: boolean;
  focused: boolean;
  hovered?: boolean;
}
export type CheckboxMsg = Msg<'toggle'> | Msg<'hover'> | Msg<'leave'> | Msg<'focus'> | Msg<'blur'> | Msg<'noop'>;

export function checkbox(config: CheckboxConfig): ComponentDescriptor<CheckboxModel, CheckboxMsg> {
  const interactionId = generateFocusGroupId(`checkbox-${config.label}`);
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  return {
    init(): [CheckboxModel, Cmd<CheckboxMsg>] {
      return [{ checked: config.checked ?? false, focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: CheckboxMsg, model: CheckboxModel): [CheckboxModel, Cmd<CheckboxMsg>] {
      if (msg.type === 'toggle') {
        const c = !model.checked;
        config.onChange?.(c);
        return [{ ...model, checked: c, focused: true }, Cmd.none()];
      }
      if (msg.type === 'hover') return [{ ...model, hovered: true }, Cmd.none()];
      if (msg.type === 'leave') return [{ ...model, hovered: false }, Cmd.none()];
      if (msg.type === 'focus') return [{ ...model, focused: true }, Cmd.none()];
      if (msg.type === 'blur') return [{ ...model, focused: false }, Cmd.none()];
      return [model, Cmd.none()];
    },
    view(model: CheckboxModel): VNode {
      const tokens = useTokens(checkboxContract, config, 'Checkbox');
      const ind = model.checked ? '[✓]' : '[ ]';
      const checkboxStyle = model.checked
        ? style({ color: tokens.checked })
        : model.hovered
          ? style({ color: tokens.borderHover, bold: true, reverse: true })
          : model.focused
            ? style({ color: tokens.borderActive })
            : applyTypography(tokens.labelStyle);
      const node = text(`${ind} ${config.label}`, checkboxStyle);
      setVNodeMeta(node, {
        testId: config.label,
        a11y: { role: 'checkbox', label: config.label, checked: model.checked },
      });
      return event(
        interactionId,
        node,
        { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: config.label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
      );
    },
    subscriptions(model: CheckboxModel): Sub<CheckboxMsg> {
      const mouse = Sub.elementMouse<CheckboxMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== interactionId) return { type: 'noop' };
        if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<CheckboxMsg>(mouse, Sub.key('space', { type: 'toggle' }));
    },
  };
}

export interface CheckboxGroupOption {
  label: string;
  value: string;
  checked?: boolean;
}
export interface CheckboxGroupConfig {
  options: CheckboxGroupOption[];
  focused?: boolean;
  onChange?: (selected: string[]) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface CheckboxGroupModel {
  checked: Set<string>;
  highlighted: number;
  focused: boolean;
}
export type CheckboxGroupMsg = Msg<'toggle'> | Msg<'up'> | Msg<'down'> | Msg<'focus'> | Msg<'blur'>;

export function checkboxGroup(config: CheckboxGroupConfig): ComponentDescriptor<CheckboxGroupModel, CheckboxGroupMsg> {
  const options = config.options;
  return {
    init(): [CheckboxGroupModel, Cmd<CheckboxGroupMsg>] {
      return [{ checked: new Set(options.filter((o) => o.checked).map((o) => o.value)), highlighted: 0, focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: CheckboxGroupMsg, model: CheckboxGroupModel): [CheckboxGroupModel, Cmd<CheckboxGroupMsg>] {
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
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
    },
    view(model: CheckboxGroupModel): VNode {
      const tokens = useTokens(checkboxContract, config, 'CheckboxGroup');
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const chkStyle = style({ color: tokens.checked });
      const items = options.map((opt, i) => {
        const isChecked = model.checked.has(opt.value);
        const s = i === model.highlighted ? hlStyle : isChecked ? chkStyle : undefined;
        const item = text(`${i === model.highlighted ? '▸ ' : '  '}${isChecked ? '[✓]' : '[ ]'} ${opt.label}`, s);
        setVNodeMeta(item, {
          testId: opt.value,
          a11y: { role: 'checkbox', label: opt.label, checked: isChecked },
        });
        return item;
      });
      return column(...items);
    },
    subscriptions(model: CheckboxGroupModel): Sub<CheckboxGroupMsg> {
      if (!model.focused) return Sub.none();
      return Sub.batch<CheckboxGroupMsg>(Sub.key('space', { type: 'toggle' }), Sub.key('up', { type: 'up' }), Sub.key('down', { type: 'down' }));
    },
  };
}
