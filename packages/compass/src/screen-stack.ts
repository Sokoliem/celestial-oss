import {
  assertWellFormedString,
  type CapturedObject,
  captureDenseArray,
  captureObject,
  diagnosticUnknown,
  freezeSnapshot,
  MAX_CAPTURED_ARRAY_LENGTH,
  snapshotImmutableData,
} from './internal.js';

export interface ScreenStackEntry<ScreenId extends string = string> {
  readonly id: ScreenId;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly modal?: boolean;
}

export interface ScreenDismissalReceipt<ScreenId extends string = string, Result = unknown> {
  readonly screen: Readonly<ScreenStackEntry<ScreenId>>;
  readonly result: Result | undefined;
}

export interface ScreenStackModel<ScreenId extends string = string, Result = unknown> {
  readonly stack: readonly Readonly<ScreenStackEntry<ScreenId>>[];
  readonly lastDismissal: ScreenDismissalReceipt<ScreenId, Result> | null;
}

export type ScreenStackMsg<ScreenId extends string = string, Result = unknown> =
  | {
      readonly type: 'screen:push';
      readonly id: ScreenId;
      readonly params?: Readonly<Record<string, unknown>>;
      readonly modal?: boolean;
    }
  | {
      readonly type: 'screen:replace';
      readonly id: ScreenId;
      readonly params?: Readonly<Record<string, unknown>>;
      readonly modal?: boolean;
    }
  | { readonly type: 'screen:pop' }
  | { readonly type: 'screen:dismiss'; readonly result?: Result };

const SCREEN_ENTRY_SNAPSHOTS = new WeakSet<object>();
const SCREEN_DISMISSAL_SNAPSHOTS = new WeakSet<object>();
const SCREEN_MODEL_SNAPSHOTS = new WeakSet<object>();

function freezeEntry<ScreenId extends string>(
  value: ScreenStackEntry<ScreenId>,
): Readonly<ScreenStackEntry<ScreenId>> {
  freezeSnapshot(value);
  SCREEN_ENTRY_SNAPSHOTS.add(value);
  return value;
}

function freezeDismissal<ScreenId extends string, Result>(
  value: ScreenDismissalReceipt<ScreenId, Result>,
): ScreenDismissalReceipt<ScreenId, Result> {
  freezeSnapshot(value);
  SCREEN_DISMISSAL_SNAPSHOTS.add(value);
  return value;
}

function snapshotParams(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Screen params must be a plain record');
  }
  return snapshotImmutableData(value, 'Screen params') as Readonly<Record<string, unknown>>;
}

function snapshotCapturedEntry<ScreenId extends string>(
  captured: CapturedObject,
  label: string,
  allowModal: boolean,
): Readonly<ScreenStackEntry<ScreenId>> {
  if (!captured.present.has('id')) {
    throw new TypeError(`${label} must define own data property "id"`);
  }
  const id = captured.values.id;
  if (typeof id !== 'string') {
    throw new TypeError('Screen id must be a string');
  }
  assertWellFormedString(id, 'Screen id');
  if (id.length === 0 || id.trim() !== id) {
    throw new RangeError('Screen id must be a non-empty printable string without surrounding whitespace');
  }

  const rawModal = captured.present.has('modal') ? captured.values.modal : undefined;
  if (rawModal !== undefined && typeof rawModal !== 'boolean') {
    throw new TypeError('Screen modal must be a boolean');
  }
  const modal = rawModal === true;
  if (modal && !allowModal) {
    throw new RangeError('A root screen cannot be modal because it cannot be dismissed');
  }

  const rawParams = captured.present.has('params') ? captured.values.params : undefined;
  const params = snapshotParams(rawParams);
  const snapshot: ScreenStackEntry<ScreenId> = {
    id: id as ScreenId,
    ...(params === undefined ? {} : { params }),
    ...(modal ? { modal: true } : {}),
  };
  return freezeEntry(snapshot);
}

function snapshotEntry<ScreenId extends string>(
  entry: ScreenStackEntry<ScreenId>,
  allowModal: boolean,
): Readonly<ScreenStackEntry<ScreenId>> {
  if (
    entry !== null &&
    typeof entry === 'object' &&
    SCREEN_ENTRY_SNAPSHOTS.has(entry)
  ) {
    if (!allowModal && entry.modal === true) {
      throw new RangeError('A root screen cannot be modal because it cannot be dismissed');
    }
    return entry;
  }
  const captured = captureObject(entry, 'Screen entry', ['id'], ['params', 'modal']);
  return snapshotCapturedEntry<ScreenId>(captured, 'Screen entry', allowModal);
}

function freezeModel<ScreenId extends string, Result>(
  stack: readonly Readonly<ScreenStackEntry<ScreenId>>[],
  lastDismissal: ScreenDismissalReceipt<ScreenId, Result> | null,
): ScreenStackModel<ScreenId, Result> {
  if (stack.length > MAX_CAPTURED_ARRAY_LENGTH) {
    throw new RangeError(
      `Screen stack length must not exceed ${MAX_CAPTURED_ARRAY_LENGTH}`,
    );
  }
  const snapshot = freezeSnapshot({
    stack: freezeSnapshot([...stack]),
    lastDismissal,
  });
  SCREEN_MODEL_SNAPSHOTS.add(snapshot);
  return snapshot;
}

function snapshotDismissal<ScreenId extends string, Result>(
  value: unknown,
): ScreenDismissalReceipt<ScreenId, Result> | null {
  if (value === null) return null;
  if (typeof value === 'object' && SCREEN_DISMISSAL_SNAPSHOTS.has(value)) {
    return value as ScreenDismissalReceipt<ScreenId, Result>;
  }
  const captured = captureObject(value, 'Screen dismissal receipt', ['screen', 'result']);
  const screen = snapshotEntry<ScreenId>(captured.values.screen as ScreenStackEntry<ScreenId>, true);
  if (screen.modal !== true) {
    throw new RangeError('A screen dismissal receipt must identify a modal screen');
  }
  const result = snapshotImmutableData(captured.values.result as Result | undefined, 'Screen dismissal result');
  return freezeDismissal({ screen, result });
}

/**
 * Validate and canonicalize an externally supplied screen-stack model.
 */
function normalizeModel<ScreenId extends string, Result>(
  model: ScreenStackModel<ScreenId, Result>,
): ScreenStackModel<ScreenId, Result> {
  if (
    model !== null &&
    typeof model === 'object' &&
    SCREEN_MODEL_SNAPSHOTS.has(model)
  ) {
    return model;
  }
  if (model === null || typeof model !== 'object' || Array.isArray(model)) {
    throw new TypeError('Screen stack model must contain a stack array');
  }
  const captured = captureObject(model, 'Screen stack model', ['stack', 'lastDismissal']);
  const capturedStack = captureDenseArray<unknown>(captured.values.stack, 'Screen stack');
  if (capturedStack.values.length === 0) {
    throw new RangeError('Screen stack must contain at least one screen');
  }

  const stack: Readonly<ScreenStackEntry<ScreenId>>[] = [];
  for (let index = 0; index < capturedStack.values.length; index += 1) {
    const entry = snapshotEntry<ScreenId>(capturedStack.values[index] as ScreenStackEntry<ScreenId>, true);
    if (entry.modal === true && index !== capturedStack.values.length - 1) {
      throw new RangeError('A modal screen must be the active top screen');
    }
    stack.push(entry);
  }
  if (stack[0]?.modal === true) {
    throw new RangeError('A root screen cannot be modal because it cannot be dismissed');
  }

  const lastDismissal = snapshotDismissal<ScreenId, Result>(captured.values.lastDismissal);
  return freezeModel(stack, lastDismissal);
}

function rejectModalBypass<ScreenId extends string, Result>(
  model: ScreenStackModel<ScreenId, Result>,
  operation: string,
): void {
  if (model.stack[model.stack.length - 1]?.modal === true) {
    throw new RangeError(`${operation} cannot bypass a modal screen; use "screen:dismiss"`);
  }
}

export function createScreenStack<ScreenId extends string, Result = unknown>(
  initial: ScreenStackEntry<ScreenId>,
): ScreenStackModel<ScreenId, Result> {
  return freezeModel([snapshotEntry(initial, false)], null);
}

export function currentScreen<ScreenId extends string, Result>(
  model: ScreenStackModel<ScreenId, Result>,
): Readonly<ScreenStackEntry<ScreenId>> {
  const normalized = normalizeModel(model);
  const screen = normalized.stack[normalized.stack.length - 1];
  if (screen === undefined) throw new RangeError('Screen stack must contain at least one screen');
  return screen;
}

export function canPopScreen<ScreenId extends string, Result>(
  model: ScreenStackModel<ScreenId, Result>,
): boolean {
  const normalized = normalizeModel(model);
  return normalized.stack.length > 1 && normalized.stack[normalized.stack.length - 1]?.modal !== true;
}

export function canDismissScreen<ScreenId extends string, Result>(
  model: ScreenStackModel<ScreenId, Result>,
): boolean {
  const normalized = normalizeModel(model);
  return normalized.stack.length > 1 && normalized.stack[normalized.stack.length - 1]?.modal === true;
}

export function screenStackUpdate<ScreenId extends string, Result = unknown>(
  msg: ScreenStackMsg<ScreenId, Result>,
  model: ScreenStackModel<ScreenId, Result>,
): ScreenStackModel<ScreenId, Result> {
  const normalized = normalizeModel(model);
  const capturedMessage = captureObject(msg, 'Screen stack message', ['type'], ['id', 'params', 'modal', 'result']);
  const type = capturedMessage.values.type;
  if (typeof type !== 'string') {
    throw new TypeError('Screen stack message must be a namespaced message object');
  }

  switch (type) {
    case 'screen:push': {
      rejectModalBypass(normalized, 'screen:push');
      if (normalized.stack.length >= MAX_CAPTURED_ARRAY_LENGTH) {
        throw new RangeError(
          `Screen stack length must not exceed ${MAX_CAPTURED_ARRAY_LENGTH}`,
        );
      }
      const entry = snapshotCapturedEntry<ScreenId>(capturedMessage, 'screen:push', true);
      return freezeModel([...normalized.stack, entry], null);
    }
    case 'screen:replace': {
      rejectModalBypass(normalized, 'screen:replace');
      const entry = snapshotCapturedEntry<ScreenId>(
        capturedMessage,
        'screen:replace',
        normalized.stack.length > 1,
      );
      return freezeModel([...normalized.stack.slice(0, -1), entry], null);
    }
    case 'screen:pop': {
      rejectModalBypass(normalized, 'screen:pop');
      if (normalized.stack.length === 1) {
        return normalized.lastDismissal === null ? normalized : freezeModel(normalized.stack, null);
      }
      return freezeModel(normalized.stack.slice(0, -1), null);
    }
    case 'screen:dismiss': {
      if (
        normalized.stack.length === 1 ||
        normalized.stack[normalized.stack.length - 1]?.modal !== true
      ) {
        throw new RangeError('screen:dismiss requires a dismissible modal above the root screen');
      }
      const screen = normalized.stack[normalized.stack.length - 1];
      if (screen === undefined) throw new RangeError('Screen stack must contain at least one screen');
      const rawResult = capturedMessage.present.has('result') ? capturedMessage.values.result : undefined;
      const result = snapshotImmutableData(rawResult as Result | undefined, 'Screen dismissal result');
      const receipt = freezeDismissal({ screen, result });
      return freezeModel(normalized.stack.slice(0, -1), receipt);
    }
    default:
      throw new RangeError(`Unknown screen stack message type "${diagnosticUnknown(type)}"`);
  }
}
