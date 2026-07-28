/**
 * ColorPicker - HSL color selection with keyboard and mouse support.
 *
 * The picker exposes layout, hit testing, slider math, and help metadata so
 * host components can build reliable mouse-first experiences without redoing
 * geometry or descriptions.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { color, ensureReadableColor, hexToRgb as coronaHexToRgb, rgbToHex as coronaRgbToHex, style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, text } from '@celestial/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger, clampRange, finiteNumber } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

export interface ColorPickerTokens {
  text: Color;
  textSoft: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  muted: Color;
  labelStyle: TypographyToken;
}

export const colorPickerContract: TokenContract<ColorPickerTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  border: (t: SemanticTheme) => t.colors.focusRing,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  muted: (t: SemanticTheme) => t.colors.muted,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface ColorPickerConfig {
  value?: string;
  swatches?: string[];
  swatchLabels?: string[];
  onChange?: (hex: string) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type ColorPickerField = 'hue' | 'saturation' | 'lightness' | 'hex' | 'swatches';
export type ColorPickerSliderField = Extract<ColorPickerField, 'hue' | 'saturation' | 'lightness'>;
export type ColorPickerHoverTarget = ColorPickerField | 'preview' | { kind: 'swatch'; index: number };

export interface ColorPickerHelpInfo {
  title: string;
  summary: string;
  effect: string;
}

export interface ColorPickerModel {
  hsl: HSL;
  hexInput: string;
  activeField: ColorPickerField;
  swatchIndex: number;
  focused: boolean;
  hoveredTarget: ColorPickerHoverTarget | null;
  dragField: ColorPickerSliderField | null;
}

export type ColorPickerMsg =
  | Msg<'increment'>
  | Msg<'decrement'>
  | Msg<'increment-large'>
  | Msg<'decrement-large'>
  | Msg<'next-field'>
  | Msg<'prev-field'>
  | Msg<'select-swatch'>
  | Msg<'apply-hex'>
  | Msg<'hex-char', { char: string }>
  | Msg<'hex-backspace'>
  | Msg<'set-field', { field: ColorPickerField }>
  | Msg<'set-slider', { field: ColorPickerSliderField; value: number }>
  | Msg<'set-swatch-index', { index: number }>
  | Msg<'hover', { target: ColorPickerHoverTarget | null }>
  | Msg<'drag-start', { field: ColorPickerSliderField }>
  | Msg<'pointer-slider', { field: ColorPickerSliderField; value: number; dragging: boolean }>
  | Msg<'select-swatch-at', { index: number }>
  | Msg<'pointer-field', { field: ColorPickerField }>
  | Msg<'drag-end'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

export interface ColorPickerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColorPickerLayout {
  root: ColorPickerBounds;
  title: ColorPickerBounds;
  sliders: Record<ColorPickerSliderField, ColorPickerBounds>;
  hexField: ColorPickerBounds;
  preview: ColorPickerBounds;
  swatches: ColorPickerBounds[];
  help: ColorPickerBounds;
  barWidth: number;
}

export type ColorPickerHit =
  | { kind: 'slider'; field: ColorPickerSliderField; value: number }
  | { kind: 'hex-field' }
  | { kind: 'swatch'; index: number }
  | { kind: 'preview' }
  | { kind: 'body' };

const DEFAULT_SWATCHES = ['#FF0000', '#FF8800', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#8800FF', '#FF00FF', '#FFFFFF', '#808080', '#000000', '#FF6347'];
const FIELDS: ColorPickerField[] = ['hue', 'saturation', 'lightness', 'hex', 'swatches'];
const COLOR_PICKER_BAR_WIDTH = 20;
const COLOR_PICKER_WIDTH = 42;

const COLOR_PICKER_HELP: Record<ColorPickerField | 'preview', ColorPickerHelpInfo> = {
  hue: {
    title: 'Hue',
    summary: 'Shifts the color family around the wheel.',
    effect: 'Expect the edited token to move between reds, blues, greens, and other broad color families.',
  },
  saturation: {
    title: 'Saturation',
    summary: 'Controls how vivid or neutral the color feels.',
    effect: 'Higher saturation makes accents pop harder; lower saturation makes the UI calmer and grayer.',
  },
  lightness: {
    title: 'Lightness',
    summary: 'Controls brightness and contrast.',
    effect: 'This most strongly affects readability and how much the token stands out against surrounding surfaces.',
  },
  hex: {
    title: 'Hex',
    summary: 'Type or paste an exact color value.',
    effect: 'Use this when you already know the precise brand or reference color you want to match.',
  },
  swatches: {
    title: 'Swatches',
    summary: 'Quickly try the base color, nearby harmony options, and a complement.',
    effect: 'Base restores the starting token, numbered swatches try nearby hues, and Comp gives you an opposite accent direction.',
  },
  preview: {
    title: 'Preview',
    summary: 'Shows the current color as a sample chip.',
    effect: 'Use this to confirm the resulting hex and RGB values before saving or moving to another token.',
  },
};

const DEFAULT_SWATCH_LABELS = ['Base', '1', '2', '3', 'Comp'];

function clamp(value: number, min: number, max: number, fallback = min): number {
  return clampRange(value, min, max, fallback);
}

function isPointInBounds(bounds: ColorPickerBounds, x: number, y: number): boolean {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}

function getLabelPrefix(field: ColorPickerSliderField): string {
  if (field === 'hue') return 'H ';
  if (field === 'saturation') return 'S ';
  return 'L ';
}

function getSliderMax(field: ColorPickerSliderField): number {
  return field === 'hue' ? 360 : 100;
}

function getSliderValue(model: ColorPickerModel, field: ColorPickerSliderField): number {
  if (field === 'hue') return model.hsl.h;
  if (field === 'saturation') return model.hsl.s;
  return model.hsl.l;
}

function getSwatchRowLabel(width: number): string {
  if (width < 28) return 'Sw ';
  if (width < 34) return 'Swatch ';
  return 'Swatches ';
}

function getHexFromHsl(hsl: HSL): string {
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function isSwatchHoverTarget(target: ColorPickerHoverTarget | null | undefined): target is Extract<ColorPickerHoverTarget, { kind: 'swatch' }> {
  return typeof target === 'object' && target !== null && target.kind === 'swatch';
}

export function getColorPickerHelp(target: ColorPickerHoverTarget | null | undefined): ColorPickerHelpInfo {
  return getColorPickerHelpWithLabels(target);
}

export function getColorPickerHelpWithLabels(
  target: ColorPickerHoverTarget | null | undefined,
  swatchLabels: readonly string[] = DEFAULT_SWATCH_LABELS,
): ColorPickerHelpInfo {
  if (isSwatchHoverTarget(target)) {
    const index = Number.isFinite(target.index) ? Math.max(0, Math.trunc(target.index)) : 0;
    const label = swatchLabels[index] ?? `Option ${index + 1}`;
    const normalized = label.toLowerCase();
    if (normalized === 'base' || normalized.startsWith('base')) {
      return {
        title: 'Swatch: Base',
        summary: 'The original value from the base theme for this token.',
        effect: 'Use this to snap back to the starting color and compare your edits against the current theme baseline.',
      };
    }
    if (normalized === 'comp' || normalized.startsWith('comp')) {
      return {
        title: 'Swatch: Complement',
        summary: 'A complementary color on the opposite side of the hue wheel.',
        effect: 'This is useful when you want stronger contrast or a more dramatic alternate accent direction.',
      };
    }
    return {
      title: `Swatch: ${label}`,
      summary: 'A nearby harmony color generated from the current selection.',
      effect: 'Use these quick options to explore related accent directions without manually dragging the sliders.',
    };
  }
  return typeof target === 'string' && target in COLOR_PICKER_HELP ? COLOR_PICKER_HELP[target]! : COLOR_PICKER_HELP.hue;
}

export function getColorPickerSliderValue(layout: ColorPickerLayout, field: ColorPickerSliderField, x: number): number {
  const bounds = layout.sliders[field];
  const max = getSliderMax(field);
  const ratio = clamp((finiteNumber(x, bounds.x) - bounds.x) / Math.max(1, bounds.width - 1), 0, 1);
  return Math.round(ratio * max);
}

export function getColorPickerLayout(
  _model: ColorPickerModel,
  config: Pick<ColorPickerConfig, 'swatches' | 'swatchLabels'> = {},
  origin: { x?: number; y?: number; width?: number } = {},
): ColorPickerLayout {
  const x = boundedInteger(origin.x, 0, -100_000, 100_000);
  const y = boundedInteger(origin.y, 0, -100_000, 100_000);
  const requestedWidth = boundedInteger(origin.width, COLOR_PICKER_WIDTH, 24, COLOR_PICKER_WIDTH);
  const width = Math.max(24, Math.min(COLOR_PICKER_WIDTH, requestedWidth));
  const swatches = (config.swatches ?? DEFAULT_SWATCHES).slice(0, 10_000);
  const swatchRowLabel = getSwatchRowLabel(width);
  const sliderX = x + 3;
  const sliderWidth = Math.min(COLOR_PICKER_BAR_WIDTH, Math.max(8, width - 16));
  const swatchStartX = x + 2 + swatchRowLabel.length;
  const swatchY = y + 6;
  const swatchBounds: ColorPickerBounds[] = [];

  for (let index = 0; index < swatches.length; index += 1) {
    swatchBounds.push({
      x: swatchStartX + index * 3,
      y: swatchY,
      width: 3,
      height: 1,
    });
  }

  return {
    root: {
      x,
      y,
      width,
      height: 9,
    },
    title: { x, y, width, height: 1 },
    sliders: {
      hue: { x: sliderX, y: y + 1, width: sliderWidth, height: 1 },
      saturation: { x: sliderX, y: y + 2, width: sliderWidth, height: 1 },
      lightness: { x: sliderX, y: y + 3, width: sliderWidth, height: 1 },
    },
    hexField: { x: x + 6, y: y + 4, width: 7, height: 1 },
    preview: { x: x + 2, y: y + 5, width: Math.max(12, width - 4), height: 1 },
    swatches: swatchBounds,
    help: { x, y: y + 7, width, height: 2 },
    barWidth: sliderWidth,
  };
}

export function getColorPickerHit(layout: ColorPickerLayout, x: number, y: number): ColorPickerHit | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const field of ['hue', 'saturation', 'lightness'] as const) {
    const bounds = layout.sliders[field];
    if (isPointInBounds(bounds, x, y)) {
      return { kind: 'slider', field, value: getColorPickerSliderValue(layout, field, x) };
    }
  }

  if (isPointInBounds(layout.hexField, x, y)) {
    return { kind: 'hex-field' };
  }

  for (let index = 0; index < layout.swatches.length; index += 1) {
    if (isPointInBounds(layout.swatches[index]!, x, y)) {
      return { kind: 'swatch', index };
    }
  }

  if (isPointInBounds(layout.preview, x, y)) {
    return { kind: 'preview' };
  }

  if (isPointInBounds(layout.root, x, y)) {
    return { kind: 'body' };
  }

  return null;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((finiteNumber(h, 0) % 360) + 360) % 360;
  const sn = clamp(s, 0, 100, 0) / 100;
  const ln = clamp(l, 0, 100, 0) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = clamp(r, 0, 255, 0) / 255;
  const gn = clamp(g, 0, 255, 0) / 255;
  const bn = clamp(b, 0, 255, 0) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return coronaRgbToHex(clamp(r, 0, 255, 0), clamp(g, 0, 255, 0), clamp(b, 0, 255, 0)).toUpperCase();
}

export function hexToRgb(hex: string): RGB | null {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const full = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const [r, g, b] = coronaHexToRgb(hex);
  return { r, g, b };
}

function getActiveHelpTarget(model: ColorPickerModel): ColorPickerHoverTarget {
  return model.hoveredTarget ?? model.activeField;
}

export function colorPicker(config: ColorPickerConfig): ComponentDescriptor<ColorPickerModel, ColorPickerMsg> {
  const swatches = (config.swatches ?? DEFAULT_SWATCHES).slice(0, 10_000);
  const swatchLabels = (config.swatchLabels ?? DEFAULT_SWATCH_LABELS.slice(0, swatches.length)).slice(0, swatches.length);
  const interactionId = generateFocusGroupId('color-picker');
  const sliderSetTag = `${interactionId}:slider-set`;
  const sliderDragTag = `${interactionId}:slider-drag`;
  const swatchSelectTag = `${interactionId}:swatch-select`;
  const fieldSelectTag = `${interactionId}:field-select`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  const normalizeHsl = (hsl: HSL): HSL => ({
    h: clamp(Math.round(hsl.h), 0, 360, 0),
    s: clamp(Math.round(hsl.s), 0, 100, 0),
    l: clamp(Math.round(hsl.l), 0, 100, 0),
  });

  const isField = (field: unknown): field is ColorPickerField => typeof field === 'string' && FIELDS.includes(field as ColorPickerField);
  const isSliderField = (field: unknown): field is ColorPickerSliderField => field === 'hue' || field === 'saturation' || field === 'lightness';

  const normalizeSwatchIndex = (index: number): number => boundedInteger(index, 0, 0, Math.max(0, swatches.length - 1));

  return {
    init(): [ColorPickerModel, Cmd<ColorPickerMsg>] {
      let hsl: HSL = { h: 0, s: 100, l: 50 };
      if (config.value) {
        const rgb = hexToRgb(config.value);
        if (rgb) {
          hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        }
      }

      return [
        {
          hsl,
          hexInput: getHexFromHsl(hsl),
          activeField: 'hue',
          swatchIndex: 0,
          focused: false,
          hoveredTarget: null,
          dragField: null,
        },
        Cmd.none(),
      ];
    },

    update(msg: ColorPickerMsg, model: ColorPickerModel): [ColorPickerModel, Cmd<ColorPickerMsg>] {
      const hsl = normalizeHsl(model.hsl);
      model = { ...model, hsl, hexInput: typeof model.hexInput === 'string' ? model.hexInput.slice(0, 7) : getHexFromHsl(hsl) };
      switch (msg.type) {
        case 'set-field':
          return isField(msg.field) ? [{ ...model, activeField: msg.field }, Cmd.none()] : [model, Cmd.none()];
        case 'set-swatch-index': {
          const nextIndex = normalizeSwatchIndex(msg.index);
          return [{ ...model, activeField: 'swatches', swatchIndex: nextIndex }, Cmd.none()];
        }
        case 'set-slider': {
          if (!isSliderField(msg.field)) return [model, Cmd.none()];
          const nextHsl = { ...model.hsl };
          if (msg.field === 'hue') {
            nextHsl.h = clamp(Math.round(msg.value), 0, 360);
          } else if (msg.field === 'saturation') {
            nextHsl.s = clamp(Math.round(msg.value), 0, 100);
          } else {
            nextHsl.l = clamp(Math.round(msg.value), 0, 100);
          }
          const hex = getHexFromHsl(nextHsl);
          config.onChange?.(hex);
          return [
            {
              ...model,
              activeField: msg.field,
              hoveredTarget: msg.field,
              hsl: nextHsl,
              hexInput: hex,
            },
            Cmd.none(),
          ];
        }
        case 'hover':
          return [{ ...model, hoveredTarget: msg.target }, Cmd.none()];
        case 'drag-start':
          return isSliderField(msg.field)
            ? [{ ...model, dragField: msg.field, hoveredTarget: msg.field, activeField: msg.field, focused: true }, Cmd.none()]
            : [model, Cmd.none()];
        case 'pointer-slider': {
          if (!isSliderField(msg.field)) return [model, Cmd.none()];
          const [updated, cmd] = this.update({ type: 'set-slider', field: msg.field, value: msg.value }, model);
          return [{ ...updated, focused: true, dragField: msg.dragging ? msg.field : updated.dragField }, cmd];
        }
        case 'select-swatch-at': {
          const index = normalizeSwatchIndex(msg.index);
          const [selectedModel, command] = this.update({ type: 'set-swatch-index', index }, model);
          const [updated] = this.update({ type: 'select-swatch' }, selectedModel);
          return [{ ...updated, focused: true }, command];
        }
        case 'pointer-field':
          return isField(msg.field) ? [{ ...model, activeField: msg.field, focused: true }, Cmd.none()] : [model, Cmd.none()];
        case 'drag-end':
          return [{ ...model, dragField: null }, Cmd.none()];
        case 'increment':
        case 'decrement':
        case 'increment-large':
        case 'decrement-large': {
          const isLarge = msg.type === 'increment-large' || msg.type === 'decrement-large';
          const isIncrement = msg.type === 'increment' || msg.type === 'increment-large';
          const delta = isIncrement ? (isLarge ? 10 : 1) : isLarge ? -10 : -1;

          if (model.activeField === 'swatches') {
            return [{ ...model, swatchIndex: clamp(model.swatchIndex + delta, 0, Math.max(0, swatches.length - 1)) }, Cmd.none()];
          }

          if (model.activeField === 'hex') {
            return [model, Cmd.none()];
          }

          const nextHsl = { ...model.hsl };
          if (model.activeField === 'hue') {
            nextHsl.h = (((nextHsl.h + delta) % 360) + 360) % 360;
          } else if (model.activeField === 'saturation') {
            nextHsl.s = clamp(nextHsl.s + delta, 0, 100);
          } else {
            nextHsl.l = clamp(nextHsl.l + delta, 0, 100);
          }

          const hex = getHexFromHsl(nextHsl);
          config.onChange?.(hex);
          return [{ ...model, hsl: nextHsl, hexInput: hex }, Cmd.none()];
        }
        case 'next-field': {
          const nextIndex = (FIELDS.indexOf(model.activeField) + 1) % FIELDS.length;
          return [{ ...model, activeField: FIELDS[nextIndex]! }, Cmd.none()];
        }
        case 'prev-field': {
          const prevIndex = (FIELDS.indexOf(model.activeField) - 1 + FIELDS.length) % FIELDS.length;
          return [{ ...model, activeField: FIELDS[prevIndex]! }, Cmd.none()];
        }
        case 'select-swatch': {
          const value = swatches[model.swatchIndex];
          if (!value) return [model, Cmd.none()];
          const rgb = hexToRgb(value);
          if (!rgb) return [model, Cmd.none()];
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          const hex = getHexFromHsl(hsl);
          config.onChange?.(hex);
          return [{ ...model, hsl, hexInput: hex }, Cmd.none()];
        }
        case 'apply-hex': {
          const rgb = hexToRgb(model.hexInput);
          if (!rgb) return [model, Cmd.none()];
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          const hex = getHexFromHsl(hsl);
          config.onChange?.(hex);
          return [{ ...model, hsl, hexInput: hex }, Cmd.none()];
        }
        case 'hex-char': {
          if (model.activeField !== 'hex') return [model, Cmd.none()];
          if (model.hexInput.length >= 7) return [model, Cmd.none()];
          if (!/^[0-9a-fA-F#]$/.test(msg.char)) return [model, Cmd.none()];
          if (msg.char === '#' && model.hexInput.length > 0) return [model, Cmd.none()];
          return [{ ...model, hexInput: model.hexInput + msg.char }, Cmd.none()];
        }
        case 'hex-backspace': {
          if (model.activeField !== 'hex') return [model, Cmd.none()];
          return [{ ...model, hexInput: model.hexInput.slice(0, -1) }, Cmd.none()];
        }
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false, hoveredTarget: null, dragField: null }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model: ColorPickerModel): VNode {
      const tokens = useTokens(colorPickerContract, config, 'ColorPicker');
      const hsl = normalizeHsl(model.hsl);
      model = { ...model, hsl, hexInput: typeof model.hexInput === 'string' ? model.hexInput.slice(0, 7) : getHexFromHsl(hsl) };
      const layout = getColorPickerLayout(model, { swatches, swatchLabels });
      const hex = getHexFromHsl(model.hsl);
      const rgb = hslToRgb(model.hsl.h, model.hsl.s, model.hsl.l);
      const previewColor = style({ color: color.rgb(rgb.r, rgb.g, rgb.b), bold: true });
      const titleStyle = style({ color: tokens.text, bold: true });
      const mutedStyle = style({ color: tokens.muted, dim: true });
      const help = getColorPickerHelpWithLabels(getActiveHelpTarget(model), swatchLabels);
      const swatchRowLabel = getSwatchRowLabel(layout.root.width);
      const swatchLegend = layout.root.width >= 38 ? ' B=base  1-3=related  C=complement' : layout.root.width >= 31 ? ' B=base  C=comp' : '';

      const sliderLine = (field: ColorPickerSliderField, suffix: string) => {
        const value = getSliderValue(model, field);
        const active = model.activeField === field;
        const hovered = model.hoveredTarget === field;
        const accent = active ? tokens.borderActive : hovered ? tokens.borderHover : tokens.textSoft;
        const max = getSliderMax(field);
        const thumb = clamp(Math.round((clamp(value, 0, max) / Math.max(1, max)) * (layout.barWidth - 1)), 0, Math.max(0, layout.barWidth - 1));
        const cells = Array.from({ length: layout.barWidth }, (_, index) =>
          event(
            `${interactionId}:slider:${field}:${index}`,
            text(index === thumb ? '|' : index < thumb ? '=' : '-', style({ color: accent, bold: active })),
            { onMouseDown: sliderSetTag, onMouseMove: sliderDragTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            {
              label: `${field} ${Math.round((index / Math.max(1, layout.barWidth - 1)) * max)}`,
              intent: 'edit',
              affordances: ['hover', 'click', 'drag'],
              cursor: 'ew-resize',
            },
          ),
        );
        return row(
          text(active ? '>' : hovered ? '+' : ' '),
          text(getLabelPrefix(field), style({ color: accent, bold: active })),
          row(...cells),
          text(` ${suffix}`, style({ color: accent, bold: active })),
        );
      };

      const swatchNodes = swatches.map((swatch, index) => {
        const swatchRgb = hexToRgb(swatch);
        const swatchColor = swatchRgb ? color.rgb(swatchRgb.r, swatchRgb.g, swatchRgb.b) : tokens.textSoft;
        const swatchText = ensureReadableColor(tokens.text, swatchColor);
        const active = model.activeField === 'swatches' && model.swatchIndex === index;
        const hovered = isSwatchHoverTarget(model.hoveredTarget) && model.hoveredTarget.index === index;
        const label = (swatchLabels[index] ?? `${index + 1}`).slice(0, 1).toUpperCase();
        return event(
          `${interactionId}:swatch:${index}`,
          text(
            active ? `[${label}]` : hovered ? `(${label})` : ` ${label} `,
            style({ color: swatchText, background: swatchColor, bold: active }),
          ),
          { onClick: swatchSelectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: swatchLabels[index] ?? `Swatch ${index + 1}`, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer' },
        );
      });

      return column(
        text('Color Picker', titleStyle),
        sliderLine('hue', `${model.hsl.h}deg`),
        sliderLine('saturation', `${model.hsl.s}%`),
        sliderLine('lightness', `${model.hsl.l}%`),
        row(
          text(model.activeField === 'hex' ? '> ' : model.hoveredTarget === 'hex' ? '+ ' : '  '),
          text(
            'Hex ',
            style({
              color: model.activeField === 'hex' ? tokens.borderActive : model.hoveredTarget === 'hex' ? tokens.borderHover : tokens.text,
              bold: model.activeField === 'hex',
            }),
          ),
          event(
            `${interactionId}:field:hex`,
            text(model.hexInput.padEnd(7, ' '), style({ color: model.activeField === 'hex' ? tokens.borderActive : tokens.text })),
            { onClick: fieldSelectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: 'Hex color', intent: 'edit', affordances: ['hover', 'click'], cursor: 'text' },
          ),
          text(' click to focus', mutedStyle),
        ),
        row(
          text(model.hoveredTarget === 'preview' ? '+ ' : '  '),
          event(
            `${interactionId}:field:preview`,
            text('[##]', previewColor),
            { onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: `Preview ${hex}`, intent: 'inspect', affordances: ['hover'] },
          ),
          text(` ${hex}`, style({ color: tokens.text })),
          text(` rgb(${rgb.r},${rgb.g},${rgb.b})`, style({ color: tokens.textSoft })),
        ),
        row(
          text(model.activeField === 'swatches' || isSwatchHoverTarget(model.hoveredTarget) ? (model.activeField === 'swatches' ? '> ' : '+ ') : '  '),
          text(swatchRowLabel),
          ...swatchNodes,
          ...(swatchLegend.length > 0 ? [text(swatchLegend, mutedStyle)] : []),
        ),
        text(help.summary, mutedStyle),
        text(help.effect, mutedStyle),
      );
    },

    subscriptions(model: ColorPickerModel): Sub<ColorPickerMsg> {
      const pointer = Sub.elementMouse<ColorPickerMsg>((mouseEvent) => {
        if (mouseEvent.elementId.startsWith(`${interactionId}:slider:`)) {
          const payload = mouseEvent.elementId.slice(`${interactionId}:slider:`.length);
          const separator = payload.lastIndexOf(':');
          const field = payload.slice(0, separator);
          const indexText = payload.slice(separator + 1);
          if (!isSliderField(field)) return { type: 'noop' };
          const index = boundedInteger(Number(indexText), 0, 0, COLOR_PICKER_BAR_WIDTH - 1);
          const value = Math.round((index / Math.max(1, COLOR_PICKER_BAR_WIDTH - 1)) * getSliderMax(field));
          if (mouseEvent.handlerTag === sliderSetTag) return { type: 'pointer-slider', field, value, dragging: true };
          if (mouseEvent.handlerTag === sliderDragTag && model.dragField === field) return { type: 'pointer-slider', field, value, dragging: true };
          if (mouseEvent.handlerTag === hoverTag) return { type: 'hover', target: field };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'hover', target: null };
        }
        if (mouseEvent.elementId.startsWith(`${interactionId}:swatch:`)) {
          const index = Number(mouseEvent.elementId.slice(`${interactionId}:swatch:`.length));
          if (mouseEvent.handlerTag === swatchSelectTag) return { type: 'select-swatch-at', index };
          if (mouseEvent.handlerTag === hoverTag) return { type: 'hover', target: { kind: 'swatch', index } };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'hover', target: null };
        }
        if (mouseEvent.elementId.startsWith(`${interactionId}:field:`)) {
          const field = mouseEvent.elementId.slice(`${interactionId}:field:`.length);
          if (field === 'hex' && mouseEvent.handlerTag === fieldSelectTag) return { type: 'pointer-field', field };
          if ((field === 'hex' || field === 'preview') && mouseEvent.handlerTag === hoverTag) return { type: 'hover', target: field };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'hover', target: null };
        }
        return { type: 'noop' };
      });
      const release = model.dragField
        ? Sub.mouse<ColorPickerMsg>((mouseEvent) => (mouseEvent.type === 'release' ? { type: 'drag-end' } : { type: 'noop' }))
        : Sub.none<ColorPickerMsg>();
      if (!model.focused) return Sub.batch(pointer, release);

      const baseSubs: Array<Sub<ColorPickerMsg>> = [
        pointer,
        release,
        Sub.key('tab', { type: 'next-field' }),
        Sub.keyWithModifiers('tab', { shift: true }, { type: 'prev-field' }),
      ];

      if (model.activeField === 'hex') {
        const hexSubs: Array<Sub<ColorPickerMsg>> = [];
        for (const char of '0123456789abcdefABCDEF#') {
          hexSubs.push(Sub.key(char, { type: 'hex-char', char }));
        }
        return Sub.batch(...baseSubs, ...hexSubs, Sub.key('backspace', { type: 'hex-backspace' }), Sub.key('enter', { type: 'apply-hex' }));
      }

      if (model.activeField === 'swatches') {
        return Sub.batch(
          ...baseSubs,
          Sub.key('left', { type: 'decrement' }),
          Sub.key('right', { type: 'increment' }),
          Sub.key('enter', { type: 'select-swatch' }),
        );
      }

      return Sub.batch(
        ...baseSubs,
        Sub.key('left', { type: 'decrement' }),
        Sub.key('right', { type: 'increment' }),
        Sub.key('up', { type: 'increment' }),
        Sub.key('down', { type: 'decrement' }),
        Sub.key('pageup', { type: 'increment-large' }),
        Sub.key('pagedown', { type: 'decrement-large' }),
      );
    },
  };
}
