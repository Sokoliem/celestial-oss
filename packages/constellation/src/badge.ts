import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, event, row, Sub, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import type { ConstellationTone } from './theme.js';
import { applyTypography, resolveTheme, useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface BadgeTokens {
  text: Color;
  textSoft: Color;
  hoverBackground: Color;
  labelStyle: TypographyToken;
}

export const badgeContract: TokenContract<BadgeTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  hoverBackground: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeConfig {
  id?: string;
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  onClick?: () => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export interface BadgeModel {
  visible: boolean;
  hovered?: boolean;
}

export type BadgeMsg = Msg<'click' | 'hover' | 'leave' | 'noop'>;
type Msg<T extends string> = { type: T };

const VARIANT_DECORATORS: Record<BadgeVariant, { prefix: string; suffix: string }> = {
  default: { prefix: '[', suffix: ']' },
  success: { prefix: '[', suffix: ']' },
  warning: { prefix: '[', suffix: ']' },
  danger: { prefix: '[', suffix: ']' },
  info: { prefix: '[', suffix: ']' },
};

const VARIANT_TONE: Record<BadgeVariant, ConstellationTone> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
};

const SIZE_PREFIX: Record<BadgeSize, string> = {
  sm: '',
  md: ' ',
  lg: '  ',
};

const SIZE_SUFFIX: Record<BadgeSize, string> = {
  sm: '',
  md: ' ',
  lg: '  ',
};

const PULSE_CHARS = ['◐', '◓', '◑', '◒'];

export function badge(config: BadgeConfig): ComponentDescriptor<BadgeModel, BadgeMsg> {
  const variant = config.variant && config.variant in VARIANT_DECORATORS ? config.variant : 'default';
  const size = config.size === 'sm' || config.size === 'lg' ? config.size : 'md';
  const decorators = VARIANT_DECORATORS[variant];
  const pulseIndex = 0;
  const label = String(config.label);
  const pulse = Boolean(config.pulse);
  const onClick = config.onClick;
  const interactionId = config.id ? String(config.id) : generateFocusGroupId(`badge-${label}`);
  const clickTag = `${interactionId}:click`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  return {
    init(): [BadgeModel, Cmd<BadgeMsg>] {
      return [{ visible: true, hovered: false }, Cmd.none()];
    },

    update(msg: BadgeMsg, model: BadgeModel): [BadgeModel, Cmd<BadgeMsg>] {
      switch (msg.type) {
        case 'click':
          onClick?.();
          return [model, Cmd.none()];
        case 'hover':
          return [{ ...model, hovered: true }, Cmd.none()];
        case 'leave':
          return [{ ...model, hovered: false }, Cmd.none()];
      }
      return [model, Cmd.none()];
    },

    view(model: BadgeModel): VNode {
      if (!model.visible) return text('');

      const tokens = useTokens(badgeContract, config, 'Badge');
      const theme = resolveTheme(config);
      const badgeColor = theme.colors.tones[VARIANT_TONE[variant]];

      const labelStr = pulse
        ? `${SIZE_PREFIX[size]}${PULSE_CHARS[pulseIndex % 4]} ${label}${SIZE_SUFFIX[size]}`
        : `${SIZE_PREFIX[size]}${decorators.prefix}${label}${decorators.suffix}${SIZE_SUFFIX[size]}`;

      const badgeNode = text(
        labelStr,
        applyTypography(tokens.labelStyle, {
          color: model.hovered ? tokens.text : badgeColor,
          background: model.hovered ? tokens.hoverBackground : undefined,
        }),
      );

      if (!onClick) return badgeNode;
      return event(
        interactionId,
        badgeNode,
        { onClick: clickTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label, intent: 'activate', affordances: ['hover', 'click'], cursor: 'pointer' },
      );
    },

    subscriptions(): Sub<BadgeMsg> {
      if (!onClick) return Sub.none();
      return Sub.elementMouse<BadgeMsg>((mouseEvent) => {
        if (mouseEvent.elementId !== interactionId) return { type: 'noop' };
        if (mouseEvent.handlerTag === clickTag) return { type: 'click' };
        if (mouseEvent.handlerTag === hoverTag) return { type: 'hover' };
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
    },
  };
}

export interface BadgeGroupConfig {
  badges: Array<{ label: string; variant?: BadgeVariant }>;
  size?: BadgeSize;
  onBadgeClick?: (index: number) => void;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export function badgeGroup(config: BadgeGroupConfig): VNode {
  const nodes = config.badges.map((b) =>
    badge({ label: b.label, variant: b.variant, size: config.size, themeCtx: config.themeCtx, theme: config.theme }).view({ visible: true }),
  );
  return row(...nodes);
}
