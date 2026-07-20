import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, focus, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import type { Validator } from './validation.js';
import { compose as composeValidators, validate } from './validation.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TextareaTokens {
  text: Color;
  placeholder: Color;
  lineNumber: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  placeholderStyle: TypographyToken;
  bodyStyle: TypographyToken;
}

export const textareaContract: TokenContract<TextareaTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  lineNumber: (t: SemanticTheme) => t.colors.tones.accent,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
  bodyStyle: (t: SemanticTheme) => t.typography.body,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TextareaConfig {
  value?: string;
  placeholder?: string;
  rows?: number;
  maxLines?: number;
  showLineNumbers?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  /** Validators run on submit; first failure sets validationError on the model. */
  validators?: Validator[];
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface TextareaModel {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  scrollOffset: number;
  focused: boolean;
  hovered?: boolean;
  validationError?: string;
}

export type TextareaMsg =
  | Msg<'char', { char: string }>
  | Msg<'newline'>
  | Msg<'backspace'>
  | Msg<'delete'>
  | Msg<'cursor-left'>
  | Msg<'cursor-right'>
  | Msg<'cursor-up'>
  | Msg<'cursor-down'>
  | Msg<'home'>
  | Msg<'end'>
  | Msg<'page-up'>
  | Msg<'page-down'>
  | Msg<'submit'>
  | Msg<'hover'>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function printableCharSubscriptions(): Array<Sub<TextareaMsg>> {
  const subs: Array<Sub<TextareaMsg>> = [Sub.key('space', { type: 'char', char: ' ' } as TextareaMsg)];
  for (let code = 33; code <= 126; code++) {
    const char = String.fromCharCode(code);
    subs.push(Sub.key(char, { type: 'char', char } as TextareaMsg));
  }
  return subs;
}

function getValue(lines: string[]): string {
  return lines.join('\n');
}

/** Ensure scrollOffset keeps cursorRow visible within the viewport. */
function ensureCursorVisible(cursorRow: number, scrollOffset: number, visibleRows: number): number {
  if (cursorRow < scrollOffset) return cursorRow;
  if (cursorRow >= scrollOffset + visibleRows) return cursorRow - visibleRows + 1;
  return scrollOffset;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function textarea(config: TextareaConfig): ComponentDescriptor<TextareaModel, TextareaMsg> {
  const placeholder = config.placeholder ?? '';
  const visibleRows = config.rows ?? 5;
  const maxLines = config.maxLines ?? Infinity;
  const showLineNumbers = config.showLineNumbers ?? false;
  const readOnly = config.readOnly ?? false;
  const printableSubs = printableCharSubscriptions();
  const inputId = `textarea-${Math.random().toString(36).slice(2, 10)}`;
  const surfaceId = `${inputId}:surface`;
  const focusTag = `${inputId}:focus`;
  const hoverTag = `${inputId}:hover`;
  const leaveTag = `${inputId}:leave`;

  function interactiveSurface(content: VNode, model: TextareaModel, tokens: TextareaTokens): VNode {
    const visual =
      model.hovered && !model.focused ? box(content, style({ color: tokens.borderHover, bold: true, reverse: true }), { fit: 'content' }) : content;
    const surface = event(
      surfaceId,
      visual,
      { onClick: focusTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
      { label: placeholder || 'Textarea', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text', keyboardHint: 'Type' },
    );
    setVNodeMeta(surface, { testId: placeholder || inputId, a11y: { role: 'textbox', label: placeholder || 'Textarea' } });
    return focus(inputId, surface, { focused: model.focused });
  }

  return {
    init(): [TextareaModel, Cmd<TextareaMsg>] {
      const initVal = config.value ?? '';
      const lines = initVal.length > 0 ? initVal.split('\n') : [''];
      const cursorRow = lines.length - 1;
      const cursorCol = lines[cursorRow]!.length;
      return [{ lines, cursorRow, cursorCol, scrollOffset: 0, focused: false }, Cmd.none()];
    },

    update(msg: TextareaMsg, model: TextareaModel): [TextareaModel, Cmd<TextareaMsg>] {
      switch (msg.type) {
        case 'char': {
          if (readOnly) return [model, Cmd.none()];
          const lines = [...model.lines];
          const line = lines[model.cursorRow]!;
          lines[model.cursorRow] = line.slice(0, model.cursorCol) + msg.char + line.slice(model.cursorCol);
          const newCol = model.cursorCol + 1;
          config.onChange?.(getValue(lines));
          return [{ ...model, lines, cursorCol: newCol }, Cmd.none()];
        }

        case 'newline': {
          if (readOnly) return [model, Cmd.none()];
          if (model.lines.length >= maxLines) return [model, Cmd.none()];
          const lines = [...model.lines];
          const line = lines[model.cursorRow]!;
          const before = line.slice(0, model.cursorCol);
          const after = line.slice(model.cursorCol);
          lines.splice(model.cursorRow, 1, before, after);
          const newRow = model.cursorRow + 1;
          const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          config.onChange?.(getValue(lines));
          return [{ ...model, lines, cursorRow: newRow, cursorCol: 0, scrollOffset }, Cmd.none()];
        }

        case 'backspace': {
          if (readOnly) return [model, Cmd.none()];
          if (model.cursorCol > 0) {
            // Delete character within line
            const lines = [...model.lines];
            const line = lines[model.cursorRow]!;
            lines[model.cursorRow] = line.slice(0, model.cursorCol - 1) + line.slice(model.cursorCol);
            config.onChange?.(getValue(lines));
            return [{ ...model, lines, cursorCol: model.cursorCol - 1 }, Cmd.none()];
          }
          if (model.cursorRow > 0) {
            // Merge with previous line
            const lines = [...model.lines];
            const prevLine = lines[model.cursorRow - 1]!;
            const curLine = lines[model.cursorRow]!;
            const newCol = prevLine.length;
            lines[model.cursorRow - 1] = prevLine + curLine;
            lines.splice(model.cursorRow, 1);
            const newRow = model.cursorRow - 1;
            const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
            config.onChange?.(getValue(lines));
            return [{ ...model, lines, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }

        case 'delete': {
          if (readOnly) return [model, Cmd.none()];
          const line = model.lines[model.cursorRow]!;
          if (model.cursorCol < line.length) {
            // Delete character forward within line
            const lines = [...model.lines];
            lines[model.cursorRow] = line.slice(0, model.cursorCol) + line.slice(model.cursorCol + 1);
            config.onChange?.(getValue(lines));
            return [{ ...model, lines }, Cmd.none()];
          }
          if (model.cursorRow < model.lines.length - 1) {
            // Merge with next line
            const lines = [...model.lines];
            const nextLine = lines[model.cursorRow + 1]!;
            lines[model.cursorRow] = line + nextLine;
            lines.splice(model.cursorRow + 1, 1);
            config.onChange?.(getValue(lines));
            return [{ ...model, lines }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }

        case 'cursor-left': {
          if (model.cursorCol > 0) {
            return [{ ...model, cursorCol: model.cursorCol - 1 }, Cmd.none()];
          }
          if (model.cursorRow > 0) {
            const newRow = model.cursorRow - 1;
            const newCol = model.lines[newRow]!.length;
            const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
            return [{ ...model, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }

        case 'cursor-right': {
          const line = model.lines[model.cursorRow]!;
          if (model.cursorCol < line.length) {
            return [{ ...model, cursorCol: model.cursorCol + 1 }, Cmd.none()];
          }
          if (model.cursorRow < model.lines.length - 1) {
            const newRow = model.cursorRow + 1;
            const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
            return [{ ...model, cursorRow: newRow, cursorCol: 0, scrollOffset }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }

        case 'cursor-up': {
          if (model.cursorRow <= 0) return [model, Cmd.none()];
          const newRow = model.cursorRow - 1;
          const targetLine = model.lines[newRow]!;
          const newCol = Math.min(model.cursorCol, targetLine.length);
          const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
        }

        case 'cursor-down': {
          if (model.cursorRow >= model.lines.length - 1) return [model, Cmd.none()];
          const newRow = model.cursorRow + 1;
          const targetLine = model.lines[newRow]!;
          const newCol = Math.min(model.cursorCol, targetLine.length);
          const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
        }

        case 'home':
          return [{ ...model, cursorCol: 0 }, Cmd.none()];

        case 'end':
          return [{ ...model, cursorCol: model.lines[model.cursorRow]!.length }, Cmd.none()];

        case 'page-up': {
          const newRow = Math.max(0, model.cursorRow - visibleRows);
          const targetLine = model.lines[newRow]!;
          const newCol = Math.min(model.cursorCol, targetLine.length);
          const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
        }

        case 'page-down': {
          const newRow = Math.min(model.lines.length - 1, model.cursorRow + visibleRows);
          const targetLine = model.lines[newRow]!;
          const newCol = Math.min(model.cursorCol, targetLine.length);
          const scrollOffset = ensureCursorVisible(newRow, model.scrollOffset, visibleRows);
          return [{ ...model, cursorRow: newRow, cursorCol: newCol, scrollOffset }, Cmd.none()];
        }

        case 'submit': {
          const val = getValue(model.lines);
          if (config.validators && config.validators.length > 0) {
            const composed = composeValidators(...config.validators);
            const error = validate(val, composed);
            if (error) {
              return [{ ...model, validationError: error }, Cmd.none()];
            }
          }
          config.onSubmit?.(val);
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

    view(model: TextareaModel): VNode {
      const tokens = useTokens(textareaContract, config, 'Textarea');
      // Adjust scroll offset to keep cursor visible
      const scrollOffset = ensureCursorVisible(model.cursorRow, model.scrollOffset, visibleRows);

      // Empty + unfocused → placeholder
      if (!model.focused && model.lines.length === 1 && model.lines[0] === '') {
        const placeholderNode = text(placeholder, applyTypography(tokens.placeholderStyle, { color: tokens.placeholder, dim: true }));
        return interactiveSurface(column(placeholderNode), model, tokens);
      }

      const children: VNode[] = [];
      const lineCount = model.lines.length;
      const hasScrollUp = scrollOffset > 0;
      const hasScrollDown = scrollOffset + visibleRows < lineCount;

      // Line number gutter width: enough to fit the largest visible line number
      const maxLineNum = Math.min(scrollOffset + visibleRows, lineCount);
      const gutterWidth = showLineNumbers ? String(maxLineNum).length : 0;

      // Scroll-up indicator
      if (hasScrollUp) {
        const indicator = showLineNumbers ? text(`${' '.repeat(gutterWidth)} ▲`, style({ dim: true })) : text('▲', style({ dim: true }));
        children.push(indicator);
      }

      // Visible lines
      const endLine = Math.min(scrollOffset + visibleRows, lineCount);
      for (let i = scrollOffset; i < endLine; i++) {
        const line = model.lines[i]!;
        const isCursorLine = model.focused && i === model.cursorRow;
        const parts: VNode[] = [];

        // Line number
        if (showLineNumbers) {
          const num = String(i + 1).padStart(gutterWidth, ' ');
          const numStyle = isCursorLine ? style({ color: tokens.lineNumber, bold: true }) : style({ dim: true });
          parts.push(text(`${num}│`, numStyle));
        }

        // Line content
        if (model.focused && isCursorLine) {
          // Show cursor (reverse on character at cursor position)
          const before = line.slice(0, model.cursorCol);
          const ch = model.cursorCol < line.length ? line[model.cursorCol]! : ' ';
          const after = line.slice(model.cursorCol + 1);
          const cursorStyle = style({ reverse: true });

          if (before.length > 0) parts.push(text(before));
          parts.push(text(ch, cursorStyle));
          if (after.length > 0) parts.push(text(after));
        } else {
          // Unfocused or non-cursor line
          const lineStyle = !model.focused ? style({ dim: true }) : undefined;
          parts.push(text(line.length > 0 ? line : ' ', lineStyle));
        }

        children.push(row(...parts));
      }

      // Scroll-down indicator
      if (hasScrollDown) {
        const indicator = showLineNumbers ? text(`${' '.repeat(gutterWidth)} ▼`, style({ dim: true })) : text('▼', style({ dim: true }));
        children.push(indicator);
      }

      return interactiveSurface(column(...children), model, tokens);
    },

    subscriptions(model: TextareaModel): Sub<TextareaMsg> {
      const mouse = Sub.elementMouse<TextareaMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== surfaceId) return { type: 'noop' };
        if (mouseEvent.handlerTag === focusTag) return { type: 'focus' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<TextareaMsg>(
        mouse,
        ...printableSubs,
        Sub.key('left', { type: 'cursor-left' }),
        Sub.key('right', { type: 'cursor-right' }),
        Sub.key('up', { type: 'cursor-up' }),
        Sub.key('down', { type: 'cursor-down' }),
        Sub.key('home', { type: 'home' }),
        Sub.key('end', { type: 'end' }),
        Sub.key('backspace', { type: 'backspace' }),
        Sub.key('delete', { type: 'delete' }),
        Sub.key('enter', { type: 'newline' }),
        Sub.key('pageup', { type: 'page-up' }),
        Sub.key('pagedown', { type: 'page-down' }),
        Sub.keyWithModifiers('enter', { ctrl: true }, { type: 'submit' }),
      );
    },
  };
}
