import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import { applySingleLineKey, graphemes, insertSingleLinePaste, replaceSelection } from './editable-text.js';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, positiveInteger, wheelDirection } from './internal.js';
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
  hoverText: Color;
  hoverBackground: Color;
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
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceRaised,
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
  maxVisibleOptions?: number;
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
  hoveredIndex?: number | null;
  hoveredInput?: boolean;
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
  | Msg<'select-at', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'hover-input'>
  | Msg<'leave-input'>
  | Msg<'submit'>
  | Msg<'close'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterOptions(options: readonly ComboboxOption[], query: string): number[] {
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
  const options = config.options.slice(0, 100_000).map((option) => ({ ...option }));
  const placeholder = config.placeholder ?? 'Type or select...';
  const allowCustom = config.allowCustom ?? true;
  const maxVisible = positiveInteger(config.maxVisibleOptions, 10);
  const interactionId = generateFocusGroupId(`combobox-${placeholder}`);
  const focusTag = `${interactionId}:focus`;
  const selectTag = `${interactionId}:select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const scrollTag = `${interactionId}:scroll`;
  const hoverInputTag = `${interactionId}:hover-input`;
  const leaveInputTag = `${interactionId}:leave-input`;

  function normalizeFiltered(indices: readonly number[]): number[] {
    const result: number[] = [];
    const seen = new Set<number>();
    for (const index of indices.slice(0, options.length)) {
      if (!Number.isInteger(index) || index < 0 || index >= options.length || seen.has(index)) continue;
      seen.add(index);
      result.push(index);
    }
    return result;
  }

  function withInput(model: ComboboxModel, value: string, cursor: number): ComboboxModel {
    const parts = graphemes(value).slice(0, 100_000);
    const safeValue = parts.join('');
    const filteredIndices = filterOptions(options, safeValue);
    if (safeValue !== model.inputBuffer) config.onChange?.(safeValue);
    return {
      ...model,
      inputBuffer: safeValue,
      cursor: boundedInteger(cursor, parts.length, 0, parts.length),
      filteredIndices,
      highlighted: 0,
      open: filteredIndices.length > 0,
    };
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
          hoveredInput: false,
        },
        Cmd.none(),
      ];
    },

    update(msg: ComboboxMsg, model: ComboboxModel): [ComboboxModel, Cmd<ComboboxMsg>] {
      const parts = graphemes(model.inputBuffer);
      const partCount = parts.length;
      const cursor = boundedInteger(model.cursor, partCount, 0, partCount);
      const filteredIndices = normalizeFiltered(model.filteredIndices);
      const highlighted = filteredIndices.length > 0 ? boundedInteger(model.highlighted, 0, 0, filteredIndices.length - 1) : 0;
      const normalizedModel = { ...model, cursor, filteredIndices, highlighted };

      switch (msg.type) {
        case 'key': {
          if (msg.event.key === 'escape') return this.update({ type: 'close' }, model);
          if (msg.event.key === 'up' && model.open) return this.update({ type: 'up' }, model);
          if (msg.event.key === 'down' && model.open) return this.update({ type: 'down' }, model);
          if (msg.event.key === 'enter') return this.update({ type: model.open ? 'select' : 'submit' }, model);
          const result = applySingleLineKey({ value: model.inputBuffer, cursor }, msg.event);
          return [withInput(normalizedModel, result.state.value, result.state.cursor), Cmd.none()];
        }
        case 'paste': {
          const next = insertSingleLinePaste({ value: model.inputBuffer, cursor }, msg.value);
          return [withInput(normalizedModel, next.value, next.cursor), Cmd.none()];
        }
        case 'char': {
          const next = replaceSelection({ value: model.inputBuffer, cursor }, msg.char);
          return [withInput(normalizedModel, next.value, next.cursor), Cmd.none()];
        }
        case 'backspace': {
          if (cursor === 0) return [model, Cmd.none()];
          const before = parts.slice(0, cursor - 1).join('');
          const after = parts.slice(cursor).join('');
          const nv = before + after;
          return [withInput(normalizedModel, nv, cursor - 1), Cmd.none()];
        }
        case 'delete': {
          if (cursor >= partCount) return [model, Cmd.none()];
          const before = parts.slice(0, cursor).join('');
          const after = parts.slice(cursor + 1).join('');
          const nv = before + after;
          return [withInput(normalizedModel, nv, cursor), Cmd.none()];
        }
        case 'cursor-left':
          return [{ ...normalizedModel, cursor: Math.max(0, cursor - 1) }, Cmd.none()];
        case 'cursor-right':
          return [{ ...normalizedModel, cursor: Math.min(partCount, cursor + 1) }, Cmd.none()];
        case 'home':
          return [{ ...normalizedModel, cursor: 0 }, Cmd.none()];
        case 'end':
          return [{ ...normalizedModel, cursor: partCount }, Cmd.none()];
        case 'up': {
          if (filteredIndices.length === 0) return [normalizedModel, Cmd.none()];
          const next = moveOptionHighlight(highlighted, filteredIndices.length, 'up');
          return [{ ...normalizedModel, highlighted: next }, Cmd.none()];
        }
        case 'down': {
          if (filteredIndices.length === 0) return [normalizedModel, Cmd.none()];
          const next = moveOptionHighlight(highlighted, filteredIndices.length, 'down');
          return [{ ...normalizedModel, highlighted: next }, Cmd.none()];
        }
        case 'select': {
          const optIndex = filteredIndices[highlighted];
          const opt = optIndex !== undefined ? options[optIndex] : undefined;
          if (!opt) return [model, Cmd.none()];
          config.onChange?.(opt.value);
          return [
            {
              ...normalizedModel,
              inputBuffer: opt.label,
              cursor: graphemes(opt.label).length,
              open: false,
              highlighted: 0,
              filteredIndices: filterOptions(options, opt.label),
            },
            Cmd.none(),
          ];
        }
        case 'select-at': {
          if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= filteredIndices.length) return [normalizedModel, Cmd.none()];
          return this.update({ type: 'select' }, { ...normalizedModel, highlighted: msg.index, focused: true });
        }
        case 'hover-at':
          return Number.isInteger(msg.index) && msg.index >= 0 && msg.index < filteredIndices.length
            ? [{ ...normalizedModel, highlighted: msg.index, hoveredIndex: msg.index }, Cmd.none()]
            : [normalizedModel, Cmd.none()];
        case 'leave':
          return [{ ...normalizedModel, hoveredIndex: null }, Cmd.none()];
        case 'hover-input':
          return [normalizedModel.hoveredInput ? normalizedModel : { ...normalizedModel, hoveredInput: true }, Cmd.none()];
        case 'leave-input':
          return [normalizedModel.hoveredInput ? { ...normalizedModel, hoveredInput: false } : normalizedModel, Cmd.none()];
        case 'submit': {
          if (!allowCustom) {
            const match = options.find((o) => o.label === model.inputBuffer || o.value === model.inputBuffer);
            if (!match) return [normalizedModel, Cmd.none()];
          }
          config.onSubmit?.(model.inputBuffer);
          return [normalizedModel, Cmd.none()];
        }
        case 'close':
          return [{ ...normalizedModel, open: false, highlighted: 0 }, Cmd.none()];
        case 'focus':
          return [{ ...normalizedModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...normalizedModel, focused: false, open: false, hoveredIndex: null }, Cmd.none()];
        case 'noop':
          return [normalizedModel, Cmd.none()];
      }
    },

    view(model: ComboboxModel): VNode {
      const tokens = useTokens(comboboxContract, config, 'Combobox');
      const dimStyle = applyTypography(tokens.placeholderStyle, { color: tokens.placeholder, dim: true });
      const hlStyle = style({ color: tokens.highlight, bold: true });
      const hoverStyle = style({ color: tokens.hoverText, background: tokens.hoverBackground, bold: true });
      const hoverCursorStyle = style({ color: tokens.hoverText, background: tokens.hoverBackground, bold: true, reverse: true });

      // Build input display
      let inputDisplay: VNode;
      if (model.inputBuffer.length === 0 && !model.focused) {
        inputDisplay = text(placeholder, model.hoveredInput ? hoverStyle : dimStyle);
      } else if (model.inputBuffer.length === 0 && model.focused) {
        inputDisplay = row(text(' ', model.hoveredInput ? hoverCursorStyle : style({ reverse: true })));
      } else if (model.focused) {
        const parts = graphemes(model.inputBuffer);
        const beforeStr = parts.slice(0, model.cursor).join('');
        const ch = model.cursor < parts.length ? parts[model.cursor]! : ' ';
        const afterStr = parts.slice(model.cursor + 1).join('');
        inputDisplay = row(
          text(beforeStr, model.hoveredInput ? hoverStyle : undefined),
          text(ch, model.hoveredInput ? hoverCursorStyle : style({ reverse: true })),
          text(afterStr, model.hoveredInput ? hoverStyle : undefined),
        );
      } else {
        inputDisplay = text(model.inputBuffer, model.hoveredInput ? hoverStyle : applyTypography(tokens.labelStyle));
      }

      const filteredIndices = normalizeFiltered(model.filteredIndices);
      const highlighted = filteredIndices.length > 0 ? boundedInteger(model.highlighted, 0, 0, filteredIndices.length - 1) : 0;
      const inputTarget = event(
        `${interactionId}:input`,
        inputDisplay,
        { onClick: focusTag, onMouseEnter: hoverInputTag, onMouseLeave: leaveInputTag },
        { label: placeholder, intent: 'edit', affordances: ['hover', 'click'], cursor: 'text' },
      );
      if (!model.open || filteredIndices.length === 0) return inputTarget;

      // Build dropdown items
      const start = highlighted >= maxVisible ? highlighted - maxVisible + 1 : 0;
      const items = filteredIndices.slice(start, start + maxVisible).map((optIdx, localIndex) => {
        const i = start + localIndex;
        const opt = options[optIdx]!;
        const isHighlighted = i === highlighted || i === model.hoveredIndex;
        const prefix = isHighlighted ? '▸ ' : '  ';
        return event(
          `${interactionId}:option:${i}`,
          text(prefix + opt.label, isHighlighted ? hlStyle : applyTypography(tokens.labelStyle)),
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag, onScroll: scrollTag },
          { label: opt.label, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
        );
      });

      return column(inputTarget, ...items);
    },

    subscriptions(model: ComboboxModel): Sub<ComboboxMsg> {
      const pointer = Sub.elementMouse<ComboboxMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === scrollTag) {
          const direction = wheelDirection(mouseEvent.deltaY);
          return direction < 0 ? { type: 'up' } : direction > 0 ? { type: 'down' } : { type: 'noop' };
        }
        if (mouseEvent.elementId === `${interactionId}:input` && mouseEvent.handlerTag === focusTag) return { type: 'focus' };
        if (mouseEvent.elementId === `${interactionId}:input` && mouseEvent.handlerTag === hoverInputTag) return { type: 'hover-input' };
        if (mouseEvent.elementId === `${interactionId}:input` && mouseEvent.handlerTag === leaveInputTag) return { type: 'leave-input' };
        if (!mouseEvent.elementId.startsWith(`${interactionId}:option:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:option:`.length));
        if (mouseEvent.handlerTag === selectTag) return { type: 'select-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-at', index };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return pointer;

      return Sub.batch(
        pointer,
        Sub.keyEvent<ComboboxMsg>((event) => ({ type: 'key', event })),
        Sub.paste<ComboboxMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
