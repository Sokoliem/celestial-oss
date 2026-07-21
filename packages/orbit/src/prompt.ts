import { style } from '@celestial/corona';
import type { KeyEvent, Msg, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import { formatList, resolveLocale, segmentGraphemes } from '@celestial/rosetta';
import {
  boundedInteger,
  MAX_PROMPT_INPUT_GRAPHEMES,
  nextInteractionId,
  normalizeHighlightedIndex,
  normalizeOptionIndex,
  normalizePromptOptions,
  promptWindow,
} from './internal.js';
import { feedbackColor, formColor, orbitToneColor } from './theme.js';
import type { ConfirmConfig, MultiSelectPromptConfig, PromptConfig, SelectPromptConfig, ValidationRule } from './types.js';
import { runRules } from './validation.js';

// ─── Re-export pure state machines (backward compat) ────────────────────────

export {
  confirmResult,
  createConfirmState,
  createInputState,
  createMultiSelectState,
  createSelectState,
  multiSelectResults,
  updateConfirmState,
  updateInputState,
  updateMultiSelectState,
  updateSelectState,
} from './prompt-state.js';

function renderPromptHeader(config: { label?: string; description?: string; theme?: unknown; themeCtx?: unknown }): VNode[] {
  const nodes: VNode[] = [];

  if (config.label) {
    nodes.push(text(config.label, style({ bold: true })));
  }

  if (config.description) {
    nodes.push(text(config.description, style({ color: formColor(config as { theme?: never; themeCtx?: never }, 'muted'), dim: true })));
  }

  return nodes;
}

// ─── Input Prompt ComponentDescriptor ───────────────────────────────────────

export interface InputPromptModel {
  value: string;
  cursor: number;
  done: boolean;
  error: string | null;
  focused: boolean;
}

export type InputPromptMsg =
  | Msg<'prompt:key', { readonly event: KeyEvent }>
  | Msg<'prompt:paste', { readonly value: string }>
  | Msg<'prompt:char', { readonly char: string }>
  | Msg<'prompt:backspace'>
  | Msg<'prompt:delete'>
  | Msg<'prompt:left'>
  | Msg<'prompt:right'>
  | Msg<'prompt:home'>
  | Msg<'prompt:end'>
  | Msg<'prompt:submit'>
  | Msg<'prompt:focus'>
  | Msg<'prompt:blur'>
  | Msg<'prompt:noop'>;

export interface InputPromptDescriptor {
  init(): [InputPromptModel, Cmd<InputPromptMsg>];
  update(msg: InputPromptMsg, model: InputPromptModel): [InputPromptModel, Cmd<InputPromptMsg>];
  view(model: InputPromptModel): VNode;
  subscriptions?(model: InputPromptModel): Sub<InputPromptMsg>;
  getValue(model: InputPromptModel): string;
  isDone(model: InputPromptModel): boolean;
}

/**
 * Create a text input prompt as a proper ComponentDescriptor.
 * Replaces the imperative `promptInput()` wrapper.
 */
export function inputPrompt(config: PromptConfig): InputPromptDescriptor {
  const validators = [...(config.validate ?? [])];
  const interactionId = nextInteractionId('input-prompt');
  const focusTag = `${interactionId}:focus`;
  const defaultValue = segmentGraphemes(config.defaultValue ?? '')
    .slice(0, MAX_PROMPT_INPUT_GRAPHEMES)
    .join('');

  function cursorFor(model: InputPromptModel): number {
    return boundedInteger(model.cursor, 0, 0, segmentGraphemes(model.value).length);
  }

  return {
    init(): [InputPromptModel, Cmd<InputPromptMsg>] {
      return [
        {
          value: defaultValue,
          cursor: segmentGraphemes(defaultValue).length,
          done: false,
          error: null,
          focused: true,
        },
        Cmd.none(),
      ];
    },

    update(msg: InputPromptMsg, model: InputPromptModel): [InputPromptModel, Cmd<InputPromptMsg>] {
      if (model.done) return [model, Cmd.none()];

      switch (msg.type) {
        case 'prompt:key':
          if (msg.event.key === 'enter') return this.update({ type: 'prompt:submit' }, model);
          if (msg.event.key === 'backspace') return this.update({ type: 'prompt:backspace' }, model);
          if (msg.event.key === 'delete') return this.update({ type: 'prompt:delete' }, model);
          if (msg.event.key === 'left') return this.update({ type: 'prompt:left' }, model);
          if (msg.event.key === 'right') return this.update({ type: 'prompt:right' }, model);
          if (msg.event.key === 'home') return this.update({ type: 'prompt:home' }, model);
          if (msg.event.key === 'end') return this.update({ type: 'prompt:end' }, model);
          if (msg.event.char && !msg.event.ctrl && !msg.event.alt) return this.update({ type: 'prompt:char', char: msg.event.char }, model);
          return [model, Cmd.none()];

        case 'prompt:paste':
          return this.update({ type: 'prompt:char', char: msg.value.replace(/\r\n?|\n/g, ' ') }, model);

        case 'prompt:char': {
          const parts = segmentGraphemes(model.value);
          const cursor = cursorFor(model);
          const inserted = segmentGraphemes(msg.char).slice(0, Math.max(0, MAX_PROMPT_INPUT_GRAPHEMES - parts.length));
          if (inserted.length === 0) return [{ ...model, cursor }, Cmd.none()];
          const newValue = `${parts.slice(0, cursor).join('')}${inserted.join('')}${parts.slice(cursor).join('')}`;
          return [{ ...model, value: newValue, cursor: cursor + inserted.length, error: null }, Cmd.none()];
        }

        case 'prompt:backspace': {
          const parts = segmentGraphemes(model.value);
          const cursor = cursorFor(model);
          if (cursor === 0) return [{ ...model, cursor }, Cmd.none()];
          const newValue = `${parts.slice(0, cursor - 1).join('')}${parts.slice(cursor).join('')}`;
          return [{ ...model, value: newValue, cursor: cursor - 1, error: null }, Cmd.none()];
        }

        case 'prompt:delete': {
          const parts = segmentGraphemes(model.value);
          const cursor = cursorFor(model);
          if (cursor >= parts.length) return [{ ...model, cursor }, Cmd.none()];
          const newValue = `${parts.slice(0, cursor).join('')}${parts.slice(cursor + 1).join('')}`;
          return [{ ...model, value: newValue, cursor, error: null }, Cmd.none()];
        }

        case 'prompt:left':
          return [{ ...model, cursor: Math.max(0, cursorFor(model) - 1) }, Cmd.none()];
        case 'prompt:right':
          return [{ ...model, cursor: Math.min(segmentGraphemes(model.value).length, cursorFor(model) + 1) }, Cmd.none()];
        case 'prompt:home':
          return [{ ...model, cursor: 0 }, Cmd.none()];
        case 'prompt:end':
          return [{ ...model, cursor: segmentGraphemes(model.value).length }, Cmd.none()];

        case 'prompt:submit': {
          // Validate
          if (validators.length > 0) {
            const errors = runRules(validators as ValidationRule<unknown>[], model.value);
            if (errors.length > 0) {
              return [{ ...model, error: errors[0]! }, Cmd.none()];
            }
          }
          return [{ ...model, done: true }, Cmd.none()];
        }

        case 'prompt:focus':
          return [{ ...model, focused: true }, Cmd.none()];

        case 'prompt:blur':
          return [{ ...model, focused: false }, Cmd.none()];

        default:
          return [model, Cmd.none()];
      }
    },

    view(model: InputPromptModel): VNode {
      const children: VNode[] = [...renderPromptHeader(config)];

      // Message / label
      const msgStyle = style({ color: orbitToneColor(config, 'accent'), bold: true });
      children.push(text(`? ${config.message}`, msgStyle));

      // Input value
      if (model.done) {
        const doneStyle = style({ color: feedbackColor(config, 'success') });
        children.push(text(`  ${model.value}`, doneStyle));
      } else if (model.focused && model.value) {
        // Render with visible cursor using reverse-video on the cursor character
        const parts = segmentGraphemes(model.value);
        const cursor = cursorFor(model);
        const before = parts.slice(0, cursor).join('');
        const cursorChar = cursor < parts.length ? parts[cursor]! : ' ';
        const after = parts.slice(cursor + 1).join('');
        const valueStyle = style({ color: formColor(config, 'text') });
        const cursorStyle = style({ color: formColor(config, 'text'), reverse: true });
        children.push(
          event(
            interactionId,
            row(text(`  ${before}`, valueStyle), text(cursorChar, cursorStyle), text(after, valueStyle)),
            { onClick: focusTag },
            { label: config.label ?? config.message, intent: 'focus', affordances: ['click'], cursor: 'text' },
          ),
        );
      } else if (model.focused) {
        // Focused but empty: show cursor at start, then placeholder
        const placeholder = config.placeholder ?? '';
        const cursorStyle = style({ reverse: true });
        children.push(
          event(
            interactionId,
            row(text('  ', style({})), text(' ', cursorStyle), text(placeholder, style({ dim: true }))),
            { onClick: focusTag },
            { label: config.label ?? config.message, intent: 'focus', affordances: ['click'], cursor: 'text' },
          ),
        );
      } else {
        const placeholder = config.placeholder ?? '';
        const displayValue = model.value || placeholder;
        const valueStyle = model.value ? style({ color: formColor(config, 'text') }) : style({ dim: true });
        children.push(
          event(
            interactionId,
            text(`  ${displayValue}`, valueStyle),
            { onClick: focusTag },
            { label: config.label ?? config.message, intent: 'focus', affordances: ['click'], cursor: 'text' },
          ),
        );
      }

      // Error
      if (model.error) {
        const errorStyle = style({ color: feedbackColor(config, 'danger') });
        children.push(text(`  ${model.error}`, errorStyle));
      }

      return column(...children);
    },

    subscriptions(model: InputPromptModel): Sub<InputPromptMsg> {
      if (model.done) return Sub.none();
      const pointer = Sub.elementMouse<InputPromptMsg>((mouseEvent) =>
        mouseEvent.elementId === interactionId && mouseEvent.handlerTag === focusTag ? { type: 'prompt:focus' } : { type: 'prompt:noop' },
      );
      if (!model.focused) return pointer;
      return Sub.batch(
        pointer,
        Sub.keyEvent<InputPromptMsg>((event) => ({ type: 'prompt:key', event })),
        Sub.paste<InputPromptMsg>((value) => ({ type: 'prompt:paste', value })),
      );
    },

    getValue(model: InputPromptModel): string {
      return model.value;
    },

    isDone(model: InputPromptModel): boolean {
      return model.done;
    },
  };
}

// ─── Confirm Prompt ComponentDescriptor ─────────────────────────────────────

export interface ConfirmPromptModel {
  value: boolean | null;
  done: boolean;
  focused: boolean;
}

export type ConfirmPromptMsg =
  | Msg<'confirm:yes'>
  | Msg<'confirm:no'>
  | Msg<'confirm:submit'>
  | Msg<'confirm:focus'>
  | Msg<'confirm:blur'>
  | Msg<'confirm:noop'>;

export interface ConfirmPromptDescriptor {
  init(): [ConfirmPromptModel, Cmd<ConfirmPromptMsg>];
  update(msg: ConfirmPromptMsg, model: ConfirmPromptModel): [ConfirmPromptModel, Cmd<ConfirmPromptMsg>];
  view(model: ConfirmPromptModel): VNode;
  subscriptions?(model: ConfirmPromptModel): Sub<ConfirmPromptMsg>;
  getValue(model: ConfirmPromptModel): boolean;
  isDone(model: ConfirmPromptModel): boolean;
}

/**
 * Create a yes/no confirm prompt as a proper ComponentDescriptor.
 */
export function confirmPrompt(config: ConfirmConfig): ConfirmPromptDescriptor {
  const defaultValue = config.defaultValue ?? false;
  const interactionId = nextInteractionId('confirm-prompt');
  const yesId = `${interactionId}:yes`;
  const noId = `${interactionId}:no`;
  const chooseTag = `${interactionId}:choose`;

  return {
    init(): [ConfirmPromptModel, Cmd<ConfirmPromptMsg>] {
      return [{ value: null, done: false, focused: true }, Cmd.none()];
    },

    update(msg: ConfirmPromptMsg, model: ConfirmPromptModel): [ConfirmPromptModel, Cmd<ConfirmPromptMsg>] {
      if (model.done) return [model, Cmd.none()];

      switch (msg.type) {
        case 'confirm:yes':
          return [{ ...model, value: true, done: true }, Cmd.none()];
        case 'confirm:no':
          return [{ ...model, value: false, done: true }, Cmd.none()];
        case 'confirm:submit':
          return [{ ...model, value: defaultValue, done: true }, Cmd.none()];
        case 'confirm:focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'confirm:blur':
          return [{ ...model, focused: false }, Cmd.none()];
        default:
          return [model, Cmd.none()];
      }
    },

    view(model: ConfirmPromptModel): VNode {
      const msgStyle = style({ color: orbitToneColor(config, 'accent'), bold: true });
      const hint = defaultValue ? '(Y/n)' : '(y/N)';

      if (model.done) {
        const result = model.value ?? defaultValue;
        const doneStyle = style({ color: feedbackColor(config, 'success') });
        return column(...renderPromptHeader(config), text(`? ${config.message} ${hint}`, msgStyle), text(`  ${result ? 'Yes' : 'No'}`, doneStyle));
      }

      const yesStyle = defaultValue ? style({ color: orbitToneColor(config, 'accent'), bold: true }) : style({});
      const noStyle = defaultValue ? style({}) : style({ color: orbitToneColor(config, 'accent'), bold: true });
      const yes = event(
        yesId,
        text(defaultValue ? '  [Yes]' : '   Yes ', yesStyle),
        { onClick: chooseTag },
        { label: 'Yes', intent: 'confirm', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Y' },
      );
      const no = event(
        noId,
        text(defaultValue ? '   No ' : '  [No]', noStyle),
        { onClick: chooseTag },
        { label: 'No', intent: 'cancel', affordances: ['click'], cursor: 'pointer', keyboardHint: 'N' },
      );
      return column(...renderPromptHeader(config), text(`? ${config.message} ${hint}`, msgStyle), row(yes, no));
    },

    subscriptions(model: ConfirmPromptModel): Sub<ConfirmPromptMsg> {
      if (model.done) return Sub.none();
      const pointer = Sub.elementMouse<ConfirmPromptMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag !== chooseTag) return { type: 'confirm:noop' };
        if (mouseEvent.elementId === yesId) return { type: 'confirm:yes' };
        if (mouseEvent.elementId === noId) return { type: 'confirm:no' };
        return { type: 'confirm:noop' };
      });
      if (!model.focused) return pointer;
      return Sub.batch<ConfirmPromptMsg>(
        pointer,
        Sub.key('y', { type: 'confirm:yes' }),
        Sub.key('Y', { type: 'confirm:yes' }),
        Sub.key('n', { type: 'confirm:no' }),
        Sub.key('N', { type: 'confirm:no' }),
        Sub.key('enter', { type: 'confirm:submit' }),
      );
    },

    getValue(model: ConfirmPromptModel): boolean {
      return model.value ?? defaultValue;
    },

    isDone(model: ConfirmPromptModel): boolean {
      return model.done;
    },
  };
}

// ─── Select Prompt ComponentDescriptor ──────────────────────────────────────

export interface SelectPromptModel {
  options: { label: string; value: string }[];
  highlighted: number;
  selected: string | null;
  done: boolean;
  focused: boolean;
}

export type SelectPromptMsg =
  | Msg<'select:up'>
  | Msg<'select:down'>
  | Msg<'select:submit'>
  | Msg<'select:choose-at', { readonly index: number }>
  | Msg<'select:hover-at', { readonly index: number }>
  | Msg<'select:focus'>
  | Msg<'select:blur'>
  | Msg<'select:noop'>;

export interface SelectPromptDescriptor {
  init(): [SelectPromptModel, Cmd<SelectPromptMsg>];
  update(msg: SelectPromptMsg, model: SelectPromptModel): [SelectPromptModel, Cmd<SelectPromptMsg>];
  view(model: SelectPromptModel): VNode;
  subscriptions?(model: SelectPromptModel): Sub<SelectPromptMsg>;
  getValue(model: SelectPromptModel): string;
  isDone(model: SelectPromptModel): boolean;
}

/**
 * Create a single-select prompt as a proper ComponentDescriptor.
 */
export function selectPrompt(config: SelectPromptConfig): SelectPromptDescriptor {
  const options = normalizePromptOptions(config.options);
  const interactionId = nextInteractionId('select-prompt');
  const optionPrefix = `${interactionId}:option:`;
  const chooseTag = `${interactionId}:choose`;
  const hoverTag = `${interactionId}:hover`;

  const defaultIndex = config.defaultValue ? options.findIndex((o) => o.value === config.defaultValue) : 0;

  return {
    init(): [SelectPromptModel, Cmd<SelectPromptMsg>] {
      return [
        {
          options: options.map((option) => ({ ...option })),
          highlighted: defaultIndex >= 0 ? defaultIndex : 0,
          selected: null,
          done: false,
          focused: true,
        },
        Cmd.none(),
      ];
    },

    update(msg: SelectPromptMsg, model: SelectPromptModel): [SelectPromptModel, Cmd<SelectPromptMsg>] {
      if (model.done) return [model, Cmd.none()];

      switch (msg.type) {
        case 'select:up': {
          const highlighted = Math.max(0, normalizeHighlightedIndex(model.highlighted, options.length) - 1);
          return [{ ...model, highlighted }, Cmd.none()];
        }
        case 'select:down': {
          const current = normalizeHighlightedIndex(model.highlighted, options.length);
          const highlighted = options.length === 0 ? 0 : Math.min(options.length - 1, current + 1);
          return [{ ...model, highlighted }, Cmd.none()];
        }
        case 'select:submit': {
          const index = normalizeOptionIndex(model.highlighted, options.length);
          if (index === null) return [model, Cmd.none()];
          return [{ ...model, highlighted: index, selected: options[index]!.value, done: true }, Cmd.none()];
        }
        case 'select:choose-at': {
          const index = normalizeOptionIndex(msg.index, options.length);
          if (index === null) return [model, Cmd.none()];
          return [{ ...model, highlighted: index, selected: options[index]!.value, done: true, focused: true }, Cmd.none()];
        }
        case 'select:hover-at': {
          const index = normalizeOptionIndex(msg.index, options.length);
          if (index === null) return [model, Cmd.none()];
          return [{ ...model, highlighted: index, focused: true }, Cmd.none()];
        }
        case 'select:focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'select:blur':
          return [{ ...model, focused: false }, Cmd.none()];
        default:
          return [model, Cmd.none()];
      }
    },

    view(model: SelectPromptModel): VNode {
      const children: VNode[] = [...renderPromptHeader(config)];
      const msgStyle = style({ color: orbitToneColor(config, 'accent'), bold: true });
      children.push(text(`? ${config.message}`, msgStyle));

      if (model.done) {
        const opt = options.find((o) => o.value === model.selected);
        const doneStyle = style({ color: feedbackColor(config, 'success') });
        children.push(text(`  ${opt?.label ?? model.selected ?? ''}`, doneStyle));
      } else {
        const highlighted = normalizeHighlightedIndex(model.highlighted, options.length);
        const viewport = promptWindow(highlighted, options.length, config.maxVisible);
        if (options.length === 0) children.push(text('  (No options)', style({ dim: true })));
        for (let i = viewport.start; i < viewport.end; i++) {
          const isHighlighted = i === highlighted;
          const prefix = isHighlighted ? '> ' : '  ';
          const optStyle = isHighlighted ? style({ color: orbitToneColor(config, 'accent') }) : style({});
          const option = options[i]!;
          children.push(
            event(
              `${optionPrefix}${i}`,
              text(`${prefix}${option.label}`, optStyle),
              { onClick: chooseTag, onMouseEnter: hoverTag },
              { label: option.label, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
            ),
          );
        }
      }

      return column(...children);
    },

    subscriptions(model: SelectPromptModel): Sub<SelectPromptMsg> {
      if (model.done) return Sub.none();
      const pointer = Sub.elementMouse<SelectPromptMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(optionPrefix)) return { type: 'select:noop' };
        const index = Number(mouseEvent.elementId.slice(optionPrefix.length));
        if (mouseEvent.handlerTag === chooseTag) return { type: 'select:choose-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'select:hover-at', index };
        return { type: 'select:noop' };
      });
      if (!model.focused) return pointer;
      return Sub.batch<SelectPromptMsg>(
        pointer,
        Sub.key('up', { type: 'select:up' }),
        Sub.key('down', { type: 'select:down' }),
        Sub.key('enter', { type: 'select:submit' }),
      );
    },

    getValue(model: SelectPromptModel): string {
      return model.selected ?? '';
    },

    isDone(model: SelectPromptModel): boolean {
      return model.done;
    },
  };
}

// ─── MultiSelect Prompt ComponentDescriptor ─────────────────────────────────

export interface MultiSelectPromptModel {
  options: { label: string; value: string }[];
  highlighted: number;
  selected: Set<number>;
  done: boolean;
  error: string | null;
  focused: boolean;
}

export type MultiSelectPromptMsg =
  | Msg<'multi:up'>
  | Msg<'multi:down'>
  | Msg<'multi:toggle'>
  | Msg<'multi:toggle-at', { readonly index: number }>
  | Msg<'multi:hover-at', { readonly index: number }>
  | Msg<'multi:submit'>
  | Msg<'multi:focus'>
  | Msg<'multi:blur'>
  | Msg<'multi:noop'>;

export interface MultiSelectPromptDescriptor {
  init(): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>];
  update(msg: MultiSelectPromptMsg, model: MultiSelectPromptModel): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>];
  view(model: MultiSelectPromptModel): VNode;
  subscriptions?(model: MultiSelectPromptModel): Sub<MultiSelectPromptMsg>;
  getValue(model: MultiSelectPromptModel): string[];
  isDone(model: MultiSelectPromptModel): boolean;
}

/**
 * Create a multi-select prompt as a proper ComponentDescriptor.
 */
export function multiSelectPrompt(config: MultiSelectPromptConfig): MultiSelectPromptDescriptor {
  const options = normalizePromptOptions(config.options);
  const locale = resolveLocale(config.locale);
  const interactionId = nextInteractionId('multi-select-prompt');
  const optionPrefix = `${interactionId}:option:`;
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;

  const minSelect = boundedInteger(config.minSelect, 0, 0, options.length);
  const maxSelect =
    config.maxSelect === undefined || config.maxSelect === Number.POSITIVE_INFINITY
      ? options.length
      : boundedInteger(config.maxSelect, options.length, 0, options.length);
  if (config.minSelect !== undefined && (!Number.isInteger(config.minSelect) || config.minSelect < 0 || config.minSelect > options.length)) {
    throw new RangeError('orbit/multiSelectPrompt: minSelect must be a non-negative integer no greater than the option count');
  }
  if (config.maxSelect !== undefined && config.maxSelect !== Number.POSITIVE_INFINITY && (!Number.isInteger(config.maxSelect) || config.maxSelect < 0)) {
    throw new RangeError('orbit/multiSelectPrompt: maxSelect must be a non-negative integer or Infinity');
  }
  if (minSelect > maxSelect) throw new RangeError('orbit/multiSelectPrompt: minSelect must not exceed maxSelect');

  // Pre-select defaults
  const initialSelected = new Set<number>();
  if (config.defaultValues) {
    for (const dv of [...config.defaultValues]) {
      const idx = options.findIndex((o) => o.value === dv);
      if (idx >= 0) initialSelected.add(idx);
      if (initialSelected.size >= maxSelect) break;
    }
  }

  function validSelection(selected: ReadonlySet<number>): Set<number> {
    const next = new Set<number>();
    for (const index of selected) {
      if (normalizeOptionIndex(index, options.length) !== null) next.add(index);
      if (next.size >= maxSelect) break;
    }
    return next;
  }

  function toggleAt(index: number, model: MultiSelectPromptModel): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>] {
    const normalized = normalizeOptionIndex(index, options.length);
    if (normalized === null) return [model, Cmd.none()];
    const newSelected = validSelection(model.selected);
    if (newSelected.has(normalized)) {
      newSelected.delete(normalized);
    } else {
      if (newSelected.size >= maxSelect) {
        return [{ ...model, highlighted: normalized, selected: newSelected, focused: true, error: `Maximum ${maxSelect} selections allowed` }, Cmd.none()];
      }
      newSelected.add(normalized);
    }
    return [{ ...model, highlighted: normalized, selected: newSelected, focused: true, error: null }, Cmd.none()];
  }

  return {
    init(): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>] {
      return [
        {
          options: options.map((option) => ({ ...option })),
          highlighted: 0,
          selected: new Set(initialSelected),
          done: false,
          error: null,
          focused: true,
        },
        Cmd.none(),
      ];
    },

    update(msg: MultiSelectPromptMsg, model: MultiSelectPromptModel): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>] {
      if (model.done) return [model, Cmd.none()];

      switch (msg.type) {
        case 'multi:up': {
          const highlighted = Math.max(0, normalizeHighlightedIndex(model.highlighted, options.length) - 1);
          return [{ ...model, highlighted, error: null }, Cmd.none()];
        }
        case 'multi:down': {
          const current = normalizeHighlightedIndex(model.highlighted, options.length);
          const highlighted = options.length === 0 ? 0 : Math.min(options.length - 1, current + 1);
          return [{ ...model, highlighted, error: null }, Cmd.none()];
        }
        case 'multi:toggle': {
          return toggleAt(model.highlighted, model);
        }
        case 'multi:toggle-at': {
          return toggleAt(msg.index, model);
        }
        case 'multi:hover-at': {
          const index = normalizeOptionIndex(msg.index, options.length);
          if (index === null) return [model, Cmd.none()];
          return [{ ...model, highlighted: index, focused: true }, Cmd.none()];
        }
        case 'multi:submit': {
          const selected = validSelection(model.selected);
          if (selected.size < minSelect) {
            return [{ ...model, selected, error: `Select at least ${minSelect} option${minSelect > 1 ? 's' : ''}` }, Cmd.none()];
          }
          return [{ ...model, selected, done: true }, Cmd.none()];
        }
        case 'multi:focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'multi:blur':
          return [{ ...model, focused: false }, Cmd.none()];
        default:
          return [model, Cmd.none()];
      }
    },

    view(model: MultiSelectPromptModel): VNode {
      const children: VNode[] = [...renderPromptHeader(config)];
      const msgStyle = style({ color: orbitToneColor(config, 'accent'), bold: true });
      children.push(text(`? ${config.message}`, msgStyle));

      if (model.done) {
        const selectedLabels = Array.from(validSelection(model.selected))
          .sort((a, b) => a - b)
          .map((i) => options[i]!.label);
        const doneStyle = style({ color: feedbackColor(config, 'success') });
        children.push(text(`  ${formatList(selectedLabels, locale.lang)}`, doneStyle));
      } else {
        const highlighted = normalizeHighlightedIndex(model.highlighted, options.length);
        const selected = validSelection(model.selected);
        const viewport = promptWindow(highlighted, options.length, config.maxVisible);
        if (options.length === 0) children.push(text('  (No options)', style({ dim: true })));
        for (let i = viewport.start; i < viewport.end; i++) {
          const isHighlighted = i === highlighted;
          const isSelected = selected.has(i);
          const pointer = isHighlighted ? '>' : ' ';
          const check = isSelected ? '[x]' : '[ ]';
          const optStyle = isHighlighted ? style({ color: orbitToneColor(config, 'accent') }) : style({});
          const option = options[i]!;
          children.push(
            event(
              `${optionPrefix}${i}`,
              text(`${pointer} ${check} ${option.label}`, optStyle),
              { onClick: toggleTag, onMouseEnter: hoverTag },
              { label: option.label, intent: 'toggle', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Space' },
            ),
          );
        }
      }

      if (model.error) {
        const errorStyle = style({ color: feedbackColor(config, 'danger') });
        children.push(text(`  ${model.error}`, errorStyle));
      }

      return column(...children);
    },

    subscriptions(model: MultiSelectPromptModel): Sub<MultiSelectPromptMsg> {
      if (model.done) return Sub.none();
      const pointer = Sub.elementMouse<MultiSelectPromptMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(optionPrefix)) return { type: 'multi:noop' };
        const index = Number(mouseEvent.elementId.slice(optionPrefix.length));
        if (mouseEvent.handlerTag === toggleTag) return { type: 'multi:toggle-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'multi:hover-at', index };
        return { type: 'multi:noop' };
      });
      if (!model.focused) return pointer;
      return Sub.batch<MultiSelectPromptMsg>(
        pointer,
        Sub.key('up', { type: 'multi:up' }),
        Sub.key('down', { type: 'multi:down' }),
        Sub.key('space', { type: 'multi:toggle' }),
        Sub.key('enter', { type: 'multi:submit' }),
      );
    },

    getValue(model: MultiSelectPromptModel): string[] {
      return Array.from(validSelection(model.selected))
        .sort((a, b) => a - b)
        .map((i) => options[i]!.value);
    },

    isDone(model: MultiSelectPromptModel): boolean {
      return model.done;
    },
  };
}
