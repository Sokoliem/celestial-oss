import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, divider, event, focus, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { applyState, applyTypography, resolveAnimatedBorderColor, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ModalTokens {
  title: Color;
  border: Color;
  bg: Color;
  backdrop: Color;
  hint: Color;
  titleStyle: TypographyToken;
  hintStyle: TypographyToken;
  actionState: StateToken;
  actionHoverState: StateToken;
}

export const modalContract: TokenContract<ModalTokens> = {
  title: (t: SemanticTheme) => t.colors.tones.accent,
  border: (t: SemanticTheme) => t.elevation.modal.border ?? t.colors.borderActive,
  bg: (t: SemanticTheme) => t.elevation.modal.surface ?? t.colors.surfaceRaised,
  backdrop: (t: SemanticTheme) => t.colors.backdrop,
  hint: (t: SemanticTheme) => t.colors.muted,
  titleStyle: (t: SemanticTheme) => t.typography.heading,
  hintStyle: (t: SemanticTheme) => t.typography.caption,
  actionState: (t: SemanticTheme) => ({ fg: t.colors.interactive, bold: true }),
  actionHoverState: (t: SemanticTheme) => t.states.hover,
};

export interface ModalConfig {
  title: string;
  content: VNode;
  onClose?: () => void;
  width?: number;
  height?: number;
  /** Wrap unconstrained text descendants when the modal narrows (default: true). */
  wrapContent?: boolean;
  open?: boolean;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface ModalModel {
  open: boolean;
  hoveredClose?: boolean;
  borderTick?: number;
}
export type ModalMsg = Msg<'close'> | Msg<'open'> | Msg<'hover-close'> | Msg<'leave-close'> | Msg<'tick'> | Msg<'panic'> | Msg<'noop'>;

export function modal(config: ModalConfig): ComponentDescriptor<ModalModel, ModalMsg> {
  const slug = config.title.replace(/\s+/g, '-').toLowerCase() || 'modal';
  const groupId = generateFocusGroupId(`modal-${slug}`);
  const closeId = `${groupId}-close`;
  const closeTag = `${groupId}:close`;
  const hoverCloseTag = `${groupId}:hover-close`;
  const leaveCloseTag = `${groupId}:leave-close`;
  return {
    init(): [ModalModel, Cmd<ModalMsg>] {
      return [{ open: config.open ?? true, hoveredClose: false, borderTick: 0 }, (config.open ?? true) ? Cmd.pushFocusGroup(groupId) : Cmd.none()];
    },
    update(msg: ModalMsg, model: ModalModel): [ModalModel, Cmd<ModalMsg>] {
      switch (msg.type) {
        case 'close':
          if (!model.open) return [model, Cmd.none()];
          try {
            config.onClose?.();
          } catch {
            // best-effort; never let a host onClose strand the surface
          }
          return [{ open: false }, Cmd.popFocusGroup()];
        case 'open':
          return [{ open: true, hoveredClose: false, borderTick: 0 }, Cmd.pushFocusGroup(groupId)];
        case 'hover-close':
          return [{ ...model, hoveredClose: true }, Cmd.none()];
        case 'leave-close':
          return [{ ...model, hoveredClose: false }, Cmd.none()];
        case 'tick':
          return model.open ? [{ ...model, borderTick: (model.borderTick ?? 0) + 1 }, Cmd.none()] : [model, Cmd.none()];
        case 'panic':
          if (!model.open) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          try {
            config.onClose?.();
          } catch {
            // best-effort
          }
          return [{ open: false }, Cmd.popFocusGroup()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: ModalModel): VNode {
      if (!model.open) return text('');
      const tokens = useTokens(modalContract, config, 'Modal');
      const theme = resolveTheme(config);
      const width = Math.max(32, Math.floor(config.width ?? 52));
      const borderColor = resolveAnimatedBorderColor(theme, theme.colors.borderHover, tokens.border, model.borderTick ?? 0);
      const titleStyle = applyTypography(tokens.titleStyle, { color: tokens.title });
      const hintStyle = applyTypography(tokens.hintStyle, { color: tokens.hint });
      const closeStyle = model.hoveredClose ? applyState(tokens.actionHoverState, { bold: true }) : applyState(tokens.actionState);
      const borderStyle = style({ border: border.double, color: borderColor, background: tokens.bg, width });
      const dividerStyle = style({ color: borderColor, background: tokens.bg });
      const groupedContent = assignFocusGroup(config.wrapContent === false ? config.content : enableModalTextWrapping(config.content), groupId);
      const modalContent = box(
        column(
          text(config.title, titleStyle, { wrap: true }),
          divider({ style: dividerStyle }),
          text(''),
          groupedContent,
          text(''),
          event(
            `${groupId}:close`,
            focus(closeId, text('[esc] close', model.hoveredClose ? closeStyle : hintStyle), { group: groupId }),
            { onClick: closeTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
            { label: `Close ${config.title}`, intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
          ),
        ),
        style({ padding: 1, background: tokens.bg }),
      );

      const node = box(modalContent, borderStyle, { width, height: config.height, fit: 'content' });
      setVNodeMeta(node, {
        testId: `modal-${slug}`,
        a11y: { role: 'dialog', label: config.title },
      });
      return node;
    },
    subscriptions(model: ModalModel): Sub<ModalMsg> {
      if (!model.open) return Sub.none();
      const theme = resolveTheme(config);
      const subs: Sub<ModalMsg>[] = [
        Sub.elementMouse((mouseEvent) =>
          mouseEvent.handlerTag === closeTag && mouseEvent.elementId === `${groupId}:close`
            ? { type: 'close' }
            : mouseEvent.handlerTag === hoverCloseTag && mouseEvent.elementId === `${groupId}:close`
              ? { type: 'hover-close' }
              : mouseEvent.handlerTag === leaveCloseTag && mouseEvent.elementId === `${groupId}:close`
                ? { type: 'leave-close' }
                : { type: 'noop' },
        ),
        Sub.key('escape', { type: 'close' }),
        surfaceContractSubs<ModalMsg>({ id: groupId, onPanic: { type: 'panic' } }),
      ];
      if (!theme.motion.reduceMotion) {
        subs.push(Sub.timer(160, () => ({ type: 'tick' })));
      }
      return subs.length === 1 ? subs[0]! : Sub.batch<ModalMsg>(...subs);
    },
  };
}

function enableModalTextWrapping(node: VNode): VNode {
  switch (node.kind) {
    case 'text':
      return node.wrap === undefined ? { ...node, wrap: true } : node;
    case 'row':
    case 'column':
    case 'box':
    case 'tabGroup':
      return { ...node, children: node.children.map(enableModalTextWrapping) };
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      return { ...node, child: enableModalTextWrapping(node.child) };
    case 'component':
      return { ...node, render: (context) => enableModalTextWrapping(node.render(context)) };
    case 'memo':
      return { ...node, render: () => enableModalTextWrapping(node.render()) };
    case 'suspense':
      return { ...node, child: enableModalTextWrapping(node.child), fallback: enableModalTextWrapping(node.fallback) };
    default:
      return node;
  }
}
