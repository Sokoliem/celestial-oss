import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { EchoHint, FocusOptions, KeyEvent, LayoutRects, Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, focus, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import {
  applySingleLineKey,
  deleteBackward,
  deleteForward,
  graphemeIndexAtCell,
  graphemes,
  insertSingleLinePaste,
  replaceSelection,
  selectionRange,
} from './editable-text.js';
import { generateFocusGroupId } from './focus-group.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import type { Validator } from './validation.js';
import { compose as composeValidators, validate } from './validation.js';

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
  text: (theme: SemanticTheme) => theme.colors.text,
  placeholder: (theme: SemanticTheme) => theme.colors.muted,
  border: (theme: SemanticTheme) => theme.colors.border,
  borderHover: (theme: SemanticTheme) => theme.colors.borderHover,
  borderActive: (theme: SemanticTheme) => theme.colors.borderActive,
  placeholderStyle: (theme: SemanticTheme) => theme.typography.caption,
  bodyStyle: (theme: SemanticTheme) => theme.typography.body,
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
  /** Cursor position measured in grapheme clusters. */
  cursor: number;
  focused: boolean;
  hovered?: boolean;
  selectionAnchor?: number;
  layoutX?: number;
  validationError?: string;
}

export type TextInputMsg =
  | Msg<'key', { event: KeyEvent }>
  | Msg<'paste', { value: string }>
  | Msg<'pointer', { x: number }>
  | Msg<'layout', { rects: LayoutRects }>
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

function keyEvent(key: string, char?: string): KeyEvent {
  return { key, char, ctrl: false, alt: false, shift: false };
}

export function textInput(config: TextInputConfig): ComponentDescriptor<TextInputModel, TextInputMsg> {
  const placeholder = config.placeholder ?? '';
  const mask = config.mask;
  const maskGrapheme = mask ? (graphemes(mask)[0] ?? '*') : undefined;
  const inputId = generateFocusGroupId('text-input');
  const surfaceId = `${inputId}:surface`;
  const focusTag = `${inputId}:focus`;
  const hoverTag = `${inputId}:hover`;
  const leaveTag = `${inputId}:leave`;

  function buildEchoHint(model: TextInputModel): EchoHint {
    return { kind: 'text-input', value: model.value, cursor: model.cursor, mask: maskGrapheme };
  }

  function displayedGraphemes(value: string): string[] {
    const parts = graphemes(value);
    return maskGrapheme ? parts.map(() => maskGrapheme) : parts;
  }

  function buildDisplayRow(model: TextInputModel, tokens: TextInputTokens): VNode {
    if (model.value.length === 0 && !model.focused) {
      return text(
        placeholder,
        applyTypography(tokens.placeholderStyle, {
          color: model.hovered ? tokens.borderHover : tokens.placeholder,
        }),
      );
    }

    const parts = displayedGraphemes(model.value);
    const display = parts.join('');
    if (!model.focused) {
      return row(text(display, model.hovered ? style({ color: tokens.borderHover }) : style({ color: tokens.text })));
    }

    const range = selectionRange(model);
    if (range) {
      return row(
        text(parts.slice(0, range[0]).join(''), style({ color: tokens.text })),
        text(parts.slice(range[0], range[1]).join(''), style({ color: tokens.text, reverse: true })),
        text(parts.slice(range[1]).join(''), style({ color: tokens.text })),
      );
    }

    const before = parts.slice(0, model.cursor).join('');
    const cursor = model.cursor < parts.length ? parts[model.cursor]! : ' ';
    const after = parts.slice(model.cursor + 1).join('');
    return row(
      text(before, style({ color: tokens.text })),
      text(cursor, style({ color: tokens.text, reverse: true })),
      text(after, style({ color: tokens.text })),
    );
  }

  function submit(model: TextInputModel): TextInputModel {
    if (config.validators && config.validators.length > 0) {
      const error = validate(model.value, composeValidators(...config.validators));
      if (error) return { ...model, validationError: error };
    }
    config.onSubmit?.(model.value);
    return { ...model, validationError: undefined };
  }

  function applyKey(model: TextInputModel, event: KeyEvent): TextInputModel {
    const result = applySingleLineKey(model, event);
    if (result.submit) return submit(model);
    if (result.changed) config.onChange?.(result.state.value);
    return { ...model, ...result.state };
  }

  return {
    init(): [TextInputModel, Cmd<TextInputMsg>] {
      const value = config.value ?? '';
      return [{ value, cursor: graphemes(value).length, focused: false }, Cmd.none()];
    },
    update(msg: TextInputMsg, model: TextInputModel): [TextInputModel, Cmd<TextInputMsg>] {
      switch (msg.type) {
        case 'key':
          return [applyKey(model, msg.event), Cmd.none()];
        case 'paste': {
          const state = insertSingleLinePaste(model, msg.value);
          if (state.value !== model.value) config.onChange?.(state.value);
          return [{ ...model, ...state }, Cmd.none()];
        }
        case 'pointer': {
          const display = displayedGraphemes(model.value).join('');
          const cursor = graphemeIndexAtCell(display, msg.x - (model.layoutX ?? msg.x));
          return [{ ...model, cursor, selectionAnchor: undefined, focused: true }, Cmd.none()];
        }
        case 'layout': {
          const rect = msg.rects.rects.get(inputId);
          return rect ? [{ ...model, layoutX: rect.x }, Cmd.none()] : [model, Cmd.none()];
        }
        case 'char': {
          const state = replaceSelection(model, msg.char);
          if (state.value !== model.value) config.onChange?.(state.value);
          return [{ ...model, ...state }, Cmd.none()];
        }
        case 'backspace': {
          const state = deleteBackward(model);
          if (state.value !== model.value) config.onChange?.(state.value);
          return [{ ...model, ...state }, Cmd.none()];
        }
        case 'delete': {
          const state = deleteForward(model);
          if (state.value !== model.value) config.onChange?.(state.value);
          return [{ ...model, ...state }, Cmd.none()];
        }
        case 'cursor-left':
          return [applyKey(model, keyEvent('left')), Cmd.none()];
        case 'cursor-right':
          return [applyKey(model, keyEvent('right')), Cmd.none()];
        case 'home':
          return [applyKey(model, keyEvent('home')), Cmd.none()];
        case 'end':
          return [applyKey(model, keyEvent('end')), Cmd.none()];
        case 'submit':
          return [submit(model), Cmd.none()];
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, selectionAnchor: undefined }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: TextInputModel): VNode {
      const tokens = useTokens(textInputContract, config, 'TextInput');
      const content = buildDisplayRow(model, tokens);
      const focusOptions: FocusOptions = {
        focused: model.focused,
        echoHint: model.focused && !selectionRange(model) ? buildEchoHint(model) : undefined,
      };
      const surface = event(
        surfaceId,
        content,
        { onClick: focusTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: placeholder || 'Text input', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text', keyboardHint: 'Type' },
      );
      setVNodeMeta(surface, { testId: placeholder || inputId, a11y: { role: 'textbox', label: placeholder } });
      return focus(inputId, surface, focusOptions);
    },
    subscriptions(model: TextInputModel): Sub<TextInputMsg> {
      const mouse = Sub.elementMouse<TextInputMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== surfaceId) return { type: 'noop' };
        if (mouseEvent.handlerTag === focusTag) return { type: 'pointer', x: mouseEvent.x };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      const layout = Sub.layout<TextInputMsg>([inputId], (rects) => ({ type: 'layout', rects }));
      if (!model.focused) return Sub.batch(mouse, layout);
      return Sub.batch(
        mouse,
        layout,
        Sub.keyEvent<TextInputMsg>((event) => ({ type: 'key', event })),
        Sub.paste<TextInputMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
