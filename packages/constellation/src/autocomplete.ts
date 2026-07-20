import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, row, Sub, text } from '@celestial/nebula';
import { graphemes } from './editable-text.js';
import { moveOptionHighlight } from './option-list-view.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface AutocompleteTokens {
  text: Color;
  highlight: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  muted: Color;
  placeholder: Color;
  labelStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const autocompleteContract: TokenContract<AutocompleteTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  muted: (t: SemanticTheme) => t.colors.muted,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  labelStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
};

export interface AutocompleteConfig {
  source: (query: string) => string[];
  placeholder?: string;
  onChange?: (value: string) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface AutocompleteModel {
  query: string;
  suggestions: string[];
  highlighted: number;
  open: boolean;
}
export type AutocompleteMsg =
  | Msg<'key', { event: KeyEvent }>
  | Msg<'paste', { value: string }>
  | Msg<'input', { char: string }>
  | Msg<'backspace'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'close'>;

export function autocomplete(config: AutocompleteConfig): ComponentDescriptor<AutocompleteModel, AutocompleteMsg> {
  const placeholder = config.placeholder ?? '';
  return {
    init(): [AutocompleteModel, Cmd<AutocompleteMsg>] {
      return [{ query: '', suggestions: [], highlighted: 0, open: false }, Cmd.none()];
    },
    update(msg: AutocompleteMsg, model: AutocompleteModel): [AutocompleteModel, Cmd<AutocompleteMsg>] {
      switch (msg.type) {
        case 'key':
          if (msg.event.key === 'escape') return this.update({ type: 'close' }, model);
          if (msg.event.key === 'up' && model.open) return this.update({ type: 'up' }, model);
          if (msg.event.key === 'down' && model.open) return this.update({ type: 'down' }, model);
          if (msg.event.key === 'enter' && model.open) return this.update({ type: 'select' }, model);
          if (msg.event.key === 'backspace') return this.update({ type: 'backspace' }, model);
          if (msg.event.char && !msg.event.ctrl && !msg.event.alt) return this.update({ type: 'input', char: msg.event.char }, model);
          return [model, Cmd.none()];
        case 'paste':
          return this.update({ type: 'input', char: msg.value.replace(/\r\n?|\n/g, ' ') }, model);
        case 'input': {
          const q = model.query + msg.char,
            s = config.source(q);
          config.onChange?.(q);
          return [{ query: q, suggestions: s, highlighted: 0, open: s.length > 0 }, Cmd.none()];
        }
        case 'backspace': {
          const q = graphemes(model.query).slice(0, -1).join('');
          const s = config.source(q);
          config.onChange?.(q);
          return [{ query: q, suggestions: s, highlighted: 0, open: s.length > 0 }, Cmd.none()];
        }
        case 'up':
          return [{ ...model, highlighted: moveOptionHighlight(model.highlighted, model.suggestions.length, 'up') }, Cmd.none()];
        case 'down':
          return [{ ...model, highlighted: moveOptionHighlight(model.highlighted, model.suggestions.length, 'down') }, Cmd.none()];
        case 'select': {
          const sel = model.suggestions[model.highlighted];
          if (sel) {
            config.onChange?.(sel);
            return [{ query: sel, suggestions: [], highlighted: 0, open: false }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }
        case 'close':
          return [{ ...model, open: false }, Cmd.none()];
      }
    },
    view(model: AutocompleteModel): VNode {
      const tokens = useTokens(autocompleteContract, config, 'Autocomplete');
      const dimStyle = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder, dim: true });
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const display = model.query.length > 0 ? row(text(model.query), text(' ', style({ reverse: true }))) : text(placeholder, dimStyle);
      if (!model.open || model.suggestions.length === 0) return display;
      const items = model.suggestions.map((s, i) =>
        text((i === model.highlighted ? '▸ ' : '  ') + s, i === model.highlighted ? hlStyle : applyTypography(tokens.labelStyle)),
      );
      return column(display, ...items);
    },
    subscriptions(model: AutocompleteModel): Sub<AutocompleteMsg> {
      void model;
      return Sub.batch(
        Sub.keyEvent<AutocompleteMsg>((event) => ({ type: 'key', event })),
        Sub.paste<AutocompleteMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
