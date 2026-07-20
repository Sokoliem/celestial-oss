import type { Color, GlyphLevel, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { border, popoverGlyphs, resolveGlyph, style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { box, Cmd, collectFocusNodes, column, event, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { caretFor } from './anchored-overlay.js';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveTheme, useTokens } from './theme.js';
import { type ComponentDescriptor, normalizeContent } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface PopoverTokens {
  text: Color;
  textSoft: Color;
  border: Color;
  bg: Color;
  titleStyle: TypographyToken;
  captionStyle: TypographyToken;
}

export const popoverContract: TokenContract<PopoverTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  border: (t: SemanticTheme) => t.elevation.floating.border ?? t.colors.borderHover,
  bg: (t: SemanticTheme) => t.elevation.floating.surface ?? t.colors.surfaceRaised,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export type PopoverPosition = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type PopoverVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface PopoverConfig {
  trigger: VNode;
  content: VNode | VNode[];
  position?: PopoverPosition;
  variant?: PopoverVariant;
  title?: string;
  showArrow?: boolean;
  persistent?: boolean;
  /** Preferred outer width before viewport clamping (default: 36). */
  width?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface PopoverModel {
  visible: boolean;
  focusTrapActive: boolean;
  viewportCols?: number;
  hoveredClose?: boolean;
}

export type PopoverMsg =
  | Msg<'show' | 'hide' | 'toggle' | 'panic' | 'hover-close' | 'leave-close' | 'noop'>
  | Msg<'resize', { cols: number }>;

/**
 * Caret glyph for the popover's anchor-facing edge.
 *
 * Sides top/bottom/left/right delegate to the shared `caretFor()` helper
 * (sourced from corona-grade glyph tokens via anchored-overlay.ts); the
 * 'center' position resolves through `popoverGlyphs.centerCaret` so the
 * popover-specific caret can be themed independently (Phase 3.1 / B1).
 */
function popoverArrow(position: PopoverPosition, level: GlyphLevel = 'wide'): string {
  if (position === 'center') return resolveGlyph(popoverGlyphs.centerCaret, level);
  return caretFor(position, level);
}

const VARIANT_TONE: Record<PopoverVariant, ConstellationTone> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

export function popover(config: PopoverConfig): ComponentDescriptor<PopoverModel, PopoverMsg> {
  const position = config.position ?? 'top';
  const variant = config.variant ?? 'default';
  const showArrow = config.showArrow ?? true;
  const persistent = config.persistent ?? false;
  const groupId = generateFocusGroupId(`popover-${position}-${variant}`);
  const triggerId = `${groupId}:trigger`;
  const closeId = `${groupId}:close`;
  const toggleTag = `${groupId}:toggle`;
  const closeTag = `${groupId}:hide`;
  const hoverCloseTag = `${groupId}:hover-close`;
  const leaveCloseTag = `${groupId}:leave-close`;
  const focusableCount = collectFocusNodes(Array.isArray(config.content) ? column(...config.content) : config.content).length;
  const trapFocus = !persistent && focusableCount > 0;

  return {
    init(): [PopoverModel, Cmd<PopoverMsg>] {
      return [{ visible: false, focusTrapActive: false, hoveredClose: false }, Cmd.none()];
    },

    update(msg: PopoverMsg, model: PopoverModel): [PopoverModel, Cmd<PopoverMsg>] {
      switch (msg.type) {
        case 'show':
          if (model.visible) return [model, Cmd.none()];
          return [{ ...model, visible: true, focusTrapActive: trapFocus, hoveredClose: false }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'hide':
          if (!model.visible) return [model, Cmd.none()];
          return [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        case 'toggle':
          return model.visible
            ? [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()]
            : [{ ...model, visible: true, focusTrapActive: trapFocus, hoveredClose: false }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'panic':
          if (!model.visible) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          return [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: Math.max(1, Math.floor(msg.cols)) }, Cmd.none()];
        case 'hover-close':
          return [{ ...model, hoveredClose: true }, Cmd.none()];
        case 'leave-close':
          return [{ ...model, hoveredClose: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: PopoverModel): VNode {
      const tokens = useTokens(popoverContract, config, 'Popover');
      const theme = resolveTheme(config);
      const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
      const preferredWidth = Math.max(12, Math.floor(config.width ?? 36));
      const width = Math.max(8, Math.min(preferredWidth, model.viewportCols === undefined ? preferredWidth : model.viewportCols - 2));

      const groupedContent = Array.isArray(config.content)
        ? config.content.map((node) => (model.focusTrapActive ? assignFocusGroup(node, groupId) : node))
        : model.focusTrapActive
          ? assignFocusGroup(config.content, groupId)
          : config.content;
      const content = normalizeContent(groupedContent).map(enablePopoverTextWrapping);
      const closeStyle = applyTypography(tokens.captionStyle, {
        color: model.hoveredClose ? tokens.text : tokens.textSoft,
        background: model.hoveredClose ? theme.states.hover.bg : undefined,
        bold: model.hoveredClose,
      });
      const panelChildren: VNode[] = [];
      if (config.title) panelChildren.push(text(config.title, applyTypography(tokens.titleStyle, { color: variantColor }), { wrap: true }));
      panelChildren.push(...content);
      panelChildren.push(
        event(
          closeId,
          text('[x] close', closeStyle),
          { onClick: closeTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
          { label: 'Close popover', intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
        ),
      );
      const popoverContent = box(
        column(...panelChildren),
        style({ border: border.rounded, borderColor: variantColor, background: tokens.bg, padding: 1 }),
        { width, fit: 'content', overflow: 'hidden' },
      );
      setVNodeMeta(popoverContent, { testId: `${groupId}:panel`, a11y: { role: 'dialog', label: config.title ?? 'Popover' } });
      const arrow = showArrow ? text(` ${popoverArrow(position)} `, style({ color: variantColor })) : text('');
      const trigger = event(
        triggerId,
        config.trigger,
        { onClick: toggleTag },
        { label: config.title ? `Open ${config.title}` : 'Toggle popover', intent: 'open', affordances: ['click'], cursor: 'pointer' },
      );

      const positionedPopover = (() => {
        switch (position) {
          case 'top':
            return column(popoverContent, arrow, trigger);
          case 'bottom':
            return column(trigger, arrow, popoverContent);
          case 'left':
            return row(popoverContent, arrow, trigger);
          case 'right':
            return row(trigger, arrow, popoverContent);
          case 'center':
            return column(trigger, popoverContent);
        }
      })();

      return model.visible ? positionedPopover : trigger;
    },

    subscriptions(model: PopoverModel): Sub<PopoverMsg> {
      const mouse = Sub.elementMouse<PopoverMsg>((mouseEvent) => {
        if (mouseEvent.elementId === triggerId && mouseEvent.handlerTag === toggleTag) return { type: 'toggle' };
        if (mouseEvent.elementId !== closeId) return { type: 'noop' };
        if (mouseEvent.handlerTag === closeTag) return { type: 'hide' };
        if (mouseEvent.handlerTag === hoverCloseTag) return { type: 'hover-close' };
        if (mouseEvent.handlerTag === leaveCloseTag) return { type: 'leave-close' };
        return { type: 'noop' };
      });
      if (!model.visible) return mouse;
      return Sub.batch<PopoverMsg>(
        mouse,
        Sub.key('escape', { type: 'hide' }),
        Sub.resize((cols) => ({ type: 'resize', cols })),
        surfaceContractSubs<PopoverMsg>({ id: groupId, onPanic: { type: 'panic' } }),
      );
    },
  };
}

function enablePopoverTextWrapping(node: VNode): VNode {
  switch (node.kind) {
    case 'text':
      return node.wrap === undefined ? { ...node, wrap: true } : node;
    case 'row':
    case 'column':
    case 'box':
    case 'tabGroup':
      return { ...node, children: node.children.map(enablePopoverTextWrapping) };
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      return { ...node, child: enablePopoverTextWrapping(node.child) };
    case 'component':
      return { ...node, render: (context) => enablePopoverTextWrapping(node.render(context)) };
    case 'memo':
      return { ...node, render: () => enablePopoverTextWrapping(node.render()) };
    case 'suspense':
      return { ...node, child: enablePopoverTextWrapping(node.child), fallback: enablePopoverTextWrapping(node.fallback) };
    default:
      return node;
  }
}

export interface PopoverGroupConfig {
  popovers: Array<{
    trigger: string;
    content: string;
    variant?: PopoverVariant;
    position?: PopoverPosition;
  }>;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export function popoverGroup(config: PopoverGroupConfig): ComponentDescriptor<{ activeIndex: number }, PopoverMsg> {
  return {
    init(): [{ activeIndex: number }, Cmd<PopoverMsg>] {
      return [{ activeIndex: -1 }, Cmd.none()];
    },
    update(msg: PopoverMsg, model: { activeIndex: number }): [{ activeIndex: number }, Cmd<PopoverMsg>] {
      if (msg.type === 'toggle') {
        const newIndex = model.activeIndex === -1 ? 0 : -1;
        return [{ activeIndex: newIndex }, Cmd.none()];
      }
      if (msg.type === 'hide') {
        return [{ activeIndex: -1 }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: { activeIndex: number }): VNode {
      const theme = resolveTheme(config);
      const nodes = config.popovers.map((p, i) => {
        const triggerColor = model.activeIndex === i ? theme.colors.highlight : theme.colors.text;
        const triggerText = text(p.trigger, style({ color: triggerColor }));
        return popover({
          trigger: triggerText,
          content: text(p.content),
          variant: p.variant,
          position: p.position,
          themeCtx: config.themeCtx,
          theme: config.theme,
        }).view({ visible: model.activeIndex === i, focusTrapActive: false });
      });
      return row(...nodes);
    },
    subscriptions(model: { activeIndex: number }): Sub<PopoverMsg> {
      if (model.activeIndex === -1) return Sub.none();
      return Sub.key('escape', { type: 'hide' });
    },
  };
}
