import type { Color, SemanticTheme, StatusKind, ThemeInput, TokenContract } from '@celestial/core/corona';
import { border, style, visualWidth, wrap } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, flex, layerStack, overlay, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { statusGlyph, statusIcon } from './status-icon.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { useTokens } from './theme.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface ToastTokens {
  text: Color;
  textSoft: Color;
  bg: Color;
  border: Color;
  borderHover: Color;
  hoverBg: Color;
  info: Color;
  success: Color;
  warning: Color;
  error: Color;
}

export const toastContract: TokenContract<ToastTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  bg: (t: SemanticTheme) => t.elevation.floating.surface ?? t.colors.surfaceRaised,
  border: (t: SemanticTheme) => t.elevation.floating.border ?? t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  hoverBg: (t: SemanticTheme) => t.states.hover.bg ?? t.colors.surfaceAlt,
  info: (t: SemanticTheme) => t.colors.tones.info,
  success: (t: SemanticTheme) => t.colors.tones.success,
  warning: (t: SemanticTheme) => t.colors.tones.warning,
  error: (t: SemanticTheme) => t.colors.tones.danger,
};

export type ToastLevel = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  message: string;
  level: ToastLevel;
  duration?: number;
}
export interface ToastEntry {
  id: number;
  message: string;
  level: ToastLevel;
  createdAt: number;
  duration: number;
}
export interface ToastModel {
  toasts: ToastEntry[];
  nextId: number;
  hoveredId?: number | null;
}
export type ToastMsg =
  | Msg<'push', { toast: Toast }>
  | Msg<'dismiss', { id: number }>
  | Msg<'dismiss-latest'>
  | Msg<'hover', { id: number }>
  | Msg<'leave', { id: number }>
  | Msg<'panic'>
  | Msg<'tick'>
  | Msg<'noop'>;

export interface ToastManagerConfig {
  id?: string;
  /** Default corner for source-owned layered rendering. */
  placement?: ToastPlacement;
  width?: number;
  margin?: number;
  zIndex?: number;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export type ToastPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ToastViewOptions {
  width?: number;
}

export interface ToastLayerOptions extends ToastViewOptions {
  placement?: ToastPlacement;
  margin?: number;
  zIndex?: number;
  layoutId?: string;
}

const STATUS_KIND: Record<ToastLevel, StatusKind> = { info: 'info', success: 'success', warning: 'warning', error: 'danger' };

function measureToast(message: string, level: ToastLevel, width: number): { compact: boolean; height: number; lines: string[] } {
  const innerWidth = Math.max(1, width - 4);
  const iconWidth = visualWidth(statusGlyph(STATUS_KIND[level]));
  const fixedRowWidth = iconWidth + 1 + 1 + visualWidth('[x]');
  const compact = innerWidth - fixedRowWidth < 8;
  const messageWidth = Math.max(1, compact ? innerWidth : innerWidth - fixedRowWidth);
  const lines = wrap(message, messageWidth).split('\n');
  return { compact, height: lines.length + (compact ? 3 : 2), lines };
}

export function createToastManager(config: ToastManagerConfig = {}) {
  const surfaceId = config.id ?? generateFocusGroupId('toast-manager');
  const dismissTag = `${surfaceId}:dismiss`;
  const hoverTag = `${surfaceId}:hover`;
  const leaveTag = `${surfaceId}:leave`;

  return {
    init(): [ToastModel, Cmd<ToastMsg>] {
      return [{ toasts: [], nextId: 1, hoveredId: null }, Cmd.none()];
    },
    push(model: ToastModel, toast: Toast): ToastModel {
      const entry: ToastEntry = { id: model.nextId, message: toast.message, level: toast.level, createdAt: Date.now(), duration: toast.duration ?? 3000 };
      return { ...model, toasts: [...model.toasts, entry], nextId: model.nextId + 1 };
    },
    update(msg: ToastMsg, model: ToastModel): [ToastModel, Cmd<ToastMsg>] {
      switch (msg.type) {
        case 'push':
          return [this.push(model, msg.toast), Cmd.none()];
        case 'dismiss':
          return [
            { ...model, toasts: model.toasts.filter((t) => t.id !== msg.id), hoveredId: model.hoveredId === msg.id ? null : model.hoveredId },
            Cmd.none(),
          ];
        case 'dismiss-latest': {
          const latest = model.toasts.at(-1);
          if (!latest) return [model, Cmd.none()];
          return [
            { ...model, toasts: model.toasts.filter((t) => t.id !== latest.id), hoveredId: model.hoveredId === latest.id ? null : model.hoveredId },
            Cmd.none(),
          ];
        }
        case 'hover':
          return [{ ...model, hoveredId: msg.id }, Cmd.none()];
        case 'leave': {
          return [model.hoveredId === msg.id ? { ...model, hoveredId: null } : model, Cmd.none()];
        }
        case 'panic': {
          if (model.toasts.length === 0) return [model, Cmd.none()];
          broadcastSurfacePanic();
          return [{ ...model, toasts: [], hoveredId: null }, Cmd.none()];
        }
        case 'tick': {
          const now = Date.now();
          const toasts = model.toasts.filter((t) => now - t.createdAt < t.duration);
          return [{ ...model, toasts, hoveredId: toasts.some((toast) => toast.id === model.hoveredId) ? model.hoveredId : null }, Cmd.none()];
        }
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: ToastModel, options: ToastViewOptions = {}): VNode {
      if (model.toasts.length === 0) return text('');
      const tokens = useTokens(toastContract, config, 'Toast');
      const width = Math.max(1, Math.floor(options.width ?? config.width ?? 44));
      const levelColors: Record<ToastLevel, Color> = {
        info: tokens.info,
        success: tokens.success,
        warning: tokens.warning,
        error: tokens.error,
      };
      return column(
        ...model.toasts.map((t) => {
          const hovered = model.hoveredId === t.id;
          const close = event(
            `${surfaceId}:dismiss:${t.id}`,
            text('[x]', style({ color: hovered ? tokens.text : tokens.textSoft, background: hovered ? tokens.hoverBg : undefined, bold: hovered })),
            { onClick: dismissTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: `Dismiss ${t.message}`, intent: 'dismiss', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Escape' },
          );
          const measurement = measureToast(t.message, t.level, width);
          const icon = statusIcon({
            kind: STATUS_KIND[t.level],
            color: levelColors[t.level],
            ariaLabel: t.level,
            themeCtx: config.themeCtx,
            theme: config.theme,
          });
          const messageStyle = style({ color: tokens.text });
          const toastContent = measurement.compact
            ? column(row(icon, flex(text(''), { flex: 1, minWidth: 0 }), close), ...measurement.lines.map((line) => text(line, messageStyle)))
            : column(
                row(icon, text(' '), flex(text(measurement.lines[0] ?? '', messageStyle), { flex: 1, minWidth: 1 }), text(' '), close),
                ...measurement.lines
                  .slice(1)
                  .map((line) => row(text(' '.repeat(visualWidth(statusGlyph(STATUS_KIND[t.level])) + 1)), text(line, messageStyle))),
              );
          const toastSurface = box(
            toastContent,
            style({ border: border.rounded, color: hovered ? tokens.borderHover : levelColors[t.level], background: tokens.bg, padding: [0, 1] }),
            { width, fit: 'content', overflow: 'hidden' },
          );
          setVNodeMeta(toastSurface, { a11y: { role: 'status', label: `${t.level}: ${t.message}` } });
          return toastSurface;
        }),
      );
    },
    /** Render the toast stack as a layout-neutral corner layer. */
    layer(base: VNode, model: ToastModel, bounds: { cols: number; rows: number }, options: ToastLayerOptions = {}): VNode {
      if (model.toasts.length === 0) return base;
      const margin = Math.max(0, Math.floor(options.margin ?? config.margin ?? 1));
      const maxWidth = Math.max(1, bounds.cols - margin * 2);
      const width = Math.max(1, Math.min(Math.floor(options.width ?? config.width ?? 44), maxWidth));
      const stackHeight = model.toasts.reduce((sum, toast) => sum + measureToast(toast.message, toast.level, width).height, 0);
      const height = Math.max(1, Math.min(stackHeight, Math.max(1, bounds.rows - margin * 2)));
      const placement = options.placement ?? config.placement ?? 'top-right';
      const x = placement.endsWith('right') ? Math.max(0, bounds.cols - margin - width) : margin;
      const y = placement.startsWith('bottom') ? Math.max(0, bounds.rows - margin - height) : margin;
      return layerStack(
        base,
        overlay(this.view(model, { width }), {
          x,
          y,
          width,
          height,
          zIndex: options.zIndex ?? config.zIndex ?? 60,
          transparent: true,
          layoutId: options.layoutId ?? `toast-layer:${surfaceId}`,
        }),
      );
    },
    subscriptions(model: ToastModel): Sub<ToastMsg> {
      if (model.toasts.length === 0) return Sub.none();
      return Sub.batch(
        Sub.elementMouse<ToastMsg>((mouseEvent) => {
          if (mouseEvent.handlerTag === dismissTag && mouseEvent.elementId.startsWith(`${surfaceId}:dismiss:`)) {
            return { type: 'dismiss', id: Number(mouseEvent.elementId.slice(`${surfaceId}:dismiss:`.length)) };
          }
          if (mouseEvent.handlerTag === hoverTag && mouseEvent.elementId.startsWith(`${surfaceId}:dismiss:`)) {
            return { type: 'hover', id: Number(mouseEvent.elementId.slice(`${surfaceId}:dismiss:`.length)) };
          }
          if (mouseEvent.handlerTag === leaveTag && mouseEvent.elementId.startsWith(`${surfaceId}:dismiss:`)) {
            return { type: 'leave', id: Number(mouseEvent.elementId.slice(`${surfaceId}:dismiss:`.length)) };
          }
          return { type: 'noop' };
        }),
        Sub.timer(500, () => ({ type: 'tick' })),
        Sub.key('escape', { type: 'dismiss-latest' }),
        surfaceContractSubs<ToastMsg>({ id: surfaceId, onPanic: { type: 'panic' } }),
      );
    },
  };
}
