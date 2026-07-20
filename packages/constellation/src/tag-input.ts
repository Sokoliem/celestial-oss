/**
 * Tag Input — Free-form list builder with type + Enter to add, Backspace to remove.
 *
 * Renders tag chips `[tag1 ×] [tag2 ×]` on one line, then an input box below.
 * Enter commits the input buffer as a new tag, Backspace on an empty buffer
 * highlights the last tag, and a second Backspace removes it.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style, visualWidth } from '@celestial/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, event, focus, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { applySingleLineKey, graphemes, insertSingleLinePaste, replaceSelection } from './editable-text.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TagInputTokens {
  tagBg: Color;
  tagText: Color;
  removeBtn: Color;
  inputBorder: Color;
  text: Color;
  placeholder: Color;
  labelStyle: TypographyToken;
}

export const tagInputContract: TokenContract<TagInputTokens> = {
  tagBg: (t: SemanticTheme) => t.colors.surfaceRaised,
  tagText: (t: SemanticTheme) => t.colors.text,
  removeBtn: (t: SemanticTheme) => t.colors.muted,
  inputBorder: (t: SemanticTheme) => t.colors.border,
  text: (t: SemanticTheme) => t.colors.text,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/** Configuration for creating a tag input component. */
export interface TagInputConfig {
  /** Placeholder text shown when input is empty. */
  placeholder?: string;
  /** Maximum number of tags allowed (default: unlimited). */
  maxTags?: number;
  /** Callback when the tags list changes. */
  onChange?: (tags: string[]) => void;
  /** Initial tags. */
  tags?: string[];
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** Model state for the tag input component. */
export interface TagInputModel {
  /** Current list of tags. */
  tags: string[];
  /** Current text in the input buffer. */
  inputBuffer: string;
  /** Cursor position within the input buffer. */
  cursorPos: number;
  /** Index of the highlighted tag (-1 for none). */
  highlightedTag: number;
  /** Whether the tag input is focused. */
  focused: boolean;
}

/** Messages the tag input can handle. */
export type TagInputMsg =
  | Msg<'key', { event: KeyEvent }>
  | Msg<'paste', { value: string }>
  | Msg<'insert-char', { char: string }>
  | Msg<'backspace'>
  | Msg<'delete-char'>
  | Msg<'move-left'>
  | Msg<'move-right'>
  | Msg<'home'>
  | Msg<'end'>
  | Msg<'commit-tag'>
  | Msg<'remove-tag', { index: number }>
  | Msg<'highlight-tag-left'>
  | Msg<'highlight-tag-right'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Mouse hit-testing ──────────────────────────────────────────────────────

/**
 * Map a click position on the tag chip row to a remove-tag message.
 *
 * Chip layout: `[tagName ×] ` — each chip is `tagName.length + 4` chars,
 * followed by a 1-char space separator.
 *
 * @param tags - Current tag list (from model).
 * @param relX - Click X relative to the start of the chip row.
 * @returns A remove-tag message if a chip was hit, null otherwise.
 */
export function tagInputHitTest(tags: readonly string[], relX: number): Msg<'remove-tag', { index: number }> | null {
  if (tags.length === 0) return null;
  let cursor = 0;
  for (let i = 0; i < tags.length; i++) {
    const chipWidth = visualWidth(tags[i]!) + 4; // `[tag ×]`
    if (relX >= cursor && relX < cursor + chipWidth) {
      return { type: 'remove-tag', index: i };
    }
    cursor += chipWidth + 1; // +1 for space separator
  }
  return null;
}

/**
 * Create a tag input component for building free-form lists.
 *
 * @param config - Tag input configuration including placeholder and maxTags.
 * @returns A ComponentDescriptor for the tag input.
 */
export function tagInput(config: TagInputConfig): ComponentDescriptor<TagInputModel, TagInputMsg> {
  const maxTags = config.maxTags ?? Infinity;
  const placeholder = config.placeholder ?? 'Type and press Enter...';
  const inputId = `tag-input-${Math.random().toString(36).slice(2, 10)}`;
  const inputTag = `${inputId}:focus`;
  const removeTagPrefix = `${inputId}:remove:`;

  function applyTextState(model: TagInputModel, value: string, cursorPos: number): TagInputModel {
    return { ...model, inputBuffer: value, cursorPos, highlightedTag: -1 };
  }

  return {
    init(): [TagInputModel, Cmd<TagInputMsg>] {
      return [
        {
          tags: config.tags ? [...config.tags] : [],
          inputBuffer: '',
          cursorPos: 0,
          highlightedTag: -1,
          focused: false,
        },
        Cmd.none(),
      ];
    },

    update(msg: TagInputMsg, model: TagInputModel): [TagInputModel, Cmd<TagInputMsg>] {
      switch (msg.type) {
        case 'key': {
          if (msg.event.key === 'enter') return this.update({ type: 'commit-tag' }, model);
          if (msg.event.key === 'backspace' && model.inputBuffer.length === 0) return this.update({ type: 'backspace' }, model);
          const result = applySingleLineKey({ value: model.inputBuffer, cursor: model.cursorPos }, msg.event);
          return [applyTextState(model, result.state.value, result.state.cursor), Cmd.none()];
        }
        case 'paste': {
          const next = insertSingleLinePaste({ value: model.inputBuffer, cursor: model.cursorPos }, msg.value);
          return [applyTextState(model, next.value, next.cursor), Cmd.none()];
        }
        case 'insert-char': {
          const char = (msg as Msg<'insert-char', { char: string }>).char;
          const next = replaceSelection({ value: model.inputBuffer, cursor: model.cursorPos }, char);
          return [applyTextState(model, next.value, next.cursor), Cmd.none()];
        }
        case 'backspace': {
          if (model.inputBuffer.length === 0) {
            // Empty buffer: highlight last tag, or remove highlighted tag
            if (model.highlightedTag >= 0) {
              const newTags = model.tags.filter((_, i) => i !== model.highlightedTag);
              config.onChange?.(newTags);
              return [
                {
                  ...model,
                  tags: newTags,
                  highlightedTag: -1,
                },
                Cmd.none(),
              ];
            }
            if (model.tags.length > 0) {
              return [{ ...model, highlightedTag: model.tags.length - 1 }, Cmd.none()];
            }
            return [model, Cmd.none()];
          }
          if (model.cursorPos <= 0) return [model, Cmd.none()];
          const parts = graphemes(model.inputBuffer);
          const before = parts.slice(0, model.cursorPos - 1).join('');
          const after = parts.slice(model.cursorPos).join('');
          return [
            {
              ...model,
              inputBuffer: before + after,
              cursorPos: model.cursorPos - 1,
              highlightedTag: -1,
            },
            Cmd.none(),
          ];
        }
        case 'delete-char': {
          const parts = graphemes(model.inputBuffer);
          if (model.cursorPos >= parts.length) return [model, Cmd.none()];
          const before = parts.slice(0, model.cursorPos).join('');
          const after = parts.slice(model.cursorPos + 1).join('');
          return [{ ...model, inputBuffer: before + after }, Cmd.none()];
        }
        case 'move-left':
          return [
            {
              ...model,
              cursorPos: model.cursorPos > 0 ? model.cursorPos - 1 : model.cursorPos,
              highlightedTag: -1,
            },
            Cmd.none(),
          ];
        case 'move-right':
          return [
            {
              ...model,
              cursorPos: model.cursorPos < graphemes(model.inputBuffer).length ? model.cursorPos + 1 : model.cursorPos,
              highlightedTag: -1,
            },
            Cmd.none(),
          ];
        case 'home':
          return [{ ...model, cursorPos: 0, highlightedTag: -1 }, Cmd.none()];
        case 'end':
          return [{ ...model, cursorPos: graphemes(model.inputBuffer).length, highlightedTag: -1 }, Cmd.none()];
        case 'commit-tag': {
          const trimmed = model.inputBuffer.trim();
          if (!trimmed || model.tags.length >= maxTags) return [model, Cmd.none()];
          // Avoid duplicate tags
          if (model.tags.includes(trimmed)) return [model, Cmd.none()];
          const newTags = [...model.tags, trimmed];
          config.onChange?.(newTags);
          return [
            {
              ...model,
              tags: newTags,
              inputBuffer: '',
              cursorPos: 0,
              highlightedTag: -1,
            },
            Cmd.none(),
          ];
        }
        case 'remove-tag': {
          const idx = (msg as Msg<'remove-tag', { index: number }>).index;
          if (idx < 0 || idx >= model.tags.length) return [model, Cmd.none()];
          const newTags = model.tags.filter((_, i) => i !== idx);
          config.onChange?.(newTags);
          return [{ ...model, tags: newTags, highlightedTag: -1 }, Cmd.none()];
        }
        case 'highlight-tag-left': {
          if (model.tags.length === 0) return [model, Cmd.none()];
          const next = model.highlightedTag <= 0 ? model.tags.length - 1 : model.highlightedTag - 1;
          return [{ ...model, highlightedTag: next }, Cmd.none()];
        }
        case 'highlight-tag-right': {
          if (model.tags.length === 0) return [model, Cmd.none()];
          const next = model.highlightedTag >= model.tags.length - 1 ? 0 : model.highlightedTag + 1;
          return [{ ...model, highlightedTag: next }, Cmd.none()];
        }
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, highlightedTag: -1 }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: TagInputModel): VNode {
      const tokens = useTokens(tagInputContract, config, 'TagInput');

      const parts: VNode[] = [];

      // Render tag chips
      for (let i = 0; i < model.tags.length; i++) {
        const isHighlighted = model.highlightedTag === i;
        const tagStyle = isHighlighted
          ? style({ color: tokens.tagText, background: tokens.removeBtn, bold: true })
          : style({ color: tokens.tagText, background: tokens.tagBg });
        const removeBtnStyle = style({ color: tokens.removeBtn, background: tokens.tagBg });

        parts.push(
          event(
            `${inputId}:chip:${i}`,
            row(text(`[${model.tags[i]!} `, tagStyle), text('×]', isHighlighted ? tagStyle : removeBtnStyle), text(' ', style({ color: tokens.text }))),
            { onClick: `${removeTagPrefix}${i}` },
            { label: `Remove tag ${model.tags[i]!}`, intent: 'remove', affordances: ['click'], cursor: 'pointer' },
          ),
        );
      }

      // Render input area
      if (model.focused && model.inputBuffer.length > 0) {
        const inputParts = graphemes(model.inputBuffer);
        const before = inputParts.slice(0, model.cursorPos).join('');
        const cursorChar = model.cursorPos < inputParts.length ? inputParts[model.cursorPos]! : ' ';
        const after = inputParts.slice(model.cursorPos + 1).join('');
        parts.push(text(before, style({ color: tokens.text })));
        parts.push(text(cursorChar, style({ color: tokens.tagBg, background: tokens.text })));
        parts.push(text(after, style({ color: tokens.text })));
      } else if (model.focused) {
        // Show cursor on empty input
        parts.push(text(' ', style({ color: tokens.tagBg, background: tokens.text })));
      } else if (model.tags.length === 0) {
        parts.push(text(placeholder, style({ color: tokens.placeholder, dim: true })));
      }

      const surface = event(
        `${inputId}:surface`,
        row(...parts),
        { onClick: inputTag },
        { label: placeholder || 'Tag input', intent: 'edit', affordances: ['click'], cursor: 'text', keyboardHint: 'Type, then Enter' },
      );
      setVNodeMeta(surface, { testId: placeholder || inputId, a11y: { role: 'textbox', label: placeholder } });
      return focus(inputId, surface, { focused: model.focused });
    },

    subscriptions(model: TagInputModel): Sub<TagInputMsg> {
      const mouse = Sub.elementMouse<TagInputMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === inputTag) return { type: 'focus' };
        if (mouseEvent.handlerTag?.startsWith(removeTagPrefix)) {
          const index = Number.parseInt(mouseEvent.handlerTag.slice(removeTagPrefix.length), 10);
          return Number.isInteger(index) ? { type: 'remove-tag', index } : { type: 'noop' };
        }
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<TagInputMsg>(
        mouse,
        Sub.keyEvent<TagInputMsg>((event) => ({ type: 'key', event })),
        Sub.paste<TagInputMsg>((value) => ({ type: 'paste', value })),
      );
    },
  };
}
