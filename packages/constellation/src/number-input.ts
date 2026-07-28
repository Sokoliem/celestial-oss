import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, event, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, clampRange, finiteNumber } from './internal.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface NumberInputTokens {
  text: Color;
  chrome: Color;
  placeholder: Color;
  border: Color;
  borderHover: Color;
  borderFocus: Color;
  bodyStyle: TypographyToken;
  placeholderStyle: TypographyToken;
}

export const numberInputContract: TokenContract<NumberInputTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  chrome: (t: SemanticTheme) => t.colors.textSoft,
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
  hoveredControl?: 'decrement' | 'increment' | 'value' | null;
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
  | Msg<'blur'>
  | Msg<'hover-control', { control: 'decrement' | 'increment' | 'value' }>
  | Msg<'leave-control'>
  | Msg<'noop'>;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Detect decimal places from step value (e.g. 0.01 => 2, 5 => 0). */
function detectPrecision(step: number): number {
  if (!Number.isFinite(step)) return 0;
  const [coefficient, exponentText] = Math.abs(step).toString().toLowerCase().split('e');
  const decimalPlaces = coefficient!.split('.')[1]?.length ?? 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return Math.max(0, decimalPlaces - exponent);
}

/** Clamp a value within [min, max]. */
/** Snap a value to the nearest step, anchored at min (or 0 if min is -Infinity). */
function snapToStep(value: number, step: number, min: number, max: number, precision: number, fallback: number): number {
  const bounded = clampRange(value, min, max, fallback);
  const anchor = Number.isFinite(min) ? min : 0;
  const offset = bounded - anchor;
  if (!Number.isFinite(offset)) return bounded;
  const stepIndex = offset / step;
  if (!Number.isFinite(stepIndex)) return bounded;
  const steps = Math.round(stepIndex);
  const snapped = anchor + steps * step;
  if (!Number.isFinite(snapped)) return bounded;
  const rounded = Number(snapped.toFixed(precision));
  return clampRange(rounded, min, max, bounded);
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
  const configuredMin = config.min === undefined || Number.isNaN(config.min) ? Number.NEGATIVE_INFINITY : config.min;
  const configuredMax = config.max === undefined || Number.isNaN(config.max) ? Number.POSITIVE_INFINITY : config.max;
  const min = Math.min(configuredMin, configuredMax);
  const max = Math.max(configuredMin, configuredMax);
  const configuredStep = finiteNumber(config.step, 1);
  const step = configuredStep > 0 ? configuredStep : 1;
  const precision = boundedInteger(config.precision, detectPrecision(step), 0, 100);
  const interactionId = generateFocusGroupId(`number-input-${config.label ?? 'value'}`);
  const decrementTag = `${interactionId}:decrement`;
  const incrementTag = `${interactionId}:increment`;
  const editTag = `${interactionId}:edit`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  function applyChange(value: number, fallback = 0): number {
    const clamped = clampRange(value, min, max, clampRange(fallback, min, max, 0));
    // Round to precision to avoid floating-point drift
    return Number.isFinite(clamped) ? Number(clamped.toFixed(precision)) : clamped;
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
      const currentValue = applyChange(model.value);
      const normalizedModel = { ...model, value: currentValue };
      const changeBy = (delta: number): [NumberInputModel, Cmd<NumberInputMsg>] => {
        const next = applyChange(currentValue + delta, currentValue);
        if (next !== currentValue) notifyChange(next);
        return [{ ...normalizedModel, value: next, focused: true }, Cmd.none()];
      };
      switch (msg.type) {
        case 'increment':
          return changeBy(step);
        case 'decrement':
          return changeBy(-step);
        case 'increment-large':
          return changeBy(step * 10);
        case 'decrement-large':
          return changeBy(step * -10);
        case 'set-min': {
          if (!Number.isFinite(min)) return [normalizedModel, Cmd.none()];
          if (currentValue !== min) notifyChange(min);
          return [{ ...normalizedModel, value: min }, Cmd.none()];
        }
        case 'set-max': {
          if (!Number.isFinite(max)) return [normalizedModel, Cmd.none()];
          if (currentValue !== max) notifyChange(max);
          return [{ ...normalizedModel, value: max }, Cmd.none()];
        }
        case 'start-edit': {
          const buf = formatValue(currentValue, precision);
          return [{ ...normalizedModel, editing: true, buffer: buf, focused: true }, Cmd.none()];
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
          const snapped = snapToStep(parsed, step, min, max, precision, currentValue);
          if (snapped !== currentValue) notifyChange(snapped);
          return [{ ...normalizedModel, value: snapped, editing: false, buffer: '' }, Cmd.none()];
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
        case 'hover-control':
          return [{ ...normalizedModel, hoveredControl: msg.control }, Cmd.none()];
        case 'leave-control':
          return [{ ...normalizedModel, hoveredControl: null }, Cmd.none()];
        case 'noop':
          return [normalizedModel, Cmd.none()];
      }
    },

    view(model: NumberInputModel): VNode {
      const tokens = useTokens(numberInputContract, config, 'NumberInput');
      const value = applyChange(model.value);
      const parts: VNode[] = [];
      // Brackets are text glyphs, not a painted border. Use a text-safe token
      // at rest so terminal a11y scanners and real users get readable chrome.
      const borderColor = model.focused ? tokens.borderFocus : tokens.chrome;
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
        const atMin = value <= min;
        const atMax = value >= max;
        const downStyle = atMin ? dimStyle : focusedStyle;
        const upStyle = atMax ? dimStyle : focusedStyle;

        parts.push(
          event(
            `${interactionId}:decrement`,
            text('\u25BC ', model.hoveredControl === 'decrement' ? style({ color: tokens.borderHover }) : downStyle),
            atMin ? {} : { onClick: decrementTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: 'Decrease value', intent: 'edit', affordances: atMin ? [] : ['hover', 'click'], cursor: atMin ? undefined : 'pointer' },
          ),
        );

        // Prefix
        if (config.prefix) {
          parts.push(text(config.prefix, focusedStyle));
        }

        // Value display
        const display = formatValue(value, precision);
        if (display === '0' && !model.focused && config.placeholder) {
          parts.push(
            event(
              `${interactionId}:value`,
              text(config.placeholder, applyTypography(tokens.placeholderStyle, { color: tokens.placeholder })),
              { onClick: editTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              { label: config.label ?? 'Edit value', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text' },
            ),
          );
        } else {
          parts.push(
            event(
              `${interactionId}:value`,
              text(display, model.hoveredControl === 'value' ? style({ color: tokens.borderHover }) : focusedStyle),
              { onClick: editTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              { label: config.label ?? 'Edit value', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text' },
            ),
          );
        }

        // Suffix
        if (config.suffix) {
          parts.push(text(config.suffix, focusedStyle));
        }

        parts.push(
          event(
            `${interactionId}:increment`,
            text(' \u25B2', model.hoveredControl === 'increment' ? style({ color: tokens.borderHover }) : upStyle),
            atMax ? {} : { onClick: incrementTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: 'Increase value', intent: 'edit', affordances: atMax ? [] : ['hover', 'click'], cursor: atMax ? undefined : 'pointer' },
          ),
        );
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
      const pointer = Sub.elementMouse<NumberInputMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:`)) return { type: 'noop' };
        const control = mouseEvent.elementId.slice(`${interactionId}:`.length);
        if (mouseEvent.handlerTag === decrementTag) return { type: 'decrement' };
        if (mouseEvent.handlerTag === incrementTag) return { type: 'increment' };
        if (mouseEvent.handlerTag === editTag) return { type: 'start-edit' };
        if (mouseEvent.handlerTag === hoverTag && (control === 'decrement' || control === 'increment' || control === 'value')) {
          return { type: 'hover-control', control };
        }
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave-control' };
        return { type: 'noop' };
      });
      if (!model.focused) return pointer;

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

        return Sub.batch<NumberInputMsg>(pointer, ...subs);
      }

      // Normal mode: arrow keys, page up/down, home/end, enter to edit
      return Sub.batch<NumberInputMsg>(
        pointer,
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
