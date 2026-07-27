import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import { graphemes } from './editable-text.js';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, positiveInteger, wheelDirection } from './internal.js';
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
  maxSuggestions?: number;
  onChange?: (value: string) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface AutocompleteModel {
  query: string;
  suggestions: string[];
  highlighted: number;
  open: boolean;
  focused?: boolean;
  hoveredIndex?: number | null;
}
export type AutocompleteMsg =
  | Msg<'key', { event: KeyEvent }>
  | Msg<'paste', { value: string }>
  | Msg<'input', { char: string }>
  | Msg<'backspace'>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'select-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'close'>
  | Msg<'noop'>;

export function autocomplete(config: AutocompleteConfig): ComponentDescriptor<AutocompleteModel, AutocompleteMsg> {
  const placeholder = config.placeholder ?? '';
  const maxSuggestions = positiveInteger(config.maxSuggestions, 10);
  const interactionId = generateFocusGroupId(`autocomplete-${placeholder || 'input'}`);
  const focusTag = `${interactionId}:focus`;
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const scrollTag = `${interactionId}:scroll`;

  const suggestionsFor = (query: string): string[] => {
    const result = config.source(query);
    return Array.isArray(result) ? result.slice(0, 100_000).map(String) : [];
  };

  const normalizeModel = (model: AutocompleteModel): AutocompleteModel => {
    const suggestions = Array.isArray(model.suggestions) ? model.suggestions.slice(0, 100_000).map(String) : [];
    const highlighted = suggestions.length > 0 ? boundedInteger(model.highlighted, 0, 0, suggestions.length - 1) : 0;
    return { ...model, suggestions, highlighted, open: Boolean(model.open && suggestions.length > 0) };
  };
  return {
    init(): [AutocompleteModel, Cmd<AutocompleteMsg>] {
      return [{ query: '', suggestions: [], highlighted: 0, open: false, focused: false, hoveredIndex: null }, Cmd.none()];
    },
    update(msg: AutocompleteMsg, model: AutocompleteModel): [AutocompleteModel, Cmd<AutocompleteMsg>] {
      model = normalizeModel(model);
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
          const q = graphemes(model.query + msg.char)
            .slice(0, 100_000)
            .join('');
          const s = suggestionsFor(q);
          config.onChange?.(q);
          return [{ ...model, query: q, suggestions: s, highlighted: 0, open: s.length > 0, hoveredIndex: null }, Cmd.none()];
        }
        case 'backspace': {
          const q = graphemes(model.query).slice(0, -1).join('');
          const s = suggestionsFor(q);
          config.onChange?.(q);
          return [{ ...model, query: q, suggestions: s, highlighted: 0, open: s.length > 0, hoveredIndex: null }, Cmd.none()];
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
        case 'select-at':
          return Number.isInteger(msg.index) && msg.index >= 0 && msg.index < model.suggestions.length
            ? this.update({ type: 'select' }, { ...model, highlighted: msg.index, focused: true })
            : [model, Cmd.none()];
        case 'hover-at':
          return Number.isInteger(msg.index) && msg.index >= 0 && msg.index < model.suggestions.length
            ? [{ ...model, highlighted: msg.index, hoveredIndex: msg.index }, Cmd.none()]
            : [model, Cmd.none()];
        case 'leave':
          return [{ ...model, hoveredIndex: null }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, open: false, hoveredIndex: null }, Cmd.none()];
        case 'close':
          return [{ ...model, open: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: AutocompleteModel): VNode {
      model = normalizeModel(model);
      const tokens = useTokens(autocompleteContract, config, 'Autocomplete');
      const dimStyle = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder, dim: true });
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const display = model.query.length > 0 ? row(text(model.query), text(' ', style({ reverse: true }))) : text(placeholder, dimStyle);
      const inputTarget = event(
        `${interactionId}:input`,
        display,
        { onClick: focusTag },
        { label: placeholder || 'Autocomplete', intent: 'edit', affordances: ['click'], cursor: 'text' },
      );
      if (!model.open || model.suggestions.length === 0) return inputTarget;
      const start = model.highlighted >= maxSuggestions ? model.highlighted - maxSuggestions + 1 : 0;
      const items = model.suggestions.slice(start, start + maxSuggestions).map((suggestion, localIndex) => {
        const index = start + localIndex;
        const active = index === model.highlighted || index === model.hoveredIndex;
        return event(
          `${interactionId}:suggestion:${index}`,
          text((active ? '▸ ' : '  ') + suggestion, active ? hlStyle : applyTypography(tokens.labelStyle)),
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag, onScroll: scrollTag },
          { label: suggestion, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
        );
      });
      return column(inputTarget, ...items);
    },
    subscriptions(model: AutocompleteModel): Sub<AutocompleteMsg> {
      const pointer = Sub.elementMouse<AutocompleteMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === scrollTag) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction < 0 ? { type: 'up' } : direction > 0 ? { type: 'down' } : { type: 'noop' };
        }
        if (mouseEvent.elementId === `${interactionId}:input` && mouseEvent.handlerTag === focusTag) return { type: 'focus' };
        if (!mouseEvent.elementId.startsWith(`${interactionId}:suggestion:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:suggestion:`.length));
        if (mouseEvent.handlerTag === selectTag) return { type: 'select-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return pointer;
      return Sub.batch(
        pointer,
        Sub.keyEvent<AutocompleteMsg>((event) => ({ type: 'key', event })),
        Sub.paste<AutocompleteMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
