import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style, truncate, visualWidth } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, component, empty, event, focus, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { applyTypography, useTokens } from './theme.js';
import { type ComponentDescriptor, normalizeContent } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface DrawerTokens {
  border: Color;
  title: Color;
  muted: Color;
  bg: Color;
  headerBg: Color;
  backdrop: Color;
  hoverBg: Color;
  hoverText: Color;
  titleStyle: TypographyToken;
  captionStyle: TypographyToken;
}

export const drawerContract: TokenContract<DrawerTokens> = {
  border: (t: SemanticTheme) => t.colors.focusRing,
  title: (t: SemanticTheme) => t.colors.text,
  muted: (t: SemanticTheme) => t.colors.muted,
  bg: (t: SemanticTheme) => t.elevation.floating.surface ?? t.colors.surfaceRaised,
  headerBg: (t: SemanticTheme) => t.colors.surfaceAlt,
  backdrop: (t: SemanticTheme) => t.colors.backdrop,
  hoverBg: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export type DrawerPosition = 'left' | 'right' | 'top' | 'bottom';
export type DrawerVariant = 'default' | 'overlay' | 'rail';
export type DrawerBackdrop = 'transparent' | 'opaque';

export interface DrawerConfig {
  content: VNode | VNode[];
  position?: DrawerPosition;
  variant?: DrawerVariant;
  width?: number;
  height?: number;
  title?: string;
  /**
   * Presentation of the outside-click region for overlay drawers.
   * Transparent preserves the application beneath it; opaque paints the
   * theme backdrop color. Defaults to transparent.
   */
  backdrop?: DrawerBackdrop;
  /** @deprecated Published drawers are always dismissible. Use a panel for a persistent surface. */
  closable?: boolean;
  onClose?: () => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface DrawerModel {
  open: boolean;
  width: number;
  height: number;
  focusTrapActive: boolean;
  hoveredControl?: 'open' | 'close' | null;
}

export type DrawerMsg =
  | Msg<'open' | 'close' | 'toggle' | 'panic' | 'noop'>
  | { type: 'hover-control'; control: 'open' | 'close' }
  | { type: 'leave-control'; control: 'open' | 'close' };
type Msg<T extends string> = { type: T };

const DEFAULT_WIDTH = 40;
const DEFAULT_HEIGHT = 20;

export function drawer(config: DrawerConfig): ComponentDescriptor<DrawerModel, DrawerMsg> {
  const position = config.position ?? 'left';
  const variant = config.variant ?? 'default';
  const width = config.width ?? DEFAULT_WIDTH;
  const height = config.height ?? DEFAULT_HEIGHT;
  const backdropMode = config.backdrop ?? 'transparent';
  if (config.closable === false) throw new Error('Drawers must be dismissible. Use a panel for a persistent surface.');
  const closable = true;
  const trapFocus = variant === 'overlay' && closable;
  const groupId = generateFocusGroupId(`drawer-${position}-${variant}`);
  const closeTag = `${groupId}:close`;
  const openTag = `${groupId}:open`;
  const hoverTag = `${groupId}:hover-control`;
  const leaveTag = `${groupId}:leave-control`;

  return {
    init(): [DrawerModel, Cmd<DrawerMsg>] {
      return [{ open: true, width, height, focusTrapActive: trapFocus, hoveredControl: null }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
    },

    update(msg: DrawerMsg, model: DrawerModel): [DrawerModel, Cmd<DrawerMsg>] {
      switch (msg.type) {
        case 'open':
          if (model.open) return [model, Cmd.none()];
          return [{ ...model, open: true, focusTrapActive: trapFocus }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'close':
          if (!model.open) return [model, Cmd.none()];
          try {
            config.onClose?.();
          } catch {
            // Closing must not strand a surface if a host callback fails.
          }
          return [{ ...model, open: false, focusTrapActive: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        case 'toggle':
          return model.open
            ? [{ ...model, open: false, focusTrapActive: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()]
            : [{ ...model, open: true, focusTrapActive: trapFocus }, trapFocus ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
        case 'hover-control':
          return [{ ...model, hoveredControl: msg.control }, Cmd.none()];
        case 'leave-control':
          return [model.hoveredControl === msg.control ? { ...model, hoveredControl: null } : model, Cmd.none()];
        case 'panic': {
          if (!model.open) return [model, Cmd.none()];
          broadcastSurfacePanic();
          try {
            config.onClose?.();
          } catch {
            // best-effort
          }
          return [{ ...model, open: false, focusTrapActive: false }, model.focusTrapActive ? Cmd.popFocusGroup() : Cmd.none()];
        }
        case 'noop':
          return [model, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: DrawerModel): VNode {
      if (!model.open && variant === 'default') {
        return text('');
      }

      const tokens = useTokens(drawerContract, config, 'Drawer');
      const contentArr = normalizeContent(config.content).map((node) => (trapFocus ? assignFocusGroup(node, groupId) : node));
      const drawerStyle = style({ border: border.double, borderColor: tokens.border, background: tokens.bg, padding: [0, 1] });
      const headerStyle = style({ background: tokens.headerBg });
      const hoveredControlStyle = style({ color: tokens.hoverText, background: tokens.hoverBg, bold: true });

      const renderDrawerContent = (surfaceWidth: number, surfaceHeight: number) => {
        const closeHint = closable
          ? event(
              `${groupId}:close`,
              trapFocus
                ? focus(
                    `${groupId}-close`,
                    text('[x]', model.hoveredControl === 'close' ? hoveredControlStyle : applyTypography(tokens.captionStyle, { background: tokens.headerBg })),
                    { group: groupId },
                  )
                : text('[x]', model.hoveredControl === 'close' ? hoveredControlStyle : applyTypography(tokens.captionStyle, { background: tokens.headerBg })),
              { onClick: closeTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              { label: 'Close drawer', intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
            )
          : text('');

        const innerWidth = Math.max(0, surfaceWidth - 4);
        const closeWidth = closable ? 3 : 0;
        const visibleTitle = truncate(config.title ?? '', Math.max(0, innerWidth - closeWidth));
        const titleGap = Math.max(0, innerWidth - visualWidth(visibleTitle) - closeWidth);
        const headerRow = row(
          text(visibleTitle, applyTypography(tokens.titleStyle, { background: tokens.headerBg })),
          text(' '.repeat(titleGap), headerStyle),
          closeHint,
        );
        const body = contentArr.length > 0 ? column(...contentArr) : text('');
        const drawerContent = box(column(headerRow, body), drawerStyle, {
          width: surfaceWidth,
          height: surfaceHeight,
          overflow: 'hidden',
        });
        setVNodeMeta(drawerContent, {
          testId: `drawer-${position}`,
          a11y: { role: 'dialog', label: config.title },
        });
        return drawerContent;
      };

      const renderBackdrop = (id: string, backdropWidth: number, backdropHeight: number): VNode => {
        if (backdropWidth <= 0 || backdropHeight <= 0) return empty(0, 0);
        const backdropContent =
          backdropMode === 'opaque'
            ? box(empty(), style({ background: tokens.backdrop }), {
                width: backdropWidth,
                height: backdropHeight,
                overflow: 'hidden',
              })
            : empty(backdropWidth, backdropHeight);
        const backdrop = event(`${groupId}:backdrop:${id}`, backdropContent, closable ? { onClick: closeTag } : {}, {
          label: 'Close drawer',
          intent: 'dismiss',
          affordances: closable ? ['click'] : [],
          cursor: closable ? 'pointer' : undefined,
        });
        setVNodeMeta(backdrop, { a11y: { role: 'button', label: 'Close drawer' } });
        return backdrop;
      };

      const renderOverlay = (viewportWidth: number, viewportHeight: number): VNode => {
        const surfaceWidth = Math.max(1, Math.min(Math.floor(model.width), viewportWidth));
        const surfaceHeight = Math.max(1, Math.min(Math.floor(model.height), viewportHeight));
        const remainingWidth = Math.max(0, viewportWidth - surfaceWidth);
        const remainingHeight = Math.max(0, viewportHeight - surfaceHeight);
        const surface = renderDrawerContent(surfaceWidth, surfaceHeight);

        const surfaceBand =
          position === 'right'
            ? row(renderBackdrop('side', remainingWidth, surfaceHeight), surface)
            : row(surface, renderBackdrop('side', remainingWidth, surfaceHeight));

        if (position === 'bottom') {
          return column(renderBackdrop('above', viewportWidth, remainingHeight), surfaceBand);
        }
        return column(surfaceBand, renderBackdrop('below', viewportWidth, remainingHeight));
      };

      if (variant === 'rail') {
        const railContent =
          position === 'left' || position === 'right'
            ? column(text('│', drawerStyle), text('│', drawerStyle), text('▼', drawerStyle), text('│', drawerStyle))
            : row(text('─', drawerStyle), text('─', drawerStyle), text('►', drawerStyle));
        return model.open
          ? renderDrawerContent(model.width, model.height)
          : event(
              `${groupId}:open`,
              model.hoveredControl === 'open' ? box(railContent, hoveredControlStyle, { fit: 'content' }) : railContent,
              { onClick: openTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              { label: 'Open drawer', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
            );
      }

      if (variant === 'overlay') {
        if (model.open) {
          const overlayNode = component((context) => {
            const viewportWidth = Math.max(1, Math.floor(context?.available.cols ?? context?.terminal.cols ?? model.width));
            const viewportHeight = Math.max(1, Math.floor(context?.available.rows ?? context?.terminal.rows ?? model.height));
            return renderOverlay(viewportWidth, viewportHeight);
          });
          setVNodeMeta(overlayNode, {
            testId: `drawer-overlay-${position}`,
            a11y: { role: 'dialog', label: config.title },
          });
          return overlayNode;
        }
        return event(
          `${groupId}:open`,
          text('◀ drawer', model.hoveredControl === 'open' ? hoveredControlStyle : style({ color: tokens.muted })),
          { onClick: openTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: 'Open drawer', intent: 'open', affordances: ['hover', 'click'], cursor: 'pointer' },
        );
      }

      return renderDrawerContent(model.width, model.height);
    },

    subscriptions(model: DrawerModel): Sub<DrawerMsg> {
      const mouse = Sub.elementMouse<DrawerMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === closeTag && mouseEvent.elementId.startsWith(`${groupId}:`)) return { type: 'close' };
        if (mouseEvent.handlerTag === openTag && mouseEvent.elementId === `${groupId}:open`) return { type: 'open' };
        if (mouseEvent.handlerTag === hoverTag && mouseEvent.elementId === `${groupId}:close`) return { type: 'hover-control', control: 'close' };
        if (mouseEvent.handlerTag === hoverTag && mouseEvent.elementId === `${groupId}:open`) return { type: 'hover-control', control: 'open' };
        if (mouseEvent.handlerTag === leaveTag && mouseEvent.elementId === `${groupId}:close`) return { type: 'leave-control', control: 'close' };
        if (mouseEvent.handlerTag === leaveTag && mouseEvent.elementId === `${groupId}:open`) return { type: 'leave-control', control: 'open' };
        return { type: 'noop' };
      });
      if (!model.open) return mouse;
      const subs: Sub<DrawerMsg>[] = [mouse];
      if (closable) subs.push(Sub.key('escape', { type: 'close' }));
      // Panic protection is mandatory regardless of `closable` — the user
      // must always be able to clear stuck surfaces.
      subs.push(surfaceContractSubs<DrawerMsg>({ id: groupId, onPanic: { type: 'panic' } }));
      return subs.length === 1 ? subs[0]! : Sub.batch<DrawerMsg>(...subs);
    },
  };
}

export interface DrawerGroupConfig {
  drawers: Array<{
    id: string;
    content: VNode | VNode[];
    position?: DrawerPosition;
    title?: string;
  }>;
  activeId?: string;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export function drawerGroup(config: DrawerGroupConfig): ComponentDescriptor<{ activeId: string | null }, DrawerMsg> {
  return {
    init(): [{ activeId: string | null }, Cmd<DrawerMsg>] {
      return [{ activeId: config.activeId ?? null }, Cmd.none()];
    },
    update(msg: DrawerMsg, model: { activeId: string | null }): [{ activeId: string | null }, Cmd<DrawerMsg>] {
      if (msg.type === 'toggle') {
        return [{ activeId: model.activeId ? null : (config.drawers[0]?.id ?? null) }, Cmd.none()];
      }
      if (msg.type === 'close') {
        return [{ activeId: null }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: { activeId: string | null }): VNode {
      const tokens = useTokens(drawerContract, config, 'DrawerGroup');
      if (!model.activeId) {
        return row(text('◀ ', style({ color: tokens.muted })), ...config.drawers.map((d) => text(`${d.id} `, style({ color: tokens.muted }))));
      }

      const activeDrawer = config.drawers.find((d) => d.id === model.activeId);
      if (!activeDrawer) return text('');

      return drawer({
        content: activeDrawer.content,
        position: activeDrawer.position,
        title: activeDrawer.title,
        themeCtx: config.themeCtx,
        theme: config.theme,
      }).view({ open: true, width: 50, height: 25, focusTrapActive: false });
    },
  };
}
