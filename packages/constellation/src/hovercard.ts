/**
 * `hovercard` — interactive surface that appears on hover-intent and persists
 * while the cursor remains over the card or the trigger. Distinct from
 * `tooltip` (passive label, no rich content) and `popover` (click-toggled,
 * always-on-while-open).
 *
 * Design-system review Phase 7.4 / F4.
 *
 * Behavior:
 *   - 200 ms hover-intent delay before showing (configurable).
 *   - 150 ms grace period after `hover-leave` before hiding, so users can
 *     move the cursor from trigger to card without losing the surface.
 *   - Click-through escape: clicking outside dismisses immediately.
 *   - Escape key + panic shortcut dismiss (via surfaceContractSubs).
 *
 * @experimental — Stability per ADR 0003.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { border, style } from '@celestial/corona';
import { box, Cmd, column, event, type Msg, Sub, setVNodeMeta, text, type ThemeContext, type VNode } from '@celestial/nebula';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { applyTypography, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

export interface HovercardTokens {
  readonly text: Color;
  readonly textSoft: Color;
  readonly border: Color;
  readonly background: Color;
  readonly captionStyle: TypographyToken;
}

export const hovercardContract: TokenContract<HovercardTokens> = {
  text: (theme: SemanticTheme) => theme.colors.text,
  textSoft: (theme: SemanticTheme) => theme.colors.textSoft,
  border: (theme: SemanticTheme) => theme.elevation.floating.border ?? theme.colors.borderHover,
  background: (theme: SemanticTheme) => theme.elevation.floating.surface ?? theme.colors.surfaceRaised,
  captionStyle: (theme: SemanticTheme) => theme.typography.caption,
};

export interface HovercardConfig {
  /** Stable ID for focus-group and panic-broadcast scoping. */
  readonly id: string;
  /** Trigger content rendered always-on. */
  readonly trigger: VNode;
  /** Card content shown after the hover-intent delay. */
  readonly content: VNode;
  /** Hover-intent delay before showing (ms). Default 200. */
  readonly showDelay?: number;
  /** Grace period after hover-leave before hiding (ms). Default 150. */
  readonly hideDelay?: number;
  /** Preferred outer width before viewport clamping (default: 36). */
  readonly width?: number;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export interface HovercardModel {
  readonly state: 'idle' | 'pending-show' | 'open' | 'pending-hide';
  readonly viewportCols?: number;
  readonly hoveredClose?: boolean;
}

export type HovercardMsg =
  | Msg<'hover-enter'>
  | Msg<'hover-leave'>
  | Msg<'show-tick'>
  | Msg<'hide-tick'>
  | Msg<'dismiss'>
  | Msg<'panic'>
  | Msg<'hover-close'>
  | Msg<'leave-close'>
  | Msg<'noop'>
  | Msg<'resize', { cols: number }>;

export function hovercard(config: HovercardConfig): ComponentDescriptor<HovercardModel, HovercardMsg> {
  const showDelay = Math.max(0, config.showDelay ?? 200);
  const hideDelay = Math.max(0, config.hideDelay ?? 150);
  const surfaceId = `hovercard-${config.id}`;
  const triggerId = `${surfaceId}:trigger`;
  const cardId = `${surfaceId}:card`;
  const closeId = `${surfaceId}:close`;
  const enterTag = `${surfaceId}:enter`;
  const leaveTag = `${surfaceId}:leave`;
  const dismissTag = `${surfaceId}:dismiss`;
  const hoverCloseTag = `${surfaceId}:hover-close`;
  const leaveCloseTag = `${surfaceId}:leave-close`;

  return {
    init(): [HovercardModel, Cmd<HovercardMsg>] {
      return [{ state: 'idle', hoveredClose: false }, Cmd.none()];
    },
    update(msg: HovercardMsg, model: HovercardModel): [HovercardModel, Cmd<HovercardMsg>] {
      switch (msg.type) {
        case 'hover-enter':
          return [{ ...model, state: model.state === 'open' || model.state === 'pending-hide' ? 'open' : 'pending-show' }, Cmd.none()];
        case 'hover-leave':
          if (model.state === 'pending-show') return [{ ...model, state: 'idle' }, Cmd.none()];
          if (model.state === 'open') return [{ ...model, state: 'pending-hide' }, Cmd.none()];
          return [model, Cmd.none()];
        case 'show-tick':
          if (model.state !== 'pending-show') return [model, Cmd.none()];
          return [{ ...model, state: 'open' }, Cmd.none()];
        case 'hide-tick':
          if (model.state !== 'pending-hide') return [model, Cmd.none()];
          return [{ ...model, state: 'idle', hoveredClose: false }, Cmd.none()];
        case 'dismiss':
          return [{ ...model, state: 'idle', hoveredClose: false }, Cmd.none()];
        case 'panic':
          if (model.state === 'idle') return [model, Cmd.none()];
          broadcastSurfacePanic();
          return [{ ...model, state: 'idle', hoveredClose: false }, Cmd.none()];
        case 'resize':
          return [{ ...model, viewportCols: Math.max(1, Math.floor(msg.cols)) }, Cmd.none()];
        case 'hover-close':
          return [{ ...model, hoveredClose: true }, Cmd.none()];
        case 'leave-close':
          return [{ ...model, hoveredClose: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: HovercardModel): VNode {
      const trigger = event(
        triggerId,
        config.trigger,
        { onMouseEnter: enterTag, onMouseLeave: leaveTag },
        { label: 'Hovercard trigger', intent: 'inspect', affordances: ['hover'], cursor: 'pointer' },
      );
      if (model.state !== 'open') return trigger;
      const tokens = useTokens(hovercardContract, config, 'Hovercard');
      const preferredWidth = Math.max(12, Math.floor(config.width ?? 36));
      const width = Math.max(8, Math.min(preferredWidth, model.viewportCols === undefined ? preferredWidth : model.viewportCols - 2));
      const close = event(
        closeId,
        text(
          '[x] close',
          applyTypography(tokens.captionStyle, {
            color: model.hoveredClose ? tokens.text : tokens.textSoft,
            background: model.hoveredClose ? tokens.border : undefined,
            bold: model.hoveredClose,
          }),
        ),
        { onClick: dismissTag, onMouseEnter: hoverCloseTag, onMouseLeave: leaveCloseTag },
        { label: 'Close hovercard', intent: 'close', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
      );
      const card = event(
        cardId,
        box(
          column(enableHovercardTextWrapping(config.content), close),
          style({ border: border.rounded, borderColor: tokens.border, background: tokens.background, padding: 1 }),
          { width, fit: 'content', overflow: 'hidden' },
        ),
        { onMouseEnter: enterTag, onMouseLeave: leaveTag },
        { label: 'Hovercard', intent: 'inspect', affordances: ['hover'] },
      );
      setVNodeMeta(card, { testId: cardId, a11y: { role: 'dialog', label: 'Hovercard' } });
      return column(trigger, card);
    },
    subscriptions(model: HovercardModel): Sub<HovercardMsg> {
      const subs: Sub<HovercardMsg>[] = [
        Sub.elementMouse<HovercardMsg>((mouseEvent) => {
          if (mouseEvent.elementId === closeId) {
            if (mouseEvent.handlerTag === dismissTag) return { type: 'dismiss' };
            if (mouseEvent.handlerTag === hoverCloseTag) return { type: 'hover-close' };
            if (mouseEvent.handlerTag === leaveCloseTag) return { type: 'leave-close' };
          }
          if ((mouseEvent.elementId === triggerId || mouseEvent.elementId === cardId) && mouseEvent.handlerTag === enterTag) return { type: 'hover-enter' };
          if ((mouseEvent.elementId === triggerId || mouseEvent.elementId === cardId) && mouseEvent.handlerTag === leaveTag) return { type: 'hover-leave' };
          return { type: 'noop' };
        }),
      ];
      if (model.state === 'pending-show') {
        subs.push(Sub.timer(showDelay, () => ({ type: 'show-tick' })));
      }
      if (model.state === 'pending-hide') {
        subs.push(Sub.timer(hideDelay, () => ({ type: 'hide-tick' })));
      }
      if (model.state === 'open' || model.state === 'pending-hide') {
        subs.push(Sub.key<HovercardMsg>('escape', { type: 'dismiss' }));
        subs.push(Sub.resize((cols) => ({ type: 'resize', cols })));
        subs.push(surfaceContractSubs<HovercardMsg>({ id: surfaceId, onPanic: { type: 'panic' } }));
      }
      return subs.length === 1 ? subs[0]! : Sub.batch<HovercardMsg>(...subs);
    },
  };
}

function enableHovercardTextWrapping(node: VNode): VNode {
  switch (node.kind) {
    case 'text':
      return node.wrap === undefined ? { ...node, wrap: true } : node;
    case 'row':
    case 'column':
    case 'box':
    case 'tabGroup':
      return { ...node, children: node.children.map(enableHovercardTextWrapping) };
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      return { ...node, child: enableHovercardTextWrapping(node.child) };
    case 'component':
      return { ...node, render: (context) => enableHovercardTextWrapping(node.render(context)) };
    case 'memo':
      return { ...node, render: () => enableHovercardTextWrapping(node.render()) };
    case 'suspense':
      return { ...node, child: enableHovercardTextWrapping(node.child), fallback: enableHovercardTextWrapping(node.fallback) };
    default:
      return node;
  }
}
