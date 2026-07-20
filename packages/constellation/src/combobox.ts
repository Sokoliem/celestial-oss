import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, row, Sub, text } from '@celestial/nebula';
import { applySingleLineKey, graphemes, insertSingleLinePaste, replaceSelection } from './editable-text.js';
import { moveOptionHighlight } from './option-list-view.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ComboboxTokens {
  text: Color;
  highlight: Color;
  placeholder: Color;
  border: Color;
  borderActive: Color;
  muted: Color;
  labelStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const comboboxContract: TokenContract<ComboboxTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  muted: (t: SemanticTheme) => t.colors.muted,
  labelStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ComboboxOption {
  label: string;
  value: string;
}

export interface ComboboxConfig {
  options: ComboboxOption[];
  placeholder?: string;
  value?: string;
  allowCustom?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface ComboboxModel {
  inputBuffer: string;
  cursor: number;
  open: boolean;
  highlighted: number;
  filteredIndices: number[];
  focused: boolean;
}

export type ComboboxMsg =
  | Msg<'key', { event: KeyEvent }>
  | Msg<'paste', { value: string }>
  | Msg<'char', { char: string }>
  | Msg<'backspace'>
  | Msg<'delete'>
  | Msg<'cursor-left'>
  | Msg<'cursor-right'>
  | Msg<'home'>
  | Msg<'end'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'submit'>
  | Msg<'close'>
  | Msg<'focus'>
  | Msg<'blur'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterOptions(options: ComboboxOption[], query: string): number[] {
  if (query.length === 0) return options.map((_, i) => i);
  const lower = query.toLowerCase();
  const indices: number[] = [];
  for (let i = 0; i < options.length; i++) {
    if (options[i]!.label.toLowerCase().includes(lower)) indices.push(i);
  }
  return indices;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function combobox(config: ComboboxConfig): ComponentDescriptor<ComboboxModel, ComboboxMsg> {
  const options = config.options;
  const placeholder = config.placeholder ?? 'Type or select...';
  const allowCustom = config.allowCustom ?? true;

  function withInput(model: ComboboxModel, value: string, cursor: number): ComboboxModel {
    const filteredIndices = filterOptions(options, value);
    if (value !== model.inputBuffer) config.onChange?.(value);
    return { ...model, inputBuffer: value, cursor, filteredIndices, highlighted: 0, open: filteredIndices.length > 0 };
  }

  return {
    init(): [ComboboxModel, Cmd<ComboboxMsg>] {
      const initVal = config.value ?? '';
      const filtered = filterOptions(options, initVal);
      return [
        {
          inputBuffer: initVal,
          cursor: graphemes(initVal).length,
          open: false,
          highlighted: 0,
          filteredIndices: filtered,
          focused: false,
        },
        Cmd.none(),
      ];
    },

    update(msg: ComboboxMsg, model: ComboboxModel): [ComboboxModel, Cmd<ComboboxMsg>] {
      const parts = graphemes(model.inputBuffer);
      const partCount = parts.length;

      switch (msg.type) {
        case 'key': {
          if (msg.event.key === 'escape') return this.update({ type: 'close' }, model);
          if (msg.event.key === 'up' && model.open) return this.update({ type: 'up' }, model);
          if (msg.event.key === 'down' && model.open) return this.update({ type: 'down' }, model);
          if (msg.event.key === 'enter') return this.update({ type: model.open ? 'select' : 'submit' }, model);
          const result = applySingleLineKey({ value: model.inputBuffer, cursor: model.cursor }, msg.event);
          return [withInput(model, result.state.value, result.state.cursor), Cmd.none()];
        }
        case 'paste': {
          const next = insertSingleLinePaste({ value: model.inputBuffer, cursor: model.cursor }, msg.value);
          return [withInput(model, next.value, next.cursor), Cmd.none()];
        }
        case 'char': {
          const next = replaceSelection({ value: model.inputBuffer, cursor: model.cursor }, msg.char);
          return [withInput(model, next.value, next.cursor), Cmd.none()];
        }
        case 'backspace': {
          if (model.cursor === 0) return [model, Cmd.none()];
          const before = parts.slice(0, model.cursor - 1).join('');
          const after = parts.slice(model.cursor).join('');
          const nv = before + after;
          return [withInput(model, nv, model.cursor - 1), Cmd.none()];
        }
        case 'delete': {
          if (model.cursor >= partCount) return [model, Cmd.none()];
          const before = parts.slice(0, model.cursor).join('');
          const after = parts.slice(model.cursor + 1).join('');
          const nv = before + after;
          return [withInput(model, nv, model.cursor), Cmd.none()];
        }
        case 'cursor-left':
          return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
        case 'cursor-right':
          return [{ ...model, cursor: Math.min(partCount, model.cursor + 1) }, Cmd.none()];
        case 'home':
          return [{ ...model, cursor: 0 }, Cmd.none()];
        case 'end':
          return [{ ...model, cursor: partCount }, Cmd.none()];
        case 'up': {
          if (model.filteredIndices.length === 0) return [model, Cmd.none()];
          const next = moveOptionHighlight(model.highlighted, model.filteredIndices.length, 'up');
          return [{ ...model, highlighted: next }, Cmd.none()];
        }
        case 'down': {
          if (model.filteredIndices.length === 0) return [model, Cmd.none()];
          const next = moveOptionHighlight(model.highlighted, model.filteredIndices.length, 'down');
          return [{ ...model, highlighted: next }, Cmd.none()];
        }
        case 'select': {
          const optIndex = model.filteredIndices[model.highlighted];
          const opt = optIndex !== undefined ? options[optIndex] : undefined;
          if (!opt) return [model, Cmd.none()];
          config.onChange?.(opt.value);
          return [
            {
              ...model,
              inputBuffer: opt.label,
              cursor: graphemes(opt.label).length,
              open: false,
              highlighted: 0,
              filteredIndices: filterOptions(options, opt.label),
            },
            Cmd.none(),
          ];
        }
        case 'submit': {
          if (!allowCustom) {
            const match = options.find((o) => o.label === model.inputBuffer || o.value === model.inputBuffer);
            if (!match) return [model, Cmd.none()];
          }
          config.onSubmit?.(model.inputBuffer);
          return [model, Cmd.none()];
        }
        case 'close':
          return [{ ...model, open: false, highlighted: 0 }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, open: false }, Cmd.none()];
      }
    },

    view(model: ComboboxModel): VNode {
      const tokens = useTokens(comboboxContract, config, 'Combobox');
      const dimStyle = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder, dim: true });
      const hlStyle = style({ color: tokens.highlight, bold: true });

      // Build input display
      let inputDisplay: VNode;
      if (model.inputBuffer.length === 0 && !model.focused) {
        inputDisplay = text(placeholder, dimStyle);
      } else if (model.inputBuffer.length === 0 && model.focused) {
        inputDisplay = row(text(' ', style({ reverse: true })));
      } else if (model.focused) {
        const parts = graphemes(model.inputBuffer);
        const beforeStr = parts.slice(0, model.cursor).join('');
        const ch = model.cursor < parts.length ? parts[model.cursor]! : ' ';
        const afterStr = parts.slice(model.cursor + 1).join('');
        inputDisplay = row(text(beforeStr), text(ch, style({ reverse: true })), text(afterStr));
      } else {
        inputDisplay = text(model.inputBuffer, applyTypography(tokens.labelStyle));
      }

      if (!model.open || model.filteredIndices.length === 0) return inputDisplay;

      // Build dropdown items
      const items = model.filteredIndices.map((optIdx, i) => {
        const opt = options[optIdx]!;
        const isHighlighted = i === model.highlighted;
        const prefix = isHighlighted ? '▸ ' : '  ';
        return text(prefix + opt.label, isHighlighted ? hlStyle : applyTypography(tokens.labelStyle));
      });

      return column(inputDisplay, ...items);
    },

    subscriptions(model: ComboboxModel): Sub<ComboboxMsg> {
      if (!model.focused) return Sub.none();

      return Sub.batch(
        Sub.keyEvent<ComboboxMsg>((event) => ({ type: 'key', event })),
        Sub.paste<ComboboxMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
