/**
 * Range Slider — A dual-handle numeric range input component.
 *
 * Extends the slider pattern to support selecting a range [low, high].
 * Renders a horizontal track using Unicode block characters with two
 * thumb positions. Tab switches the active handle.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, row, Sub, text } from '@celestial/nebula';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface RangeSliderTokens {
  track: Color;
  trackEmpty: Color;
  thumb: Color;
  text: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const rangeSliderContract: TokenContract<RangeSliderTokens> = {
  track: (t: SemanticTheme) => t.colors.trackFill,
  trackEmpty: (t: SemanticTheme) => t.colors.muted,
  thumb: (t: SemanticTheme) => t.colors.trackFill,
  text: (t: SemanticTheme) => t.colors.text,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/** Clamp a value between min and max, snapped to step increments. */
function clampToStep(value: number, min: number, max: number, step: number): number {
  if (value >= max) return max;
  if (value <= min) return min;
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.max(min, Math.min(max, snapped));
}

/** Configuration for creating a range slider component. */
export interface RangeSliderConfig {
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Step increment (default: 1). */
  step?: number;
  /** Initial low value (defaults to min). */
  low?: number;
  /** Initial high value (defaults to max). */
  high?: number;
  /** Width of the track in characters (default: 20). */
  width?: number;
  /** Callback when either handle changes. */
  onChange?: (low: number, high: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** Model state for the range slider component. */
export interface RangeSliderModel {
  /** Current low bound value. */
  low: number;
  /** Current high bound value. */
  high: number;
  /** Which handle is currently active for keyboard input. */
  activeHandle: 'low' | 'high';
  /** Whether the range slider is focused. */
  focused: boolean;
}

/** Messages the range slider can handle. */
export type RangeSliderMsg =
  | Msg<'increment'>
  | Msg<'decrement'>
  | Msg<'increment-large'>
  | Msg<'decrement-large'>
  | Msg<'set-min'>
  | Msg<'set-max'>
  | Msg<'set-low', { value: number }>
  | Msg<'set-high', { value: number }>
  | Msg<'switch-handle'>
  | Msg<'focus'>
  | Msg<'blur'>;

// ─── Mouse hit-testing ──────────────────────────────────────────────────────

interface RangeHitConfig {
  min: number;
  max: number;
  step: number;
  width: number;
}

/**
 * Map a click position on the track to a set-low or set-high message.
 * Selects the nearest handle to the click point.
 *
 * @param model - Current model with low/high values.
 * @param cfg - Range configuration (min, max, step, width).
 * @param relX - Click X relative to the track start (no padding offset — caller strips it).
 * @returns A set-low or set-high message, or null if outside the track.
 */
export function rangeSliderHitTest(
  model: Pick<RangeSliderModel, 'low' | 'high'>,
  cfg: RangeHitConfig,
  relX: number,
): Msg<'set-low', { value: number }> | Msg<'set-high', { value: number }> | null {
  if (relX < 0 || relX >= cfg.width) return null;
  const ratio = relX / cfg.width;
  const value = cfg.min + ratio * (cfg.max - cfg.min);
  const distToLow = Math.abs(value - model.low);
  const distToHigh = Math.abs(value - model.high);
  if (distToLow <= distToHigh) {
    return { type: 'set-low', value: clampToStep(value, cfg.min, model.high, cfg.step) };
  }
  return { type: 'set-high', value: clampToStep(value, model.low, cfg.max, cfg.step) };
}

/**
 * Map a drag position to a message for the currently active handle.
 * Unlike hitTest, this does not switch handles — it moves whichever is active.
 *
 * @param model - Current model with low/high/activeHandle values.
 * @param cfg - Range configuration (min, max, step, width).
 * @param relX - Drag X relative to the track start (clamped internally).
 * @returns A set-low or set-high message for the active handle.
 */
export function rangeSliderDragTest(
  model: Pick<RangeSliderModel, 'low' | 'high' | 'activeHandle'>,
  cfg: RangeHitConfig,
  relX: number,
): Msg<'set-low', { value: number }> | Msg<'set-high', { value: number }> {
  const clamped = Math.max(0, Math.min(cfg.width - 1, relX));
  const ratio = clamped / cfg.width;
  const value = cfg.min + ratio * (cfg.max - cfg.min);
  if (model.activeHandle === 'low') {
    return { type: 'set-low', value: clampToStep(value, cfg.min, model.high, cfg.step) };
  }
  return { type: 'set-high', value: clampToStep(value, model.low, cfg.max, cfg.step) };
}

/**
 * Create a range slider component for dual-handle numeric range selection.
 *
 * @param config - Range slider configuration including min, max, step, and callbacks.
 * @returns A ComponentDescriptor for the range slider.
 */
export function rangeSlider(config: RangeSliderConfig): ComponentDescriptor<RangeSliderModel, RangeSliderMsg> {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const step = config.step ?? 1;
  const width = config.width ?? 20;

  return {
    init(): [RangeSliderModel, Cmd<RangeSliderMsg>] {
      const low = config.low !== undefined ? clampToStep(config.low, min, max, step) : min;
      const high = config.high !== undefined ? clampToStep(config.high, min, max, step) : max;
      return [{ low, high: Math.max(low, high), activeHandle: 'low', focused: false }, Cmd.none()];
    },

    update(msg: RangeSliderMsg, model: RangeSliderModel): [RangeSliderModel, Cmd<RangeSliderMsg>] {
      const moveHandle = (delta: number): [RangeSliderModel, Cmd<RangeSliderMsg>] => {
        if (model.activeHandle === 'low') {
          const nv = clampToStep(model.low + delta, min, model.high, step);
          if (nv !== model.low) config.onChange?.(nv, model.high);
          return [{ ...model, low: nv }, Cmd.none()];
        } else {
          const nv = clampToStep(model.high + delta, model.low, max, step);
          if (nv !== model.high) config.onChange?.(model.low, nv);
          return [{ ...model, high: nv }, Cmd.none()];
        }
      };

      switch (msg.type) {
        case 'increment':
          return moveHandle(step);
        case 'decrement':
          return moveHandle(-step);
        case 'increment-large':
          return moveHandle(step * 10);
        case 'decrement-large':
          return moveHandle(-step * 10);
        case 'set-min': {
          if (model.activeHandle === 'low') {
            if (model.low !== min) config.onChange?.(min, model.high);
            return [{ ...model, low: min }, Cmd.none()];
          } else {
            if (model.high !== model.low) config.onChange?.(model.low, model.low);
            return [{ ...model, high: model.low }, Cmd.none()];
          }
        }
        case 'set-max': {
          if (model.activeHandle === 'low') {
            if (model.low !== model.high) config.onChange?.(model.high, model.high);
            return [{ ...model, low: model.high }, Cmd.none()];
          } else {
            if (model.high !== max) config.onChange?.(model.low, max);
            return [{ ...model, high: max }, Cmd.none()];
          }
        }
        case 'set-low': {
          const v = clampToStep((msg as Msg<'set-low', { value: number }>).value, min, model.high, step);
          if (v !== model.low) config.onChange?.(v, model.high);
          return [{ ...model, low: v, activeHandle: 'low' }, Cmd.none()];
        }
        case 'set-high': {
          const v = clampToStep((msg as Msg<'set-high', { value: number }>).value, model.low, max, step);
          if (v !== model.high) config.onChange?.(model.low, v);
          return [{ ...model, high: v, activeHandle: 'high' }, Cmd.none()];
        }
        case 'switch-handle':
          return [{ ...model, activeHandle: model.activeHandle === 'low' ? 'high' : 'low' }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
      }
    },

    view(model: RangeSliderModel): VNode {
      const tokens = useTokens(rangeSliderContract, config, 'RangeSlider');
      const range = max - min;

      // Calculate positions in track characters
      const lowPos = range > 0 ? Math.round(((model.low - min) / range) * width) : 0;
      const highPos = range > 0 ? Math.round(((model.high - min) / range) * width) : width;

      const beforeCount = lowPos;
      const filledCount = Math.max(0, highPos - lowPos);
      const afterCount = width - highPos;

      const emptyStyle = style({ color: tokens.trackEmpty, dim: true });
      const filledStyle = model.focused ? style({ color: tokens.borderActive, bold: true }) : style({ color: tokens.track });

      const parts: VNode[] = [];

      // Track: empty ░░░ filled ████ empty ░░░
      parts.push(text('░'.repeat(beforeCount), emptyStyle));
      parts.push(text('█'.repeat(filledCount), filledStyle));
      parts.push(text('░'.repeat(afterCount), emptyStyle));

      // Label: show range values with active handle indicator
      const lowStr = Number.isInteger(model.low) ? String(model.low) : model.low.toFixed(1);
      const highStr = Number.isInteger(model.high) ? String(model.high) : model.high.toFixed(1);

      const labelStyle = model.focused ? style({ color: tokens.borderActive }) : style({ color: tokens.text });

      if (model.focused) {
        const activeIndicator = model.activeHandle === 'low' ? '◄' : '►';
        parts.push(text(` ${lowStr}-${highStr} ${activeIndicator}`, labelStyle));
      } else {
        parts.push(text(` ${lowStr}-${highStr}`, labelStyle));
      }

      return row(...parts);
    },

    subscriptions(model: RangeSliderModel): Sub<RangeSliderMsg> {
      if (!model.focused) return Sub.none();
      return Sub.batch<RangeSliderMsg>(
        Sub.key('right', { type: 'increment' }),
        Sub.key('left', { type: 'decrement' }),
        Sub.key('up', { type: 'increment' }),
        Sub.key('down', { type: 'decrement' }),
        Sub.key('pageup', { type: 'increment-large' }),
        Sub.key('pagedown', { type: 'decrement-large' }),
        Sub.key('home', { type: 'set-min' }),
        Sub.key('end', { type: 'set-max' }),
        Sub.key('tab', { type: 'switch-handle' }),
      );
    },
  };
}
