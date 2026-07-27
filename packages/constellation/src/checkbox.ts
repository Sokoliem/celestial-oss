import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { ensureReadableColor, style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, MAX_RENDER_CELLS } from './internal.js';
import { applyState, applyTypography, useTokens } from './theme.js';
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
  hoverState: StateToken;
  activeState: StateToken;
  labelStyle: TypographyToken;
}

export const checkboxContract: TokenContract<CheckboxTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  checked: (t: SemanticTheme) =>
    ensureReadableColor(t.colors.tones.success, [t.colors.surface, t.colors.surfaceAlt, t.colors.surfaceRaised]),
  unchecked: (t: SemanticTheme) => t.colors.muted,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  hoverState: (t: SemanticTheme) => t.states.hover,
  activeState: (t: SemanticTheme) => t.states.active,
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
      const checkboxStyle = model.hovered
        ? applyState(tokens.hoverState, { bold: true })
        : model.focused
          ? applyState(tokens.activeState, { bold: true })
          : model.checked
            ? style({ color: tokens.checked })
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
export type CheckboxGroupMsg =
  | Msg<'toggle'>
  | Msg<'toggle-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

export function checkboxGroup(config: CheckboxGroupConfig): ComponentDescriptor<CheckboxGroupModel, CheckboxGroupMsg> {
  const options = config.options.slice(0, MAX_RENDER_CELLS).map((option) => ({ ...option }));
  const interactionId = generateFocusGroupId('checkbox-group');
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const validValues = new Set(options.map((option) => option.value));
  const normalizeModel = (model: CheckboxGroupModel): CheckboxGroupModel => ({
    checked: new Set([...model.checked].filter((value) => validValues.has(value))),
    highlighted: options.length === 0 ? 0 : boundedInteger(model.highlighted, 0, 0, options.length - 1),
    focused: Boolean(model.focused),
  });
  return {
    init(): [CheckboxGroupModel, Cmd<CheckboxGroupMsg>] {
      return [{ checked: new Set(options.filter((o) => o.checked).map((o) => o.value)), highlighted: 0, focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: CheckboxGroupMsg, model: CheckboxGroupModel): [CheckboxGroupModel, Cmd<CheckboxGroupMsg>] {
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
    },
    view(model: CheckboxGroupModel): VNode {
      const safeModel = normalizeModel(model);
      const tokens = useTokens(checkboxContract, config, 'CheckboxGroup');
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const chkStyle = style({ color: tokens.checked });
      const items = options.map((opt, i) => {
        const isChecked = safeModel.checked.has(opt.value);
        const s = i === safeModel.highlighted ? hlStyle : isChecked ? chkStyle : undefined;
        const item = text(`${i === safeModel.highlighted ? '▸ ' : '  '}${isChecked ? '[✓]' : '[ ]'} ${opt.label}`, s);
        setVNodeMeta(item, {
          testId: opt.value,
          a11y: { role: 'checkbox', label: opt.label, checked: isChecked },
        });
        return event(
          `${interactionId}:option:${i}`,
          item,
          { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: opt.label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
        );
      });
      return column(...items);
    },
    subscriptions(model: CheckboxGroupModel): Sub<CheckboxGroupMsg> {
      const mouse = Sub.elementMouse<CheckboxGroupMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === toggleTag) return { type: 'toggle-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<CheckboxGroupMsg>(mouse, Sub.key('space', { type: 'toggle' }), Sub.key('up', { type: 'up' }), Sub.key('down', { type: 'down' }));
    },
  };
}
