/**
 * Pure notification state shared by toast and inbox surfaces.
 *
 * This module owns notification identity, retention, deduplication, and the
 * transient toast lifecycle. Renderers project this model; they must not keep
 * a second notification list or timer state.
 */

export type NotificationId = number;
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';
export type NotificationDelivery = 'toast' | 'inbox' | 'both';

export interface NotificationEntry {
  readonly id: NotificationId;
  readonly message: string;
  readonly detail?: string;
  readonly level: NotificationLevel;
  readonly delivery: NotificationDelivery;
  /** `null` keeps a toast visible until explicitly hidden. */
  readonly durationMs: number | null;
  readonly createdAt: number;
  /** Timestamp of the latest occurrence/content update. */
  readonly updatedAt: number;
  /**
   * Absolute toast-expiry deadline. `null` is required for inbox-only and
   * persistent notifications. Hover pauses extend this deadline without
   * changing the user-facing `updatedAt` timestamp.
   */
  readonly expiresAt: number | null;
  readonly read: boolean;
  readonly occurrences: number;
  readonly dedupeKey?: string;
  readonly actionIds: readonly string[];
}

export interface NotificationPausedToast {
  readonly id: NotificationId;
  readonly startedAt: number;
}

export interface NotificationModel {
  /** Oldest first; a repeated dedupe key moves its entry to the end. */
  readonly entries: readonly NotificationEntry[];
  /** Oldest first; the last ID is the latest visible toast. */
  readonly visibleToastIds: readonly NotificationId[];
  /** Monotonic identity source. Dedupe, retention, and dismissal never rewind it. */
  readonly nextId: NotificationId;
  readonly hoveredToastId: NotificationId | null;
  readonly pausedToast: NotificationPausedToast | null;
}

export interface NotificationModelSeed {
  readonly entries?: readonly NotificationEntry[];
  readonly visibleToastIds?: readonly NotificationId[];
  readonly nextId?: NotificationId;
  readonly hoveredToastId?: NotificationId | null;
  readonly pausedToast?: NotificationPausedToast | null;
}

export interface NotificationEnqueueInput {
  readonly message: string;
  readonly detail?: string;
  readonly level: NotificationLevel;
  readonly delivery: NotificationDelivery;
  /**
   * Toast lifetime. Omit to use the configured default, or pass `null` for a
   * persistent toast. Inbox-only notifications must omit this field.
   */
  readonly durationMs?: number | null;
  readonly dedupeKey?: string;
  readonly actionIds?: readonly string[];
}

export interface NotificationStoreConfig {
  /** Maximum retained entries, including transient toast-only entries. */
  readonly maxEntries?: number;
  /** Default toast lifetime. Defaults to 3000ms. */
  readonly defaultDurationMs?: number;
  /** Injectable non-negative safe-integer wall clock. */
  readonly now?: () => number;
}

export type NotificationDiagnosticCode =
  | 'invalid-message'
  | 'invalid-level'
  | 'invalid-delivery'
  | 'invalid-duration'
  | 'invalid-clock'
  | 'invalid-dedupe-key'
  | 'invalid-action-id'
  | 'duplicate-action-id'
  | 'invalid-model'
  | 'id-exhausted';

export interface NotificationDiagnostic {
  readonly code: NotificationDiagnosticCode;
  readonly field: string;
  readonly message: string;
}

export type NotificationStoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly NotificationDiagnostic[] };

export interface NotificationEnqueueValue {
  readonly model: NotificationModel;
  readonly entry: NotificationEntry;
}

export interface NotificationStore {
  init(seed?: NotificationModelSeed): NotificationModel;
  validateModel(model: NotificationModel): NotificationStoreResult<NotificationModel>;
  enqueue(model: NotificationModel, input: NotificationEnqueueInput): NotificationStoreResult<NotificationEnqueueValue>;
  markRead(model: NotificationModel, id: NotificationId): NotificationModel;
  markAllRead(model: NotificationModel): NotificationModel;
  hoverToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel>;
  leaveToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel>;
  hideToast(model: NotificationModel, id: NotificationId): NotificationModel;
  hideLatestToast(model: NotificationModel): NotificationModel;
  dismiss(model: NotificationModel, id: NotificationId): NotificationModel;
  tick(model: NotificationModel): NotificationStoreResult<NotificationModel>;
  panic(model: NotificationModel): NotificationModel;
}

const DEFAULT_MAX_ENTRIES = 100;
const MAX_ENTRIES = 10_000;
const DEFAULT_DURATION_MS = 3_000;
const LEVELS = new Set<unknown>(['info', 'success', 'warning', 'error']);
const DELIVERIES = new Set<unknown>(['toast', 'inbox', 'both']);
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const DETAIL_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function configPositiveInteger(value: unknown, field: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (!isPositiveSafeInteger(value) || value > maximum) {
    throw new RangeError(
      `NotificationStore config.${field} must be a positive safe integer no greater than ${String(maximum)}; received ${String(value)}.`,
    );
  }
  return value;
}

function diagnostic(code: NotificationDiagnosticCode, field: string, message: string): NotificationDiagnostic {
  return Object.freeze({ code, field, message });
}

function describeDiagnosticValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return serialized;
  } catch {
    // BigInt, cycles, and hostile toJSON values still need a diagnostic.
  }
  try {
    return String(value).replace(/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/gu, (character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined ? '\\u{fffd}' : `\\u{${codePoint.toString(16)}}`;
    });
  } catch {
    return '<unprintable>';
  }
}

function describeDiagnosticError(error: unknown): string {
  try {
    if (error instanceof Error) {
      const message: unknown = error.message;
      if (typeof message === 'string' && message.length > 0) {
        return describeDiagnosticValue(message);
      }
    }
  } catch {
    // Hostile Error subclasses must not escape the diagnostic boundary.
  }
  return describeDiagnosticValue(error);
}

function failure<T>(diagnostics: readonly NotificationDiagnostic[]): NotificationStoreResult<T> {
  return Object.freeze({ ok: false, diagnostics: Object.freeze([...diagnostics]) });
}

function success<T>(value: T): NotificationStoreResult<T> {
  return Object.freeze({ ok: true, value });
}

function freezeEntry(entry: NotificationEntry): NotificationEntry {
  const snapshot: NotificationEntry = {
    id: entry.id,
    message: entry.message,
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    level: entry.level,
    delivery: entry.delivery,
    durationMs: entry.durationMs,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    expiresAt: entry.expiresAt,
    read: entry.read,
    occurrences: entry.occurrences,
    ...(entry.dedupeKey === undefined ? {} : { dedupeKey: entry.dedupeKey }),
    actionIds: Object.freeze([...entry.actionIds]),
  };
  return Object.freeze(snapshot);
}

function freezeModel(model: NotificationModel): NotificationModel {
  const pausedToast = model.pausedToast === null ? null : Object.freeze({ id: model.pausedToast.id, startedAt: model.pausedToast.startedAt });
  return Object.freeze({
    entries: Object.freeze(model.entries.map(freezeEntry)),
    visibleToastIds: Object.freeze([...model.visibleToastIds]),
    nextId: model.nextId,
    hoveredToastId: model.hoveredToastId,
    pausedToast,
  });
}

function hasToastDelivery(delivery: NotificationDelivery): boolean {
  return delivery === 'toast' || delivery === 'both';
}

function hasInboxDelivery(delivery: NotificationDelivery): boolean {
  return delivery === 'inbox' || delivery === 'both';
}

function validateEntry(entry: unknown, index: number): NotificationDiagnostic[] {
  const path = `entries[${index}]`;
  if (!isRecord(entry)) {
    return [diagnostic('invalid-model', path, `Notification model ${path} must be an entry object.`)];
  }

  const diagnostics: NotificationDiagnostic[] = [];
  if (!isPositiveSafeInteger(entry.id)) {
    diagnostics.push(diagnostic('invalid-model', `${path}.id`, `Notification model ${path}.id must be a positive safe integer.`));
  }
  if (
    typeof entry.message !== 'string'
    || entry.message.trim().length === 0
    || SINGLE_LINE_CONTROL.test(entry.message)
    || LONE_SURROGATE.test(entry.message)
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.message`,
        `Notification model ${path}.message must be a non-empty, well-formed printable single-line string.`,
      ),
    );
  }
  if (
    entry.detail !== undefined
    && (typeof entry.detail !== 'string' || DETAIL_CONTROL.test(entry.detail) || LONE_SURROGATE.test(entry.detail))
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.detail`,
        `Notification model ${path}.detail must be well-formed text and may contain line feeds but no other C0 or C1 controls.`,
      ),
    );
  }
  if (!LEVELS.has(entry.level)) {
    diagnostics.push(diagnostic('invalid-model', `${path}.level`, `Notification model ${path}.level is not a supported notification level.`));
  }
  if (!DELIVERIES.has(entry.delivery)) {
    diagnostics.push(diagnostic('invalid-model', `${path}.delivery`, `Notification model ${path}.delivery is not a supported delivery mode.`));
  }
  if (entry.durationMs !== null && !isPositiveSafeInteger(entry.durationMs)) {
    diagnostics.push(
      diagnostic('invalid-model', `${path}.durationMs`, `Notification model ${path}.durationMs must be null or a positive safe integer.`),
    );
  }
  if (entry.delivery === 'inbox' && entry.durationMs !== null) {
    diagnostics.push(diagnostic('invalid-model', `${path}.durationMs`, `Notification model ${path}.durationMs must be null for inbox delivery.`));
  }
  if (!isNonNegativeSafeInteger(entry.createdAt)) {
    diagnostics.push(
      diagnostic('invalid-model', `${path}.createdAt`, `Notification model ${path}.createdAt must be a non-negative safe integer.`),
    );
  }
  if (!isNonNegativeSafeInteger(entry.updatedAt)) {
    diagnostics.push(
      diagnostic('invalid-model', `${path}.updatedAt`, `Notification model ${path}.updatedAt must be a non-negative safe integer.`),
    );
  } else if (isNonNegativeSafeInteger(entry.createdAt) && entry.updatedAt < entry.createdAt) {
    diagnostics.push(
      diagnostic('invalid-model', `${path}.updatedAt`, `Notification model ${path}.updatedAt cannot precede its createdAt timestamp.`),
    );
  }
  const expiresAtIsValid = entry.expiresAt === null || isNonNegativeSafeInteger(entry.expiresAt);
  if (!expiresAtIsValid) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.expiresAt`,
        `Notification model ${path}.expiresAt must be null or a non-negative safe integer.`,
      ),
    );
  }
  const timedDurationMs =
    (entry.delivery === 'toast' || entry.delivery === 'both')
    && isPositiveSafeInteger(entry.durationMs)
      ? entry.durationMs
      : null;
  if (timedDurationMs !== null && entry.expiresAt === null) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.expiresAt`,
        `Notification model ${path}.expiresAt must be an absolute deadline for timed toast delivery.`,
      ),
    );
  } else if (
    timedDurationMs !== null
    && isNonNegativeSafeInteger(entry.expiresAt)
    && isNonNegativeSafeInteger(entry.updatedAt)
    && entry.expiresAt - entry.updatedAt < timedDurationMs
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.expiresAt`,
        `Notification model ${path}.expiresAt cannot precede its initial toast lifetime.`,
      ),
    );
  } else if (
    expiresAtIsValid
    && entry.expiresAt !== null
    && (entry.delivery === 'inbox' || entry.durationMs === null)
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.expiresAt`,
        `Notification model ${path}.expiresAt must be null for inbox-only or persistent delivery.`,
      ),
    );
  }
  if (typeof entry.read !== 'boolean') {
    diagnostics.push(diagnostic('invalid-model', `${path}.read`, `Notification model ${path}.read must be a boolean.`));
  }
  if (!isPositiveSafeInteger(entry.occurrences)) {
    diagnostics.push(
      diagnostic('invalid-model', `${path}.occurrences`, `Notification model ${path}.occurrences must be a positive safe integer.`),
    );
  }
  if (
    entry.dedupeKey !== undefined &&
    (
      typeof entry.dedupeKey !== 'string'
      || entry.dedupeKey.trim().length === 0
      || SINGLE_LINE_CONTROL.test(entry.dedupeKey)
      || LONE_SURROGATE.test(entry.dedupeKey)
    )
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.dedupeKey`,
        `Notification model ${path}.dedupeKey must be a non-empty well-formed string when provided.`,
      ),
    );
  }
  if (!Array.isArray(entry.actionIds)) {
    diagnostics.push(diagnostic('invalid-model', `${path}.actionIds`, `Notification model ${path}.actionIds must be an array.`));
  } else {
    const actionIds = new Set<string>();
    for (const [actionIndex, actionId] of entry.actionIds.entries()) {
      const field = `${path}.actionIds[${actionIndex}]`;
      if (
        typeof actionId !== 'string'
        || actionId.trim().length === 0
        || SINGLE_LINE_CONTROL.test(actionId)
        || LONE_SURROGATE.test(actionId)
      ) {
        diagnostics.push(diagnostic('invalid-model', field, `Notification model ${field} must be a non-empty well-formed string.`));
      } else if (actionIds.has(actionId)) {
        diagnostics.push(diagnostic('invalid-model', field, `Notification model ${field} duplicates action ID ${JSON.stringify(actionId)}.`));
      } else {
        actionIds.add(actionId);
      }
    }
  }
  return diagnostics;
}

function validateModelShape(model: unknown, maxEntries: number): NotificationDiagnostic[] {
  if (!isRecord(model)) {
    return [diagnostic('invalid-model', 'model', 'Notification model must be an object.')];
  }

  const diagnostics: NotificationDiagnostic[] = [];
  if (!Array.isArray(model.entries)) {
    diagnostics.push(diagnostic('invalid-model', 'entries', 'Notification model entries must be an array.'));
  } else {
    if (model.entries.length > maxEntries) {
      diagnostics.push(
        diagnostic('invalid-model', 'entries', `Notification model entries exceed configured maxEntries (${String(maxEntries)}).`),
      );
    }
    model.entries.forEach((entry, index) => diagnostics.push(...validateEntry(entry, index)));
    const entryIds = new Set<number>();
    const dedupeKeys = new Set<string>();
    for (const [index, entry] of model.entries.entries()) {
      if (!isRecord(entry)) continue;
      if (isPositiveSafeInteger(entry.id)) {
        if (entryIds.has(entry.id)) {
          diagnostics.push(
            diagnostic('invalid-model', `entries[${index}].id`, `Notification model entry ID ${String(entry.id)} is duplicated.`),
          );
        }
        entryIds.add(entry.id);
      }
      if (
        typeof entry.dedupeKey === 'string'
        && entry.dedupeKey.trim().length > 0
        && !SINGLE_LINE_CONTROL.test(entry.dedupeKey)
        && !LONE_SURROGATE.test(entry.dedupeKey)
      ) {
        if (dedupeKeys.has(entry.dedupeKey)) {
          diagnostics.push(
            diagnostic(
              'invalid-model',
              `entries[${index}].dedupeKey`,
              `Notification model dedupe key ${JSON.stringify(entry.dedupeKey)} is duplicated.`,
            ),
          );
        }
        dedupeKeys.add(entry.dedupeKey);
      }
    }
  }

  if (!Array.isArray(model.visibleToastIds)) {
    diagnostics.push(diagnostic('invalid-model', 'visibleToastIds', 'Notification model visibleToastIds must be an array.'));
  } else {
    const visibleIds = new Set<number>();
    const entries = Array.isArray(model.entries) ? model.entries : [];
    for (const [index, id] of model.visibleToastIds.entries()) {
      const field = `visibleToastIds[${index}]`;
      if (!isPositiveSafeInteger(id)) {
        diagnostics.push(diagnostic('invalid-model', field, `Notification model ${field} must be a positive safe integer.`));
        continue;
      }
      if (visibleIds.has(id)) {
        diagnostics.push(diagnostic('invalid-model', field, `Notification model visible toast ID ${String(id)} is duplicated.`));
        continue;
      }
      visibleIds.add(id);
      const entry = entries.find((candidate) => isRecord(candidate) && candidate.id === id);
      if (!entry || !DELIVERIES.has(entry.delivery) || !hasToastDelivery(entry.delivery as NotificationDelivery)) {
        diagnostics.push(
          diagnostic('invalid-model', field, `Notification model ${field} must reference an entry with toast delivery.`),
        );
      }
    }
  }

  if (!isPositiveSafeInteger(model.nextId)) {
    diagnostics.push(diagnostic('invalid-model', 'nextId', 'Notification model nextId must be a positive safe integer.'));
  } else if (Array.isArray(model.entries)) {
    const maximumId = model.entries.reduce(
      (maximum, entry) => (isRecord(entry) && isPositiveSafeInteger(entry.id) ? Math.max(maximum, entry.id) : maximum),
      0,
    );
    if (model.nextId <= maximumId) {
      diagnostics.push(diagnostic('invalid-model', 'nextId', 'Notification model nextId must be greater than every retained entry ID.'));
    }
  }

  const hoveredToastId = model.hoveredToastId;
  if (hoveredToastId !== null && !isPositiveSafeInteger(hoveredToastId)) {
    diagnostics.push(diagnostic('invalid-model', 'hoveredToastId', 'Notification model hoveredToastId must be null or a positive safe integer.'));
  } else if (
    isPositiveSafeInteger(hoveredToastId) &&
    (!Array.isArray(model.visibleToastIds) || !model.visibleToastIds.includes(hoveredToastId))
  ) {
    diagnostics.push(
      diagnostic('invalid-model', 'hoveredToastId', 'Notification model hoveredToastId must reference a visible toast.'),
    );
  }

  if (model.pausedToast !== null) {
    if (!isRecord(model.pausedToast)) {
      diagnostics.push(diagnostic('invalid-model', 'pausedToast', 'Notification model pausedToast must be null or a pause record.'));
    } else {
      const pausedId = model.pausedToast.id;
      if (!isPositiveSafeInteger(pausedId)) {
        diagnostics.push(diagnostic('invalid-model', 'pausedToast.id', 'Notification model pausedToast.id must be a positive safe integer.'));
      } else {
        if (pausedId !== hoveredToastId) {
          diagnostics.push(
            diagnostic('invalid-model', 'pausedToast.id', 'Notification model pausedToast.id must equal hoveredToastId.'),
          );
        }
        const entry = Array.isArray(model.entries)
          ? model.entries.find((candidate) => isRecord(candidate) && candidate.id === pausedId)
          : undefined;
        if (!isRecord(entry) || entry.durationMs === null) {
          diagnostics.push(
            diagnostic('invalid-model', 'pausedToast.id', 'Notification model pausedToast.id must reference a timed toast entry.'),
          );
        } else if (
          isNonNegativeSafeInteger(model.pausedToast.startedAt) &&
          isNonNegativeSafeInteger(entry.updatedAt) &&
          model.pausedToast.startedAt < entry.updatedAt
        ) {
          diagnostics.push(
            diagnostic('invalid-model', 'pausedToast.startedAt', 'Notification model pause cannot start before the entry update timestamp.'),
          );
        }
      }
      if (!isNonNegativeSafeInteger(model.pausedToast.startedAt)) {
        diagnostics.push(
          diagnostic('invalid-model', 'pausedToast.startedAt', 'Notification model pausedToast.startedAt must be a non-negative safe integer.'),
        );
      }
    }
  } else if (isPositiveSafeInteger(hoveredToastId) && Array.isArray(model.entries)) {
    const hoveredEntry = model.entries.find((candidate) => isRecord(candidate) && candidate.id === hoveredToastId);
    if (isRecord(hoveredEntry) && isPositiveSafeInteger(hoveredEntry.durationMs)) {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'pausedToast',
          'Notification model a hovered timed toast must have a matching pause record.',
        ),
      );
    }
  }

  return diagnostics;
}

function snapshotValidatedModel(model: NotificationModel): NotificationModel {
  return freezeModel(model);
}

/**
 * Create the canonical notification state machine.
 *
 * Invalid factory options and hydration seeds throw field-specific errors.
 * Runtime enqueue and clock failures are returned as diagnostics so an app can
 * retain its last valid model and make the failure observable.
 */
export function createNotificationStore(config: NotificationStoreConfig = {}): NotificationStore {
  if (!isRecord(config)) throw new TypeError('NotificationStore config must be an object.');
  const maxEntries = configPositiveInteger(config.maxEntries, 'maxEntries', DEFAULT_MAX_ENTRIES, MAX_ENTRIES);
  const defaultDurationMs = configPositiveInteger(config.defaultDurationMs, 'defaultDurationMs', DEFAULT_DURATION_MS);
  if (config.now !== undefined && typeof config.now !== 'function') {
    throw new TypeError(`NotificationStore config.now must be a function; received ${typeof config.now}.`);
  }
  const now = config.now ?? Date.now;

  function validateModel(model: NotificationModel): NotificationStoreResult<NotificationModel> {
    const diagnostics = validateModelShape(model, maxEntries);
    if (diagnostics.length > 0) return failure(diagnostics);
    return success(snapshotValidatedModel(model));
  }

  function canonicalOrThrow(model: NotificationModel): NotificationModel {
    const validated = validateModel(model);
    if (validated.ok) return validated.value;
    const first = validated.diagnostics[0]!;
    throw new TypeError(`${first.field}: ${first.message}`);
  }

  function readClock(): NotificationStoreResult<number> {
    let value: unknown;
    try {
      value = now();
    } catch (error) {
      return failure([
        diagnostic('invalid-clock', 'now', `Notification clock threw: ${describeDiagnosticError(error)}`),
      ]);
    }
    if (!isNonNegativeSafeInteger(value)) {
      return failure([
        diagnostic(
          'invalid-clock',
          'now',
          `Notification clock must return a non-negative safe integer; received ${describeDiagnosticValue(value)}.`,
        ),
      ]);
    }
    return success(value);
  }

  function init(seed: NotificationModelSeed = {}): NotificationModel {
    if (!isRecord(seed)) throw new TypeError('NotificationStore init seed must be an object.');
    // `null` is not the same as an omitted optional field. Preserve every
    // explicitly supplied value so validateModel can reject malformed
    // hydration rather than quietly replacing it with plausible defaults.
    const entries = seed.entries === undefined ? [] : seed.entries;
    const maximumId = Array.isArray(entries)
      ? entries.reduce((maximum, entry) => (isPositiveSafeInteger(entry?.id) ? Math.max(maximum, entry.id) : maximum), 0)
      : 0;
    const derivedNextId = maximumId < Number.MAX_SAFE_INTEGER ? maximumId + 1 : Number.MAX_SAFE_INTEGER;
    const model = {
      entries,
      visibleToastIds: seed.visibleToastIds === undefined ? [] : seed.visibleToastIds,
      nextId: seed.nextId === undefined ? derivedNextId : seed.nextId,
      hoveredToastId: seed.hoveredToastId === undefined ? null : seed.hoveredToastId,
      pausedToast: seed.pausedToast === undefined ? null : seed.pausedToast,
    } as NotificationModel;
    const validated = validateModel(model);
    if (validated.ok) return validated.value;
    const first = validated.diagnostics[0]!;
    throw new TypeError(`${first.field}: ${first.message}`);
  }

  function validateInput(input: NotificationEnqueueInput): {
    readonly diagnostics: readonly NotificationDiagnostic[];
    readonly durationMs: number | null;
    readonly actionIds: readonly string[];
  } {
    if (!isRecord(input)) {
      return {
        diagnostics: [diagnostic('invalid-message', 'input', 'Notification enqueue input must be an object.')],
        durationMs: defaultDurationMs,
        actionIds: [],
      };
    }

    const diagnostics: NotificationDiagnostic[] = [];
    if (
      typeof input.message !== 'string'
      || input.message.trim().length === 0
      || SINGLE_LINE_CONTROL.test(input.message)
      || LONE_SURROGATE.test(input.message)
    ) {
      diagnostics.push(
        diagnostic('invalid-message', 'message', 'Notification message must be a non-empty, well-formed printable single-line string.'),
      );
    }
    if (
      input.detail !== undefined
      && (typeof input.detail !== 'string' || DETAIL_CONTROL.test(input.detail) || LONE_SURROGATE.test(input.detail))
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-message',
          'detail',
          'Notification detail must be well-formed text and may contain line feeds but no other C0 or C1 controls.',
        ),
      );
    }
    if (!LEVELS.has(input.level)) {
      diagnostics.push(diagnostic('invalid-level', 'level', `Unsupported notification level ${describeDiagnosticValue(input.level)}.`));
    }
    if (!DELIVERIES.has(input.delivery)) {
      diagnostics.push(diagnostic('invalid-delivery', 'delivery', `Unsupported notification delivery ${describeDiagnosticValue(input.delivery)}.`));
    }

    let durationMs: number | null = input.delivery === 'inbox' ? null : defaultDurationMs;
    if (input.durationMs !== undefined) {
      if (input.durationMs === null) {
        durationMs = null;
      } else if (!isPositiveSafeInteger(input.durationMs)) {
        diagnostics.push(diagnostic('invalid-duration', 'durationMs', 'Notification durationMs must be null or a positive safe integer.'));
      } else if (input.delivery === 'inbox') {
        diagnostics.push(diagnostic('invalid-duration', 'durationMs', 'Inbox-only notifications cannot declare a toast duration.'));
      } else {
        durationMs = input.durationMs;
      }
    }

    if (
      input.dedupeKey !== undefined &&
      (
        typeof input.dedupeKey !== 'string'
        || input.dedupeKey.trim().length === 0
        || SINGLE_LINE_CONTROL.test(input.dedupeKey)
        || LONE_SURROGATE.test(input.dedupeKey)
      )
    ) {
      diagnostics.push(
        diagnostic('invalid-dedupe-key', 'dedupeKey', 'Notification dedupeKey must be a non-empty well-formed string when provided.'),
      );
    }

    const actionIds: string[] = [];
    if (input.actionIds !== undefined && !Array.isArray(input.actionIds)) {
      diagnostics.push(diagnostic('invalid-action-id', 'actionIds', 'Notification actionIds must be an array when provided.'));
    } else {
      const seen = new Set<string>();
      for (const [index, actionId] of (input.actionIds ?? []).entries()) {
        const field = `actionIds[${index}]`;
        if (
          typeof actionId !== 'string'
          || actionId.trim().length === 0
          || SINGLE_LINE_CONTROL.test(actionId)
          || LONE_SURROGATE.test(actionId)
        ) {
          diagnostics.push(diagnostic('invalid-action-id', field, 'Notification action ID must be a non-empty well-formed string.'));
        } else if (seen.has(actionId)) {
          diagnostics.push(diagnostic('duplicate-action-id', field, `Notification action ID ${JSON.stringify(actionId)} is duplicated.`));
        } else {
          seen.add(actionId);
          actionIds.push(actionId);
        }
      }
    }

    return { diagnostics, durationMs, actionIds };
  }

  function enqueue(model: NotificationModel, input: NotificationEnqueueInput): NotificationStoreResult<NotificationEnqueueValue> {
    const validatedModel = validateModel(model);
    if (!validatedModel.ok) {
      const first = validatedModel.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validatedModel.value;
    const checkedInput = validateInput(input);
    if (checkedInput.diagnostics.length > 0) return failure(checkedInput.diagnostics);

    const clock = readClock();
    if (!clock.ok) return clock;
    const currentTime = clock.value;
    const existingIndex =
      input.dedupeKey === undefined ? -1 : current.entries.findIndex((entry) => entry.dedupeKey === input.dedupeKey);
    const existing = existingIndex < 0 ? undefined : current.entries[existingIndex];

    if (existing && currentTime < existing.updatedAt) {
      return failure([
        diagnostic('invalid-clock', 'now', 'Notification clock cannot precede the existing deduplicated entry timestamp.'),
      ]);
    }
    if (existing?.occurrences === Number.MAX_SAFE_INTEGER) {
      return failure([
        diagnostic('invalid-model', `entries[${String(existingIndex)}].occurrences`, 'Notification occurrence count is exhausted.'),
      ]);
    }
    if (!existing && current.nextId === Number.MAX_SAFE_INTEGER) {
      return failure([diagnostic('id-exhausted', 'nextId', 'Notification ID space is exhausted.')]);
    }
    let expiresAt: number | null = null;
    if (checkedInput.durationMs !== null) {
      if (checkedInput.durationMs > Number.MAX_SAFE_INTEGER - currentTime) {
        return failure([
          diagnostic('invalid-clock', 'now', 'Notification toast deadline exceeds the supported timestamp range.'),
        ]);
      }
      expiresAt = currentTime + checkedInput.durationMs;
    }

    const entry = freezeEntry({
      id: existing?.id ?? current.nextId,
      message: input.message,
      ...(input.detail === undefined ? {} : { detail: input.detail }),
      level: input.level,
      delivery: input.delivery,
      durationMs: checkedInput.durationMs,
      createdAt: existing?.createdAt ?? currentTime,
      updatedAt: currentTime,
      expiresAt,
      read: false,
      occurrences: (existing?.occurrences ?? 0) + 1,
      ...(input.dedupeKey === undefined ? {} : { dedupeKey: input.dedupeKey }),
      actionIds: checkedInput.actionIds,
    });

    const withoutExisting = existing ? current.entries.filter((candidate) => candidate.id !== existing.id) : current.entries;
    const retainedEntries = [...withoutExisting, entry].slice(-maxEntries);
    const retainedIds = new Set(retainedEntries.map((candidate) => candidate.id));
    const withoutCurrentVisibility = current.visibleToastIds.filter(
      (id) => id !== entry.id && retainedIds.has(id),
    );
    const visibleToastIds = hasToastDelivery(entry.delivery)
      ? [...withoutCurrentVisibility, entry.id]
      : withoutCurrentVisibility;
    const nextId = existing ? current.nextId : current.nextId + 1;
    const transientIdWasReplaced = existing !== undefined && current.hoveredToastId === existing.id;
    const hoveredToastId =
      transientIdWasReplaced || (current.hoveredToastId !== null && !retainedIds.has(current.hoveredToastId))
        ? null
        : current.hoveredToastId;
    const pausedToast =
      transientIdWasReplaced || (current.pausedToast !== null && !retainedIds.has(current.pausedToast.id))
        ? null
        : current.pausedToast;
    const nextModel = freezeModel({
      entries: retainedEntries,
      visibleToastIds,
      nextId,
      hoveredToastId,
      pausedToast,
    });
    return success({ model: nextModel, entry });
  }

  function markRead(model: NotificationModel, id: NotificationId): NotificationModel {
    const current = canonicalOrThrow(model);
    const entries = current.entries.map((entry) =>
      entry.id === id && hasInboxDelivery(entry.delivery) && !entry.read ? freezeEntry({ ...entry, read: true }) : entry,
    );
    return freezeModel({ ...current, entries });
  }

  function markAllRead(model: NotificationModel): NotificationModel {
    const current = canonicalOrThrow(model);
    const entries = current.entries.map((entry) =>
      hasInboxDelivery(entry.delivery) && !entry.read ? freezeEntry({ ...entry, read: true }) : entry,
    );
    return freezeModel({ ...current, entries });
  }

  function resumePausedAt(model: NotificationModel, currentTime: number): NotificationStoreResult<NotificationModel> {
    const paused = model.pausedToast;
    if (paused === null) return success(model);
    if (currentTime < paused.startedAt) {
      return failure([diagnostic('invalid-clock', 'now', 'Notification clock cannot precede the toast pause timestamp.')]);
    }
    const elapsed = currentTime - paused.startedAt;
    const entry = model.entries.find((candidate) => candidate.id === paused.id);
    if (!entry) return failure([diagnostic('invalid-model', 'pausedToast.id', 'Paused toast entry is missing.')]);
    if (entry.expiresAt === null) {
      return failure([diagnostic('invalid-model', 'pausedToast.id', 'Paused toast entry has no expiry deadline.')]);
    }
    const expiresAt = entry.expiresAt + elapsed;
    if (!Number.isSafeInteger(expiresAt)) {
      return failure([diagnostic('invalid-clock', 'now', 'Notification pause extends the toast deadline beyond the supported timestamp range.')]);
    }
    const entries = model.entries.map((candidate) =>
      candidate.id === paused.id ? freezeEntry({ ...candidate, expiresAt }) : candidate,
    );
    return success(freezeModel({ ...model, entries, hoveredToastId: null, pausedToast: null }));
  }

  function hoverToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel> {
    const validated = validateModel(model);
    if (!validated.ok) {
      const first = validated.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validated.value;
    const entry = current.entries.find((candidate) => candidate.id === id);
    if (!entry || !current.visibleToastIds.includes(id)) return success(current);
    if (current.hoveredToastId === id) return success(current);

    const clock = readClock();
    if (!clock.ok) return clock;
    if (clock.value < entry.updatedAt) {
      return failure([diagnostic('invalid-clock', 'now', 'Notification clock cannot precede the toast update timestamp.')]);
    }
    const resumed = resumePausedAt(current, clock.value);
    if (!resumed.ok) return resumed;
    return success(
      freezeModel({
        ...resumed.value,
        hoveredToastId: id,
        pausedToast: entry.durationMs === null ? null : { id, startedAt: clock.value },
      }),
    );
  }

  function leaveToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel> {
    const validated = validateModel(model);
    if (!validated.ok) {
      const first = validated.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validated.value;
    if (current.hoveredToastId !== id) return success(current);
    if (current.pausedToast === null) {
      return success(freezeModel({ ...current, hoveredToastId: null }));
    }
    const clock = readClock();
    if (!clock.ok) return clock;
    return resumePausedAt(current, clock.value);
  }

  function hideToast(model: NotificationModel, id: NotificationId): NotificationModel {
    const current = canonicalOrThrow(model);
    const entry = current.entries.find((candidate) => candidate.id === id);
    const entries = entry?.delivery === 'toast' ? current.entries.filter((candidate) => candidate.id !== id) : current.entries;
    return freezeModel({
      ...current,
      entries,
      visibleToastIds: current.visibleToastIds.filter((visibleId) => visibleId !== id),
      hoveredToastId: current.hoveredToastId === id ? null : current.hoveredToastId,
      pausedToast: current.pausedToast?.id === id ? null : current.pausedToast,
    });
  }

  function hideLatestToast(model: NotificationModel): NotificationModel {
    const current = canonicalOrThrow(model);
    const latest = current.visibleToastIds.at(-1);
    return latest === undefined ? current : hideToast(current, latest);
  }

  function dismiss(model: NotificationModel, id: NotificationId): NotificationModel {
    const current = canonicalOrThrow(model);
    return freezeModel({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== id),
      visibleToastIds: current.visibleToastIds.filter((visibleId) => visibleId !== id),
      hoveredToastId: current.hoveredToastId === id ? null : current.hoveredToastId,
      pausedToast: current.pausedToast?.id === id ? null : current.pausedToast,
    });
  }

  function tick(model: NotificationModel): NotificationStoreResult<NotificationModel> {
    const validated = validateModel(model);
    if (!validated.ok) {
      const first = validated.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validated.value;
    if (current.visibleToastIds.length === 0) return success(current);
    const clock = readClock();
    if (!clock.ok) return clock;
    const currentTime = clock.value;
    if (current.pausedToast !== null && currentTime < current.pausedToast.startedAt) {
      return failure([diagnostic('invalid-clock', 'now', 'Notification clock cannot precede the toast pause timestamp.')]);
    }
    const entryById = new Map(current.entries.map((entry) => [entry.id, entry]));
    for (const id of current.visibleToastIds) {
      const entry = entryById.get(id)!;
      if (currentTime < entry.updatedAt) {
        return failure([diagnostic('invalid-clock', 'now', 'Notification clock cannot precede a visible toast update timestamp.')]);
      }
    }

    const expiredIds = new Set<NotificationId>();
    for (const id of current.visibleToastIds) {
      if (current.pausedToast?.id === id) continue;
      const entry = entryById.get(id)!;
      if (entry.expiresAt !== null && currentTime >= entry.expiresAt) expiredIds.add(id);
    }
    if (expiredIds.size === 0) return success(current);

    const entries = current.entries.filter((entry) => !(expiredIds.has(entry.id) && entry.delivery === 'toast'));
    const hoveredExpired = current.hoveredToastId !== null && expiredIds.has(current.hoveredToastId);
    return success(
      freezeModel({
        ...current,
        entries,
        visibleToastIds: current.visibleToastIds.filter((id) => !expiredIds.has(id)),
        hoveredToastId: hoveredExpired ? null : current.hoveredToastId,
        pausedToast: current.pausedToast !== null && expiredIds.has(current.pausedToast.id) ? null : current.pausedToast,
      }),
    );
  }

  function panic(model: NotificationModel): NotificationModel {
    const current = canonicalOrThrow(model);
    return freezeModel({
      ...current,
      entries: current.entries.filter((entry) => entry.delivery !== 'toast'),
      visibleToastIds: [],
      hoveredToastId: null,
      pausedToast: null,
    });
  }

  return Object.freeze({
    init,
    validateModel,
    enqueue,
    markRead,
    markAllRead,
    hoverToast,
    leaveToast,
    hideToast,
    hideLatestToast,
    dismiss,
    tick,
    panic,
  });
}
