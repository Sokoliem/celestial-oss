import type { Color, SemanticTheme, StatusKind, ThemeInput, TokenContract } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, flex, focus, layerStack, overlay, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth, wrapCellText } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import {
  createNotificationStore,
  type NotificationDiagnostic,
  type NotificationEntry,
  type NotificationLevel,
  type NotificationModel,
  type NotificationStore,
  type NotificationStoreResult,
} from './notification-store.js';
import { statusGlyph } from './status-icon.js';
import { broadcastSurfacePanic, surfaceContractSubs } from './surface-container.js';
import { useTokens } from './theme.js';

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
  text: (theme: SemanticTheme) => theme.colors.text,
  textSoft: (theme: SemanticTheme) => theme.colors.textSoft,
  bg: (theme: SemanticTheme) => theme.elevation.floating.surface ?? theme.colors.surfaceRaised,
  border: (theme: SemanticTheme) => theme.elevation.floating.border ?? theme.colors.border,
  borderHover: (theme: SemanticTheme) => theme.colors.borderHover,
  hoverBg: (theme: SemanticTheme) => theme.states.hover.bg ?? theme.colors.surfaceAlt,
  info: (theme: SemanticTheme) => theme.colors.tones.info,
  success: (theme: SemanticTheme) => theme.colors.tones.success,
  warning: (theme: SemanticTheme) => theme.colors.tones.warning,
  error: (theme: SemanticTheme) => theme.colors.tones.danger,
};

export type ToastLevel = NotificationLevel;

export interface Toast {
  readonly message: string;
  readonly level: ToastLevel;
  /** Milliseconds before dismissal. `null` creates a persistent toast. */
  readonly duration?: number | null;
}

export interface ToastEntry extends NotificationEntry {
  /** Compatibility alias for the canonical `durationMs` field. */
  readonly duration: number | null;
}

/**
 * Compatibility model for the original toast facade.
 *
 * `toasts` is a computed, read-only projection. Canonical state lives only in
 * `entries` plus `visibleToastIds`, so a toast and its inbox entry cannot drift.
 */
export interface ToastModel extends NotificationModel {
  readonly toasts: readonly ToastEntry[];
  /** Compatibility alias for the pointer-owned hover target. */
  readonly hoveredId: number | null;
  /** Pointer and keyboard focus are tracked separately for safe activation. */
  readonly mouseHoveredToastId: number | null;
  readonly focusedToastId: number | null;
}

export interface ToastInteractionState {
  readonly mouseHoveredToastId: number | null;
  readonly focusedToastId: number | null;
}

export type ToastMsg =
  | { readonly type: 'push'; readonly toast: Toast }
  | { readonly type: 'dismiss'; readonly id: number }
  | { readonly type: 'dismiss-latest' }
  | { readonly type: 'hover'; readonly id: number }
  | { readonly type: 'leave'; readonly id: number }
  | { readonly type: 'focus'; readonly id: number | null }
  | { readonly type: 'panic' }
  | { readonly type: 'tick' }
  | { readonly type: 'noop' };

export interface ToastManagerConfig {
  readonly id?: string;
  /** Default corner for source-owned layered rendering. */
  readonly placement?: ToastPlacement;
  readonly width?: number;
  readonly margin?: number;
  readonly zIndex?: number;
  /** Maximum retained notification entries. Defaults to 100. */
  readonly maxToasts?: number;
  /** Maximum simultaneously painted transient toasts. Defaults to 5. */
  readonly maxVisibleToasts?: number;
  /** Default finite toast duration. Defaults to 3000 milliseconds. */
  readonly defaultDurationMs?: number;
  /** Injectable wall clock for deterministic runtimes and tests. */
  readonly now?: () => number;
  /**
   * Canonical store shared with an app shell or notification center.
   *
   * When supplied, `maxToasts`, `defaultDurationMs`, and `now` must be
   * configured on that store rather than repeated here.
   */
  readonly store?: NotificationStore;
  /**
   * `toast` installs Escape and panic ownership for a standalone manager.
   * Use `host` when an app shell owns the unified dismissal precedence.
   */
  readonly dismissalOwner?: 'toast' | 'host';
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export type ToastPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ToastViewOptions {
  readonly width?: number;
}

export interface ToastLayerOptions extends ToastViewOptions {
  readonly placement?: ToastPlacement;
  readonly margin?: number;
  readonly zIndex?: number;
  readonly layoutId?: string;
}

export interface ToastEnqueueValue {
  readonly model: ToastModel;
  readonly entry: ToastEntry;
}

export type ToastEnqueueResult = NotificationStoreResult<ToastEnqueueValue>;
export type ToastProjectionResult = NotificationStoreResult<ToastModel>;

export class ToastValidationError extends TypeError {
  readonly diagnostics: readonly NotificationDiagnostic[];

  constructor(diagnostics: readonly NotificationDiagnostic[]) {
    super(`Invalid toast: ${diagnostics.map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`).join('; ')}`);
    this.name = 'ToastValidationError';
    this.diagnostics = diagnostics;
  }
}

const STATUS_KIND: Record<ToastLevel, StatusKind> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};
const PLACEMENTS = new Set<ToastPlacement>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const TERMINAL_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, message: string): void {
  if (!isRecord(value)) throw new TypeError(message);
}

function configuredPositiveInteger(value: number | undefined, fallback: number, field: string, max = 100_000): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new RangeError(`${field} must be a positive safe integer no greater than ${max}.`);
  }
  return value;
}

function configuredNonNegativeInteger(value: number | undefined, fallback: number, field: string, max = 100_000): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${field} must be a non-negative safe integer no greater than ${max}.`);
  }
  return value;
}

function configuredInteger(value: number | undefined, fallback: number, field: string, min = -100_000, max = 100_000): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${field} must be a safe integer between ${min} and ${max}.`);
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown, field: string, max = 100_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${field} must be a non-negative safe integer no greater than ${max}.`);
  }
  return value;
}

function positiveToastId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer.`);
  }
  return value;
}

function parsedToastId(value: string): number | null {
  if (!/^[1-9][0-9]*$/u.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function configuredPlacement(value: ToastPlacement | undefined, fallback: ToastPlacement): ToastPlacement {
  if (value === undefined) return fallback;
  if (!PLACEMENTS.has(value)) throw new TypeError(`placement must be one of ${[...PLACEMENTS].join(', ')}.`);
  return value;
}

function visibleToastEntries(model: NotificationModel): readonly NotificationEntry[] {
  const byId = new Map(model.entries.map((entry) => [entry.id, entry] as const));
  return model.visibleToastIds.flatMap((id) => {
    const entry = byId.get(id);
    return entry === undefined ? [] : [entry];
  });
}

function toastInteraction(model: NotificationModel): ToastInteractionState {
  const candidate = model as Partial<ToastModel>;
  const mouseHoveredToastId =
    candidate.mouseHoveredToastId === null || (typeof candidate.mouseHoveredToastId === 'number' && Number.isSafeInteger(candidate.mouseHoveredToastId))
      ? candidate.mouseHoveredToastId
      : model.hoveredToastId;
  const focusedToastId =
    candidate.focusedToastId === null || (typeof candidate.focusedToastId === 'number' && Number.isSafeInteger(candidate.focusedToastId))
      ? candidate.focusedToastId
      : null;
  return { mouseHoveredToastId, focusedToastId };
}

function validatedToastInteraction(interaction: ToastInteractionState): ToastInteractionState {
  if (interaction === null || typeof interaction !== 'object') {
    throw new TypeError('Toast interaction state must be an object.');
  }
  for (const field of ['mouseHoveredToastId', 'focusedToastId'] as const) {
    const value = interaction[field];
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new RangeError(`Toast interaction ${field} must be null or a positive safe integer.`);
    }
  }
  return interaction;
}

function toastEntry(entry: NotificationEntry): ToastEntry {
  return Object.freeze({
    ...entry,
    get duration(): number | null {
      return entry.durationMs;
    },
  });
}

function asToastModel(model: NotificationModel, requestedInteraction: ToastInteractionState = toastInteraction(model)): ToastModel {
  const visibleIds = new Set(model.visibleToastIds);
  const mouseHoveredToastId =
    requestedInteraction.mouseHoveredToastId !== null && visibleIds.has(requestedInteraction.mouseHoveredToastId)
      ? requestedInteraction.mouseHoveredToastId
      : null;
  const focusedToastId =
    requestedInteraction.focusedToastId !== null && visibleIds.has(requestedInteraction.focusedToastId) ? requestedInteraction.focusedToastId : null;
  let cachedToasts: readonly ToastEntry[] | undefined;
  const projected = { ...model } as ToastModel;
  Object.defineProperties(projected, {
    toasts: {
      configurable: false,
      enumerable: false,
      get(): readonly ToastEntry[] {
        cachedToasts ??= Object.freeze(visibleToastEntries(model).map(toastEntry));
        return cachedToasts;
      },
    },
    hoveredId: {
      configurable: false,
      enumerable: false,
      get(): number | null {
        return mouseHoveredToastId;
      },
    },
    mouseHoveredToastId: {
      configurable: false,
      enumerable: false,
      value: mouseHoveredToastId,
      writable: false,
    },
    focusedToastId: {
      configurable: false,
      enumerable: false,
      value: focusedToastId,
      writable: false,
    },
  });
  return Object.freeze(projected);
}

function measureToast(message: string, level: ToastLevel, width: number, occurrences: number): { compact: boolean; height: number; lines: string[] } {
  const innerWidth = Math.max(1, width - 4);
  const iconWidth = measureTextWidth(statusGlyph(STATUS_KIND[level]));
  const badge = occurrences > 1 ? ` ×${occurrences}` : '';
  const fixedRowWidth = iconWidth + 1 + measureTextWidth(badge) + 1 + measureTextWidth('[x]');
  const compact = innerWidth - fixedRowWidth < 8;
  const messageWidth = Math.max(1, compact ? innerWidth : innerWidth - fixedRowWidth);
  const lines = wrapCellText(message, messageWidth);
  return { compact, height: lines.length + (compact ? 3 : 2), lines };
}

export function createToastManager(config: ToastManagerConfig = {}) {
  requireRecord(config, 'Toast manager config must be an object.');
  const width = configuredPositiveInteger(config.width, 44, 'width');
  const margin = configuredNonNegativeInteger(config.margin, 1, 'margin');
  const maxVisibleToasts = configuredPositiveInteger(config.maxVisibleToasts, 5, 'maxVisibleToasts', 1_000);
  const placement = configuredPlacement(config.placement, 'top-right');
  const zIndex = configuredInteger(config.zIndex, 60, 'zIndex');
  if (
    config.id !== undefined
    && (typeof config.id !== 'string' || config.id.trim().length === 0 || TERMINAL_CONTROL.test(config.id))
  ) {
    throw new TypeError('id must be non-empty printable text.');
  }
  if (config.dismissalOwner !== undefined && config.dismissalOwner !== 'toast' && config.dismissalOwner !== 'host') {
    throw new TypeError('dismissalOwner must be "toast" or "host".');
  }
  if (
    config.store !== undefined &&
    (!config.store ||
      typeof config.store.init !== 'function' ||
      typeof config.store.validateModel !== 'function' ||
      typeof config.store.enqueue !== 'function' ||
      typeof config.store.hoverToast !== 'function' ||
      typeof config.store.leaveToast !== 'function' ||
      typeof config.store.hideToast !== 'function' ||
      typeof config.store.hideLatestToast !== 'function' ||
      typeof config.store.tick !== 'function' ||
      typeof config.store.panic !== 'function')
  ) {
    throw new TypeError('store must be a NotificationStore.');
  }
  if (
    config.store !== undefined &&
    (config.maxToasts !== undefined || config.defaultDurationMs !== undefined || config.now !== undefined)
  ) {
    throw new TypeError('Configure maxToasts, defaultDurationMs, and now on the injected store, not on the toast facade.');
  }

  const store =
    config.store ??
    createNotificationStore({
      maxEntries: config.maxToasts,
      defaultDurationMs: config.defaultDurationMs,
      now: config.now,
    });
  const surfaceId = config.id ?? generateFocusGroupId('toast-manager');
  const dismissTag = `${surfaceId}:dismiss`;
  const hoverTag = `${surfaceId}:hover`;
  const leaveTag = `${surfaceId}:leave`;
  const focusPrefix = `${surfaceId}:dismiss-focus:`;
  const ownsDismissal = (config.dismissalOwner ?? 'toast') === 'toast';

  const validateCanonical = (model: NotificationModel): NotificationStoreResult<NotificationModel> => {
    const validated = store.validateModel(model);
    if (!validated.ok) return validated;
    return { ok: true, value: validated.value };
  };

  const canonicalToastOrThrow = (model: NotificationModel): ToastModel => {
    const validated = validateCanonical(model);
    if (!validated.ok) throw new ToastValidationError(validated.diagnostics);
    return asToastModel(validated.value, toastInteraction(model));
  };

  const reconcileInteraction = (
    model: NotificationModel,
    requestedInteraction: ToastInteractionState,
  ): NotificationStoreResult<ToastModel> => {
    const validated = validateCanonical(model);
    if (!validated.ok) return validated;
    const projected = asToastModel(validated.value, requestedInteraction);
    const desiredPausedId = projected.focusedToastId ?? projected.mouseHoveredToastId;
    const transition =
      desiredPausedId !== null
        ? store.hoverToast(projected, desiredPausedId)
        : projected.hoveredToastId === null
          ? ({ ok: true, value: projected } as const)
          : store.leaveToast(projected, projected.hoveredToastId);
    if (!transition.ok) return transition;
    return { ok: true, value: asToastModel(transition.value, requestedInteraction) };
  };

  const unwrapClocked = (
    result: NotificationStoreResult<NotificationModel>,
    interaction: ToastInteractionState,
  ): ToastModel => {
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    return asToastModel(result.value, interaction);
  };

  const reconcileOrThrow = (model: NotificationModel, interaction: ToastInteractionState): ToastModel => {
    const result = reconcileInteraction(model, interaction);
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    return result.value;
  };

  const enqueue = (model: ToastModel, toast: Toast): ToastEnqueueResult => {
    if (!isRecord(toast as unknown)) {
      const invalid = store.enqueue(model, toast as never);
      if (!invalid.ok) return invalid;
      throw new TypeError('Toast input must be an object.');
    }
    const result = store.enqueue(model, {
      message: toast.message,
      level: toast.level,
      delivery: 'toast',
      ...(toast.duration === undefined ? {} : { durationMs: toast.duration }),
    });
    if (!result.ok) return result;
    return {
      ok: true,
      value: {
        model: asToastModel(result.value.model, toastInteraction(model)),
        entry: toastEntry(result.value.entry),
      },
    };
  };

  const push = (model: ToastModel, toast: Toast): ToastModel => {
    const result = enqueue(model, toast);
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    return result.value.model;
  };

  const view = (model: ToastModel, options: ToastViewOptions = {}): VNode => {
    requireRecord(options, 'Toast view options must be an object.');
    model = canonicalToastOrThrow(model);
    const toasts = visibleToastEntries(model).slice(-maxVisibleToasts);
    if (toasts.length === 0) return text('');
    const tokens = useTokens(toastContract, config, 'Toast');
    const viewWidth = configuredPositiveInteger(options.width, width, 'view.width');
    const levelColors: Record<ToastLevel, Color> = {
      info: tokens.info,
      success: tokens.success,
      warning: tokens.warning,
      error: tokens.error,
    };

    return column(
      ...toasts.map((entry) => {
        const hovered = model.mouseHoveredToastId === entry.id || model.focusedToastId === entry.id;
        const closeId = `${surfaceId}:dismiss:${entry.id}`;
        const toastId = `${surfaceId}:toast:${entry.id}`;
        const close = event(
          closeId,
          focus(
            `${focusPrefix}${entry.id}`,
            text('[x]', style({ color: hovered ? tokens.text : tokens.textSoft, background: hovered ? tokens.hoverBg : undefined, bold: hovered })),
          ),
          { onClick: dismissTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          {
            label: `Dismiss ${entry.message}`,
            intent: 'dismiss',
            affordances: ['hover', 'click'],
            cursor: 'pointer',
            keyboardHint: 'Enter, Space, or Escape',
          },
        );
        setVNodeMeta(close, { a11y: { role: 'button', label: `Dismiss ${entry.message}` } });

        const measurement = measureToast(entry.message, entry.level, viewWidth, entry.occurrences);
        const icon = text(statusGlyph(STATUS_KIND[entry.level]), style({ color: levelColors[entry.level] }));
        const badge = entry.occurrences > 1 ? ` ×${entry.occurrences}` : '';
        const messageStyle = style({ color: tokens.text });
        const toastContent = measurement.compact
          ? column(
              row(icon, text(badge, style({ color: tokens.textSoft })), flex(text(''), { flex: 1, minWidth: 0 }), close),
              ...measurement.lines.map((line) => text(line, messageStyle)),
            )
          : column(
              row(
                icon,
                text(' '),
                flex(text(measurement.lines[0] ?? '', messageStyle), { flex: 1, minWidth: 1 }),
                text(badge, style({ color: tokens.textSoft })),
                text(' '),
                close,
              ),
              ...measurement.lines
                .slice(1)
                .map((line) => row(text(' '.repeat(measureTextWidth(statusGlyph(STATUS_KIND[entry.level])) + 1)), text(line, messageStyle))),
            );
        const toastSurface = box(
          toastContent,
          style({
            border: border.rounded,
            color: hovered ? tokens.borderHover : levelColors[entry.level],
            background: tokens.bg,
            padding: [0, 1],
          }),
          { width: viewWidth, fit: 'content', overflow: 'hidden' },
        );
        const repeated = entry.occurrences > 1 ? `, repeated ${entry.occurrences} times` : '';
        setVNodeMeta(toastSurface, {
          a11y: {
            role: entry.level === 'error' ? 'alert' : 'status',
            label: `${entry.level}: ${entry.message}${repeated}`,
            live: entry.level === 'error' ? 'assertive' : 'polite',
          },
        });
        return event(
          toastId,
          toastSurface,
          { onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          {
            label: `${entry.level} notification: ${entry.message}`,
            affordances: ['hover'],
          },
        );
      }),
    );
  };

  return {
    getInteraction(model: NotificationModel): ToastInteractionState {
      const projected = canonicalToastOrThrow(model);
      return Object.freeze({
        mouseHoveredToastId: projected.mouseHoveredToastId,
        focusedToastId: projected.focusedToastId,
      });
    },

    /**
     * Reattach facade-only interaction after another shared-store projection
     * (for example the notification center) returns a canonical model.
     */
    project(model: NotificationModel, interaction: ToastInteractionState = toastInteraction(model)): ToastProjectionResult {
      return reconcileInteraction(model, validatedToastInteraction(interaction));
    },

    init(seed?: NotificationModel): [ToastModel, Cmd<ToastMsg>] {
      const initial = store.init(seed);
      return [asToastModel(initial, seed === undefined ? { mouseHoveredToastId: null, focusedToastId: null } : toastInteraction(seed)), Cmd.none()];
    },

    enqueue,
    push,

    update(msg: ToastMsg, model: ToastModel): [ToastModel, Cmd<ToastMsg>] {
      if (!isRecord(msg as unknown) || typeof msg.type !== 'string') {
        throw new TypeError('Toast message must be an object with a string type.');
      }
      model = canonicalToastOrThrow(model);
      switch (msg.type) {
        case 'push':
          return [push(model, msg.toast), Cmd.none()];
        case 'dismiss': {
          positiveToastId(msg.id, 'Toast dismiss id');
          const interaction = toastInteraction(model);
          return [
            reconcileOrThrow(store.hideToast(model, msg.id), {
              mouseHoveredToastId: interaction.mouseHoveredToastId === msg.id ? null : interaction.mouseHoveredToastId,
              focusedToastId: interaction.focusedToastId === msg.id ? null : interaction.focusedToastId,
            }),
            Cmd.none(),
          ];
        }
        case 'dismiss-latest': {
          const latest = model.visibleToastIds.at(-1);
          if (latest === undefined) return [asToastModel(model, toastInteraction(model)), Cmd.none()];
          const interaction = toastInteraction(model);
          return [
            reconcileOrThrow(store.hideLatestToast(model), {
              mouseHoveredToastId: interaction.mouseHoveredToastId === latest ? null : interaction.mouseHoveredToastId,
              focusedToastId: interaction.focusedToastId === latest ? null : interaction.focusedToastId,
            }),
            Cmd.none(),
          ];
        }
        case 'hover': {
          positiveToastId(msg.id, 'Toast hover id');
          if (!model.visibleToastIds.includes(msg.id)) return [asToastModel(model, toastInteraction(model)), Cmd.none()];
          const interaction = { ...toastInteraction(model), mouseHoveredToastId: msg.id };
          return [reconcileOrThrow(model, interaction), Cmd.none()];
        }
        case 'leave': {
          positiveToastId(msg.id, 'Toast leave id');
          const current = toastInteraction(model);
          if (current.mouseHoveredToastId !== msg.id) return [asToastModel(model, current), Cmd.none()];
          return [reconcileOrThrow(model, { ...current, mouseHoveredToastId: null }), Cmd.none()];
        }
        case 'focus': {
          if (msg.id !== null) positiveToastId(msg.id, 'Toast focus id');
          const current = toastInteraction(model);
          const focusedToastId = msg.id !== null && model.visibleToastIds.includes(msg.id) ? msg.id : null;
          return [reconcileOrThrow(model, { ...current, focusedToastId }), Cmd.none()];
        }
        case 'panic': {
          if (model.visibleToastIds.length === 0) return [asToastModel(model), Cmd.none()];
          broadcastSurfacePanic();
          return [asToastModel(store.panic(model), { mouseHoveredToastId: null, focusedToastId: null }), Cmd.none()];
        }
        case 'tick':
          return [unwrapClocked(store.tick(model), toastInteraction(model)), Cmd.none()];
        case 'noop':
          return [asToastModel(model, toastInteraction(model)), Cmd.none()];
        default:
          throw new RangeError(`Unknown toast message type "${String((msg as { type: unknown }).type)}".`);
      }
    },

    view,

    /** Render the toast stack as a layout-neutral corner layer. */
    layer(base: VNode, model: ToastModel, bounds: { cols: number; rows: number }, options: ToastLayerOptions = {}): VNode {
      requireRecord(bounds, 'Toast layer bounds must be an object.');
      requireRecord(options, 'Toast layer options must be an object.');
      model = canonicalToastOrThrow(model);
      const entries = visibleToastEntries(model).slice(-maxVisibleToasts);
      if (entries.length === 0) return base;
      const cols = requiredNonNegativeInteger(bounds.cols, 'Toast layer bounds.cols');
      const rows = requiredNonNegativeInteger(bounds.rows, 'Toast layer bounds.rows');
      if (cols === 0 || rows === 0) return base;
      const layerMargin = Math.min(configuredNonNegativeInteger(options.margin, margin, 'layer.margin'), Math.floor(Math.min(cols, rows) / 2));
      const maxWidth = Math.max(1, cols - layerMargin * 2);
      const layerWidth = Math.min(configuredPositiveInteger(options.width, width, 'layer.width'), maxWidth);
      const stackHeight = entries.reduce(
        (sum, entry) => sum + measureToast(entry.message, entry.level, layerWidth, entry.occurrences).height,
        0,
      );
      const height = Math.max(1, Math.min(stackHeight, Math.max(1, rows - layerMargin * 2)));
      const layerPlacement = configuredPlacement(options.placement, placement);
      const x = layerPlacement.endsWith('right') ? Math.max(0, cols - layerMargin - layerWidth) : layerMargin;
      const y = layerPlacement.startsWith('bottom') ? Math.max(0, rows - layerMargin - height) : layerMargin;
      const layerZIndex = configuredInteger(options.zIndex, zIndex, 'layer.zIndex');
      return layerStack(
        base,
        overlay(view(model, { width: layerWidth }), {
          x,
          y,
          width: layerWidth,
          height,
          zIndex: layerZIndex,
          transparent: true,
          layoutId: options.layoutId ?? `toast-layer:${surfaceId}`,
        }),
      );
    },

    subscriptions(model: ToastModel): Sub<ToastMsg> {
      model = canonicalToastOrThrow(model);
      if (model.visibleToastIds.length === 0) return Sub.none();
      const interaction = Sub.batch(
        Sub.elementMouse<ToastMsg>((mouseEvent) => {
          if (mouseEvent.handlerTag === dismissTag && mouseEvent.elementId.startsWith(`${surfaceId}:dismiss:`)) {
            const id = parsedToastId(mouseEvent.elementId.slice(`${surfaceId}:dismiss:`.length));
            return id === null ? { type: 'noop' } : { type: 'dismiss', id };
          }
          const hoveredPrefix = mouseEvent.elementId.startsWith(`${surfaceId}:toast:`)
            ? `${surfaceId}:toast:`
            : mouseEvent.elementId.startsWith(`${surfaceId}:dismiss:`)
              ? `${surfaceId}:dismiss:`
              : null;
          if (mouseEvent.handlerTag === hoverTag && hoveredPrefix !== null) {
            const id = parsedToastId(mouseEvent.elementId.slice(hoveredPrefix.length));
            return id === null ? { type: 'noop' } : { type: 'hover', id };
          }
          if (mouseEvent.handlerTag === leaveTag && hoveredPrefix !== null) {
            const id = parsedToastId(mouseEvent.elementId.slice(hoveredPrefix.length));
            return id === null ? { type: 'noop' } : { type: 'leave', id };
          }
          return { type: 'noop' };
        }),
        Sub.focus<ToastMsg>((focusedId) => {
          const id = focusedId?.startsWith(focusPrefix) ? parsedToastId(focusedId.slice(focusPrefix.length)) : null;
          return { type: 'focus', id };
        }),
        Sub.timer(500, () => ({ type: 'tick' })),
        ...(model.focusedToastId === null
          ? []
          : [
              Sub.key<ToastMsg>('enter', { type: 'dismiss', id: model.focusedToastId }),
              Sub.key<ToastMsg>('space', { type: 'dismiss', id: model.focusedToastId }),
            ]),
      );
      if (!ownsDismissal) return interaction;
      return Sub.batch(
        interaction,
        Sub.key('escape', { type: 'dismiss-latest' }),
        surfaceContractSubs<ToastMsg>({ id: surfaceId, onPanic: { type: 'panic' } }),
      );
    },
  };
}
