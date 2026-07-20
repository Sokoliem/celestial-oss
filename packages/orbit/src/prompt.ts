import { style } from '@celestial/corona';
import type { KeyEvent, Msg, VNode } from '@celestial/nebula';
import { Cmd, column, row, Sub, text } from '@celestial/nebula';
import { formatList, resolveLocale, segmentGraphemes } from '@celestial/rosetta';
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
  | Msg<'prompt:blur'>;

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
  const validators = config.validate ?? [];

  return {
    init(): [InputPromptModel, Cmd<InputPromptMsg>] {
      return [
        {
          value: config.defaultValue ?? '',
          cursor: segmentGraphemes(config.defaultValue ?? '').length,
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
          const inserted = segmentGraphemes(msg.char);
          const newValue = `${parts.slice(0, model.cursor).join('')}${msg.char}${parts.slice(model.cursor).join('')}`;
          return [{ ...model, value: newValue, cursor: model.cursor + inserted.length, error: null }, Cmd.none()];
        }

        case 'prompt:backspace': {
          if (model.cursor === 0) return [model, Cmd.none()];
          const parts = segmentGraphemes(model.value);
          const newValue = `${parts.slice(0, model.cursor - 1).join('')}${parts.slice(model.cursor).join('')}`;
          return [{ ...model, value: newValue, cursor: model.cursor - 1, error: null }, Cmd.none()];
        }

        case 'prompt:delete': {
          const parts = segmentGraphemes(model.value);
          if (model.cursor >= parts.length) return [model, Cmd.none()];
          const newValue = `${parts.slice(0, model.cursor).join('')}${parts.slice(model.cursor + 1).join('')}`;
          return [{ ...model, value: newValue, error: null }, Cmd.none()];
        }

        case 'prompt:left':
          return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
        case 'prompt:right':
          return [{ ...model, cursor: Math.min(segmentGraphemes(model.value).length, model.cursor + 1) }, Cmd.none()];
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
        const before = parts.slice(0, model.cursor).join('');
        const cursorChar = model.cursor < parts.length ? parts[model.cursor]! : ' ';
        const after = parts.slice(model.cursor + 1).join('');
        const valueStyle = style({ color: formColor(config, 'text') });
        const cursorStyle = style({ color: formColor(config, 'text'), reverse: true });
        children.push(row(text(`  ${before}`, valueStyle), text(cursorChar, cursorStyle), text(after, valueStyle)));
      } else if (model.focused) {
        // Focused but empty: show cursor at start, then placeholder
        const placeholder = config.placeholder ?? '';
        const cursorStyle = style({ reverse: true });
        children.push(row(text('  ', style({})), text(' ', cursorStyle), text(placeholder, style({ dim: true }))));
      } else {
        const placeholder = config.placeholder ?? '';
        const displayValue = model.value || placeholder;
        const valueStyle = model.value ? style({ color: formColor(config, 'text') }) : style({ dim: true });
        children.push(text(`  ${displayValue}`, valueStyle));
      }

      // Error
      if (model.error) {
        const errorStyle = style({ color: feedbackColor(config, 'danger') });
        children.push(text(`  ${model.error}`, errorStyle));
      }

      return column(...children);
    },

    subscriptions(model: InputPromptModel): Sub<InputPromptMsg> {
      if (model.done || !model.focused) return Sub.none();
      return Sub.batch(
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

export type ConfirmPromptMsg = Msg<'confirm:yes'> | Msg<'confirm:no'> | Msg<'confirm:submit'> | Msg<'confirm:focus'> | Msg<'confirm:blur'>;

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

      return column(...renderPromptHeader(config), text(`? ${config.message} ${hint}`, msgStyle));
    },

    subscriptions(model: ConfirmPromptModel): Sub<ConfirmPromptMsg> {
      if (model.done || !model.focused) return Sub.none();
      return Sub.batch<ConfirmPromptMsg>(
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

export type SelectPromptMsg = Msg<'select:up'> | Msg<'select:down'> | Msg<'select:submit'> | Msg<'select:focus'> | Msg<'select:blur'>;

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
  const options = (config.options as readonly (string | { label: string; value: string })[]).map((o) => (typeof o === 'string' ? { label: o, value: o } : o));

  const defaultIndex = config.defaultValue ? options.findIndex((o) => o.value === config.defaultValue) : 0;

  return {
    init(): [SelectPromptModel, Cmd<SelectPromptMsg>] {
      return [
        {
          options,
          highlighted: Math.max(0, defaultIndex),
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
          const highlighted = Math.max(0, model.highlighted - 1);
          return [{ ...model, highlighted }, Cmd.none()];
        }
        case 'select:down': {
          const highlighted = Math.min(options.length - 1, model.highlighted + 1);
          return [{ ...model, highlighted }, Cmd.none()];
        }
        case 'select:submit': {
          const opt = options[model.highlighted];
          return [{ ...model, selected: opt?.value ?? null, done: true }, Cmd.none()];
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
        for (let i = 0; i < options.length; i++) {
          const isHighlighted = i === model.highlighted;
          const prefix = isHighlighted ? '> ' : '  ';
          const optStyle = isHighlighted ? style({ color: orbitToneColor(config, 'accent') }) : style({});
          children.push(text(`${prefix}${options[i]!.label}`, optStyle));
        }
      }

      return column(...children);
    },

    subscriptions(model: SelectPromptModel): Sub<SelectPromptMsg> {
      if (model.done || !model.focused) return Sub.none();
      return Sub.batch<SelectPromptMsg>(
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

export type MultiSelectPromptMsg = Msg<'multi:up'> | Msg<'multi:down'> | Msg<'multi:toggle'> | Msg<'multi:submit'> | Msg<'multi:focus'> | Msg<'multi:blur'>;

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
  const options = (config.options as readonly (string | { label: string; value: string })[]).map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  const locale = resolveLocale(config.locale);

  const minSelect = config.minSelect ?? 0;
  const maxSelect = config.maxSelect ?? Infinity;

  // Pre-select defaults
  const initialSelected = new Set<number>();
  if (config.defaultValues) {
    for (const dv of config.defaultValues) {
      const idx = options.findIndex((o) => o.value === dv);
      if (idx >= 0) initialSelected.add(idx);
    }
  }

  return {
    init(): [MultiSelectPromptModel, Cmd<MultiSelectPromptMsg>] {
      return [
        {
          options,
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
          const highlighted = Math.max(0, model.highlighted - 1);
          return [{ ...model, highlighted, error: null }, Cmd.none()];
        }
        case 'multi:down': {
          const highlighted = Math.min(options.length - 1, model.highlighted + 1);
          return [{ ...model, highlighted, error: null }, Cmd.none()];
        }
        case 'multi:toggle': {
          const newSelected = new Set(model.selected);
          if (newSelected.has(model.highlighted)) {
            newSelected.delete(model.highlighted);
          } else {
            if (newSelected.size >= maxSelect) {
              return [{ ...model, error: `Maximum ${maxSelect} selections allowed` }, Cmd.none()];
            }
            newSelected.add(model.highlighted);
          }
          return [{ ...model, selected: newSelected, error: null }, Cmd.none()];
        }
        case 'multi:submit': {
          if (model.selected.size < minSelect) {
            return [{ ...model, error: `Select at least ${minSelect} option${minSelect > 1 ? 's' : ''}` }, Cmd.none()];
          }
          return [{ ...model, done: true }, Cmd.none()];
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
        const selectedLabels = Array.from(model.selected)
          .sort((a, b) => a - b)
          .map((i) => options[i]!.label);
        const doneStyle = style({ color: feedbackColor(config, 'success') });
        children.push(text(`  ${formatList(selectedLabels, locale.lang)}`, doneStyle));
      } else {
        for (let i = 0; i < options.length; i++) {
          const isHighlighted = i === model.highlighted;
          const isSelected = model.selected.has(i);
          const pointer = isHighlighted ? '>' : ' ';
          const check = isSelected ? '[x]' : '[ ]';
          const optStyle = isHighlighted ? style({ color: orbitToneColor(config, 'accent') }) : style({});
          children.push(text(`${pointer} ${check} ${options[i]!.label}`, optStyle));
        }
      }

      if (model.error) {
        const errorStyle = style({ color: feedbackColor(config, 'danger') });
        children.push(text(`  ${model.error}`, errorStyle));
      }

      return column(...children);
    },

    subscriptions(model: MultiSelectPromptModel): Sub<MultiSelectPromptMsg> {
      if (model.done || !model.focused) return Sub.none();
      return Sub.batch<MultiSelectPromptMsg>(
        Sub.key('up', { type: 'multi:up' }),
        Sub.key('down', { type: 'multi:down' }),
        Sub.key('space', { type: 'multi:toggle' }),
        Sub.key('enter', { type: 'multi:submit' }),
      );
    },

    getValue(model: MultiSelectPromptModel): string[] {
      return Array.from(model.selected)
        .sort((a, b) => a - b)
        .map((i) => options[i]!.value);
    },

    isDone(model: MultiSelectPromptModel): boolean {
      return model.done;
    },
  };
}
