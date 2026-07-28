import type { Color, GlyphLevel, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { popoverGlyphs, resolveElevationBorder, resolveGlyph, style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { box, Cmd, collectFocusNodes, column, event, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { caretFor } from './anchored-overlay.js';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { MAX_RENDER_CELLS, positiveInteger } from './internal.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveTheme, useTokens } from './theme.js';
import { type ComponentDescriptor, normalizeContent } from './types.js';
import { transformVNode } from './vnode-transform.js';

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
  hoveredTrigger?: boolean;
}

export type PopoverMsg =
  | Msg<'show' | 'hide' | 'toggle' | 'panic' | 'hover-close' | 'leave-close' | 'hover-trigger' | 'leave-trigger' | 'noop'>
  | Msg<'toggle-at', { index: number }>
  | Msg<'hover-trigger-at' | 'leave-trigger-at', { index: number }>
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
  const position =
    config.position === 'bottom' || config.position === 'left' || config.position === 'right' || config.position === 'center' ? config.position : 'top';
  const variant = config.variant && config.variant in VARIANT_TONE ? config.variant : 'default';
  const showArrow = config.showArrow ?? true;
  const persistent = config.persistent ?? false;
  const title = config.title === undefined ? undefined : String(config.title);
  const triggerNode = config.trigger;
  const contentNodes = Array.isArray(config.content) ? [...config.content] : config.content;
  const groupId = generateFocusGroupId(`popover-${position}-${variant}`);
  const triggerId = `${groupId}:trigger`;
  const closeId = `${groupId}:close`;
  const toggleTag = `${groupId}:toggle`;
  const closeTag = `${groupId}:hide`;
  const hoverCloseTag = `${groupId}:hover-close`;
  const leaveCloseTag = `${groupId}:leave-close`;
  const hoverTriggerTag = `${groupId}:hover-trigger`;
  const leaveTriggerTag = `${groupId}:leave-trigger`;
  const focusableCount = collectFocusNodes(Array.isArray(contentNodes) ? column(...contentNodes) : contentNodes).length;
  const trapFocus = !persistent && focusableCount > 0;

  return {
    init(): [PopoverModel, Cmd<PopoverMsg>] {
      return [{ visible: false, focusTrapActive: false, hoveredClose: false, hoveredTrigger: false }, Cmd.none()];
    },

    update(msg: PopoverMsg, model: PopoverModel): [PopoverModel, Cmd<PopoverMsg>] {
      switch (msg.type) {
        case 'show':
          if (model.visible) return [model, Cmd.none()];
          return [{ ...model, visible: true, focusTrapActive: trapFocus, hoveredClose: false }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'hide':
          if (!model.visible) return [model, Cmd.none()];
          return [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false, hoveredTrigger: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        case 'toggle':
          return model.visible
            ? [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false, hoveredTrigger: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()]
            : [{ ...model, visible: true, focusTrapActive: trapFocus, hoveredClose: false }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'panic':
          if (!model.visible) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          return [{ ...model, visible: false, focusTrapActive: false, hoveredClose: false, hoveredTrigger: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: positiveInteger(msg.cols, 1) }, Cmd.none()];
        case 'hover-close':
          return [{ ...model, hoveredClose: true }, Cmd.none()];
        case 'leave-close':
          return [{ ...model, hoveredClose: false }, Cmd.none()];
        case 'hover-trigger':
          return [model.hoveredTrigger ? model : { ...model, hoveredTrigger: true }, Cmd.none()];
        case 'leave-trigger':
          return [model.hoveredTrigger ? { ...model, hoveredTrigger: false } : model, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: PopoverModel): VNode {
      const tokens = useTokens(popoverContract, config, 'Popover');
      const theme = resolveTheme(config);
      const variantColor = theme.colors.tones[VARIANT_TONE[variant]];
      const preferredWidth = Math.max(12, positiveInteger(config.width, 36));
      const viewportCols = model.viewportCols === undefined ? preferredWidth : positiveInteger(model.viewportCols, preferredWidth);
      const width = Math.max(1, Math.min(preferredWidth, Math.max(1, viewportCols - 2)));

      const groupedContent = Array.isArray(contentNodes)
        ? contentNodes.map((node) => (model.focusTrapActive ? assignFocusGroup(node, groupId) : node))
        : model.focusTrapActive
          ? assignFocusGroup(contentNodes, groupId)
          : contentNodes;
      const content = normalizeContent(groupedContent).map(enablePopoverTextWrapping);
      const closeStyle = applyTypography(tokens.captionStyle, {
        color: model.hoveredClose ? tokens.text : tokens.textSoft,
        background: model.hoveredClose ? theme.states.hover.bg : undefined,
      });
      const panelChildren: VNode[] = [];
      if (title) panelChildren.push(text(title, applyTypography(tokens.titleStyle, { color: variantColor }), { wrap: true }));
      panelChildren.push(...content);
      panelChildren.push(
        event(
          closeId,
          text('[x] close', closeStyle),
          { onClick: closeTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
          { label: 'Close popover', intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
        ),
      );
      const popoverContent = box(column(...panelChildren), style({ border: resolveElevationBorder(theme, 'floating'), borderColor: variantColor, background: tokens.bg, padding: 1 }), {
        width,
        fit: 'content',
        overflow: 'hidden',
      });
      setVNodeMeta(popoverContent, { testId: `${groupId}:panel`, a11y: { role: 'dialog', label: title ?? 'Popover' } });
      const arrow = showArrow ? text(` ${popoverArrow(position)} `, style({ color: variantColor })) : text('');
      const triggerFace = model.hoveredTrigger
        ? box(
            triggerNode,
            style({
              color: theme.states.hover.fg,
              background: theme.states.hover.bg,
            }),
            { fit: 'content' },
          )
        : triggerNode;
      const trigger = event(
        triggerId,
        triggerFace,
        { onClick: toggleTag, onMouseEnter: hoverTriggerTag, onMouseLeave: leaveTriggerTag },
        { label: title ? `Open ${title}` : 'Toggle popover', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
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
        if (mouseEvent.elementId === triggerId && mouseEvent.handlerTag === hoverTriggerTag) return { type: 'hover-trigger' };
        if (mouseEvent.elementId === triggerId && mouseEvent.handlerTag === leaveTriggerTag) return { type: 'leave-trigger' };
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
  return transformVNode(node, (current) => (current.kind === 'text' && current.wrap === undefined ? { ...current, wrap: true } : current));
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

export interface PopoverGroupModel {
  activeIndex: number;
  hoveredIndex: number;
  hoveredClose: boolean;
}

export function popoverGroup(config: PopoverGroupConfig): ComponentDescriptor<PopoverGroupModel, PopoverMsg> {
  const popovers: Array<{ trigger: string; content: string; position: PopoverPosition; variant: PopoverVariant }> = config.popovers
    .slice(0, MAX_RENDER_CELLS)
    .map((item) => ({
      trigger: String(item.trigger),
      content: String(item.content),
      position: item.position === 'bottom' || item.position === 'left' || item.position === 'right' || item.position === 'center' ? item.position : 'top',
      variant: item.variant && item.variant in VARIANT_TONE ? item.variant : 'default',
    }));
  const groupId = generateFocusGroupId('popover-group');
  const triggerTag = `${groupId}:toggle`;
  const closeTag = `${groupId}:close`;
  const hoverTriggerTag = `${groupId}:hover-trigger`;
  const leaveTriggerTag = `${groupId}:leave-trigger`;
  const hoverCloseTag = `${groupId}:hover-close`;
  const leaveCloseTag = `${groupId}:leave-close`;
  const validActiveIndex = (index: number): number => (Number.isInteger(index) && index >= 0 && index < popovers.length ? index : -1);

  return {
    init(): [PopoverGroupModel, Cmd<PopoverMsg>] {
      return [{ activeIndex: -1, hoveredIndex: -1, hoveredClose: false }, Cmd.none()];
    },
    update(msg: PopoverMsg, model: PopoverGroupModel): [PopoverGroupModel, Cmd<PopoverMsg>] {
      if (msg.type === 'toggle') {
        const newIndex = validActiveIndex(model.activeIndex) === -1 && popovers.length > 0 ? 0 : -1;
        return [{ ...model, activeIndex: newIndex, hoveredClose: false }, Cmd.none()];
      }
      if (msg.type === 'toggle-at') {
        if (!Number.isInteger(msg.index) || !popovers[msg.index]) return [model, Cmd.none()];
        return [{ ...model, activeIndex: validActiveIndex(model.activeIndex) === msg.index ? -1 : msg.index, hoveredClose: false }, Cmd.none()];
      }
      if (msg.type === 'hover-trigger-at') {
        const index = validActiveIndex(msg.index);
        return [index === -1 || model.hoveredIndex === index ? model : { ...model, hoveredIndex: index }, Cmd.none()];
      }
      if (msg.type === 'leave-trigger-at') {
        return [model.hoveredIndex === msg.index ? { ...model, hoveredIndex: -1 } : model, Cmd.none()];
      }
      if (msg.type === 'hover-close') {
        return [model.hoveredClose ? model : { ...model, hoveredClose: true }, Cmd.none()];
      }
      if (msg.type === 'leave-close') {
        return [model.hoveredClose ? { ...model, hoveredClose: false } : model, Cmd.none()];
      }
      if (msg.type === 'hide' || msg.type === 'panic') {
        if (msg.type === 'panic' && validActiveIndex(model.activeIndex) !== -1) broadcastSurfacePanic();
        return [{ ...model, activeIndex: -1, hoveredClose: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: PopoverGroupModel): VNode {
      const activeIndex = validActiveIndex(model.activeIndex);
      const tokens = useTokens(popoverContract, config, 'PopoverGroup');
      const theme = resolveTheme(config);
      const nodes = popovers.map((popoverItem, index) => {
        const isActive = activeIndex === index;
        const isHovered = model.hoveredIndex === index;
        const triggerStyle = isHovered
          ? style({
              color: theme.states.hover.fg,
              background: theme.states.hover.bg,
            })
          : style({ color: isActive ? theme.colors.highlight : theme.colors.text });
        const trigger = event(
          `${groupId}:trigger:${index}`,
          text(popoverItem.trigger, triggerStyle),
          { onClick: triggerTag, onMouseEnter: hoverTriggerTag, onMouseLeave: leaveTriggerTag },
          { label: `Toggle ${popoverItem.trigger}`, intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
        );
        if (!isActive) return trigger;

        const variantColor = theme.colors.tones[VARIANT_TONE[popoverItem.variant]];
        const close = event(
          `${groupId}:close`,
          text(
            '[x] close',
            applyTypography(tokens.captionStyle, {
              color: model.hoveredClose ? theme.states.hover.fg : tokens.textSoft,
              background: model.hoveredClose ? theme.states.hover.bg : undefined,
            }),
          ),
          { onClick: closeTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
          { label: 'Close popover', intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
        );
        const panel = box(
          column(enablePopoverTextWrapping(text(popoverItem.content)), close),
          style({ border: resolveElevationBorder(theme, 'floating'), borderColor: variantColor, background: tokens.bg, padding: 1 }),
          { width: 36, fit: 'content', overflow: 'hidden' },
        );
        setVNodeMeta(panel, { testId: `${groupId}:panel`, a11y: { role: 'dialog', label: popoverItem.trigger } });
        const arrow = text(` ${popoverArrow(popoverItem.position)} `, style({ color: variantColor }));
        switch (popoverItem.position) {
          case 'top':
            return column(panel, arrow, trigger);
          case 'bottom':
            return column(trigger, arrow, panel);
          case 'left':
            return row(panel, arrow, trigger);
          case 'right':
            return row(trigger, arrow, panel);
          case 'center':
            return column(trigger, panel);
        }
      });
      return row(...nodes);
    },
    subscriptions(model: PopoverGroupModel): Sub<PopoverMsg> {
      const mouse = Sub.elementMouse<PopoverMsg>((mouseEvent) => {
        if (mouseEvent.elementId === `${groupId}:close` && mouseEvent.handlerTag === closeTag) return { type: 'hide' };
        if (mouseEvent.elementId === `${groupId}:close` && mouseEvent.handlerTag === hoverCloseTag) return { type: 'hover-close' };
        if (mouseEvent.elementId === `${groupId}:close` && mouseEvent.handlerTag === leaveCloseTag) return { type: 'leave-close' };
        if (!mouseEvent.elementId.startsWith(`${groupId}:trigger:`)) return { type: 'noop' };
        const index = Number(mouseEvent.elementId.slice(`${groupId}:trigger:`.length));
        if (mouseEvent.handlerTag === triggerTag) return { type: 'toggle-at', index };
        if (mouseEvent.handlerTag === hoverTriggerTag) return { type: 'hover-trigger-at', index };
        if (mouseEvent.handlerTag === leaveTriggerTag) return { type: 'leave-trigger-at', index };
        return { type: 'noop' };
      });
      if (validActiveIndex(model.activeIndex) === -1) return mouse;
      return Sub.batch(mouse, Sub.key('escape', { type: 'hide' }), surfaceContractSubs<PopoverMsg>({ id: groupId, onPanic: { type: 'panic' } }));
    },
  };
}
