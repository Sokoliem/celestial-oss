import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { resolveElevationBorder, resolveGlyph, style, tooltipVariantGlyphs } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth, wrapCellText } from '@celestial/rosetta';
import { caretFor } from './anchored-overlay.js';
import { generateFocusGroupId } from './focus-group.js';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveAnimatedBorderColor, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TooltipTokens {
  text: Color;
  bg: Color;
  border: Color;
  hoverText: Color;
  hoverBackground: Color;
  captionStyle: TypographyToken;
}

export const tooltipContract: TokenContract<TooltipTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  bg: (t: SemanticTheme) => t.elevation.floating.surface ?? t.colors.surfaceRaised,
  border: (t: SemanticTheme) => t.elevation.floating.border ?? t.colors.borderHover,
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceRaised,
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
  viewportCols?: number;
}

export type TooltipMsg = Msg<'show' | 'hide' | 'toggle' | 'tick' | 'panic' | 'hover-enter' | 'hover-leave' | 'delay-elapsed' | 'noop'> | MsgWithCols;
type Msg<T extends string> = { type: T };
type MsgWithCols = { type: 'resize'; cols: number };

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
  return normalized.length === 0 ? [''] : wrapCellText(normalized, maxWidth);
}

export function measureTooltipBubble(options: TooltipBubbleOptions): TooltipBubbleMeasurement {
  const maxWidth = positiveInteger(options.maxWidth, 40);
  const contentWidth = Math.max(1, maxWidth - 6);
  const lines = wrapTooltipContent(String(options.content), contentWidth);
  const longestLine = lines.reduce((max, line) => Math.max(max, measureTextWidth(line)), 0);
  const width = Math.max(1, Math.min(maxWidth, longestLine + 6));
  // One cell of padding and one border cell on both vertical edges.
  const height = lines.length + 4;

  return {
    width,
    height,
    lines,
  };
}

export function tooltip(config: TooltipConfig): ComponentDescriptor<TooltipModel, TooltipMsg> {
  const position = config.position === 'bottom' || config.position === 'left' || config.position === 'right' ? config.position : 'top';
  const variant = config.variant && config.variant in VARIANT_PREFIX ? config.variant : 'default';
  const maxWidth = positiveInteger(config.maxWidth, 40);
  const content = String(config.content);
  const triggerNode = config.children ?? text('○');
  const caret = Boolean(config.caret);
  const delay = nonNegativeInteger(config.delay, 300, 2_147_483_647);
  const surfaceId = generateFocusGroupId(`tooltip-${position}-${variant}`);
  const triggerId = `${surfaceId}:trigger`;
  const enterTag = `${surfaceId}:enter`;
  const leaveTag = `${surfaceId}:leave`;

  return {
    init(): [TooltipModel, Cmd<TooltipMsg>] {
      return [{ visible: false, triggered: false, borderTick: 0 }, Cmd.none()];
    },

    update(msg: TooltipMsg, model: TooltipModel): [TooltipModel, Cmd<TooltipMsg>] {
      switch (msg.type) {
        case 'show':
          return [{ ...model, visible: true }, Cmd.none()];
        case 'hide':
          return [{ ...model, visible: false, triggered: false }, Cmd.none()];
        case 'toggle':
          return [{ ...model, visible: !model.visible, triggered: !model.visible }, Cmd.none()];
        case 'hover-enter':
          return [{ ...model, triggered: true, visible: delay === 0 ? true : model.visible }, Cmd.none()];
        case 'hover-leave':
          return [{ ...model, triggered: false, visible: false }, Cmd.none()];
        case 'delay-elapsed':
          return model.triggered ? [{ ...model, visible: true }, Cmd.none()] : [model, Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: positiveInteger(msg.cols, 1) }, Cmd.none()];
        case 'tick':
          return model.visible ? [{ ...model, borderTick: (nonNegativeInteger(model.borderTick, 0, 23) + 1) % 24 }, Cmd.none()] : [model, Cmd.none()];
        case 'panic':
          if (!model.visible) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          return [{ ...model, visible: false, triggered: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: TooltipModel): VNode {
      const tokens = useTokens(tooltipContract, config, 'Tooltip');
      const theme = resolveTheme(config);
      const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
      const arrow = caret ? caretFor(position) : '';
      const prefix = VARIANT_PREFIX[variant];
      const borderColor = resolveAnimatedBorderColor(theme, tokens.border, variantColor, nonNegativeInteger(model.borderTick, 0, 23), 0.2);
      const viewportWidth = model.viewportCols === undefined ? maxWidth : Math.max(1, positiveInteger(model.viewportCols, maxWidth) - 2);
      const measurement = measureTooltipBubble({ content, maxWidth: Math.min(maxWidth, viewportWidth) });

      const contentStyle = applyTypography(tokens.captionStyle, { color: tokens.text, background: tokens.bg });
      const accentStyle = style({ color: variantColor, background: tokens.bg, bold: true });
      const borderStyle = style({ color: borderColor });
      const bubbleStyle = style({
        border: resolveElevationBorder(theme, 'floating'),
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
        { width: measurement.width, overflow: 'hidden' },
      );

      const bubble = !caret
        ? tooltipBox
        : position === 'top' || position === 'left'
          ? position === 'top'
            ? column(tooltipBox, text(arrow, borderStyle))
            : row(tooltipBox, text(arrow, borderStyle))
          : position === 'bottom'
            ? column(text(arrow, borderStyle), tooltipBox)
            : row(text(arrow, borderStyle), tooltipBox);
      const triggerFace = model.triggered
        ? box(
            triggerNode,
            style({
              color: tokens.hoverText,
              background: tokens.hoverBackground,
              bold: true,
              underline: theme.states.hover.underline,
            }),
            { fit: 'content' },
          )
        : triggerNode;
      const positioned = !model.visible
        ? triggerFace
        : position === 'top'
          ? column(bubble, triggerFace)
          : position === 'bottom'
            ? column(triggerFace, bubble)
            : position === 'left'
              ? row(bubble, triggerFace)
              : row(triggerFace, bubble);
      const interactive = event(
        triggerId,
        positioned,
        { onMouseEnter: enterTag, onMouseLeave: leaveTag },
        { label: content, intent: 'inspect', affordances: ['hover'], cursor: 'help', keyboardHint: 'Escape' },
      );
      setVNodeMeta(interactive, { a11y: { role: 'status', label: content } });
      return interactive;
    },

    subscriptions(model: TooltipModel): Sub<TooltipMsg> {
      const theme = resolveTheme(config);
      const subs: Sub<TooltipMsg>[] = [
        Sub.elementMouse<TooltipMsg>((mouseEvent) => {
          if (mouseEvent.elementId !== triggerId) return { type: 'noop' };
          if (mouseEvent.handlerTag === enterTag) return { type: 'hover-enter' };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'hover-leave' };
          return { type: 'noop' };
        }),
      ];
      if (model.triggered && !model.visible && delay > 0) {
        subs.push(Sub.timer(delay, () => ({ type: 'delay-elapsed' })));
      }
      if (model.visible) {
        subs.push(
          // A2 — tooltip honors Escape AND the surface-panic contract while visible.
          Sub.key<TooltipMsg>('escape', { type: 'hide' }),
          Sub.resize((cols) => ({ type: 'resize', cols })),
          surfaceContractSubs<TooltipMsg>({ id: surfaceId, onPanic: { type: 'panic' } }),
        );
        if (!theme.motion.reduceMotion) {
          subs.push(Sub.timer(140, () => ({ type: 'tick' })));
        }
      }
      return subs.length === 1 ? subs[0]! : Sub.batch<TooltipMsg>(...subs);
    },
  };
}

export function renderTooltipBubble(options: TooltipBubbleOptions): VNode {
  const variant = options.variant && options.variant in VARIANT_PREFIX ? options.variant : 'default';
  const theme = resolveTheme({ theme: options.theme });
  const tokens = useTokens(tooltipContract, { theme: options.theme }, 'Tooltip');
  const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
  const borderColor = resolveAnimatedBorderColor(theme, tokens.border, variantColor, nonNegativeInteger(options.tick, 0, 23), 0.2);
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
      border: resolveElevationBorder(theme, 'floating'),
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
