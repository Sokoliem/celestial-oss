import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, resolveGlyph, style, tooltipVariantGlyphs, visualWidth, wrap } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, row, Sub, text } from '@celestial/core/nebula';
import { caretFor } from './anchored-overlay.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveAnimatedBorderColor, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TooltipTokens {
  text: Color;
  bg: Color;
  border: Color;
  captionStyle: TypographyToken;
}

export const tooltipContract: TokenContract<TooltipTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  bg: (t: SemanticTheme) => t.elevation.floating.surface ?? t.colors.surfaceRaised,
  border: (t: SemanticTheme) => t.elevation.floating.border ?? t.colors.borderHover,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
export type TooltipVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface TooltipConfig {
  content: string;
  children?: VNode;
  position?: TooltipPosition;
  variant?: TooltipVariant;
  delay?: number;
  maxWidth?: number;
  /**
   * Draw a directional caret next to the bubble. Defaults to false because a
   * caret is meaningful only when the caller also anchors the surface. Use
   * `anchoredOverlay()` for geometry-aware placement.
   */
  caret?: boolean;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface TooltipBubbleOptions {
  content: string;
  variant?: TooltipVariant;
  maxWidth?: number;
  theme?: ThemeInput;
  tick?: number;
}

export interface TooltipBubbleMeasurement {
  width: number;
  height: number;
  lines: string[];
}

export interface TooltipModel {
  visible: boolean;
  triggered: boolean;
  borderTick?: number;
}

export type TooltipMsg = Msg<'show' | 'hide' | 'toggle' | 'tick' | 'panic'>;
type Msg<T extends string> = { type: T };

/**
 * Per-variant tooltip prefix glyph. Wide-level resolution is used to match
 * existing rendering on capable terminals; consumers may pass a different
 * GlyphLevel through `resolveGlyph(tooltipVariantGlyphs[variant], level)`.
 * Phase 3.2 / B2 — distinct semantic glyph per variant (previously all '┌').
 */
const VARIANT_PREFIX: Record<TooltipVariant, string> = {
  default: resolveGlyph(tooltipVariantGlyphs.default, 'wide'),
  success: resolveGlyph(tooltipVariantGlyphs.success, 'wide'),
  warning: resolveGlyph(tooltipVariantGlyphs.warning, 'wide'),
  danger: resolveGlyph(tooltipVariantGlyphs.danger, 'wide'),
  info: resolveGlyph(tooltipVariantGlyphs.info, 'wide'),
};

const VARIANT_TONE: Record<TooltipVariant, ConstellationTone> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

function wrapTooltipContent(content: string, maxWidth: number): string[] {
  const normalized = content.trim();
  return normalized.length === 0 ? [''] : wrap(normalized, maxWidth).split('\n');
}

export function measureTooltipBubble(options: TooltipBubbleOptions): TooltipBubbleMeasurement {
  const maxWidth = Math.max(12, options.maxWidth ?? 40);
  const contentWidth = Math.max(8, maxWidth - 6);
  const lines = wrapTooltipContent(options.content, contentWidth);
  const longestLine = lines.reduce((max, line) => Math.max(max, visualWidth(line)), 0);
  const width = Math.max(12, Math.min(maxWidth, longestLine + 6));
  // One cell of padding and one border cell on both vertical edges.
  const height = lines.length + 4;

  return {
    width,
    height,
    lines,
  };
}

export function tooltip(config: TooltipConfig): ComponentDescriptor<TooltipModel, TooltipMsg> {
  const position = config.position ?? 'top';
  const variant = config.variant ?? 'default';
  const maxWidth = config.maxWidth ?? 40;
  const surfaceId = `tooltip-${position}-${variant}`;

  return {
    init(): [TooltipModel, Cmd<TooltipMsg>] {
      return [{ visible: false, triggered: false, borderTick: 0 }, Cmd.none()];
    },

    update(msg: TooltipMsg, model: TooltipModel): [TooltipModel, Cmd<TooltipMsg>] {
      switch (msg.type) {
        case 'show':
          return [{ ...model, visible: true }, Cmd.none()];
        case 'hide':
          return [{ ...model, visible: false }, Cmd.none()];
        case 'toggle':
          return [{ ...model, visible: !model.visible }, Cmd.none()];
        case 'tick':
          return model.visible ? [{ ...model, borderTick: (model.borderTick ?? 0) + 1 }, Cmd.none()] : [model, Cmd.none()];
        case 'panic':
          if (!model.visible) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          return [{ ...model, visible: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: TooltipModel): VNode {
      const tokens = useTokens(tooltipContract, config, 'Tooltip');
      const theme = resolveTheme(config);
      const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
      const arrow = config.caret ? caretFor(position) : '';
      const prefix = VARIANT_PREFIX[variant];
      const borderColor = resolveAnimatedBorderColor(theme, tokens.border, variantColor, model.borderTick ?? 0, 0.2);
      const measurement = measureTooltipBubble({ content: config.content, maxWidth });

      const contentStyle = applyTypography(tokens.captionStyle, { color: tokens.text, background: tokens.bg });
      const accentStyle = style({ color: variantColor, background: tokens.bg, bold: true });
      const borderStyle = style({ color: borderColor });
      const bubbleStyle = style({
        border: border.rounded,
        color: borderColor,
        background: tokens.bg,
        padding: 1,
        width: measurement.width,
      });

      const tooltipBox = box(
        column(
          row(text(`${prefix} `, accentStyle), text(measurement.lines[0] ?? '', contentStyle)),
          ...measurement.lines.slice(1).map((line) => text(`  ${line}`, contentStyle)),
        ),
        bubbleStyle,
        { width: measurement.width },
      );

      const positionedTooltip = !config.caret
        ? tooltipBox
        : position === 'top'
          ? column(tooltipBox, text(arrow, borderStyle))
          : position === 'bottom'
            ? column(text(arrow, borderStyle), tooltipBox)
            : position === 'left'
              ? row(tooltipBox, text(arrow, borderStyle))
              : row(text(arrow, borderStyle), tooltipBox);

      return model.visible ? positionedTooltip : (config.children ?? text('○'));
    },

    subscriptions(model: TooltipModel): Sub<TooltipMsg> {
      if (!model.visible) return Sub.none();
      const theme = resolveTheme(config);
      const subs: Sub<TooltipMsg>[] = [
        // A2 — tooltip honors Escape AND the surface-panic contract while visible.
        Sub.key<TooltipMsg>('escape', { type: 'hide' }),
        surfaceContractSubs<TooltipMsg>({ id: surfaceId, onPanic: { type: 'panic' } }),
      ];
      if (!theme.motion.reduceMotion) {
        subs.push(Sub.timer(140, () => ({ type: 'tick' })));
      }
      return subs.length === 1 ? subs[0]! : Sub.batch<TooltipMsg>(...subs);
    },
  };
}

export function renderTooltipBubble(options: TooltipBubbleOptions): VNode {
  const variant = options.variant ?? 'default';
  const theme = resolveTheme({ theme: options.theme });
  const tokens = useTokens(tooltipContract, { theme: options.theme }, 'Tooltip');
  const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
  const borderColor = resolveAnimatedBorderColor(theme, tokens.border, variantColor, options.tick ?? 0, 0.2);
  const measurement = measureTooltipBubble(options);

  return box(
    column(
      row(
        text(`${VARIANT_PREFIX[variant]} `, style({ color: variantColor, background: tokens.bg, bold: true })),
        text(measurement.lines[0] ?? '', applyTypography(tokens.captionStyle, { color: tokens.text, background: tokens.bg })),
      ),
      ...measurement.lines.slice(1).map((line) => text(`  ${line}`, applyTypography(tokens.captionStyle, { color: tokens.text, background: tokens.bg }))),
    ),
    style({
      border: border.rounded,
      color: borderColor,
      background: tokens.bg,
      padding: 1,
      width: measurement.width,
    }),
    { width: measurement.width },
  );
}

export interface TooltipGroupConfig {
  items: Array<{
    trigger: string;
    content: string;
    variant?: TooltipVariant;
  }>;
  position?: TooltipPosition;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export function tooltipGroup(config: TooltipGroupConfig): VNode {
  const nodes = config.items.map((item) => text(item.trigger));
  return row(...nodes);
}
