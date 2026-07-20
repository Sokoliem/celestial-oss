import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { EchoHint, FocusOptions, Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, focus, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import type { Validator } from './validation.js';
import { compose as composeValidators, validate } from './validation.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TextInputTokens {
  text: Color;
  placeholder: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  placeholderStyle: TypographyToken;
  bodyStyle: TypographyToken;
}

export const textInputContract: TokenContract<TextInputTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
  bodyStyle: (t: SemanticTheme) => t.typography.body,
};

export interface TextInputConfig {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  mask?: string;
  /** Validators run on submit; first failure sets validationError on the model. */
  validators?: Validator[];
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface TextInputModel {
  value: string;
  cursor: number;
  focused: boolean;
  hovered?: boolean;
  validationError?: string;
}
export type TextInputMsg =
  | Msg<'char', { char: string }>
  | Msg<'backspace'>
  | Msg<'delete'>
  | Msg<'cursor-left'>
  | Msg<'cursor-right'>
  | Msg<'home'>
  | Msg<'end'>
  | Msg<'submit'>
  | Msg<'hover'>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

function printableCharSubscriptions(): Array<Sub<TextInputMsg>> {
  const subscriptions: Array<Sub<TextInputMsg>> = [Sub.key('space', { type: 'char', char: ' ' })];

  for (let code = 33; code <= 126; code++) {
    const char = String.fromCharCode(code);
    subscriptions.push(Sub.key(char, { type: 'char', char }));
  }

  return subscriptions;
}

/** Convert a string to an array of codepoints (handles surrogate pairs). */
function toCodepoints(s: string): string[] {
  return Array.from(s);
}

export function textInput(config: TextInputConfig): ComponentDescriptor<TextInputModel, TextInputMsg> {
  const placeholder = config.placeholder ?? '';
  const mask = config.mask;
  const printableSubs = printableCharSubscriptions();
  const inputId = `text-input-${Math.random().toString(36).slice(2, 10)}`;

  function buildEchoHint(model: TextInputModel): EchoHint {
    return {
      kind: 'text-input' as const,
      value: model.value,
      cursor: model.cursor,
      mask,
    };
  }

  function buildDisplayRow(model: TextInputModel, tokens: TextInputTokens): VNode {
    if (model.value.length === 0 && !model.focused) {
      return text(
        placeholder,
        applyTypography(tokens.placeholderStyle, {
          color: model.hovered ? tokens.borderHover : tokens.placeholder,
          bold: model.hovered,
          reverse: model.hovered,
        }),
      );
    }
    const cps = toCodepoints(model.value);
    const cpLen = cps.length;
    const displayCps = mask ? Array(cpLen).fill(mask) : cps;
    const display = displayCps.join('');
    if (!model.focused) {
      return row(text(display, model.hovered ? style({ color: tokens.borderHover, bold: true, reverse: true }) : undefined));
    }
    const beforeStr = displayCps.slice(0, model.cursor).join('');
    const ch = model.cursor < cpLen ? displayCps[model.cursor]! : ' ';
    const afterStr = displayCps.slice(model.cursor + 1).join('');
    const cursorStyle = style({ reverse: true });
    return row(text(beforeStr), text(ch, cursorStyle), text(afterStr));
  }

  return {
    init(): [TextInputModel, Cmd<TextInputMsg>] {
      const initVal = config.value ?? '';
      return [{ value: initVal, cursor: toCodepoints(initVal).length, focused: false }, Cmd.none()];
    },
    update(msg: TextInputMsg, model: TextInputModel): [TextInputModel, Cmd<TextInputMsg>] {
      const cps = toCodepoints(model.value);
      const cpLen = cps.length;
      switch (msg.type) {
        case 'char': {
          const before = cps.slice(0, model.cursor).join('');
          const after = cps.slice(model.cursor).join('');
          const nv = before + msg.char + after;
          config.onChange?.(nv);
          return [{ ...model, value: nv, cursor: model.cursor + 1 }, Cmd.none()];
        }
        case 'backspace': {
          if (model.cursor === 0) return [model, Cmd.none()];
          const before = cps.slice(0, model.cursor - 1).join('');
          const after = cps.slice(model.cursor).join('');
          const nv = before + after;
          config.onChange?.(nv);
          return [{ ...model, value: nv, cursor: model.cursor - 1 }, Cmd.none()];
        }
        case 'delete': {
          if (model.cursor >= cpLen) return [model, Cmd.none()];
          const before = cps.slice(0, model.cursor).join('');
          const after = cps.slice(model.cursor + 1).join('');
          const nv = before + after;
          config.onChange?.(nv);
          return [{ ...model, value: nv }, Cmd.none()];
        }
        case 'cursor-left':
          return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
        case 'cursor-right':
          return [{ ...model, cursor: Math.min(cpLen, model.cursor + 1) }, Cmd.none()];
        case 'home':
          return [{ ...model, cursor: 0 }, Cmd.none()];
        case 'end':
          return [{ ...model, cursor: cpLen }, Cmd.none()];
        case 'submit': {
          if (config.validators && config.validators.length > 0) {
            const composed = composeValidators(...config.validators);
            const error = validate(model.value, composed);
            if (error) {
              return [{ ...model, validationError: error }, Cmd.none()];
            }
          }
          config.onSubmit?.(model.value);
          return [{ ...model, validationError: undefined }, Cmd.none()];
        }
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: TextInputModel): VNode {
      const tokens = useTokens(textInputContract, config, 'TextInput');
      const content = buildDisplayRow(model, tokens);
      const focusOptions: FocusOptions = {
        focused: model.focused,
        echoHint: model.focused ? buildEchoHint(model) : undefined,
      };
      const surfaceId = `${inputId}:surface`;
      const focusTag = `${inputId}:focus`;
      const hoverTag = `${inputId}:hover`;
      const leaveTag = `${inputId}:leave`;
      const surface = event(
        surfaceId,
        content,
        { onClick: focusTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: placeholder || 'Text input', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text', keyboardHint: 'Type' },
      );
      setVNodeMeta(surface, {
        testId: placeholder || inputId,
        a11y: { role: 'textbox', label: placeholder },
      });
      return focus(inputId, surface, focusOptions);
    },
    subscriptions(model: TextInputModel): Sub<TextInputMsg> {
      const surfaceId = `${inputId}:surface`;
      const focusTag = `${inputId}:focus`;
      const hoverTag = `${inputId}:hover`;
      const leaveTag = `${inputId}:leave`;
      const mouse = Sub.elementMouse<TextInputMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== surfaceId) return { type: 'noop' };
        if (mouseEvent.handlerTag === focusTag) return { type: 'focus' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<TextInputMsg>(
        mouse,
        ...printableSubs,
        Sub.key('left', { type: 'cursor-left' }),
        Sub.key('right', { type: 'cursor-right' }),
        Sub.key('home', { type: 'home' }),
        Sub.key('end', { type: 'end' }),
        Sub.key('backspace', { type: 'backspace' }),
        Sub.key('delete', { type: 'delete' }),
        Sub.key('enter', { type: 'submit' }),
      );
    },
  };
}
