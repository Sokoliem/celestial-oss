/**
 * Slider — A numeric range input component with visual track rendering.
 *
 * Renders a horizontal slider using Unicode block characters.
 * Supports min/max/step configuration, keyboard navigation,
 * and customizable track appearance.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface SliderTokens {
  track: Color;
  trackEmpty: Color;
  thumb: Color;
  text: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const sliderContract: TokenContract<SliderTokens> = {
  track: (t: SemanticTheme) => t.colors.trackFill,
  trackEmpty: (t: SemanticTheme) => t.colors.muted,
  thumb: (t: SemanticTheme) => t.colors.trackFill,
  text: (t: SemanticTheme) => t.colors.text,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/** Configuration for creating a slider component. */
export interface SliderConfig {
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Step increment (default: 1). */
  step?: number;
  /** Initial value (defaults to min). */
  value?: number;
  /** Width of the track in characters (default: 20). */
  width?: number;
  /** Whether to show the numeric value label (default: true). */
  showValue?: boolean;
  /** Optional label displayed before the slider. */
  label?: string;
  /** Callback when value changes. */
  onChange?: (value: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** Model state for the slider component. */
export interface SliderModel {
  /** Current slider value. */
  value: number;
  /** Whether the slider is focused. */
  focused: boolean;
  /** Pointer is currently over the track. */
  hovered?: boolean;
  /** Pointer is currently dragging the thumb/track. */
  dragging?: boolean;
}

/** Messages the slider can handle. */
export type SliderMsg =
  | Msg<'increment'>
  | Msg<'decrement'>
  | Msg<'increment-large'>
  | Msg<'decrement-large'>
  | Msg<'set-min'>
  | Msg<'set-max'>
  | Msg<'set-at', { index: number }>
  | Msg<'drag-at', { index: number }>
  | Msg<'drag-end'>
  | Msg<'hover'>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

/** Clamp a value between min and max, snapped to step increments. */
function clampToStep(value: number, min: number, max: number, step: number): number {
  // Allow reaching exact min/max even when step doesn't divide the range
  if (value >= max) return max;
  if (value <= min) return min;
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.max(min, Math.min(max, snapped));
}

/**
 * Create a slider component for numeric range selection.
 *
 * @param config - Slider configuration including min, max, step, and callbacks.
 * @returns A ComponentDescriptor for the slider.
 */
export function slider(config: SliderConfig): ComponentDescriptor<SliderModel, SliderMsg> {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const step = config.step ?? 1;
  const width = config.width ?? 20;
  const showValue = config.showValue ?? true;
  const label = config.label;
  const interactionId = generateFocusGroupId(`slider-${label ?? 'range'}`);
  const setTag = `${interactionId}:set`;
  const dragTag = `${interactionId}:drag`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  function valueAt(index: number): number {
    if (width <= 1 || max <= min) return min;
    const ratio = Math.max(0, Math.min(width - 1, index)) / (width - 1);
    return clampToStep(min + ratio * (max - min), min, max, step);
  }

  function applyValue(model: SliderModel, value: number, dragging: boolean): SliderModel {
    const nextValue = clampToStep(value, min, max, step);
    if (nextValue !== model.value) config.onChange?.(nextValue);
    return { ...model, value: nextValue, focused: true, hovered: true, dragging };
  }

  return {
    init(): [SliderModel, Cmd<SliderMsg>] {
      const initial = config.value !== undefined ? clampToStep(config.value, min, max, step) : min;
      return [{ value: initial, focused: false }, Cmd.none()];
    },

    update(msg: SliderMsg, model: SliderModel): [SliderModel, Cmd<SliderMsg>] {
      switch (msg.type) {
        case 'increment': {
          const nv = clampToStep(model.value + step, min, max, step);
          if (nv !== model.value) config.onChange?.(nv);
          return [{ ...model, value: nv }, Cmd.none()];
        }
        case 'decrement': {
          const nv = clampToStep(model.value - step, min, max, step);
          if (nv !== model.value) config.onChange?.(nv);
          return [{ ...model, value: nv }, Cmd.none()];
        }
        case 'increment-large': {
          const largeStep = step * 10;
          const nv = clampToStep(model.value + largeStep, min, max, step);
          if (nv !== model.value) config.onChange?.(nv);
          return [{ ...model, value: nv }, Cmd.none()];
        }
        case 'decrement-large': {
          const largeStep = step * 10;
          const nv = clampToStep(model.value - largeStep, min, max, step);
          if (nv !== model.value) config.onChange?.(nv);
          return [{ ...model, value: nv }, Cmd.none()];
        }
        case 'set-min': {
          if (model.value !== min) config.onChange?.(min);
          return [{ ...model, value: min }, Cmd.none()];
        }
        case 'set-max': {
          if (model.value !== max) config.onChange?.(max);
          return [{ ...model, value: max }, Cmd.none()];
        }
        case 'set-at':
          return [applyValue(model, valueAt(msg.index), true), Cmd.none()];
        case 'drag-at':
          return model.dragging ? [applyValue(model, valueAt(msg.index), true), Cmd.none()] : [model, Cmd.none()];
        case 'drag-end':
          return model.dragging ? [{ ...model, dragging: false }, Cmd.none()] : [model, Cmd.none()];
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, dragging: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: SliderModel): VNode {
      const tokens = useTokens(sliderContract, config, 'Slider');
      const ratio = max > min ? (model.value - min) / (max - min) : 0;
      const filledCount = Math.round(ratio * width);
      const thumbIndex = Math.max(0, Math.min(width - 1, Math.round(ratio * Math.max(0, width - 1))));
      const activeColor = model.dragging ? tokens.borderActive : model.hovered ? tokens.borderHover : model.focused ? tokens.borderActive : undefined;

      const parts: VNode[] = [];

      if (label) {
        parts.push(text(label + ' ', applyTypography(tokens.labelStyle, { bold: true })));
      }

      for (let index = 0; index < width; index++) {
        const filled = index < filledCount;
        const isThumb = index === thumbIndex;
        const cellStyle = style({
          color: activeColor ?? (isThumb ? tokens.thumb : filled ? tokens.track : tokens.trackEmpty),
          bold: isThumb || model.dragging || model.hovered,
          dim: !filled && !isThumb && !model.hovered,
        });
        parts.push(
          event(
            `${interactionId}:cell:${index}`,
            text(filled || isThumb ? '█' : '░', cellStyle),
            { onMouseDown: setTag, onMouseMove: dragTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: `${label ?? 'Slider'} ${valueAt(index)}`, intent: 'edit', affordances: ['hover', 'click', 'drag'], cursor: 'ew-resize' },
          ),
        );
      }

      if (showValue) {
        const valueStr = Number.isInteger(model.value) ? String(model.value) : model.value.toFixed(1);
        parts.push(text(` ${valueStr}`, style({ color: activeColor ?? tokens.text, bold: model.focused || model.hovered })));
      }

      const node = row(...parts);
      setVNodeMeta(node, {
        testId: config.label ?? 'slider',
        a11y: { role: 'slider', label: config.label, valueNow: model.value, valueMin: min, valueMax: max },
      });
      return node;
    },

    subscriptions(model: SliderModel): Sub<SliderMsg> {
      const mouse = Sub.elementMouse<SliderMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:cell:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${interactionId}:cell:`.length));
        if (mouseEvent.handlerTag === setTag) return { type: 'set-at', index };
        if (mouseEvent.handlerTag === dragTag) return { type: 'drag-at', index };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      const release = model.dragging
        ? Sub.mouse<SliderMsg>((mouseEvent) => (mouseEvent.type === 'release' ? { type: 'drag-end' } : { type: 'noop' }))
        : Sub.none<SliderMsg>();
      if (!model.focused) return Sub.batch(mouse, release);
      return Sub.batch<SliderMsg>(
        mouse,
        release,
        Sub.key('right', { type: 'increment' }),
        Sub.key('left', { type: 'decrement' }),
        Sub.key('up', { type: 'increment' }),
        Sub.key('down', { type: 'decrement' }),
        Sub.key('pageup', { type: 'increment-large' }),
        Sub.key('pagedown', { type: 'decrement-large' }),
        Sub.key('home', { type: 'set-min' }),
        Sub.key('end', { type: 'set-max' }),
      );
    },
  };
}
