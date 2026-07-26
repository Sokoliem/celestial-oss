import type { Color, SemanticTheme, StatusKind, ThemeInput, TokenContract } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { box, Cmd, column, event, flex, focus, layerStack, overlay, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth, wrapCellText } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import {
  createNotificationStore,
  isNotificationStore,
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

const MAX_TOAST_VALIDATION_DIAGNOSTICS = 100;
const MAX_TOAST_VALIDATION_ERROR_LENGTH = 4_096;

function toastValidationErrorMessage(diagnostics: readonly NotificationDiagnostic[]): string {
  let message = 'Invalid toast: ';
  const bounded = diagnostics.slice(0, MAX_TOAST_VALIDATION_DIAGNOSTICS);
  for (const [index, diagnostic] of bounded.entries()) {
    const separator = index === 0 ? '' : '; ';
    const detail = `${diagnostic.field}: ${diagnostic.message}`;
    const remaining = MAX_TOAST_VALIDATION_ERROR_LENGTH - message.length - separator.length;
    if (remaining <= 1) return `${message.slice(0, MAX_TOAST_VALIDATION_ERROR_LENGTH - 1)}…`;
    if (detail.length > remaining) return `${message}${separator}${detail.slice(0, remaining - 1)}…`;
    message += `${separator}${detail}`;
  }
  if (diagnostics.length > bounded.length) {
    const suffix = `; ${String(diagnostics.length - bounded.length)} additional diagnostics omitted`;
    if (message.length + suffix.length > MAX_TOAST_VALIDATION_ERROR_LENGTH) {
      return `${message.slice(0, MAX_TOAST_VALIDATION_ERROR_LENGTH - 1)}…`;
    }
    message += suffix;
  }
  return message;
}

export class ToastValidationError extends TypeError {
  readonly diagnostics: readonly NotificationDiagnostic[];

  constructor(diagnostics: readonly NotificationDiagnostic[]) {
    const boundedDiagnostics = Object.freeze(diagnostics.slice(0, MAX_TOAST_VALIDATION_DIAGNOSTICS));
    super(toastValidationErrorMessage(diagnostics));
    this.name = 'ToastValidationError';
    this.diagnostics = boundedDiagnostics;
  }
}

const STATUS_KIND: Record<ToastLevel, StatusKind> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'danger',
};
const PLACEMENTS = new Set<ToastPlacement>(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const TERMINAL_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const MAX_DIAGNOSTIC_QUOTE_LENGTH = 1_024;
const MAX_TOAST_SURFACE_ID_LENGTH = 256;
const MAX_TOAST_ELEMENT_ID_LENGTH = 512;

function boundedDiagnosticQuote(input: string): string {
  let output = '"';
  let truncated = false;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const next = input.charCodeAt(index + 1);
    let chunk: string;
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      chunk = input.slice(index, index + 2);
      index += 1;
    } else if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      chunk = `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (code === 0x22) {
      chunk = '\\"';
    } else if (code === 0x5c) {
      chunk = '\\\\';
    } else {
      chunk = input[index]!;
    }
    if (output.length + chunk.length > MAX_DIAGNOSTIC_QUOTE_LENGTH - 2) {
      truncated = true;
      break;
    }
    output += chunk;
  }
  return `${output}${truncated ? '…' : ''}"`;
}

function snapshotOwnDataRecord(value: unknown, label: string): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError(`${label} must be an object.`);
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > 1_000) {
      throw new RangeError(`${label} must not define more than 1000 properties.`);
    }
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== 'string') {
        throw new TypeError(`${label} must not define symbol properties.`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError(`${label}.${key} must be an own data property.`);
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch (error) {
    if (error instanceof TypeError && typeof error.message === 'string' && error.message.startsWith(label)) {
      throw error;
    }
    throw new TypeError(`${label} could not be inspected.`);
  }
}

function ownDataValue(value: object, key: string, label: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return undefined;
    if (!('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an own data property.`);
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof TypeError && typeof error.message === 'string' && error.message.startsWith(label)) {
      throw error;
    }
    throw new TypeError(`${label} could not be inspected.`);
  }
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
  if (value.length > 16) return null;
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
  const snapshot = snapshotOwnDataRecord(interaction, 'Toast interaction state');
  for (const field of ['mouseHoveredToastId', 'focusedToastId'] as const) {
    const value = snapshot[field];
    if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)) {
      throw new RangeError(`Toast interaction ${field} must be null or a positive safe integer.`);
    }
  }
  return Object.freeze({
    mouseHoveredToastId: snapshot.mouseHoveredToastId as number | null,
    focusedToastId: snapshot.focusedToastId as number | null,
  });
}

function snapshotModelInteraction(model: NotificationModel, canonical: NotificationModel): ToastInteractionState {
  const mouseHoveredCandidate = ownDataValue(model, 'mouseHoveredToastId', 'Toast model');
  const focusedCandidate = ownDataValue(model, 'focusedToastId', 'Toast model');
  return validatedToastInteraction({
    mouseHoveredToastId: mouseHoveredCandidate === undefined ? canonical.hoveredToastId : (mouseHoveredCandidate as number | null),
    focusedToastId: focusedCandidate === undefined ? null : (focusedCandidate as number | null),
  });
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
  config = Object.freeze(snapshotOwnDataRecord(config, 'Toast manager config')) as unknown as ToastManagerConfig;
  const width = configuredPositiveInteger(config.width, 44, 'width');
  const margin = configuredNonNegativeInteger(config.margin, 1, 'margin');
  const maxVisibleToasts = configuredPositiveInteger(config.maxVisibleToasts, 5, 'maxVisibleToasts', 1_000);
  const placement = configuredPlacement(config.placement, 'top-right');
  const zIndex = configuredInteger(config.zIndex, 60, 'zIndex');
  if (
    config.id !== undefined
    && (
      typeof config.id !== 'string'
      || config.id.length > MAX_TOAST_SURFACE_ID_LENGTH
      || config.id.trim().length === 0
      || TERMINAL_CONTROL.test(config.id)
    )
  ) {
    throw new TypeError(
      `id must be non-empty printable text of at most ${String(MAX_TOAST_SURFACE_ID_LENGTH)} characters.`,
    );
  }
  if (config.dismissalOwner !== undefined && config.dismissalOwner !== 'toast' && config.dismissalOwner !== 'host') {
    throw new TypeError('dismissalOwner must be "toast" or "host".');
  }
  const injectedStore = config.store;
  if (injectedStore !== undefined && !isNotificationStore(injectedStore)) {
    throw new TypeError('store must be a NotificationStore.');
  }
  if (
    config.store !== undefined &&
    (config.maxToasts !== undefined || config.defaultDurationMs !== undefined || config.now !== undefined)
  ) {
    throw new TypeError('Configure maxToasts, defaultDurationMs, and now on the injected store, not on the toast facade.');
  }

  const store =
    injectedStore ??
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

  const paintedToastEntries = (model: NotificationModel): readonly NotificationEntry[] =>
    visibleToastEntries(model).slice(-maxVisibleToasts);

  const paintedToastIds = (model: NotificationModel): ReadonlySet<number> =>
    new Set(paintedToastEntries(model).map((entry) => entry.id));

  const clampInteractionToPaintedToasts = (
    model: NotificationModel,
    interaction: ToastInteractionState,
  ): ToastInteractionState => {
    const paintedIds = paintedToastIds(model);
    return Object.freeze({
      mouseHoveredToastId:
        interaction.mouseHoveredToastId !== null && paintedIds.has(interaction.mouseHoveredToastId)
          ? interaction.mouseHoveredToastId
          : null,
      focusedToastId:
        interaction.focusedToastId !== null && paintedIds.has(interaction.focusedToastId)
          ? interaction.focusedToastId
          : null,
    });
  };

  const projectToastModel = (
    model: NotificationModel,
    interaction: ToastInteractionState,
  ): ToastModel =>
    asToastModel(model, clampInteractionToPaintedToasts(model, interaction));

  const validateCanonical = (model: NotificationModel): NotificationStoreResult<NotificationModel> => {
    const validated = store.validateModel(model);
    if (!validated.ok) return validated;
    return { ok: true, value: validated.value };
  };

  const canonicalToastOrThrow = (model: NotificationModel): ToastModel => {
    const validated = validateCanonical(model);
    if (!validated.ok) throw new ToastValidationError(validated.diagnostics);
    return projectToastModel(
      validated.value,
      snapshotModelInteraction(model, validated.value),
    );
  };

  const reconcileInteraction = (
    model: NotificationModel,
    requestedInteraction: ToastInteractionState,
  ): NotificationStoreResult<ToastModel> => {
    const validated = validateCanonical(model);
    if (!validated.ok) return validated;
    const boundedInteraction = clampInteractionToPaintedToasts(
      validated.value,
      requestedInteraction,
    );
    const projected = asToastModel(validated.value, boundedInteraction);
    const desiredPausedId = projected.focusedToastId ?? projected.mouseHoveredToastId;
    const transition =
      desiredPausedId !== null
        ? store.hoverToast(projected, desiredPausedId)
        : projected.hoveredToastId === null
          ? ({ ok: true, value: projected } as const)
          : store.leaveToast(projected, projected.hoveredToastId);
    if (!transition.ok) return transition;
    return {
      ok: true,
      value: asToastModel(transition.value, boundedInteraction),
    };
  };

  const unwrapClocked = (
    result: NotificationStoreResult<NotificationModel>,
    interaction: ToastInteractionState,
  ): ToastModel => {
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    const reconciled = reconcileInteraction(result.value, interaction);
    if (!reconciled.ok) throw new ToastValidationError(reconciled.diagnostics);
    return reconciled.value;
  };

  const reconcileOrThrow = (model: NotificationModel, interaction: ToastInteractionState): ToastModel => {
    const result = reconcileInteraction(model, interaction);
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    return result.value;
  };

  const enqueue = (model: ToastModel, toast: Toast): ToastEnqueueResult => {
    const validated = validateCanonical(model);
    if (!validated.ok) return validated;
    const requestedInteraction = snapshotModelInteraction(model, validated.value);
    let toastSnapshot: Record<string, unknown>;
    try {
      toastSnapshot = snapshotOwnDataRecord(toast, 'Toast input');
    } catch {
      const invalid = store.enqueue(validated.value, null as never);
      if (!invalid.ok) return invalid;
      throw new TypeError('Toast input must be an object.');
    }
    const result = store.enqueue(validated.value, {
      message: toastSnapshot.message as string,
      level: toastSnapshot.level as ToastLevel,
      delivery: 'toast',
      ...(toastSnapshot.duration === undefined ? {} : { durationMs: toastSnapshot.duration as number | null }),
    });
    if (!result.ok) return result;
    const reconciled = reconcileInteraction(result.value.model, requestedInteraction);
    if (!reconciled.ok) return reconciled;
    return {
      ok: true,
      value: {
        model: reconciled.value,
        entry: toastEntry(result.value.entry),
      },
    };
  };

  const push = (model: ToastModel, toast: Toast): ToastModel => {
    const result = enqueue(model, toast);
    if (!result.ok) throw new ToastValidationError(result.diagnostics);
    return result.value.model;
  };

  const renderToastEntries = (
    model: ToastModel,
    toasts: readonly NotificationEntry[],
    viewWidth: number,
  ): VNode => {
    if (toasts.length === 0) return text('');
    const tokens = useTokens(toastContract, config, 'Toast');
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

  const view = (model: ToastModel, options: ToastViewOptions = {}): VNode => {
    options = Object.freeze(snapshotOwnDataRecord(options, 'Toast view options')) as ToastViewOptions;
    model = canonicalToastOrThrow(model);
    const viewWidth = configuredPositiveInteger(options.width, width, 'view.width');
    return renderToastEntries(model, paintedToastEntries(model), viewWidth);
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
    project(model: NotificationModel, interaction?: ToastInteractionState): ToastProjectionResult {
      const validated = validateCanonical(model);
      if (!validated.ok) return validated;
      const requestedInteraction = interaction === undefined ? snapshotModelInteraction(model, validated.value) : validatedToastInteraction(interaction);
      return reconcileInteraction(validated.value, requestedInteraction);
    },

    init(seed?: NotificationModel): [ToastModel, Cmd<ToastMsg>] {
      const initial = store.init(seed);
      return [reconcileOrThrow(
        initial,
        seed === undefined
          ? { mouseHoveredToastId: null, focusedToastId: null }
          : snapshotModelInteraction(seed, initial),
      ),
        Cmd.none(),
      ];
    },

    enqueue,
    push,

    update(msg: ToastMsg, model: ToastModel): [ToastModel, Cmd<ToastMsg>] {
      msg = Object.freeze(snapshotOwnDataRecord(msg, 'Toast message')) as unknown as ToastMsg;
      if (typeof msg.type !== 'string') {
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
          if (latest === undefined) {
            return [projectToastModel(model, toastInteraction(model)), Cmd.none()];
          }
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
          if (!paintedToastIds(model).has(msg.id)) {
            return [reconcileOrThrow(model, toastInteraction(model)), Cmd.none()];
          }
          const interaction = { ...toastInteraction(model), mouseHoveredToastId: msg.id };
          return [reconcileOrThrow(model, interaction), Cmd.none()];
        }
        case 'leave': {
          positiveToastId(msg.id, 'Toast leave id');
          const current = toastInteraction(model);
          if (current.mouseHoveredToastId !== msg.id) {
            return [reconcileOrThrow(model, current), Cmd.none()];
          }
          return [reconcileOrThrow(model, { ...current, mouseHoveredToastId: null }), Cmd.none()];
        }
        case 'focus': {
          if (msg.id !== null) positiveToastId(msg.id, 'Toast focus id');
          const current = toastInteraction(model);
          const focusedToastId = msg.id !== null && paintedToastIds(model).has(msg.id) ? msg.id : null;
          return [reconcileOrThrow(model, { ...current, focusedToastId }), Cmd.none()];
        }
        case 'panic': {
          if (model.visibleToastIds.length === 0) {
            return [projectToastModel(model, toastInteraction(model)), Cmd.none()];
          }
          broadcastSurfacePanic();
          return [
            projectToastModel(
              store.panic(model),
              { mouseHoveredToastId: null, focusedToastId: null },
            ),
            Cmd.none(),
          ];
        }
        case 'tick': {
          const reconciled = reconcileOrThrow(model, toastInteraction(model));
          return [
            unwrapClocked(store.tick(reconciled), toastInteraction(reconciled)),
            Cmd.none(),
          ];
        }
        case 'noop':
          return [reconcileOrThrow(model, toastInteraction(model)), Cmd.none()];
        default:
          throw new RangeError(`Unknown toast message type ${boundedDiagnosticQuote((msg as { type: string }).type)}.`);
      }
    },

    view,

    /** Render the toast stack as a layout-neutral corner layer. */
    layer(base: VNode, model: ToastModel, bounds: { cols: number; rows: number }, options: ToastLayerOptions = {}): VNode {
      bounds = Object.freeze(snapshotOwnDataRecord(bounds, 'Toast layer bounds')) as { cols: number; rows: number };
      options = Object.freeze(snapshotOwnDataRecord(options, 'Toast layer options')) as ToastLayerOptions;
      model = canonicalToastOrThrow(model);
      const entries = paintedToastEntries(model);
      if (entries.length === 0) return base;
      const cols = requiredNonNegativeInteger(bounds.cols, 'Toast layer bounds.cols');
      const rows = requiredNonNegativeInteger(bounds.rows, 'Toast layer bounds.rows');
      if (cols === 0 || rows === 0) return base;
      const layerMargin = Math.min(configuredNonNegativeInteger(options.margin, margin, 'layer.margin'), Math.floor(Math.min(cols, rows) / 2));
      const maxWidth = Math.max(1, cols - layerMargin * 2);
      const layerWidth = Math.min(configuredPositiveInteger(options.width, width, 'layer.width'), maxWidth);
      const availableHeight = Math.max(1, rows - layerMargin * 2);
      const fittingEntries: NotificationEntry[] = [];
      let stackHeight = 0;
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]!;
        const entryHeight = measureToast(
          entry.message,
          entry.level,
          layerWidth,
          entry.occurrences,
        ).height;
        if (fittingEntries.length > 0 && stackHeight + entryHeight > availableHeight) break;
        fittingEntries.unshift(entry);
        stackHeight += entryHeight;
        if (stackHeight >= availableHeight) break;
      }
      const height = Math.max(1, Math.min(stackHeight, availableHeight));
      const layerPlacement = configuredPlacement(options.placement, placement);
      const x = layerPlacement.endsWith('right') ? Math.max(0, cols - layerMargin - layerWidth) : layerMargin;
      const y = layerPlacement.startsWith('bottom') ? Math.max(0, rows - layerMargin - height) : layerMargin;
      const layerZIndex = configuredInteger(options.zIndex, zIndex, 'layer.zIndex');
      return layerStack(
        base,
        overlay(renderToastEntries(model, fittingEntries, layerWidth), {
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
      const entryById = new Map(model.entries.map((entry) => [entry.id, entry] as const));
      const hasTimedVisibleToast = model.visibleToastIds.some(
        (id) => typeof entryById.get(id)?.durationMs === 'number',
      );
      const interaction = Sub.batch(
        Sub.elementMouse<ToastMsg>((mouseEvent) => {
          if (mouseEvent.elementId.length > MAX_TOAST_ELEMENT_ID_LENGTH) {
            return { type: 'noop' };
          }
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
        ...(hasTimedVisibleToast
          ? [Sub.timer<ToastMsg>(500, () => ({ type: 'tick' }))]
          : []),
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
