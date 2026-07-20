import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface NumberInputTokens {
  text: Color;
  placeholder: Color;
  border: Color;
  borderHover: Color;
  borderFocus: Color;
  bodyStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const numberInputContract: TokenContract<NumberInputTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  placeholder: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderFocus: (t: SemanticTheme) => t.colors.borderActive,
  bodyStyle: (t: SemanticTheme) => t.typography.body,
  placeholderStyle: (t: SemanticTheme) => t.typography.caption,
};

// ─── Config ─────────────────────────────────────────────────────────────────

export interface NumberInputConfig {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  precision?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  placeholder?: string;
  onChange?: (value: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

// ─── Model ──────────────────────────────────────────────────────────────────

export interface NumberInputModel {
  value: number;
  editing: boolean;
  buffer: string;
  focused: boolean;
}

// ─── Messages ───────────────────────────────────────────────────────────────

export type NumberInputMsg =
  | Msg<'increment'>
  | Msg<'decrement'>
  | Msg<'increment-large'>
  | Msg<'decrement-large'>
  | Msg<'set-min'>
  | Msg<'set-max'>
  | Msg<'start-edit'>
  | Msg<'char', { char: string }>
  | Msg<'backspace'>
  | Msg<'commit'>
  | Msg<'cancel-edit'>
  | Msg<'focus'>
  | Msg<'blur'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Detect decimal places from step value (e.g. 0.01 => 2, 5 => 0). */
function detectPrecision(step: number): number {
  const str = String(step);
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}

/** Clamp a value within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Snap a value to the nearest step, anchored at min (or 0 if min is -Infinity). */
function snapToStep(value: number, step: number, min: number, max: number): number {
  if (step <= 0) return clamp(value, min, max);
  const anchor = Number.isFinite(min) ? min : 0;
  const steps = Math.round((value - anchor) / step);
  const snapped = anchor + steps * step;
  // Fix floating point: round to precision of step
  const precision = detectPrecision(step);
  const rounded = Number(snapped.toFixed(precision));
  return clamp(rounded, min, max);
}

/** Format a number for display with the given precision. */
function formatValue(value: number, precision: number): string {
  return precision > 0 ? value.toFixed(precision) : String(value);
}

/** Check if a character is valid for numeric input at the given buffer position. */
function isValidChar(char: string, buffer: string): boolean {
  if (char >= '0' && char <= '9') return true;
  if (char === '.' && !buffer.includes('.')) return true;
  if (char === '-' && buffer.length === 0) return true;
  return false;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function numberInput(config: NumberInputConfig): ComponentDescriptor<NumberInputModel, NumberInputMsg> {
  const min = config.min ?? -Infinity;
  const max = config.max ?? Infinity;
  const step = config.step ?? 1;
  const precision = config.precision ?? detectPrecision(step);

  function applyChange(value: number): number {
    const clamped = clamp(value, min, max);
    // Round to precision to avoid floating-point drift
    return Number(clamped.toFixed(precision));
  }

  function notifyChange(value: number): void {
    config.onChange?.(value);
  }

  return {
    init(): [NumberInputModel, Cmd<NumberInputMsg>] {
      const raw = config.value ?? 0;
      const value = applyChange(raw);
      return [{ value, editing: false, buffer: '', focused: false }, Cmd.none()];
    },

    update(msg: NumberInputMsg, model: NumberInputModel): [NumberInputModel, Cmd<NumberInputMsg>] {
      switch (msg.type) {
        case 'increment': {
          const next = applyChange(model.value + step);
          notifyChange(next);
          return [{ ...model, value: next }, Cmd.none()];
        }
        case 'decrement': {
          const next = applyChange(model.value - step);
          notifyChange(next);
          return [{ ...model, value: next }, Cmd.none()];
        }
        case 'increment-large': {
          const next = applyChange(model.value + step * 10);
          notifyChange(next);
          return [{ ...model, value: next }, Cmd.none()];
        }
        case 'decrement-large': {
          const next = applyChange(model.value - step * 10);
          notifyChange(next);
          return [{ ...model, value: next }, Cmd.none()];
        }
        case 'set-min': {
          if (!Number.isFinite(min)) return [model, Cmd.none()];
          notifyChange(min);
          return [{ ...model, value: min }, Cmd.none()];
        }
        case 'set-max': {
          if (!Number.isFinite(max)) return [model, Cmd.none()];
          notifyChange(max);
          return [{ ...model, value: max }, Cmd.none()];
        }
        case 'start-edit': {
          const buf = formatValue(model.value, precision);
          return [{ ...model, editing: true, buffer: buf }, Cmd.none()];
        }
        case 'char': {
          if (!model.editing) return [model, Cmd.none()];
          if (!isValidChar(msg.char, model.buffer)) return [model, Cmd.none()];
          return [{ ...model, buffer: model.buffer + msg.char }, Cmd.none()];
        }
        case 'backspace': {
          if (!model.editing || model.buffer.length === 0) return [model, Cmd.none()];
          return [{ ...model, buffer: model.buffer.slice(0, -1) }, Cmd.none()];
        }
        case 'commit': {
          const parsed = parseFloat(model.buffer);
          if (Number.isNaN(parsed)) {
            // Invalid input: revert to previous value
            return [{ ...model, editing: false, buffer: '' }, Cmd.none()];
          }
          const snapped = snapToStep(parsed, step, min, max);
          notifyChange(snapped);
          return [{ ...model, value: snapped, editing: false, buffer: '' }, Cmd.none()];
        }
        case 'cancel-edit': {
          return [{ ...model, editing: false, buffer: '' }, Cmd.none()];
        }
        case 'focus': {
          return [{ ...model, focused: true }, Cmd.none()];
        }
        case 'blur': {
          return [{ ...model, editing: false, buffer: '', focused: false }, Cmd.none()];
        }
      }
    },

    view(model: NumberInputModel): VNode {
      const tokens = useTokens(numberInputContract, config, 'NumberInput');
      const parts: VNode[] = [];
      const borderColor = model.focused ? tokens.borderFocus : tokens.border;
      const focusedStyle = model.focused ? style({ color: tokens.text }) : undefined;
      const dimStyle = style({ dim: true, color: tokens.placeholder });

      // Label
      if (config.label) {
        parts.push(text(config.label + ': ', focusedStyle));
      }

      // Left border indicator
      parts.push(text('[', style({ color: borderColor })));

      if (model.editing) {
        // Edit mode: show buffer with cursor
        const buf = model.buffer;
        const cursorStyle = style({ reverse: true });
        parts.push(text(buf, focusedStyle));
        parts.push(text('_', cursorStyle));
      } else {
        // Normal mode: ▼ value ▲
        const atMin = model.value <= min;
        const atMax = model.value >= max;
        const downStyle = atMin ? dimStyle : focusedStyle;
        const upStyle = atMax ? dimStyle : focusedStyle;

        parts.push(text('\u25BC ', downStyle));

        // Prefix
        if (config.prefix) {
          parts.push(text(config.prefix, focusedStyle));
        }

        // Value display
        const display = formatValue(model.value, precision);
        if (display === '0' && !model.focused && config.placeholder) {
          parts.push(text(config.placeholder, applyTypography(tokens.placeholderStyle, { color: tokens.placeholder })));
        } else {
          parts.push(text(display, focusedStyle));
        }

        // Suffix
        if (config.suffix) {
          parts.push(text(config.suffix, focusedStyle));
        }

        parts.push(text(' \u25B2', upStyle));
      }

      // Right border indicator
      parts.push(text(']', style({ color: borderColor })));

      const node = row(...parts);
      setVNodeMeta(node, {
        testId: config.label ?? 'number-input',
        a11y: { role: 'textbox', label: config.label },
      });
      return node;
    },

    subscriptions(model: NumberInputModel): Sub<NumberInputMsg> {
      if (!model.focused) return Sub.none();

      if (model.editing) {
        // Edit mode: digit keys, dot, minus, backspace, enter (commit), escape (cancel)
        const subs: Sub<NumberInputMsg>[] = [];

        // Digit keys 0-9
        for (let i = 0; i <= 9; i++) {
          const ch = String(i);
          subs.push(Sub.key(ch, { type: 'char', char: ch } as NumberInputMsg));
        }
        subs.push(Sub.key('.', { type: 'char', char: '.' } as NumberInputMsg));
        subs.push(Sub.key('-', { type: 'char', char: '-' } as NumberInputMsg));
        subs.push(Sub.key('backspace', { type: 'backspace' } as NumberInputMsg));
        subs.push(Sub.key('enter', { type: 'commit' } as NumberInputMsg));
        subs.push(Sub.key('escape', { type: 'cancel-edit' } as NumberInputMsg));

        return Sub.batch<NumberInputMsg>(...subs);
      }

      // Normal mode: arrow keys, page up/down, home/end, enter to edit
      return Sub.batch<NumberInputMsg>(
        Sub.key('up', { type: 'increment' } as NumberInputMsg),
        Sub.key('down', { type: 'decrement' } as NumberInputMsg),
        Sub.key('pageup', { type: 'increment-large' } as NumberInputMsg),
        Sub.key('pagedown', { type: 'decrement-large' } as NumberInputMsg),
        Sub.key('home', { type: 'set-min' } as NumberInputMsg),
        Sub.key('end', { type: 'set-max' } as NumberInputMsg),
        Sub.key('enter', { type: 'start-edit' } as NumberInputMsg),
      );
    },
  };
}
