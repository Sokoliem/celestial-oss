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
import { Cmd, event, row, Sub, text } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, clampToStep, finiteNumber, interpolateRange, normalizeRange, positiveInteger, rangeRatio } from './internal.js';
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
  /** Pointer is currently dragging the active handle. */
  dragging?: boolean;
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
  | Msg<'set-at', { index: number }>
  | Msg<'drag-at', { index: number }>
  | Msg<'drag-end'>
  | Msg<'switch-handle'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

// ─── Mouse hit-testing ──────────────────────────────────────────────────────

interface RangeHitConfig {
  min: number;
  max: number;
  step: number;
  width: number;
}

function normalizeHitConfig(cfg: RangeHitConfig): RangeHitConfig {
  const { min, max } = normalizeRange(cfg.min, cfg.max);
  const configuredStep = finiteNumber(cfg.step, 1);
  return {
    min,
    max,
    step: configuredStep > 0 ? configuredStep : 1,
    width: positiveInteger(cfg.width, 20),
  };
}

/**
 * Map a click position on the track to a set-low or set-high message.
 * Selects the nearest handle to the click point.
 */
export function rangeSliderHitTest(
  model: Pick<RangeSliderModel, 'low' | 'high'>,
  cfg: RangeHitConfig,
  relX: number,
): Msg<'set-low', { value: number }> | Msg<'set-high', { value: number }> | null {
  const normalized = normalizeHitConfig(cfg);
  if (!Number.isFinite(relX) || relX < 0 || relX >= normalized.width) return null;

  const ratio = relX / normalized.width;
  const value = interpolateRange(normalized.min, normalized.max, ratio);
  const low = clampToStep(model.low, normalized.min, normalized.max, normalized.step);
  const high = clampToStep(model.high, low, normalized.max, normalized.step, normalized.max);
  const distToLow = Math.abs(ratio - rangeRatio(low, normalized.min, normalized.max));
  const distToHigh = Math.abs(ratio - rangeRatio(high, normalized.min, normalized.max));
  if (distToLow <= distToHigh) {
    return { type: 'set-low', value: clampToStep(value, normalized.min, high, normalized.step) };
  }
  return { type: 'set-high', value: clampToStep(value, low, normalized.max, normalized.step) };
}

/** Map a drag position to a message for the currently active handle. */
export function rangeSliderDragTest(
  model: Pick<RangeSliderModel, 'low' | 'high' | 'activeHandle'>,
  cfg: RangeHitConfig,
  relX: number,
): Msg<'set-low', { value: number }> | Msg<'set-high', { value: number }> {
  const normalized = normalizeHitConfig(cfg);
  const clamped = boundedInteger(relX, 0, 0, normalized.width - 1);
  const ratio = clamped / normalized.width;
  const value = interpolateRange(normalized.min, normalized.max, ratio);
  const low = clampToStep(model.low, normalized.min, normalized.max, normalized.step);
  const high = clampToStep(model.high, low, normalized.max, normalized.step, normalized.max);
  if (model.activeHandle === 'low') {
    return { type: 'set-low', value: clampToStep(value, normalized.min, high, normalized.step) };
  }
  return { type: 'set-high', value: clampToStep(value, low, normalized.max, normalized.step) };
}

/** Create a range slider component for dual-handle numeric range selection. */
export function rangeSlider(config: RangeSliderConfig): ComponentDescriptor<RangeSliderModel, RangeSliderMsg> {
  const { min, max } = normalizeRange(config.min, config.max);
  const configuredStep = finiteNumber(config.step, 1);
  const step = configuredStep > 0 ? configuredStep : 1;
  const width = positiveInteger(config.width, 20);
  const interactionId = generateFocusGroupId('range-slider');
  const setTag = `${interactionId}:set`;
  const dragTag = `${interactionId}:drag`;
  const hitConfig = { min, max, step, width };

  function normalizedValues(model: Pick<RangeSliderModel, 'low' | 'high'>): { low: number; high: number } {
    const low = clampToStep(model.low, min, max, step);
    return { low, high: clampToStep(model.high, low, max, step, max) };
  }

  return {
    init(): [RangeSliderModel, Cmd<RangeSliderMsg>] {
      const low = config.low !== undefined ? clampToStep(config.low, min, max, step) : min;
      const high = config.high !== undefined ? clampToStep(config.high, min, max, step) : max;
      return [{ low, high: Math.max(low, high), activeHandle: 'low', focused: false }, Cmd.none()];
    },

    update(msg: RangeSliderMsg, model: RangeSliderModel): [RangeSliderModel, Cmd<RangeSliderMsg>] {
      const current = normalizedValues(model);
      const activeHandle: RangeSliderModel['activeHandle'] = model.activeHandle === 'high' ? 'high' : 'low';
      const normalizedModel: RangeSliderModel = { ...model, ...current, activeHandle };

      const setLow = (value: number): [RangeSliderModel, Cmd<RangeSliderMsg>] => {
        const next = clampToStep(value, min, current.high, step, current.low);
        if (next !== current.low) config.onChange?.(next, current.high);
        return [{ ...normalizedModel, low: next, activeHandle: 'low' }, Cmd.none()];
      };
      const setHigh = (value: number): [RangeSliderModel, Cmd<RangeSliderMsg>] => {
        const next = clampToStep(value, current.low, max, step, current.high);
        if (next !== current.high) config.onChange?.(current.low, next);
        return [{ ...normalizedModel, high: next, activeHandle: 'high' }, Cmd.none()];
      };
      const moveHandle = (delta: number): [RangeSliderModel, Cmd<RangeSliderMsg>] =>
        activeHandle === 'low' ? setLow(current.low + delta) : setHigh(current.high + delta);

      switch (msg.type) {
        case 'increment':
          return moveHandle(step);
        case 'decrement':
          return moveHandle(-step);
        case 'increment-large':
          return moveHandle(step * 10);
        case 'decrement-large':
          return moveHandle(step * -10);
        case 'set-min':
          return activeHandle === 'low' ? setLow(min) : setHigh(current.low);
        case 'set-max':
          return activeHandle === 'low' ? setLow(current.high) : setHigh(max);
        case 'set-low':
          return setLow(msg.value);
        case 'set-high':
          return setHigh(msg.value);
        case 'set-at': {
          const pointerMsg = rangeSliderHitTest(current, hitConfig, msg.index);
          if (!pointerMsg) return [normalizedModel, Cmd.none()];
          const [updated, cmd] = pointerMsg.type === 'set-low' ? setLow(pointerMsg.value) : setHigh(pointerMsg.value);
          return [{ ...updated, focused: true, dragging: true }, cmd];
        }
        case 'drag-at': {
          if (!model.dragging) return [normalizedModel, Cmd.none()];
          const pointerMsg = rangeSliderDragTest({ ...current, activeHandle }, hitConfig, msg.index);
          const [updated, cmd] = pointerMsg.type === 'set-low' ? setLow(pointerMsg.value) : setHigh(pointerMsg.value);
          return [{ ...updated, focused: true, dragging: true }, cmd];
        }
        case 'drag-end':
          return [{ ...normalizedModel, dragging: false }, Cmd.none()];
        case 'switch-handle':
          return [{ ...normalizedModel, activeHandle: activeHandle === 'low' ? 'high' : 'low' }, Cmd.none()];
        case 'focus':
          return [{ ...normalizedModel, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...normalizedModel, focused: false, dragging: false }, Cmd.none()];
        case 'noop':
          return [normalizedModel, Cmd.none()];
      }
    },

    view(model: RangeSliderModel): VNode {
      const tokens = useTokens(rangeSliderContract, config, 'RangeSlider');
      const current = normalizedValues(model);
      const lowPos = Math.round(Math.max(0, Math.min(1, rangeRatio(current.low, min, max))) * width);
      const highPos = Math.round(Math.max(0, Math.min(1, rangeRatio(current.high, min, max, 1))) * width);
      const emptyStyle = style({ color: tokens.trackEmpty, dim: true });
      const filledStyle = model.focused ? style({ color: tokens.borderActive, bold: true }) : style({ color: tokens.track });
      const parts: VNode[] = [];

      for (let index = 0; index < width; index++) {
        const filled = index >= lowPos && index < highPos;
        parts.push(
          event(
            `${interactionId}:cell:${index}`,
            text(filled ? '█' : '░', filled ? filledStyle : emptyStyle),
            { onMouseDown: setTag, onMouseMove: dragTag },
            { label: `Range ${index + 1} of ${width}`, intent: 'edit', affordances: ['click', 'drag'], cursor: 'ew-resize' },
          ),
        );
      }

      const lowStr = Number.isInteger(current.low) ? String(current.low) : current.low.toFixed(1);
      const highStr = Number.isInteger(current.high) ? String(current.high) : current.high.toFixed(1);
      const labelStyle = model.focused ? style({ color: tokens.borderActive }) : style({ color: tokens.text });
      if (model.focused) {
        const activeIndicator = model.activeHandle === 'high' ? '►' : '◄';
        parts.push(text(` ${lowStr}-${highStr} ${activeIndicator}`, labelStyle));
      } else {
        parts.push(text(` ${lowStr}-${highStr}`, labelStyle));
      }
      return row(...parts);
    },

    subscriptions(model: RangeSliderModel): Sub<RangeSliderMsg> {
      const pointer = Sub.elementMouse<RangeSliderMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:cell:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:cell:`.length));
        if (mouseEvent.handlerTag === setTag) return { type: 'set-at', index };
        if (mouseEvent.handlerTag === dragTag) return { type: 'drag-at', index };
        return { type: 'noop' };
      });
      const release = model.dragging
        ? Sub.mouse<RangeSliderMsg>((mouseEvent) => (mouseEvent.type === 'release' ? { type: 'drag-end' } : { type: 'noop' }))
        : Sub.none<RangeSliderMsg>();
      if (!model.focused) return Sub.batch(pointer, release);
      return Sub.batch<RangeSliderMsg>(
        pointer,
        release,
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
