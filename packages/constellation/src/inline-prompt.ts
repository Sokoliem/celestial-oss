/**
 * Inline CLI prompts (Clack/Inquirer-style) implemented as small Elm
 * applications running in nebula's inline mode — no alternate screen, so
 * scrollback history is preserved when the prompt finishes.
 *
 * These are for standalone CLI flows. For prompts inside a running Celestial
 * app, use the form and wizard builders from `@celestial/orbit` instead —
 * opening a raw inline prompt over a live app would fight its renderer.
 */

import process from 'node:process';
import { color, style } from '@celestial/core/corona';
import {
  type AppConfig,
  type AppHandle,
  app,
  Cmd,
  column,
  row,
  Sub,
  text,
} from '@celestial/core/nebula';
import type { KeyEvent } from '@celestial/core/nebula';
import { graphemeLength, graphemeSlice } from '@celestial/rosetta';

/** Rejection reason when a prompt is cancelled with Escape or Ctrl+C. */
export class PromptCancelledError extends Error {
  override readonly name = 'PromptCancelledError';
  constructor() {
    super('Prompt cancelled');
  }
}

export interface PromptTextOptions {
  message: string;
  placeholder?: string;
  /** Prefilled value; the cursor starts at the end. */
  initial?: string;
  /** Return true to accept, or an error string to keep editing. */
  validate?: (val: string) => boolean | string;
}

export interface PromptConfirmOptions {
  message: string;
  initial?: boolean;
}

export interface PromptSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
}

export interface PromptSelectOptions<T = string> {
  message: string;
  options: PromptSelectOption<T>[];
  initialIndex?: number;
}

// ─── Shared prompt runtime ───────────────────────────────────────────────────

type PromptStatus = 'active' | 'submit' | 'cancel';

interface PromptBase {
  status: PromptStatus;
}

type PromptMsg = { type: 'key'; event: KeyEvent };

/** True when neither stdin nor stdout can drive an interactive prompt. */
function isNonInteractive(): boolean {
  return !process.stdin.isTTY || !process.stdout.isTTY;
}

/**
 * Advanced runner options. Providing a custom terminal backend implies
 * interactive intent, so the non-TTY fallback is skipped — this is also the
 * headless-testing seam.
 */
export interface InlinePromptAdvancedOptions {
  terminal?: import('@celestial/core/nebula').TerminalBackend;
}

/**
 * Run an inline Elm app to completion. The wrapped update observes the
 * prompt's status field: on submit/cancel it stops the app (deferred past the
 * current dispatch) and settles the promise. Rejects with
 * {@link PromptCancelledError} — library code never calls `process.exit`.
 */
function runInline<Model extends PromptBase, T>(
  buildConfig: () => AppConfig<Model, PromptMsg>,
  read: (model: Model) => T,
  height: number,
  advanced?: InlinePromptAdvancedOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const inner = buildConfig();
    let handle: AppHandle<PromptMsg> | null = null;
    const config: AppConfig<Model, PromptMsg> = {
      ...inner,
      update: (msg, model) => {
        const [next, cmd] = inner.update(msg, model);
        if (next.status !== 'active') {
          const settled = next;
          queueMicrotask(() => {
            try {
              handle?.stop();
            } catch {
              // Already stopped — the outcome is settled either way.
            }
            if (settled.status === 'submit') {
              resolve(read(settled));
            } else {
              reject(new PromptCancelledError());
            }
          });
          return [next, Cmd.none()];
        }
        return [next, cmd];
      },
    };
    handle = app(config, { inline: { height }, ...(advanced?.terminal ? { terminal: advanced.terminal } : {}) });
  });
}

function keySubscriptions<M extends PromptMsg>(): Sub<M> {
  return Sub.keyEvent((event) => ({ type: 'key', event }) as M);
}

/** Shared cancel detection: Escape, or Ctrl+C (never exits the process). */
function isCancelKey(event: KeyEvent): boolean {
  return event.key === 'escape' || (event.key === 'c' && event.ctrl);
}

const promptMarkerStyle = style({ color: color.brightCyan, bold: true });
const messageStyle = style({ bold: true, color: color.brightWhite });
const hintStyle = style({ dim: true, color: color.gray });
const answerStyle = style({ color: color.brightCyan });
const errorStyle = style({ color: color.brightRed });
const successMarkerStyle = style({ color: color.brightGreen, bold: true });

function questionLine(message: string, hint?: string): ReturnType<typeof row> {
  return row(
    text('? ', promptMarkerStyle),
    text(message, messageStyle),
    hint ? text(` ${hint}`, hintStyle) : text(''),
    text(' '),
  );
}

// ─── Text prompt ─────────────────────────────────────────────────────────────

interface TextPromptModel extends PromptBase {
  value: string;
  /** Cursor position in grapheme units. */
  cursor: number;
  error: string | null;
}

function createTextPromptApp(options: PromptTextOptions): AppConfig<TextPromptModel, PromptMsg> {
  const initialValue = options.initial ?? '';
  return {
    init: () => [{ status: 'active', value: initialValue, cursor: graphemeLength(initialValue), error: null }, Cmd.none()],

    update: (msg, model) => {
      if (msg.type !== 'key') return [model, Cmd.none()];
      const event = msg.event;

      if (isCancelKey(event)) {
        return [{ ...model, status: 'cancel' }, Cmd.none()];
      }
      if (event.key === 'enter') {
        const verdict = options.validate?.(model.value);
        if (typeof verdict === 'string') {
          return [{ ...model, error: verdict }, Cmd.none()];
        }
        return [{ ...model, status: 'submit', error: null }, Cmd.none()];
      }
      if (event.key === 'backspace') {
        if (model.cursor === 0) return [model, Cmd.none()];
        const next = graphemeSlice(model.value, 0, model.cursor - 1) + graphemeSlice(model.value, model.cursor);
        return [{ ...model, value: next, cursor: model.cursor - 1, error: null }, Cmd.none()];
      }
      if (event.key === 'delete') {
        const next = graphemeSlice(model.value, 0, model.cursor) + graphemeSlice(model.value, model.cursor + 1);
        return [{ ...model, value: next, error: null }, Cmd.none()];
      }
      if (event.key === 'left') {
        return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
      }
      if (event.key === 'right') {
        return [{ ...model, cursor: Math.min(graphemeLength(model.value), model.cursor + 1) }, Cmd.none()];
      }
      if (event.key === 'home') {
        return [{ ...model, cursor: 0 }, Cmd.none()];
      }
      if (event.key === 'end') {
        return [{ ...model, cursor: graphemeLength(model.value) }, Cmd.none()];
      }
      if (event.char && !event.ctrl && !event.alt) {
        const next = graphemeSlice(model.value, 0, model.cursor) + event.char + graphemeSlice(model.value, model.cursor);
        // Multi-scalar graphemes (emoji with modifiers, ZWJ sequences) arrive
        // as one key event per scalar — clamp so the cursor never runs past
        // the end of the composed cluster.
        const nextCursor = Math.min(model.cursor + graphemeLength(event.char), graphemeLength(next));
        return [{ ...model, value: next, cursor: nextCursor, error: null }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view: (model) => {
      if (model.status === 'submit') {
        return column(row(text('✔ ', successMarkerStyle), text(options.message, messageStyle), text(` ${model.value}`, answerStyle)));
      }
      const displayValue = model.value || (options.placeholder ?? '');
      const displayStyle = model.value ? undefined : hintStyle;
      const before = graphemeSlice(displayValue, 0, model.cursor);
      const at = graphemeSlice(displayValue, model.cursor, model.cursor + 1);
      const after = graphemeSlice(displayValue, model.cursor + 1);
      const cursorChar = at || ' ';
      const lines = [
        row(
          text('? ', promptMarkerStyle),
          text(options.message, messageStyle),
          text(' ', undefined),
          text(before, displayStyle),
          text(cursorChar, style({ reverse: true })),
          text(after, displayStyle),
        ),
      ];
      if (model.error) {
        lines.push(row(text('  ', undefined), text(model.error, errorStyle)));
      }
      return column(...lines);
    },

    subscriptions: () => keySubscriptions(),
  };
}

// ─── Confirm prompt ──────────────────────────────────────────────────────────

interface ConfirmPromptModel extends PromptBase {
  value: boolean;
}

function createConfirmPromptApp(options: PromptConfirmOptions): AppConfig<ConfirmPromptModel, PromptMsg> {
  const initial = options.initial ?? true;
  return {
    init: () => [{ status: 'active', value: initial }, Cmd.none()],

    update: (msg, model) => {
      if (msg.type !== 'key') return [model, Cmd.none()];
      const event = msg.event;
      if (isCancelKey(event)) {
        return [{ ...model, status: 'cancel' }, Cmd.none()];
      }
      if (event.key === 'enter') {
        return [{ ...model, status: 'submit' }, Cmd.none()];
      }
      if (event.key === 'left' || event.key === 'right' || event.key === 'tab') {
        return [{ ...model, value: !model.value }, Cmd.none()];
      }
      if (event.char === 'y' || event.char === 'Y') {
        return [{ ...model, value: true, status: 'submit' }, Cmd.none()];
      }
      if (event.char === 'n' || event.char === 'N') {
        return [{ ...model, value: false, status: 'submit' }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view: (model) => {
      if (model.status === 'submit') {
        return row(
          text(model.value ? '✔ ' : '✖ ', model.value ? successMarkerStyle : errorStyle),
          text(options.message, messageStyle),
          text(` ${model.value ? 'Yes' : 'No'}`, answerStyle),
        );
      }
      const hint = model.value ? '(Y/n)' : '(y/N)';
      return questionLine(options.message, hint);
    },

    subscriptions: () => keySubscriptions(),
  };
}

// ─── Select prompt ───────────────────────────────────────────────────────────

interface SelectPromptModel extends PromptBase {
  selectedIndex: number;
}

function createSelectPromptApp<T>(options: PromptSelectOptions<T>): AppConfig<SelectPromptModel, PromptMsg> {
  if (options.options.length === 0) {
    throw new RangeError('inlinePrompt.select requires at least one option');
  }
  const count = options.options.length;
  return {
    init: () => [{ status: 'active', selectedIndex: Math.min(Math.max(0, options.initialIndex ?? 0), count - 1) }, Cmd.none()],

    update: (msg, model) => {
      if (msg.type !== 'key') return [model, Cmd.none()];
      const event = msg.event;
      if (isCancelKey(event)) {
        return [{ ...model, status: 'cancel' }, Cmd.none()];
      }
      if (event.key === 'enter') {
        return [{ ...model, status: 'submit' }, Cmd.none()];
      }
      if (event.key === 'up' || event.char === 'k') {
        return [{ ...model, selectedIndex: (model.selectedIndex - 1 + count) % count }, Cmd.none()];
      }
      if (event.key === 'down' || event.char === 'j') {
        return [{ ...model, selectedIndex: (model.selectedIndex + 1) % count }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view: (model) => {
      if (model.status === 'submit') {
        const chosen = options.options[model.selectedIndex];
        return row(text('✔ ', successMarkerStyle), text(options.message, messageStyle), text(` ${chosen?.label ?? ''}`, answerStyle));
      }
      const lines = [questionLine(options.message, '(↑/↓ or j/k, Enter to confirm)')];
      for (let i = 0; i < count; i++) {
        const opt = options.options[i];
        if (!opt) continue;
        const isSelected = i === model.selectedIndex;
        lines.push(
          row(
            text(isSelected ? ' ❯ ' : '   ', isSelected ? promptMarkerStyle : undefined),
            text(opt.label, isSelected ? style({ bold: true, color: color.brightCyan }) : undefined),
            opt.hint ? text(` (${opt.hint})`, hintStyle) : text(''),
          ),
        );
      }
      return column(...lines);
    },

    subscriptions: () => keySubscriptions(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Inline prompt runner for standalone CLI flows. Each prompt is a small
 * Celestial app in inline mode: full keyboard editing, grapheme-safe cursor
 * movement, Escape/Ctrl+C cancellation via {@link PromptCancelledError}, and
 * scrollback preserved on completion.
 */
export const inlinePrompt = {
  /** Prompt for text input. Honors `initial` prefill and `validate`. */
  async text(options: PromptTextOptions, advanced?: InlinePromptAdvancedOptions): Promise<string> {
    if (!advanced?.terminal && isNonInteractive()) return options.initial ?? '';
    return runInline(() => createTextPromptApp(options), (model) => model.value, 3, advanced);
  },

  /** Prompt for yes/no confirmation. */
  async confirm(options: PromptConfirmOptions, advanced?: InlinePromptAdvancedOptions): Promise<boolean> {
    if (!advanced?.terminal && isNonInteractive()) return options.initial ?? true;
    return runInline(() => createConfirmPromptApp(options), (model) => model.value, 2, advanced);
  },

  /** Prompt to select an option from a list. */
  async select<T = string>(options: PromptSelectOptions<T>, advanced?: InlinePromptAdvancedOptions): Promise<T> {
    if (options.options.length === 0) {
      throw new RangeError('inlinePrompt.select requires at least one option');
    }
    const fallback = options.options[Math.min(Math.max(0, options.initialIndex ?? 0), options.options.length - 1)];
    if (!advanced?.terminal && isNonInteractive()) {
      return (fallback ?? options.options[0])!.value;
    }
    return runInline(
      () => createSelectPromptApp(options),
      (model) => (options.options[model.selectedIndex] ?? options.options[0])!.value,
      options.options.length + 2,
      advanced,
    );
  },
};

// Exported for headless testing and custom runners.
export { createConfirmPromptApp, createSelectPromptApp, createTextPromptApp };
export type { PromptMsg };
