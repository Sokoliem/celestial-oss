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
const MAX_NOTIFICATION_MESSAGE_LENGTH = 4_096;
const MAX_NOTIFICATION_DETAIL_LENGTH = 16_384;
const MAX_NOTIFICATION_DEDUPE_KEY_LENGTH = 256;
const MAX_NOTIFICATION_ACTION_ID_LENGTH = 256;
const MAX_NOTIFICATION_ACTION_IDS = 100;
const MAX_NOTIFICATION_DIAGNOSTICS = 100;
const LEVELS = new Set<unknown>(['info', 'success', 'warning', 'error']);
const DELIVERIES = new Set<unknown>(['toast', 'inbox', 'both']);
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const DETAIL_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const NOTIFICATION_STORES = new WeakSet<object>();
const MAX_MODEL_SNAPSHOT_ARRAY_LENGTH = MAX_ENTRIES;
const MAX_MODEL_SNAPSHOT_DEPTH = 32;
const MAX_MODEL_SNAPSHOT_NODES = 200_000;
const MAX_DIAGNOSTIC_LENGTH = 1_024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function diagnosticSafeText(input: string): string {
  let output = '';
  let truncated = false;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const next = input.charCodeAt(index + 1);
    let chunk: string;
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      chunk = input.slice(index, index + 2);
      index += 1;
    } else {
      const unsafe =
        code <= 0x1f ||
        (code >= 0x7f && code <= 0x9f) ||
        code === 0x061c ||
        code === 0x200e ||
        code === 0x200f ||
        (code >= 0x2028 && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069) ||
        (code >= 0xd800 && code <= 0xdfff);
      chunk = unsafe ? `\\u${code.toString(16).padStart(4, '0')}` : input[index]!;
    }
    if (output.length + chunk.length > MAX_DIAGNOSTIC_LENGTH - 1) {
      truncated = true;
      break;
    }
    output += chunk;
  }
  return truncated ? `${output}…` : output;
}

function configPositiveInteger(value: unknown, field: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (!isPositiveSafeInteger(value) || value > maximum) {
    throw new RangeError(
      `NotificationStore config.${field} must be a positive safe integer no greater than ${String(maximum)}; received ${describeDiagnosticValue(value)}.`,
    );
  }
  return value;
}

function diagnostic(code: NotificationDiagnosticCode, field: string, message: string): NotificationDiagnostic {
  return Object.freeze({
    code,
    field: diagnosticSafeText(field),
    message: diagnosticSafeText(message),
  });
}

function describeDiagnosticValue(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return diagnosticSafeText(serialized);
  } catch {
    // BigInt, cycles, and hostile toJSON values still need a diagnostic.
  }
  try {
    return diagnosticSafeText(String(value));
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
  const bounded =
    diagnostics.length <= MAX_NOTIFICATION_DIAGNOSTICS
      ? diagnostics
      : [
          ...diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS - 1),
          diagnostic(
            'invalid-model',
            'diagnostics',
            `${String(diagnostics.length - MAX_NOTIFICATION_DIAGNOSTICS + 1)} additional validation diagnostics were omitted.`,
          ),
        ];
  return Object.freeze({ ok: false, diagnostics: Object.freeze([...bounded]) });
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
  const frozen = Object.freeze({
    entries: Object.freeze(model.entries.map(freezeEntry)),
    visibleToastIds: Object.freeze([...model.visibleToastIds]),
    nextId: model.nextId,
    hoveredToastId: model.hoveredToastId,
    pausedToast,
  });
  return frozen;
}

interface SnapshotBudget {
  nodes: number;
}

function snapshotModelData(value: unknown, path: string, budget: SnapshotBudget, active: WeakSet<object>, depth = 0): unknown {
  budget.nodes += 1;
  if (budget.nodes > MAX_MODEL_SNAPSHOT_NODES) {
    throw new RangeError(`${path} exceeds ${MAX_MODEL_SNAPSHOT_NODES} plain-data nodes`);
  }
  if (depth > MAX_MODEL_SNAPSHOT_DEPTH) {
    throw new RangeError(`${path} exceeds maximum depth ${MAX_MODEL_SNAPSHOT_DEPTH}`);
  }
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain only plain data`);
  }
  if (active.has(value)) {
    throw new RangeError(`${path} must not contain circular references`);
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_MODEL_SNAPSHOT_ARRAY_LENGTH) {
        throw new RangeError(`${path} array length must be a non-negative safe integer no greater than ${MAX_MODEL_SNAPSHOT_ARRAY_LENGTH}`);
      }
      const snapshot: unknown[] = new Array(length);
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined) {
          throw new TypeError(`${path} must be dense; index ${index} is missing`);
        }
        if (!('value' in descriptor)) {
          throw new TypeError(`${path}[${index}] must be an own data property`);
        }
        snapshot[index] = snapshotModelData(descriptor.value, `${path}[${index}]`, budget, active, depth + 1);
      }
      return Object.freeze(snapshot);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain records and arrays`);
    }
    const keys = Reflect.ownKeys(value);
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== 'string') {
        throw new TypeError(`${path} must not contain symbol properties`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError(`${path}.${key} must be an own data property`);
      }
      snapshot[key] = snapshotModelData(descriptor.value, `${path}.${key}`, budget, active, depth + 1);
    }
    return Object.freeze(snapshot);
  } finally {
    active.delete(value);
  }
}

function snapshotNotificationModel(value: unknown): NotificationModel {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Notification model must be an object');
  }
  const snapshot = Object.create(null) as Record<string, unknown>;
  const budget = { nodes: 0 };
  const active = new WeakSet<object>();
  for (const key of ['entries', 'visibleToastIds', 'nextId', 'hoveredToastId', 'pausedToast'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`Notification model.${key} must be an own data property`);
    }
    snapshot[key] = snapshotModelData(descriptor.value, `Notification model.${key}`, budget, active, 1);
  }
  return Object.freeze(snapshot) as unknown as NotificationModel;
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
    || entry.message.length > MAX_NOTIFICATION_MESSAGE_LENGTH
    || entry.message.trim().length === 0
    || SINGLE_LINE_CONTROL.test(entry.message)
    || LONE_SURROGATE.test(entry.message)
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.message`,
        `Notification model ${path}.message must be a non-empty, well-formed printable single-line string of at most ${String(MAX_NOTIFICATION_MESSAGE_LENGTH)} characters.`,
      ),
    );
  }
  if (
    entry.detail !== undefined
    && (
      typeof entry.detail !== 'string'
      || entry.detail.length > MAX_NOTIFICATION_DETAIL_LENGTH
      || DETAIL_CONTROL.test(entry.detail)
      || LONE_SURROGATE.test(entry.detail)
    )) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.detail`,
        `Notification model ${path}.detail must be well-formed text of at most ${String(MAX_NOTIFICATION_DETAIL_LENGTH)} characters and may contain LF but no other terminal controls, Unicode line separators, or directionality controls.`,
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
      || entry.dedupeKey.length > MAX_NOTIFICATION_DEDUPE_KEY_LENGTH
      || entry.dedupeKey.trim().length === 0
      || SINGLE_LINE_CONTROL.test(entry.dedupeKey)
      || LONE_SURROGATE.test(entry.dedupeKey)
    )
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.dedupeKey`,
        `Notification model ${path}.dedupeKey must be a non-empty well-formed string of at most ${String(MAX_NOTIFICATION_DEDUPE_KEY_LENGTH)} characters when provided.`,
      ),
    );
  }
  if (!Array.isArray(entry.actionIds)) {
    diagnostics.push(diagnostic('invalid-model', `${path}.actionIds`, `Notification model ${path}.actionIds must be an array.`));
  } else if (entry.actionIds.length > MAX_NOTIFICATION_ACTION_IDS) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        `${path}.actionIds`,
        `Notification model ${path}.actionIds must contain no more than ${String(MAX_NOTIFICATION_ACTION_IDS)} action IDs.`,
      ),
    );
  } else {
    const actionIds = new Set<string>();
    for (const [actionIndex, actionId] of entry.actionIds.entries()) {
      const field = `${path}.actionIds[${actionIndex}]`;
      if (
        typeof actionId !== 'string'
        || actionId.length > MAX_NOTIFICATION_ACTION_ID_LENGTH
        || actionId.trim().length === 0
        || SINGLE_LINE_CONTROL.test(actionId)
        || LONE_SURROGATE.test(actionId)
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            field,
            `Notification model ${field} must be a non-empty well-formed string of at most ${String(MAX_NOTIFICATION_ACTION_ID_LENGTH)} characters.`,
          ),
        );
      } else if (actionIds.has(actionId)) {
        diagnostics.push(diagnostic('invalid-model', field, `Notification model ${field} duplicates action ID ${JSON.stringify(actionId)}.`));
      } else {
        actionIds.add(actionId);
      }
    }
  }
  return diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS);
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
      return [
        diagnostic('invalid-model', 'entries', `Notification model entries exceed configured maxEntries (${String(maxEntries)}).`),
      ];
    }
    for (const [index, entry] of model.entries.entries()) {
      diagnostics.push(...validateEntry(entry, index));
      if (diagnostics.length >= MAX_NOTIFICATION_DIAGNOSTICS) {
        return diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS);
      }
    }
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
        && entry.dedupeKey.length <= MAX_NOTIFICATION_DEDUPE_KEY_LENGTH
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
      if (diagnostics.length >= MAX_NOTIFICATION_DIAGNOSTICS) {
        return diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS);
      }
    }
  }

  if (!Array.isArray(model.visibleToastIds)) {
    diagnostics.push(diagnostic('invalid-model', 'visibleToastIds', 'Notification model visibleToastIds must be an array.'));
  } else if (model.visibleToastIds.length > maxEntries) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        'visibleToastIds',
        `Notification model visibleToastIds exceed configured maxEntries (${String(maxEntries)}).`,
      ),
    );
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
      if (diagnostics.length >= MAX_NOTIFICATION_DIAGNOSTICS) {
        return diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS);
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
      diagnostics.push(diagnostic('invalid-model', 'pausedToast', 'Notification model a hovered timed toast must have a matching pause record.'));
    }
  }

  return diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS);
}

/**
 * Create the canonical notification state machine.
 *
 * Invalid factory options and hydration seeds throw field-specific errors.
 * Runtime enqueue and clock failures are returned as diagnostics so an app can
 * retain its last valid model and make the failure observable.
 */
export function createNotificationStore(config: NotificationStoreConfig = {}): NotificationStore {
  let configSnapshot: NotificationStoreConfig;
  try {
    if (!isRecord(config)) throw new TypeError('NotificationStore config must be an object.');
    const values = Object.create(null) as Record<string, unknown>;
    for (const key of ['maxEntries', 'defaultDurationMs', 'now'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(config, key);
      if (descriptor === undefined) continue;
      if (!('value' in descriptor)) {
        throw new TypeError(`NotificationStore config.${key} must be an own data property.`);
      }
      values[key] = descriptor.value;
    }
    configSnapshot = Object.freeze(values) as NotificationStoreConfig;
  } catch (error) {
    throw new TypeError(`Invalid NotificationStore config: ${describeDiagnosticError(error)}`);
  }
  const maxEntries = configPositiveInteger(configSnapshot.maxEntries, 'maxEntries', DEFAULT_MAX_ENTRIES, MAX_ENTRIES);
  const defaultDurationMs = configPositiveInteger(configSnapshot.defaultDurationMs, 'defaultDurationMs', DEFAULT_DURATION_MS);
  if (configSnapshot.now !== undefined && typeof configSnapshot.now !== 'function') {
    throw new TypeError(`NotificationStore config.now must be a function; received ${typeof configSnapshot.now}.`);
  }
  const now = configSnapshot.now ?? Date.now;
  const canonicalModels = new WeakSet<object>();

  const ownedModel = (model: NotificationModel): NotificationModel => {
    const frozen = freezeModel(model);
    canonicalModels.add(frozen);
    return frozen;
  };

  function validateModel(model: NotificationModel): NotificationStoreResult<NotificationModel> {
    if (typeof model === 'object' && model !== null && canonicalModels.has(model)) {
      return success(model);
    }
    let snapshot: unknown;
    try {
      snapshot = snapshotNotificationModel(model);
    } catch (error) {
      return failure([diagnostic('invalid-model', 'model', `Notification model could not be snapshotted: ${describeDiagnosticError(error)}`)]);
    }
    const diagnostics = validateModelShape(snapshot, maxEntries);
    if (diagnostics.length > 0) return failure(diagnostics);
    return success(ownedModel(snapshot as NotificationModel));
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
      return failure([diagnostic('invalid-clock', 'now', `Notification clock threw: ${describeDiagnosticError(error)}`)]);
    }
    if (!isNonNegativeSafeInteger(value)) {
      return failure([
        diagnostic('invalid-clock', 'now', `Notification clock must return a non-negative safe integer; received ${describeDiagnosticValue(value)}.`),
      ]);
    }
    return success(value);
  }

  function init(seed: NotificationModelSeed = {}): NotificationModel {
    let seedSnapshot: Record<string, unknown>;
    try {
      const snapshot = snapshotModelData(seed, 'NotificationStore init seed', { nodes: 0 }, new WeakSet<object>());
      if (!isRecord(snapshot)) {
        throw new TypeError('NotificationStore init seed must be an object.');
      }
      seedSnapshot = snapshot;
    } catch (error) {
      throw new TypeError(`Invalid NotificationStore init seed: ${describeDiagnosticError(error)}`);
    }
    // `null` is not the same as an omitted optional field. Preserve every
    // explicitly supplied value so validateModel can reject malformed
    // hydration rather than quietly replacing it with plausible defaults.
    const entries = seedSnapshot.entries === undefined ? [] : seedSnapshot.entries;
    const maximumId = Array.isArray(entries)
      ? entries.reduce((maximum, entry) => (isPositiveSafeInteger(entry?.id) ? Math.max(maximum, entry.id) : maximum), 0)
      : 0;
    const derivedNextId = maximumId < Number.MAX_SAFE_INTEGER ? maximumId + 1 : Number.MAX_SAFE_INTEGER;
    const model = {
      entries,
      visibleToastIds: seedSnapshot.visibleToastIds === undefined ? [] : seedSnapshot.visibleToastIds,
      nextId: seedSnapshot.nextId === undefined ? derivedNextId : seedSnapshot.nextId,
      hoveredToastId: seedSnapshot.hoveredToastId === undefined ? null : seedSnapshot.hoveredToastId,
      pausedToast: seedSnapshot.pausedToast === undefined ? null : seedSnapshot.pausedToast,
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
      || input.message.length > MAX_NOTIFICATION_MESSAGE_LENGTH
      || input.message.trim().length === 0
      || SINGLE_LINE_CONTROL.test(input.message)
      || LONE_SURROGATE.test(input.message)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-message',
          'message',
          `Notification message must be a non-empty, well-formed printable single-line string of at most ${String(MAX_NOTIFICATION_MESSAGE_LENGTH)} characters.`,
        ),
      );
    }
    if (
      input.detail !== undefined
      && (
        typeof input.detail !== 'string'
        || input.detail.length > MAX_NOTIFICATION_DETAIL_LENGTH
        || DETAIL_CONTROL.test(input.detail)
        || LONE_SURROGATE.test(input.detail)
      )) {
      diagnostics.push(
        diagnostic(
          'invalid-message',
          'detail',
          `Notification detail must be well-formed text of at most ${String(MAX_NOTIFICATION_DETAIL_LENGTH)} characters and may contain LF but no other terminal controls, Unicode line separators, or directionality controls.`,
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
        || input.dedupeKey.length > MAX_NOTIFICATION_DEDUPE_KEY_LENGTH
        || input.dedupeKey.trim().length === 0
        || SINGLE_LINE_CONTROL.test(input.dedupeKey)
        || LONE_SURROGATE.test(input.dedupeKey)
      )
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-dedupe-key',
          'dedupeKey',
          `Notification dedupeKey must be a non-empty well-formed string of at most ${String(MAX_NOTIFICATION_DEDUPE_KEY_LENGTH)} characters when provided.`,
        ),
      );
    }

    const actionIds: string[] = [];
    if (input.actionIds !== undefined && !Array.isArray(input.actionIds)) {
      diagnostics.push(diagnostic('invalid-action-id', 'actionIds', 'Notification actionIds must be an array when provided.'));
    } else if ((input.actionIds?.length ?? 0) > MAX_NOTIFICATION_ACTION_IDS) {
      diagnostics.push(
        diagnostic(
          'invalid-action-id',
          'actionIds',
          `Notification actionIds must contain no more than ${String(MAX_NOTIFICATION_ACTION_IDS)} action IDs.`,
        ),
      );
    } else {
      const seen = new Set<string>();
      for (const [index, actionId] of (input.actionIds ?? []).entries()) {
        const field = `actionIds[${index}]`;
        if (
          typeof actionId !== 'string'
          || actionId.length > MAX_NOTIFICATION_ACTION_ID_LENGTH
          || actionId.trim().length === 0
          || SINGLE_LINE_CONTROL.test(actionId)
          || LONE_SURROGATE.test(actionId)
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-action-id',
              field,
              `Notification action ID must be a non-empty well-formed string of at most ${String(MAX_NOTIFICATION_ACTION_ID_LENGTH)} characters.`,
            ),
          );
        } else if (seen.has(actionId)) {
          diagnostics.push(diagnostic('duplicate-action-id', field, `Notification action ID ${JSON.stringify(actionId)} is duplicated.`));
        } else {
          seen.add(actionId);
          actionIds.push(actionId);
        }
      }
    }

    return {
      diagnostics: diagnostics.slice(0, MAX_NOTIFICATION_DIAGNOSTICS),
      durationMs,
      actionIds,
    };
  }

  function enqueue(model: NotificationModel, input: NotificationEnqueueInput): NotificationStoreResult<NotificationEnqueueValue> {
    const validatedModel = validateModel(model);
    if (!validatedModel.ok) {
      const first = validatedModel.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validatedModel.value;
    let inputSnapshot: NotificationEnqueueInput;
    try {
      inputSnapshot = snapshotModelData(input, 'Notification enqueue input', { nodes: 0 }, new WeakSet<object>()) as NotificationEnqueueInput;
    } catch (error) {
      return failure([diagnostic('invalid-message', 'input', `Notification enqueue input could not be snapshotted: ${describeDiagnosticError(error)}`)]);
    }
    const checkedInput = validateInput(inputSnapshot);
    if (checkedInput.diagnostics.length > 0) return failure(checkedInput.diagnostics);

    const clock = readClock();
    if (!clock.ok) return clock;
    const currentTime = clock.value;
    const existingIndex = inputSnapshot.dedupeKey === undefined ? -1 : current.entries.findIndex((entry) => entry.dedupeKey === inputSnapshot.dedupeKey);
    const existing = existingIndex < 0 ? undefined : current.entries[existingIndex];

    const latestRetainedTimestamp = current.entries.reduce(
      (latest, entry) => Math.max(latest, entry.updatedAt),
      0,
    );
    if (currentTime < latestRetainedTimestamp) {
      return failure([
        diagnostic(
          'invalid-clock',
          'now',
          'Notification clock cannot precede the latest retained notification timestamp.',
        ),
      ]);
    }
    if (existing?.occurrences === Number.MAX_SAFE_INTEGER) {
      return failure([diagnostic('invalid-model', `entries[${String(existingIndex)}].occurrences`, 'Notification occurrence count is exhausted.')]);
    }
    if (!existing && current.nextId === Number.MAX_SAFE_INTEGER) {
      return failure([diagnostic('id-exhausted', 'nextId', 'Notification ID space is exhausted.')]);
    }
    let expiresAt: number | null = null;
    if (checkedInput.durationMs !== null) {
      if (checkedInput.durationMs > Number.MAX_SAFE_INTEGER - currentTime) {
        return failure([diagnostic('invalid-clock', 'now', 'Notification toast deadline exceeds the supported timestamp range.')]);
      }
      expiresAt = currentTime + checkedInput.durationMs;
    }

    const entry = freezeEntry({
      id: existing?.id ?? current.nextId,
      message: inputSnapshot.message,
      ...(inputSnapshot.detail === undefined ? {} : { detail: inputSnapshot.detail }),
      level: inputSnapshot.level,
      delivery: inputSnapshot.delivery,
      durationMs: checkedInput.durationMs,
      createdAt: existing?.createdAt ?? currentTime,
      updatedAt: currentTime,
      expiresAt,
      read: false,
      occurrences: (existing?.occurrences ?? 0) + 1,
      ...(inputSnapshot.dedupeKey === undefined ? {} : { dedupeKey: inputSnapshot.dedupeKey }),
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
      transientIdWasReplaced || (current.pausedToast !== null && !retainedIds.has(current.pausedToast.id)) ? null : current.pausedToast;
    const nextModel = ownedModel({
      entries: retainedEntries,
      visibleToastIds,
      nextId,
      hoveredToastId,
      pausedToast,
    });
    return success({ model: nextModel, entry });
  }

  function markRead(model: NotificationModel, id: NotificationId): NotificationModel {
    if (!isPositiveSafeInteger(id)) {
      throw new RangeError('Notification ID must be a positive safe integer.');
    }
    const current = canonicalOrThrow(model);
    const entries = current.entries.map((entry) =>
      entry.id === id && hasInboxDelivery(entry.delivery) && !entry.read ? freezeEntry({ ...entry, read: true }) : entry,
    );
    return ownedModel({ ...current, entries });
  }

  function markAllRead(model: NotificationModel): NotificationModel {
    const current = canonicalOrThrow(model);
    const entries = current.entries.map((entry) => (hasInboxDelivery(entry.delivery) && !entry.read ? freezeEntry({ ...entry, read: true }) : entry));
    return ownedModel({ ...current, entries });
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
    const entries = model.entries.map((candidate) => (candidate.id === paused.id ? freezeEntry({ ...candidate, expiresAt }) : candidate));
    return success(ownedModel({ ...model, entries, hoveredToastId: null, pausedToast: null }));
  }

  function hoverToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel> {
    if (!isPositiveSafeInteger(id)) {
      return failure([diagnostic('invalid-model', 'id', 'Notification ID must be a positive safe integer.')]);
    }
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
      ownedModel({
        ...resumed.value,
        hoveredToastId: id,
        pausedToast: entry.durationMs === null ? null : { id, startedAt: clock.value },
      }),
    );
  }

  function leaveToast(model: NotificationModel, id: NotificationId): NotificationStoreResult<NotificationModel> {
    if (!isPositiveSafeInteger(id)) {
      return failure([diagnostic('invalid-model', 'id', 'Notification ID must be a positive safe integer.')]);
    }
    const validated = validateModel(model);
    if (!validated.ok) {
      const first = validated.diagnostics[0]!;
      return failure([diagnostic('invalid-model', first.field, first.message)]);
    }
    const current = validated.value;
    if (current.hoveredToastId !== id) return success(current);
    if (current.pausedToast === null) {
      return success(ownedModel({ ...current, hoveredToastId: null }));
    }
    const clock = readClock();
    if (!clock.ok) return clock;
    return resumePausedAt(current, clock.value);
  }

  function hideToast(model: NotificationModel, id: NotificationId): NotificationModel {
    if (!isPositiveSafeInteger(id)) {
      throw new RangeError('Notification ID must be a positive safe integer.');
    }
    const current = canonicalOrThrow(model);
    const entry = current.entries.find((candidate) => candidate.id === id);
    const entries = entry?.delivery === 'toast' ? current.entries.filter((candidate) => candidate.id !== id) : current.entries;
    return ownedModel({
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
    if (!isPositiveSafeInteger(id)) {
      throw new RangeError('Notification ID must be a positive safe integer.');
    }
    const current = canonicalOrThrow(model);
    return ownedModel({
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
      ownedModel({
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
    return ownedModel({
      ...current,
      entries: current.entries.filter((entry) => entry.delivery !== 'toast'),
      visibleToastIds: [],
      hoveredToastId: null,
      pausedToast: null,
    });
  }

  const store = Object.freeze({
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
  NOTIFICATION_STORES.add(store);
  return store;
}

/** Package-internal nominal check for stores created by this module. */
export function isNotificationStore(value: unknown): value is NotificationStore {
  return (typeof value === 'object' && value !== null) || typeof value === 'function' ? NOTIFICATION_STORES.has(value) : false;
}
