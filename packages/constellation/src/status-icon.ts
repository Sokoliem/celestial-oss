/**
 * `statusIcon` — semantic status indicator (success / warning / danger / info /
 * pending / offline / queued / neutral). Resolves to the best glyph for the
 * active atlas-detected unicode level via corona's `statusGlyphTokens`, paired
 * with the matching `statusTokens` color.
 *
 * Pure view helper — no state, no subscriptions. Composed by alert, async-
 * button, notification, avatar, chip, checkbox, captcha, drawer.
 */

import {
  type Color,
  type GlyphLevel,
  resolveDomainTokens,
  resolveGlyph,
  type SemanticTheme,
  type StatusKind,
  type StyleProps,
  statusGlyphTokens,
  statusTokens,
  style,
  type ThemeInput,
} from '@celestial/core/corona';
import { setVNodeMeta, type ThemeContext, text, type VNode } from '@celestial/core/nebula';
import { resolveTheme } from './theme.js';

export type StatusIconTone = 'solid' | 'soft' | 'outline';

export interface StatusIconConfig {
  readonly kind: StatusKind;
  /** Unicode level. Defaults to 'wide'. */
  readonly level?: GlyphLevel;
  /** Visual tone. Defaults to 'solid'. */
  readonly tone?: StatusIconTone;
  /** Accessible label. Falls back to a stable string per kind. */
  readonly ariaLabel?: string;
  /** Optional explicit color override. */
  readonly color?: Color;
  /** Style overrides merged in after color/tone. */
  readonly styleOverrides?: Partial<StyleProps>;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

const ARIA_LABELS: Record<StatusKind, string> = {
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  info: 'Information',
  pending: 'Pending',
  offline: 'Offline',
  queued: 'Queued',
  neutral: 'Neutral',
};

function statusColor(kind: StatusKind, theme: SemanticTheme): Color {
  const tokens = resolveDomainTokens(statusTokens, theme);
  switch (kind) {
    case 'success':
      return tokens.success;
    case 'warning':
      return tokens.warning;
    case 'danger':
      return tokens.danger;
    case 'info':
      return tokens.info;
    case 'pending':
      return tokens.pending;
    case 'offline':
    case 'neutral':
    case 'queued':
    default:
      return theme.colors.muted;
  }
}

/**
 * Resolve a status kind to its glyph string for the given unicode level.
 * Exposed for callers that need the raw string (badges, snapshot tests).
 */
export function statusGlyph(kind: StatusKind, level: GlyphLevel = 'wide'): string {
  return resolveGlyph(statusGlyphTokens[kind], level);
}

export function statusIcon(config: StatusIconConfig): VNode {
  const level = config.level ?? 'wide';
  const tone = config.tone ?? 'solid';
  const theme = resolveTheme(config);
  const color = config.color ?? statusColor(config.kind, theme);
  const glyph = statusGlyph(config.kind, level);
  const node = text(glyph, style({ color, dim: tone === 'soft', ...config.styleOverrides }));
  const label = config.ariaLabel ?? ARIA_LABELS[config.kind];
  setVNodeMeta(node, { testId: `status-icon-${config.kind}`, a11y: { role: 'status', label } });
  return node;
}
