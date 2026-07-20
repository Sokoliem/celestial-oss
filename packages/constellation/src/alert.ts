import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, row, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { statusIcon } from './status-icon.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface AlertTokens {
  text: Color;
  textSoft: Color;
  muted: Color;
  hoverBackground: Color;
  hoverText: Color;
  titleStyle: TypographyToken;
  bodyStyle: TypographyToken;
  captionStyle: TypographyToken;
}

export const alertContract: TokenContract<AlertTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  hoverText: (t: SemanticTheme) => t.states.hover.fg,
  titleStyle: (t: SemanticTheme) => t.typography.title,
  bodyStyle: (t: SemanticTheme) => t.typography.body,
  captionStyle: (t: SemanticTheme) => t.typography.caption,
};

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';
export type AlertSize = 'sm' | 'md' | 'lg';

export interface AlertConfig {
  id?: string;
  title?: string;
  message: string;
  variant?: AlertVariant;
  size?: AlertSize;
  dismissible?: boolean;
  onDismiss?: () => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface AlertModel {
  visible: boolean;
  hoveredDismiss?: boolean;
}

export type AlertMsg = Msg<'dismiss' | 'show' | 'hover-dismiss' | 'leave-dismiss' | 'noop'>;
type Msg<T extends string> = { type: T };

const VARIANT_TONE: Record<AlertVariant, ConstellationTone> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

const SIZE_PADDING: Record<AlertSize, number> = {
  sm: 0,
  md: 1,
  lg: 2,
};

export function alert(config: AlertConfig): ComponentDescriptor<AlertModel, AlertMsg> {
  const variant = config.variant ?? 'info';
  const size = config.size ?? 'md';
  const padding = SIZE_PADDING[size];
  const padStr = ' '.repeat(padding);
  const interactionId = config.id ?? generateFocusGroupId(`alert-${config.title ?? config.message}`);
  const dismissTag = `${interactionId}:dismiss`;
  const hoverTag = `${interactionId}:hover-dismiss`;
  const leaveTag = `${interactionId}:leave-dismiss`;

  return {
    init(): [AlertModel, Cmd<AlertMsg>] {
      return [{ visible: true, hoveredDismiss: false }, Cmd.none()];
    },

    update(msg: AlertMsg, model: AlertModel): [AlertModel, Cmd<AlertMsg>] {
      switch (msg.type) {
        case 'dismiss':
          config.onDismiss?.();
          return [{ visible: false }, Cmd.none()];
        case 'show':
          return [{ visible: true, hoveredDismiss: false }, Cmd.none()];
        case 'hover-dismiss':
          return [{ ...model, hoveredDismiss: true }, Cmd.none()];
        case 'leave-dismiss':
          return [{ ...model, hoveredDismiss: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: AlertModel): VNode {
      if (!model.visible) return text('');

      const tokens = useTokens(alertContract, config, 'Alert');
      const theme = resolveTheme(config);
      const variantColor = theme.colors.tones[VARIANT_TONE[variant]];

      const titleStyle = applyTypography(tokens.titleStyle, { color: variantColor });
      const msgStyle = applyTypography(tokens.bodyStyle);

      const iconKind = variant === 'danger' ? 'danger' : variant;
      const iconText = row(statusIcon({ kind: iconKind, color: variantColor, themeCtx: config.themeCtx, theme: config.theme }), text(' ', titleStyle));
      const titleText = config.title ? row(iconText, text(`${config.title}`, titleStyle)) : iconText;
      const msgText = text(`${padStr}${config.message}`, msgStyle);
      const dismissText = config.dismissible
        ? row(
            text(' ', msgStyle),
            event(
              `${interactionId}:dismiss-control`,
              text(
                '[x]',
                applyTypography(tokens.captionStyle, {
                  color: model.hoveredDismiss ? tokens.hoverText : tokens.textSoft,
                  background: model.hoveredDismiss ? tokens.hoverBackground : undefined,
                  bold: model.hoveredDismiss,
                }),
              ),
              { onClick: dismissTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
              { label: 'Dismiss alert', intent: 'dismiss', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
            ),
          )
        : text('');

      const content = column(titleText, msgText, dismissText);

      return box(content, style({ color: variantColor }));
    },

    subscriptions(model: AlertModel): Sub<AlertMsg> {
      if (!model.visible || !config.dismissible) return Sub.none();
      const mouse = Sub.elementMouse<AlertMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== `${interactionId}:dismiss-control`) return { type: 'noop' };
        if (mouseEvent.handlerTag === dismissTag) return { type: 'dismiss' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover-dismiss' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave-dismiss' };
        return { type: 'noop' };
      });
      return Sub.batch<AlertMsg>(mouse, Sub.key('escape', { type: 'dismiss' }));
    },
  };
}

export interface AlertGroupConfig {
  alerts: AlertConfig[];
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export function alertGroup(config: AlertGroupConfig): ComponentDescriptor<{ visible: boolean[] }, AlertMsg> {
  return {
    init(): [{ visible: boolean[] }, Cmd<AlertMsg>] {
      return [{ visible: config.alerts.map(() => true) }, Cmd.none()];
    },
    update(msg: AlertMsg, model: { visible: boolean[] }): [{ visible: boolean[] }, Cmd<AlertMsg>] {
      if (msg.type === 'dismiss') {
        const newVisible = [...model.visible];
        const firstVisible = newVisible.findIndex((v) => v);
        if (firstVisible !== -1) {
          newVisible[firstVisible] = false;
        }
        return [{ visible: newVisible }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },
    view(model: { visible: boolean[] }): VNode {
      const nodes = config.alerts.map((a, i) =>
        model.visible[i]
          ? alert({ ...a, dismissible: a.dismissible ?? true, themeCtx: config.themeCtx, theme: config.theme }).view({ visible: true })
          : text(''),
      );
      return column(...nodes);
    },
  };
}
