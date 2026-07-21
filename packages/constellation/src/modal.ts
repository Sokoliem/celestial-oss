import type { Color, SemanticTheme, StateToken, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, divider, event, flex, focus, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { nonNegativeInteger, positiveInteger } from './internal.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { applyState, applyTypography, resolveAnimatedBorderColor, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';
import { transformVNode } from './vnode-transform.js';

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
  viewportCols?: number;
  viewportRows?: number;
}
export type ModalMsg =
  | Msg<'close'>
  | Msg<'open'>
  | Msg<'hover-close'>
  | Msg<'leave-close'>
  | Msg<'tick'>
  | Msg<'resize', { cols: number; rows: number }>
  | Msg<'panic'>
  | Msg<'noop'>;

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
          return [{ ...model, open: false, hoveredClose: false }, Cmd.popFocusGroup()];
        case 'open':
          return [{ ...model, open: true, hoveredClose: false, borderTick: 0 }, Cmd.pushFocusGroup(groupId)];
        case 'hover-close':
          return [{ ...model, hoveredClose: true }, Cmd.none()];
        case 'leave-close':
          return [{ ...model, hoveredClose: false }, Cmd.none()];
        case 'tick':
          return model.open ? [{ ...model, borderTick: nonNegativeInteger(model.borderTick, 0) + 1 }, Cmd.none()] : [model, Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: positiveInteger(msg.cols, 1), viewportRows: positiveInteger(msg.rows, 1) }, Cmd.none()];
        case 'panic':
          if (!model.open) return [model, Cmd.none()];
          // Fan out to other registered surfaces before closing self.
          broadcastSurfacePanic();
          try {
            config.onClose?.();
          } catch {
            // best-effort
          }
          return [{ ...model, open: false, hoveredClose: false }, Cmd.popFocusGroup()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: ModalModel): VNode {
      if (!model.open) return text('');
      const tokens = useTokens(modalContract, config, 'Modal');
      const theme = resolveTheme(config);
      const preferredWidth = Math.max(32, positiveInteger(config.width, 52));
      const viewportWidth = model.viewportCols === undefined ? preferredWidth : Math.max(1, model.viewportCols - 2);
      const width = Math.max(1, Math.min(preferredWidth, viewportWidth));
      const preferredHeight = config.height === undefined ? undefined : positiveInteger(config.height, 1);
      const viewportHeight = model.viewportRows === undefined ? preferredHeight : Math.max(1, model.viewportRows - 2);
      const height = preferredHeight === undefined ? undefined : Math.max(1, Math.min(preferredHeight, viewportHeight ?? preferredHeight));
      const borderColor = resolveAnimatedBorderColor(theme, theme.colors.borderHover, tokens.border, model.borderTick ?? 0);
      const titleStyle = applyTypography(tokens.titleStyle, { color: tokens.title });
      const hintStyle = applyTypography(tokens.hintStyle, { color: tokens.hint });
      const closeStyle = model.hoveredClose ? applyState(tokens.actionHoverState, { bold: true }) : applyState(tokens.actionState);
      const borderStyle = style({ border: border.double, color: borderColor, background: tokens.bg, width });
      const dividerStyle = style({ color: borderColor, background: tokens.bg });
      const groupedContent = assignFocusGroup(config.wrapContent === false ? config.content : enableModalTextWrapping(config.content), groupId);
      const closeControl = event(
        `${groupId}:close`,
        focus(closeId, text('[x]', closeStyle), { group: groupId }),
        { onClick: closeTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
        { label: `Close ${config.title}`, intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
      );
      setVNodeMeta(closeControl, { a11y: { role: 'button', label: `Close ${config.title}` } });
      const titleRow = row(flex(text(config.title, titleStyle), { flex: 1, minWidth: 0 }), closeControl);
      const modalContent = box(
        column(titleRow, divider({ style: dividerStyle }), text(''), groupedContent, text(''), text('Esc closes', hintStyle, { wrap: true })),
        style({ padding: 1, background: tokens.bg }),
      );

      const node = box(modalContent, borderStyle, { width, height, fit: 'content' });
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
        Sub.resize((cols, rows) => ({ type: 'resize', cols, rows })),
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
  return transformVNode(node, (current) => (current.kind === 'text' && current.wrap === undefined ? { ...current, wrap: true } : current));
}
