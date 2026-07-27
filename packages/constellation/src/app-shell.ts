/**
 * Headless application-shell coordination.
 *
 * The shell owns no application view and never executes host actions. It
 * projects one injected action registry into palette/help/key surfaces,
 * coordinates one injected notification store across inbox and toast
 * projections, and returns explicit receipts for the host to interpret.
 */

import type {
  ActionRegistry,
  ActionScope,
  KeyEvent,
  KeyModifiers,
  ResolvedAction,
  Sub as Subscription, TaskState, TaskStatus } from '@celestial/core/nebula';
import { isActionRegistry, resolveAction, Sub, subKind } from '@celestial/core/nebula';
import {
  actionCommands,
  actionKeyBindings,
  createActionResolutionSnapshot,
  formatActionShortcut,
  type UnbindableShortcut,
  unbindableActionShortcuts,
} from './actions.js';
import { generateFocusGroupId } from './focus-group.js';
import { MAX_RENDER_CELLS } from './internal.js';
import { formatKeyBinding,
  isKeyBindingRepresentable,
  type KeyBinding,
  keyMap,
  normalizeKeyBindingKey,
} from './keyboard.js';
import {
  createNotificationCenter,
  type NotificationCenter,
  type NotificationCenterConfig,
  type NotificationCenterMsg,
  type NotificationCenterState,
  type NotificationCenterViewport,
} from './notification-center.js';
import {
  isNotificationStore,
  type NotificationDiagnostic,
  type NotificationEnqueueInput,
  type NotificationModel,
  type NotificationModelSeed,
  type NotificationStore,
} from './notification-store.js';
import {
  type Command, createPaletteState, filterPaletteCommandIds, getSelectedCommand, type PaletteState,
  paletteUpdate,
} from './palette.js';
import type { StatusBarSection } from './status-bar.js';
import {
  createToastManager,
  type ToastInteractionState,
  type ToastManagerConfig,
  type ToastModel,
  type ToastMsg,
  ToastValidationError,
} from './toast.js';

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const TASK_STATUSES = new Set<TaskStatus>(['idle', 'running', 'success', 'error', 'cancelled']);
const MODIFIERS = new Set(['ctrl', 'alt', 'shift']);
const INTERACTIVE_TOAST_MESSAGES = new Set([
  'dismiss',
  'dismiss-latest',
  'hover',
  'leave',
  'focus',
]);
const MAX_DIAGNOSTIC_LENGTH = 1_024;
const MAX_ACTION_ID_LENGTH = 256;
const MAX_SHELL_SHORTCUT_LENGTH = 4_096;
const MAX_NOTIFICATION_HOVER_TARGET_LENGTH = 4_096;

function sanitizeAppShellDiagnostic(input: string): string {
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

function describeAppShellError(error: unknown): string {
  let detail: string | null = null;
  try {
    if (typeof error === 'string') {
      detail = error;
    } else if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
      const message = Reflect.get(error, 'message');
      if (typeof message === 'string') detail = message;
    }
  } catch {
    // Hostile error inspection is contained below.
  }
  if (detail === null) {
    try {
      detail = String(error);
    } catch {
      detail = '<unprintable>';
    }
  }
  return sanitizeAppShellDiagnostic(detail);
}

export interface AppShellShortcuts {
  readonly palette?: string;
  readonly help?: string;
  readonly notifications?: string;
  readonly close?: string;
}

export type AppShellShortcutName = keyof Required<AppShellShortcuts>;

export interface AppShellShortcut {
  readonly name: AppShellShortcutName;
  readonly source: 'default' | 'configured';
  readonly declaration: string;
  readonly key: string;
  readonly modifiers: Required<KeyModifiers>;
  readonly display: string;
}

export type AppShellDiagnosticCode =
  | 'invalid-config'
  | 'invalid-shortcut'
  | 'unbindable-shortcut'
  | 'conflicting-shortcut'
  | 'invalid-model'
  | 'invalid-context'
  | 'unknown-action'
  | 'unavailable-action'
  | 'notification-store';

export interface AppShellDiagnostic {
  readonly code: AppShellDiagnosticCode;
  readonly field: string;
  readonly message: string;
  readonly actionId?: string;
  readonly shortcut?: string;
}

export class AppShellValidationError extends TypeError {
  readonly diagnostics: readonly AppShellDiagnostic[];

  constructor(message: string, diagnostics: readonly AppShellDiagnostic[]) {
    super(`${message}: ${diagnostics.map((entry) => `${entry.field}: ${entry.message}`).join('; ')}`);
    this.name = 'AppShellValidationError';
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

export interface AppShellConfirmState {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'warning' | 'danger';
}

export interface AppShellTaskRecord {
  readonly id: string;
  readonly label?: string;
  readonly state: TaskState;
}

export interface AppShellTaskSummary {
  readonly total: number;
  readonly idle: number;
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
  /**
   * Null means there is no task evidence. Success is never fabricated from an
   * empty collection.
   */
  readonly overall: TaskStatus | null;
}

export type AppShellTaskMessage = string | ((state: TaskState) => string | null);

export interface AppShellTaskMessages {
  readonly idle?: AppShellTaskMessage | null;
  readonly running: AppShellTaskMessage;
  readonly success: AppShellTaskMessage;
  readonly error: AppShellTaskMessage;
  readonly cancelled: AppShellTaskMessage;
}

export interface AppShellModel {
  readonly palette: PaletteState;
  readonly helpOpen: boolean;
  readonly confirm: AppShellConfirmState | null;
  /** Controlled selection shared by pointer and keyboard confirmation views. */
  readonly confirmSelection?: 'confirm' | 'cancel';
  readonly notificationCenter: NotificationCenterState;
  /** Canonical shared notification state. */
  readonly notifications: NotificationModel;
  /** Facade-only toast hover/focus state; contains no notification entries. */
  readonly toastInteraction: ToastInteractionState;
  readonly tasks: readonly AppShellTaskRecord[];
}

export interface AppShellModelSeed {
  readonly palette?: PaletteState;
  readonly helpOpen?: boolean;
  readonly confirm?: AppShellConfirmState | null;
  readonly confirmSelection?: 'confirm' | 'cancel';
  readonly notificationCenter?: NotificationCenterState;
  readonly notifications?: NotificationModelSeed;
  readonly toastInteraction?: ToastInteractionState;
  readonly tasks?: readonly AppShellTaskRecord[];
}

export type AppShellActionSource = 'palette' | 'shortcut' | 'notification';

export type AppShellReceipt =
  | {
      readonly type: 'action-requested';
      readonly actionId: string;
      readonly source: AppShellActionSource;
    }
  | {
      readonly type: 'confirm-resolved';
      readonly id: string;
      readonly confirmed: boolean;
    };

export type AppShellMsg =
  | { readonly type: 'shell-open-palette' }
  | { readonly type: 'shell-toggle-help' }
  | { readonly type: 'shell-toggle-notifications' }
  | { readonly type: 'shell-dismiss' }
  | { readonly type: 'shell-open-confirm'; readonly confirm: AppShellConfirmState }
  | { readonly type: 'shell-confirm'; readonly id: string }
  | { readonly type: 'shell-cancel-confirm'; readonly id: string }
  | { readonly type: 'shell-confirm-select'; readonly selection: 'confirm' | 'cancel' }
  | { readonly type: 'shell-confirm-toggle' }
  | { readonly type: 'shell-palette-input'; readonly char: string }
  | { readonly type: 'shell-palette-backspace' }
  | { readonly type: 'shell-palette-up' }
  | { readonly type: 'shell-palette-down' }
  | { readonly type: 'shell-palette-select' }
  | { readonly type: 'shell-palette-highlight'; readonly index: number }
  | { readonly type: 'shell-palette-select-at'; readonly index: number }
  | {
      readonly type: 'shell-request-action';
      readonly actionId: string;
      readonly source: Exclude<AppShellActionSource, 'notification'>;
    }
  | { readonly type: 'shell-notification-center'; readonly msg: NotificationCenterMsg }
  | {
      readonly type: 'shell-activate-notification-action';
      readonly id: number;
      readonly actionId: string;
    }
  | { readonly type: 'shell-notify'; readonly notification: NotificationEnqueueInput }
  | { readonly type: 'shell-mark-notification-read'; readonly id: number }
  | { readonly type: 'shell-clear-notifications' }
  | { readonly type: 'shell-toast'; readonly msg: ToastMsg }
  | { readonly type: 'shell-task-state'; readonly task: AppShellTaskRecord }
  | { readonly type: 'shell-remove-task'; readonly id: string }
  | { readonly type: 'shell-noop' };

export interface AppShellUpdateResult {
  readonly model: AppShellModel;
  readonly receipts: readonly AppShellReceipt[];
  readonly diagnostics: readonly AppShellDiagnostic[];
}

export interface AppShellProjection {
  readonly commands: readonly Command<AppShellMsg>[];
  readonly keyBindings: readonly KeyBinding<AppShellMsg>[];
  /** Exact discoverable subset of `keyBindings`, not a second help registry. */
  readonly helpBindings: readonly KeyBinding<AppShellMsg>[];
  readonly diagnostics: readonly AppShellDiagnostic[];
}

export interface AppShellContext<HostModel> {
  readonly hostModel: HostModel;
  readonly viewport: NotificationCenterViewport;
}

export interface AppShellStatusOptions {
  readonly mode?: string;
  readonly title?: string;
  readonly showShortcutHints?: boolean;
}

export interface AppShellStatusSections {
  readonly left: readonly StatusBarSection[];
  readonly center: readonly StatusBarSection[];
  readonly right: readonly StatusBarSection[];
}

export interface AppShellNotificationOptions
  extends Pick<NotificationCenterConfig, 'title' | 'width' | 'maxHeight' | 'theme' | 'themeCtx'> {}

export type AppShellToastOptions = Omit<
  ToastManagerConfig,
  'store' | 'dismissalOwner' | 'maxToasts' | 'defaultDurationMs' | 'now'
>;

export interface AppShellConfig<HostModel, HostMsg> {
  readonly id?: string;
  readonly registry: ActionRegistry<HostModel, HostMsg>;
  readonly notificationStore: NotificationStore;
  readonly shortcuts?: AppShellShortcuts;
  readonly formatTimestamp: NotificationCenterConfig['formatTimestamp'];
  /**
   * Return true only while the host's focus owner permits application-global
   * bindings. Surface-local dismissal remains available independently.
   */
  readonly canUseGlobalShortcuts: (hostModel: HostModel, shell: AppShellModel) => boolean;
  readonly isScopeActive?: (
    scope: ActionScope,
    action: ResolvedAction<HostModel, HostMsg>,
    hostModel: HostModel,
  ) => boolean;
  readonly includeDisabledActions?: boolean;
  readonly includeUndiscoverableActions?: boolean;
  readonly notifications?: AppShellNotificationOptions;
  readonly toast?: AppShellToastOptions;
}

export interface AppShell<HostModel, HostMsg> {
  readonly registry: ActionRegistry<HostModel, HostMsg>;
  readonly notificationStore: NotificationStore;
  readonly toastManager: ReturnType<typeof createToastManager>;
  init(hostModel: HostModel, seed?: AppShellModelSeed): AppShellModel;
  validateModel(model: AppShellModel): readonly AppShellDiagnostic[];
  update(
    msg: AppShellMsg,
    model: AppShellModel,
    context: AppShellContext<HostModel>,
  ): AppShellUpdateResult;
  project(model: AppShellModel, hostModel: HostModel): AppShellProjection;
  subscriptions(model: AppShellModel, context: AppShellContext<HostModel>): Subscription<AppShellMsg>;
  notificationCenter(hostModel: HostModel): NotificationCenter;
  projectToasts(model: AppShellModel): ToastModel;
  status(model: AppShellModel, options?: AppShellStatusOptions): AppShellStatusSections;
}

const DEFAULT_SHORTCUTS: Readonly<Record<AppShellShortcutName, string>> = Object.freeze({
  palette: 'ctrl+p',
  help: 'f1',
  notifications: 'alt+n',
  close: 'escape',
});
const RESERVED_COMMAND_IDS = new Set([
  'app-shell.help',
  'app-shell.notifications',
  'app-shell.clear-notifications',
]);
const CANONICAL_ESCAPE_CHORD = '000:escape';

interface ShortcutParseSuccess {
  readonly shortcut: AppShellShortcut;
}

interface ShortcutParseFailure {
  readonly diagnostic: AppShellDiagnostic;
}

type ShortcutParseResult = ShortcutParseSuccess | ShortcutParseFailure;

function diagnostic(
  code: AppShellDiagnosticCode,
  field: string,
  message: string,
  extra: Pick<AppShellDiagnostic, 'actionId' | 'shortcut'> = {},
): AppShellDiagnostic {
  const actionId = extra.actionId;
  const shortcut = extra.shortcut;
  return Object.freeze({
    code,
    field: sanitizeAppShellDiagnostic(field),
    message: sanitizeAppShellDiagnostic(message),
    ...(typeof actionId === 'string'
      ? { actionId: sanitizeAppShellDiagnostic(actionId) }
      : {}),
    ...(typeof shortcut === 'string'
      ? { shortcut: sanitizeAppShellDiagnostic(shortcut) }
      : {}),
  });
}

function notificationDiagnostic(entry: NotificationDiagnostic): AppShellDiagnostic {
  return diagnostic('notification-store', entry.field, entry.message);
}

function printableSingleLine(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || unsafeText(value)
  ) {
    throw new TypeError(`${field} must be non-empty printable single-line text.`);
  }
  return value;
}

function unsafeText(value: string): boolean {
  return CONTROL.test(value) || LONE_SURROGATE.test(value);
}

function parseShellShortcut(
  name: AppShellShortcutName,
  declaration: unknown,
  source: AppShellShortcut['source'],
): ShortcutParseResult {
  const field = `shortcuts.${name}`;
  if (typeof declaration !== 'string') {
    return {
      diagnostic: diagnostic(
        'invalid-shortcut',
        field,
        'Shortcut must be a string; only an absent value uses the default.',
      ),
    };
  }
  if (declaration.length > MAX_SHELL_SHORTCUT_LENGTH) {
    return {
      diagnostic: diagnostic(
        'invalid-shortcut',
        field,
        `Shortcut must be no longer than ${String(MAX_SHELL_SHORTCUT_LENGTH)} characters.`,
        { shortcut: declaration },
      ),
    };
  }
  const trimmed = declaration.trim();
  if (trimmed.length === 0) {
    return {
      diagnostic: diagnostic('invalid-shortcut', field, 'Shortcut must not be empty.', {
        shortcut: declaration,
      }),
    };
  }
  const segments = trimmed.split(/\s+/);
  if (segments.length !== 1) {
    return {
      diagnostic: diagnostic(
        'unbindable-shortcut',
        field,
        'Multi-chord sequences cannot be represented by one shell binding.',
        { shortcut: declaration },
      ),
    };
  }

  const parts = segments[0]!.split('+');
  const rawKey = parts.at(-1) ?? '';
  if (rawKey.length === 0) {
    return {
      diagnostic: diagnostic('invalid-shortcut', field, 'Shortcut is missing a key.', {
        shortcut: declaration,
      }),
    };
  }

  const modifiers: Required<KeyModifiers> = { ctrl: false, alt: false, shift: false };
  for (const rawModifier of parts.slice(0, -1)) {
    const modifier = rawModifier.toLowerCase();
    if (!MODIFIERS.has(modifier)) {
      return {
        diagnostic: diagnostic(
          'invalid-shortcut',
          field,
          `Unknown shortcut modifier ${JSON.stringify(rawModifier)}.`,
          { shortcut: declaration },
        ),
      };
    }
    const key = modifier as keyof Required<KeyModifiers>;
    if (modifiers[key]) {
      return {
        diagnostic: diagnostic(
          'invalid-shortcut',
          field,
          `Shortcut repeats modifier ${JSON.stringify(rawModifier)}.`,
          { shortcut: declaration },
        ),
      };
    }
    modifiers[key] = true;
  }

  let key: string;
  try {
    key = normalizeKeyBindingKey(rawKey, modifiers);
  } catch (error) {
    return {
      diagnostic: diagnostic(
        'invalid-shortcut', field, describeAppShellError(error),
        { shortcut: declaration },
      ),
    };
  }
  if (!isKeyBindingRepresentable(key, modifiers)) {
    return {
      diagnostic: diagnostic(
        'unbindable-shortcut',
        field,
        `Terminal input cannot preserve ${formatKeyBinding(key, modifiers)} exactly.`,
        { shortcut: declaration },
      ),
    };
  }

  return {
    shortcut: Object.freeze({
      name,
      source,
      declaration,
      key,
      modifiers: Object.freeze({ ...modifiers }),
      display: formatKeyBinding(key, modifiers),
    }),
  };
}

function shortcutChord(shortcut: AppShellShortcut): string {
  return `${shortcut.modifiers.ctrl ? '1' : '0'}${shortcut.modifiers.alt ? '1' : '0'}${shortcut.modifiers.shift ? '1' : '0'}:${shortcut.key}`;
}

function resolveShellShortcuts(configured: AppShellShortcuts | undefined): {
  readonly shortcuts: Readonly<Record<AppShellShortcutName, AppShellShortcut>>;
  readonly diagnostics: readonly AppShellDiagnostic[];
} {
  const diagnostics: AppShellDiagnostic[] = [];
  const resolved = {} as Record<AppShellShortcutName, AppShellShortcut>;
  const chordOwners = new Map<string, AppShellShortcutName>();

  for (const name of Object.keys(DEFAULT_SHORTCUTS) as AppShellShortcutName[]) {
    const hasConfiguredValue =
      configured !== undefined && Object.hasOwn(configured, name);
    const configuredValue = hasConfiguredValue
      ? configured[name]
      : DEFAULT_SHORTCUTS[name];
    const source = hasConfiguredValue ? 'configured' : 'default';
    const result = parseShellShortcut(
      name,
      configuredValue,
      source,
    );
    if ('diagnostic' in result) {
      diagnostics.push(result.diagnostic);
      continue;
    }
    resolved[name] = result.shortcut;
    const chord = shortcutChord(result.shortcut);
    if (name !== 'close' && chord === CANONICAL_ESCAPE_CHORD) {
      diagnostics.push(
        diagnostic(
          'conflicting-shortcut',
          `shortcuts.${name}`,
          'Unmodified Escape is reserved by the canonical app-shell dismissal chain.',
          { shortcut: result.shortcut.declaration },
        ),
      );
      continue;
    }
    const existing = chordOwners.get(chord);
    if (existing !== undefined) {
      diagnostics.push(
        diagnostic(
          'conflicting-shortcut',
          `shortcuts.${name}`,
          `Shortcut conflicts with shortcuts.${existing}.`,
          { shortcut: result.shortcut.declaration },
        ),
      );
    } else {
      chordOwners.set(chord, name);
    }
  }

  return {
    shortcuts: Object.freeze(resolved),
    diagnostics: Object.freeze(diagnostics),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function snapshotPalette(palette: PaletteState): PaletteState {
  return Object.freeze({
    open: palette.open,
    query: palette.query,
    selectedIndex: palette.selectedIndex,
    filteredIds: Object.freeze([...palette.filteredIds]) as unknown as string[],
  });
}

function reconcilePaletteCommands<M>(palette: PaletteState, commands: readonly Command<M>[]): PaletteState {
  const filteredIds = filterPaletteCommandIds(palette.query, commands);
  const priorId = palette.filteredIds[palette.selectedIndex];
  const retainedIndex = priorId === undefined ? -1 : filteredIds.indexOf(priorId);
  const selectedIndex = filteredIds.length === 0 ? 0 : retainedIndex >= 0 ? retainedIndex : Math.min(palette.selectedIndex, filteredIds.length - 1);
  return snapshotPalette({
    ...palette,
    filteredIds,
    selectedIndex,
  });
}

function snapshotConfirm(confirm: AppShellConfirmState | null): AppShellConfirmState | null {
  return confirm === null ? null : Object.freeze({
        id: confirm.id,
        title: confirm.title,
        ...(confirm.description === undefined ? {} : { description: confirm.description }),
        ...(confirm.confirmLabel === undefined ? {} : { confirmLabel: confirm.confirmLabel }),
        ...(confirm.cancelLabel === undefined ? {} : { cancelLabel: confirm.cancelLabel }),
        ...(confirm.variant === undefined ? {} : { variant: confirm.variant }),
      });
}

function snapshotCenter(state: NotificationCenterState): NotificationCenterState {
  return Object.freeze({
    open: state.open,
    selectedId: state.selectedId,
    expandedId: state.expandedId,
    actionCursor:
      state.actionCursor === null
        ? null
        : Object.freeze({
            notificationId: state.actionCursor.notificationId,
            actionId: state.actionCursor.actionId,
          }),
    rowScrollOffset: state.rowScrollOffset,
    hoveredTarget: state.hoveredTarget,
    focusWithin: state.focusWithin,
  });
}

function snapshotToastInteraction(interaction: ToastInteractionState): ToastInteractionState {
  return Object.freeze({
    mouseHoveredToastId: interaction.mouseHoveredToastId,
    focusedToastId: interaction.focusedToastId,
  });
}

function snapshotTaskState(state: TaskState): TaskState {
  return Object.freeze({
    status: state.status,
    ...(state.startedAt === undefined ? {} : { startedAt: state.startedAt }),
    ...(state.finishedAt === undefined ? {} : { finishedAt: state.finishedAt }),
    ...(Object.hasOwn(state, 'error') ? { error: state.error } : {}),
  });
}

function snapshotTasks(tasks: readonly AppShellTaskRecord[]): readonly AppShellTaskRecord[] {
  return Object.freeze(
    tasks.map((task) =>
      Object.freeze({
        id: task.id,
        ...(task.label === undefined ? {} : { label: task.label }),
        state: snapshotTaskState(task.state),
      }),
    ),
  );
}

function snapshotModel(model: AppShellModel): AppShellModel {
  return Object.freeze({
    palette: snapshotPalette(model.palette),
    helpOpen: model.helpOpen,
    confirm: snapshotConfirm(model.confirm),
    confirmSelection: model.confirmSelection === 'cancel' ? 'cancel' : 'confirm',
    notificationCenter: snapshotCenter(model.notificationCenter),
    notifications: model.notifications,
    toastInteraction: snapshotToastInteraction(model.toastInteraction),
    tasks: snapshotTasks(model.tasks),
  });
}

function frozenResult(
  model: AppShellModel,
  receipts: readonly AppShellReceipt[] = [],
  diagnostics: readonly AppShellDiagnostic[] = [],
): AppShellUpdateResult {
  return Object.freeze({
    model,
    receipts: Object.freeze(receipts.map((receipt) => Object.freeze({ ...receipt }))),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function appendResultDiagnostics(result: AppShellUpdateResult, diagnostics: readonly AppShellDiagnostic[]): AppShellUpdateResult {
  return diagnostics.length === 0 ? result : frozenResult(result.model, result.receipts, dedupeDiagnostics([...diagnostics, ...result.diagnostics]));
}

function validateConfirm(confirm: unknown, field = 'confirm'): AppShellDiagnostic[] {
  if (confirm === null) return [];
  if (!isRecord(confirm)) {
    return [diagnostic('invalid-model', field, 'Confirm state must be null or an object.')];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  for (const name of ['id', 'title'] as const) {
    const value = confirm[name];
    if (
      typeof value !== 'string'
      || value.trim().length === 0
      || unsafeText(value)
    ) {
      diagnostics.push(
        diagnostic('invalid-model', `${field}.${name}`, `${name} must be non-empty printable single-line text.`),
      );
    }
  }
  for (const name of ['description', 'confirmLabel', 'cancelLabel'] as const) {
    const value = confirm[name];
    if (value !== undefined && (typeof value !== 'string' || unsafeText(value))) {
      diagnostics.push(
        diagnostic('invalid-model', `${field}.${name}`, `${name} must be printable single-line text when provided.`),
      );
    }
  }
  if (
    confirm.variant !== undefined
    && confirm.variant !== 'default'
    && confirm.variant !== 'warning'
    && confirm.variant !== 'danger'
  ) {
    diagnostics.push(
      diagnostic('invalid-model', `${field}.variant`, 'variant must be default, warning, or danger.'),
    );
  }
  return diagnostics;
}

function validatePalette(palette: unknown): AppShellDiagnostic[] {
  if (!isRecord(palette)) {
    return [diagnostic('invalid-model', 'palette', 'Palette state must be an object.')];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  if (typeof palette.open !== 'boolean') {
    diagnostics.push(diagnostic('invalid-model', 'palette.open', 'palette.open must be boolean.'));
  }
  if (typeof palette.query !== 'string' || unsafeText(palette.query)) {
    diagnostics.push(diagnostic('invalid-model', 'palette.query', 'palette.query must be safe terminal text.'));
  }
  if (!Number.isSafeInteger(palette.selectedIndex) || (palette.selectedIndex as number) < 0) {
    diagnostics.push(
      diagnostic('invalid-model', 'palette.selectedIndex', 'palette.selectedIndex must be a non-negative safe integer.'),
    );
  }
  if (!Array.isArray(palette.filteredIds)) {
    diagnostics.push(diagnostic('invalid-model', 'palette.filteredIds', 'palette.filteredIds must be an array.'));
  } else {
    const seen = new Set<string>();
    for (const [index, id] of palette.filteredIds.entries()) {
      if (
        typeof id !== 'string'
        || id.trim().length === 0
        || unsafeText(id)
      ) {
        diagnostics.push(
          diagnostic('invalid-model', `palette.filteredIds[${String(index)}]`, 'Filtered command ID must be printable text.'),
        );
      } else if (seen.has(id)) {
        diagnostics.push(
          diagnostic('invalid-model', `palette.filteredIds[${String(index)}]`, 'Filtered command IDs must be unique.'),
        );
      } else {
        seen.add(id);
      }
    }
    if (
      palette.filteredIds.length > 0
      && Number.isSafeInteger(palette.selectedIndex)
      && (palette.selectedIndex as number) >= palette.filteredIds.length
    ) {
      diagnostics.push(
        diagnostic('invalid-model', 'palette.selectedIndex', 'Palette selection must reference a filtered command.'),
      );
    }
  }
  return diagnostics;
}

function validateCenter(state: unknown): AppShellDiagnostic[] {
  if (!isRecord(state)) {
    return [diagnostic('invalid-model', 'notificationCenter', 'Notification center state must be an object.')];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  for (const field of ['open', 'focusWithin'] as const) {
    if (typeof state[field] !== 'boolean') {
      diagnostics.push(diagnostic('invalid-model', `notificationCenter.${field}`, `${field} must be boolean.`));
    }
  }
  for (const field of ['selectedId', 'expandedId'] as const) {
    const value = state[field];
    if (value !== null && !validPositiveId(value)) {
      diagnostics.push(
        diagnostic('invalid-model', `notificationCenter.${field}`, `${field} must be null or a positive safe integer.`),
      );
    }
  }
  if (!Number.isSafeInteger(state.rowScrollOffset) || (state.rowScrollOffset as number) < 0) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        'notificationCenter.rowScrollOffset',
        'rowScrollOffset must be a non-negative safe integer.',
      ),
    );
  }
  if (state.hoveredTarget !== null && typeof state.hoveredTarget !== 'string') {
    diagnostics.push(
      diagnostic('invalid-model', 'notificationCenter.hoveredTarget', 'hoveredTarget must be null or a string.'),
    );
  }
  if (state.actionCursor !== null) {
    if (
      !isRecord(state.actionCursor)
      || !validPositiveId(state.actionCursor.notificationId)
      || typeof state.actionCursor.actionId !== 'string'
      || state.actionCursor.actionId.trim().length === 0
      || state.actionCursor.actionId.length > MAX_ACTION_ID_LENGTH
      || unsafeText(state.actionCursor.actionId)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'notificationCenter.actionCursor',
          'actionCursor must be null or a stable notification/action identity.',
        ),
      );
    }
  }
  return diagnostics;
}

function validateTaskState(state: unknown, field: string): AppShellDiagnostic[] {
  if (!isRecord(state) || !TASK_STATUSES.has(state.status as TaskStatus)) {
    return [diagnostic('invalid-model', `${field}.status`, 'Task status is invalid.')];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  for (const timestamp of ['startedAt', 'finishedAt'] as const) {
    if (state[timestamp] !== undefined && !validTimestamp(state[timestamp])) {
      diagnostics.push(
        diagnostic('invalid-model', `${field}.${timestamp}`, `${timestamp} must be a non-negative safe integer.`),
      );
    }
  }
  if (
    validTimestamp(state.startedAt)
    && validTimestamp(state.finishedAt)
    && state.finishedAt < state.startedAt
  ) {
    diagnostics.push(
      diagnostic('invalid-model', `${field}.finishedAt`, 'finishedAt cannot precede startedAt.'),
    );
  }
  if (state.status === 'error' && !Object.hasOwn(state, 'error')) {
    diagnostics.push(
      diagnostic('invalid-model', `${field}.error`, 'Error tasks must retain observable error evidence.'),
    );
  }
  return diagnostics;
}

function validateTasks(tasks: unknown): AppShellDiagnostic[] {
  if (!Array.isArray(tasks)) {
    return [diagnostic('invalid-model', 'tasks', 'tasks must be an array.')];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  const seen = new Set<string>();
  for (const [index, task] of tasks.entries()) {
    const field = `tasks[${String(index)}]`;
    if (!isRecord(task)) {
      diagnostics.push(diagnostic('invalid-model', field, 'Task record must be an object.'));
      continue;
    }
    if (
      typeof task.id !== 'string'
      || task.id.trim().length === 0
      || unsafeText(task.id)
    ) {
      diagnostics.push(diagnostic('invalid-model', `${field}.id`, 'Task ID must be printable text.'));
    } else if (seen.has(task.id)) {
      diagnostics.push(diagnostic('invalid-model', `${field}.id`, 'Task IDs must be unique.'));
    } else {
      seen.add(task.id);
    }
    if (
      task.label !== undefined
      && (typeof task.label !== 'string' || unsafeText(task.label))
    ) {
      diagnostics.push(diagnostic('invalid-model', `${field}.label`, 'Task label must be printable text.'));
    }
    diagnostics.push(...validateTaskState(task.state, `${field}.state`));
  }
  return diagnostics;
}

function snapshotPublicTaskState(state: unknown, label: string): TaskState {
  const snapshot = Object.freeze(snapshotOwnDataRecord(state, label));
  const diagnostics = validateTaskState(snapshot, label);
  if (diagnostics.length > 0) {
    throw new TypeError(`Invalid app-shell task state: ${diagnostics[0]!.message}`);
  }
  return snapshotTaskState(snapshot as unknown as TaskState);
}

function snapshotPublicTasks(tasks: unknown): readonly AppShellTaskRecord[] {
  const values = snapshotDenseArrayValues(tasks, 'App-shell task summary input');
  const snapshots = values.map((task, index) => {
    const label = `App-shell task summary input[${String(index)}]`;
    const record = snapshotOwnDataRecord(task, label);
    return Object.freeze({
      id: record.id as string,
      ...(record.label === undefined ? {} : { label: record.label as string }),
      state: snapshotPublicTaskState(record.state, `${label}.state`),
    });
  });
  const diagnostics = validateTasks(snapshots);
  if (diagnostics.length > 0) {
    throw new TypeError(`Invalid app-shell task summary input: ${diagnostics[0]!.message}`);
  }
  return snapshotTasks(snapshots);
}

export function summarizeAppShellTasks(tasks: readonly AppShellTaskRecord[]): AppShellTaskSummary {
  tasks = snapshotPublicTasks(tasks);
  let idle = 0;
  let running = 0;
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  for (const task of tasks) {
    switch (task.state.status) {
      case 'idle':
        idle++;
        break;
      case 'running':
        running++;
        break;
      case 'success':
        succeeded++;
        break;
      case 'error':
        failed++;
        break;
      case 'cancelled':
        cancelled++;
        break;
    }
  }
  const total = tasks.length;
  const overall: TaskStatus | null =
    total === 0
      ? null
      : failed > 0
        ? 'error'
        : running > 0
          ? 'running'
          : cancelled > 0
            ? 'cancelled'
            : succeeded === total
              ? 'success'
              : 'idle';
  return Object.freeze({ total, idle, running, succeeded, failed, cancelled, overall });
}

function resolveTaskMessage(
  message: AppShellTaskMessage | null | undefined,
  state: TaskState,
): string | null {
  if (message === null || message === undefined) return null;
  const resolved = typeof message === 'function' ? message(state) : message;
  if (resolved === null) return null;
  return printableSingleLine(resolved, `Task ${state.status} message`);
}

function snapshotTaskMessages(messages: unknown): AppShellTaskMessages {
  const snapshot = snapshotOwnDataRecord(messages, 'App-shell task messages');
  for (const field of ['idle', 'running', 'success', 'error', 'cancelled'] as const) {
    const value = snapshot[field];
    const required = field !== 'idle';
    if (required && value === undefined) {
      throw new TypeError(`App-shell task messages requires own data property ${field}.`);
    }
    if (value === undefined || (field === 'idle' && value === null)) continue;
    if (typeof value !== 'string' && typeof value !== 'function') {
      throw new TypeError(`App-shell task message ${field} must be printable text or a function.`);
    }
    if (typeof value === 'string') {
      printableSingleLine(value, `Task ${field} message`);
    }
  }
  return Object.freeze(snapshot) as unknown as AppShellTaskMessages;
}

export function getAppShellTaskMessage(
  state: TaskState, messages: AppShellTaskMessages): string | null {
  state = snapshotPublicTaskState(state, 'App-shell task message state');
  messages = snapshotTaskMessages(messages);
  switch (state.status) {
    case 'idle':
      return resolveTaskMessage(messages.idle, state);
    case 'running':
      return resolveTaskMessage(messages.running, state);
    case 'success':
      return resolveTaskMessage(messages.success, state);
    case 'error':
      return resolveTaskMessage(messages.error, state);
    case 'cancelled':
      return resolveTaskMessage(messages.cancelled, state);
  }
  throw new TypeError('App-shell task status is invalid.');
}

function removeEscapeSubscription<M>(subscription: Subscription<M>): Subscription<M> {
  const kind = subKind(subscription);
  if (kind.kind === 'key' && kind.key === 'escape') return Sub.none();
  if (kind.kind !== 'batch') return subscription;
  return Sub.batch(...kind.subs.map(removeEscapeSubscription));
}

function validViewport(viewport: unknown): AppShellDiagnostic[] {
  if (!isRecord(viewport)) {
    return [
      diagnostic(
        'invalid-context',
        'viewport',
        'Viewport must be an object with positive safe-integer cols and rows.',
      ),
    ];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  if (
    typeof viewport.cols !== 'number'
    || !Number.isSafeInteger(viewport.cols)
    || viewport.cols <= 0 || viewport.cols > MAX_RENDER_CELLS) {
    diagnostics.push(
      diagnostic('invalid-context', 'viewport.cols', `Viewport columns must be a positive safe integer no greater than ${String(MAX_RENDER_CELLS)}.`),
    );
  }
  if (
    typeof viewport.rows !== 'number'
    || !Number.isSafeInteger(viewport.rows)
    || viewport.rows <= 0 || viewport.rows > MAX_RENDER_CELLS) {
    diagnostics.push(
      diagnostic('invalid-context', 'viewport.rows', `Viewport rows must be a positive safe integer no greater than ${String(MAX_RENDER_CELLS)}.`),
    );
  }
  return diagnostics;
}

function validateToastInteraction(interaction: unknown): AppShellDiagnostic[] {
  if (!isRecord(interaction)) {
    return [
      diagnostic(
        'invalid-model',
        'toastInteraction',
        'Toast interaction state must be an object.',
      ),
    ];
  }
  const diagnostics: AppShellDiagnostic[] = [];
  for (const field of ['mouseHoveredToastId', 'focusedToastId'] as const) {
    const value = interaction[field];
    if (value !== null && !validPositiveId(value)) {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          `toastInteraction.${field}`,
          `${field} must be null or a positive safe integer.`,
        ),
      );
    }
  }
  return diagnostics;
}

function validateCenterHoverTarget(value: unknown): boolean {
  if (value === null || value === 'close' || value === 'list') return true;
  if (
    typeof value !== 'string'
    || value.length > MAX_NOTIFICATION_HOVER_TARGET_LENGTH
  ) {
    return false;
  }
  const idTarget = /^(?:row|dismiss):([1-9][0-9]*)$/u.exec(value);
  if (idTarget) return validPositiveId(Number(idTarget[1]));
  const actionTarget = /^action:([1-9][0-9]*):(.+)$/u.exec(value);
  if (!actionTarget || !validPositiveId(Number(actionTarget[1]))) return false;
  try {
    const actionId = decodeURIComponent(actionTarget[2]!);
    return (
      actionId.trim().length > 0
      && actionId.length <= MAX_ACTION_ID_LENGTH
      && !unsafeText(actionId)
      && encodeURIComponent(actionId) === actionTarget[2]
    );
  } catch {
    return false;
  }
}

function validateNotificationCenterMessageBoundary(
  value: unknown,
): readonly AppShellDiagnostic[] {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return Object.freeze([
      diagnostic(
        'invalid-model',
        'message.msg',
        'Notification-center message must be an object with a string type.',
      ),
    ]);
  }

  switch (value.type) {
    case 'open':
    case 'close':
    case 'toggle':
    case 'escape':
    case 'select-previous':
    case 'select-next':
    case 'select-first':
    case 'select-last':
    case 'page-up':
    case 'page-down':
    case 'toggle-expanded':
    case 'action-previous':
    case 'action-next':
    case 'activate':
    case 'leave-target':
    case 'noop':
      return Object.freeze([]);
    case 'select':
    case 'activate-row':
    case 'mark-read':
      return validPositiveId(value.id)
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.id',
              `Notification-center ${value.type} ID must be a positive safe integer.`,
            ),
          ]);
    case 'activate-action': {
      const diagnostics: AppShellDiagnostic[] = [];
      if (!validPositiveId(value.id)) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            'message.msg.id',
            'Notification-center activate-action ID must be a positive safe integer.',
          ),
        );
      }
      if (
        typeof value.actionId !== 'string'
        || value.actionId.trim().length === 0
        || value.actionId.length > 256
        || unsafeText(value.actionId)
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            'message.msg.actionId',
            'Notification-center action ID must be non-empty printable single-line text no longer than 256 characters.',
          ),
        );
      }
      return Object.freeze(diagnostics);
    }
    case 'dismiss':
      return value.id === undefined || validPositiveId(value.id)
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.id',
              'Notification-center dismiss ID must be a positive safe integer when supplied.',
            ),
          ]);
    case 'scroll':
      return typeof value.delta === 'number' && Number.isFinite(value.delta)
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.delta',
              'Notification-center scroll delta must be finite.',
            ),
          ]);
    case 'hover-target':
      return (
        value.target !== null
        && typeof value.target === 'string'
        && validateCenterHoverTarget(value.target)
      )
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.target',
              'Notification-center hover target is malformed.',
            ),
          ]);
    case 'focus-changed':
      return typeof value.within === 'boolean'
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.within',
              'Notification-center focus state must be boolean.',
            ),
          ]);
    default:
      return Object.freeze([
        diagnostic(
          'invalid-model',
          'message.msg.type',
          `Unknown notification-center message type ${JSON.stringify(value.type)}.`,
        ),
      ]);
  }
}

function validateToastMessageBoundary(
  value: unknown,
): readonly AppShellDiagnostic[] {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return Object.freeze([
      diagnostic(
        'invalid-model',
        'message.msg',
        'Toast message must be an object with a string type.',
      ),
    ]);
  }

  switch (value.type) {
    case 'dismiss-latest':
    case 'panic':
    case 'tick':
    case 'noop':
      return Object.freeze([]);
    case 'dismiss':
    case 'hover':
    case 'leave':
      return validPositiveId(value.id)
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.id',
              `Toast ${value.type} ID must be a positive safe integer.`,
            ),
          ]);
    case 'focus':
      return value.id === null || validPositiveId(value.id)
        ? Object.freeze([])
        : Object.freeze([
            diagnostic(
              'invalid-model',
              'message.msg.id',
              'Toast focus ID must be null or a positive safe integer.',
            ),
          ]);
    case 'push': {
      if (!isRecord(value.toast)) {
        return Object.freeze([
          diagnostic(
            'invalid-model',
            'message.msg.toast',
            'Toast push payload must be an object.',
          ),
        ]);
      }
      const diagnostics: AppShellDiagnostic[] = [];
      if (
        typeof value.toast.message !== 'string'
        || value.toast.message.trim().length === 0
        || unsafeText(value.toast.message)
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            'message.msg.toast.message',
            'Toast message must be non-empty printable text.',
          ),
        );
      }
      if (
        value.toast.level !== 'info'
        && value.toast.level !== 'success'
        && value.toast.level !== 'warning'
        && value.toast.level !== 'error'
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            'message.msg.toast.level',
            'Toast level must be info, success, warning, or error.',
          ),
        );
      }
      if (
        value.toast.duration !== undefined
        && value.toast.duration !== null
        && (
          typeof value.toast.duration !== 'number'
          || !Number.isSafeInteger(value.toast.duration)
          || value.toast.duration < 0
        )
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-model',
            'message.msg.toast.duration',
            'Toast duration must be null or a non-negative safe integer.',
          ),
        );
      }
      return Object.freeze(diagnostics);
    }
    default:
      return Object.freeze([
        diagnostic(
          'invalid-model',
          'message.msg.type',
          `Unknown toast message type ${JSON.stringify(value.type)}.`,
        ),
      ]);
  }
}

function validateAppShellMessageBoundary(
  value: Record<string, unknown>,
): readonly AppShellDiagnostic[] {
  if (value.type === 'shell-request-action') {
    const diagnostics: AppShellDiagnostic[] = [];
    if (
      typeof value.actionId !== 'string'
      || value.actionId.trim().length === 0
      || value.actionId.length > MAX_ACTION_ID_LENGTH
      || unsafeText(value.actionId)
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'message.actionId',
          `Action ID must be non-empty printable single-line text no longer than ${String(MAX_ACTION_ID_LENGTH)} characters.`,
        ),
      );
    }
    if (value.source !== 'palette' && value.source !== 'shortcut') {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'message.source',
          'Direct action request source must be palette or shortcut.',
        ),
      );
    }
    return Object.freeze(diagnostics);
  }
  if (value.type === 'shell-notification-center') {
    return validateNotificationCenterMessageBoundary(value.msg);
  }
  if (value.type === 'shell-toast') {
    return validateToastMessageBoundary(value.msg);
  }
  return Object.freeze([]);
}

function validateAppShellModel(
  value: unknown, store: NotificationStore, registryById: ReadonlyMap<string, unknown>): readonly AppShellDiagnostic[] {
  if (!isRecord(value)) {
    return Object.freeze([
      diagnostic('invalid-model', 'model', 'App shell model must be an object.'),
    ]);
  }

  const diagnostics: AppShellDiagnostic[] = [];
  diagnostics.push(...validatePalette(value.palette));
  if (typeof value.helpOpen !== 'boolean') {
    diagnostics.push(
      diagnostic('invalid-model', 'helpOpen', 'helpOpen must be boolean.'),
    );
  }
  diagnostics.push(...validateConfirm(value.confirm));
  diagnostics.push(...validateCenter(value.notificationCenter));
  if (
    isRecord(value.notificationCenter)
    && !validateCenterHoverTarget(value.notificationCenter.hoveredTarget)
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-model',
        'notificationCenter.hoveredTarget',
        'hoveredTarget is malformed.',
      ),
    );
  }

  try {
    const validated = store.validateModel(value.notifications as NotificationModel);
    if (!validated.ok) {
      diagnostics.push(
        ...validated.diagnostics.map((entry) =>
          diagnostic(
            'notification-store',
            `notifications.${entry.field}`, entry.message)));
    } else {
      for (let entryIndex = 0; entryIndex < validated.value.entries.length; entryIndex += 1) {
        const entry = validated.value.entries[entryIndex]!;
        for (let actionIndex = 0; actionIndex < entry.actionIds.length; actionIndex += 1) {
          const actionId = entry.actionIds[actionIndex]!;
          if (!registryById.has(actionId)) {
            diagnostics.push(
              diagnostic(
                'unknown-action',
                `notifications.entries[${String(entryIndex)}].actionIds[${String(actionIndex)}]`,
                `Notification references unknown action ${JSON.stringify(actionId)}.`,
                { actionId },
              ),
            );
          }
        }
      }
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'notification-store', 'notifications', `Notification store validation threw: ${describeAppShellError(error)}`));
  }

  diagnostics.push(...validateToastInteraction(value.toastInteraction));
  diagnostics.push(...validateTasks(value.tasks));
  return Object.freeze(diagnostics);
}

type NormalizedAppShellModel =
  | { readonly ok: true; readonly value: AppShellModel }
  | { readonly ok: false; readonly diagnostics: readonly AppShellDiagnostic[] };

function normalizeAppShellModel(value: unknown, store: NotificationStore, registryById: ReadonlyMap<string, unknown>): NormalizedAppShellModel {
  try {
    if (!isRecord(value)) {
      return {
        ok: false,
        diagnostics: Object.freeze([diagnostic('invalid-model', 'model', 'App shell model must be an object.')]),
      };
    }
    const boundary = snapshotOwnDataRecord(value, 'model');
    if (isRecord(boundary.palette)) {
      const palette = snapshotOwnDataRecord(boundary.palette, 'model.palette');
      if (Array.isArray(palette.filteredIds)) {
        palette.filteredIds = snapshotDenseArrayValues(palette.filteredIds, 'model.palette.filteredIds');
      }
      boundary.palette = Object.freeze(palette);
    }
    if (isRecord(boundary.confirm)) {
      boundary.confirm = Object.freeze(snapshotOwnDataRecord(boundary.confirm, 'model.confirm'));
    }
    if (
      boundary.confirmSelection !== undefined
      && boundary.confirmSelection !== 'confirm'
      && boundary.confirmSelection !== 'cancel'
    ) {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic('invalid-model', 'model.confirmSelection', 'Confirmation selection must be confirm or cancel.'),
        ]),
      };
    }
    if (isRecord(boundary.notificationCenter)) {
      const center = snapshotOwnDataRecord(boundary.notificationCenter, 'model.notificationCenter');
      if (isRecord(center.actionCursor)) {
        center.actionCursor = Object.freeze(snapshotOwnDataRecord(center.actionCursor, 'model.notificationCenter.actionCursor'));
      }
      boundary.notificationCenter = Object.freeze(center);
    }
    if (isRecord(boundary.toastInteraction)) {
      boundary.toastInteraction = Object.freeze(snapshotOwnDataRecord(boundary.toastInteraction, 'model.toastInteraction'));
    }
    if (Array.isArray(boundary.tasks)) {
      boundary.tasks = Object.freeze(
        snapshotDenseArrayValues(boundary.tasks, 'model.tasks').map((task, index) => {
          const taskSnapshot = snapshotOwnDataRecord(task, `model.tasks[${String(index)}]`);
          if (isRecord(taskSnapshot.state)) {
            taskSnapshot.state = Object.freeze(snapshotOwnDataRecord(taskSnapshot.state, `model.tasks[${String(index)}].state`));
          }
          return Object.freeze(taskSnapshot);
        }),
      );
    }
    const snapshot = snapshotModel(boundary as unknown as AppShellModel);
    const diagnostics = validateAppShellModel(snapshot, store, registryById);
    if (diagnostics.length > 0) return { ok: false, diagnostics };

    const validatedNotifications = store.validateModel(snapshot.notifications);
    if (!validatedNotifications.ok) {
      return {
        ok: false,
        diagnostics: Object.freeze(
          validatedNotifications.diagnostics.map((entry) => diagnostic('notification-store', `notifications.${entry.field}`, entry.message)),
        ),
      };
    }
    return {
      ok: true,
      value: snapshotModel({
        palette: snapshot.palette,
        helpOpen: snapshot.helpOpen,
        confirm: snapshot.confirm,
        confirmSelection: snapshot.confirmSelection,
        notificationCenter: snapshot.notificationCenter,
        notifications: validatedNotifications.value,
        toastInteraction: snapshot.toastInteraction,
        tasks: snapshot.tasks,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: Object.freeze([diagnostic('invalid-model', 'model', `App shell model could not be inspected: ${describeAppShellError(error)}`)]),
    };
  }
}

function snapshotOwnDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
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
    Object.defineProperty(snapshot, key, {
      configurable: false,
      enumerable: descriptor.enumerable,
      writable: true,
      value: descriptor.value,
    });
  }
  return snapshot;
}

function snapshotDenseArrayValues(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 100_000) {
    throw new RangeError(`${label} length must be a non-negative safe integer no greater than 100000.`);
  }
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new TypeError(`${label} must be dense; index ${String(index)} is missing.`);
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`${label}[${String(index)}] must be an own data property.`);
    }
    values.push(descriptor.value);
  }
  return values;
}

type NormalizedAppShellConfig<HostModel, HostMsg> =
  | {
      readonly ok: true;
      readonly value: AppShellConfig<HostModel, HostMsg>;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly AppShellDiagnostic[];
    };

function normalizeAppShellConfig<HostModel, HostMsg>(value: unknown): NormalizedAppShellConfig<HostModel, HostMsg> {
  try {
    const snapshot = snapshotOwnDataRecord(value, 'config');
    for (const field of ['shortcuts', 'notifications', 'toast'] as const) {
      const nested = snapshot[field];
      if (nested !== undefined && isRecord(nested)) {
        snapshot[field] = Object.freeze(snapshotOwnDataRecord(nested, `config.${field}`));
      }
    }
    return {
      ok: true,
      value: Object.freeze(snapshot) as unknown as AppShellConfig<HostModel, HostMsg>,
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: Object.freeze([diagnostic('invalid-config', 'config', `App shell config could not be snapshotted: ${describeAppShellError(error)}`)]),
    };
  }
}

function validateConfigShape(value: unknown): readonly AppShellDiagnostic[] {
  if (!isRecord(value)) {
    return Object.freeze([
      diagnostic('invalid-config', 'config', 'App shell config must be an object.'),
    ]);
  }

  const diagnostics: AppShellDiagnostic[] = [];
  if (
    value.id !== undefined
    && (typeof value.id !== 'string'
      || value.id.trim().length === 0
      || unsafeText(value.id))
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-config',
        'id',
        'App shell id must be non-empty printable single-line text.',
      ),
    );
  }
  if (typeof value.formatTimestamp !== 'function') {
    diagnostics.push(
      diagnostic(
        'invalid-config',
        'formatTimestamp',
        'formatTimestamp must be a function.',
      ),
    );
  }
  if (typeof value.canUseGlobalShortcuts !== 'function') {
    diagnostics.push(
      diagnostic(
        'invalid-config',
        'canUseGlobalShortcuts',
        'canUseGlobalShortcuts must be a focus-ownership function.',
      ),
    );
  }
  if (value.isScopeActive !== undefined && typeof value.isScopeActive !== 'function') {
    diagnostics.push(
      diagnostic('invalid-config', 'isScopeActive', 'isScopeActive must be a function.'),
    );
  }
  for (const field of [
    'includeDisabledActions',
    'includeUndiscoverableActions',
  ] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      diagnostics.push(
        diagnostic('invalid-config', field, `${field} must be boolean when supplied.`),
      );
    }
  }

  const registry = value.registry;
  if (!isActionRegistry(registry)) {
    diagnostics.push(
      diagnostic(
        'invalid-config', 'registry', 'registry must be one canonical ActionRegistry object.'));
  } else {
    if (!Array.isArray(registry.actions)) {
      diagnostics.push(
        diagnostic('invalid-config', 'registry.actions', 'registry.actions must be an array.'),
      );
    }
    const byId = registry.byId;
    if (
      !isRecord(byId)
      || typeof byId.get !== 'function'
      || typeof byId.has !== 'function'
      || typeof byId.size !== 'number'
      || !Number.isSafeInteger(byId.size)
      || byId.size < 0
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-config',
          'registry.byId',
          'registry.byId must be a readonly map-like index with a finite size.',
        ),
      );
    } else if (
      Array.isArray(registry.actions)
      && byId.size !== registry.actions.length
    ) {
      diagnostics.push(
        diagnostic(
          'invalid-config',
          'registry.byId',
          'registry.byId must contain exactly one entry for every registry action and no extras.',
        ),
      );
    }
    if (Array.isArray(registry.actions)) {
      const seen = new Set<string>();
      for (const [index, action] of registry.actions.entries()) {
        const field = `registry.actions[${String(index)}]`;
        if (!isRecord(action)) {
          diagnostics.push(
            diagnostic('invalid-config', field, 'Action descriptor must be an object.'),
          );
          continue;
        }
        if (
          typeof action.id !== 'string'
          || action.id.trim().length === 0
          || unsafeText(action.id)
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `${field}.id`,
              'Action ID must be non-empty printable single-line text.',
            ),
          );
        } else if (RESERVED_COMMAND_IDS.has(action.id)) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `${field}.id`,
              `Action ID ${JSON.stringify(action.id)} is reserved by the app shell.`,
              { actionId: action.id },
            ),
          );
        } else if (seen.has(action.id)) {
          diagnostics.push(
            diagnostic('invalid-config', `${field}.id`, 'Action IDs must be unique.'),
          );
        } else {
          seen.add(action.id);
          if (isRecord(byId) && typeof byId.get === 'function') {
            try {
              if ((byId.get as (id: string) => unknown)(action.id) !== action) {
                diagnostics.push(
                  diagnostic(
                    'invalid-config',
                    'registry.byId',
                    `registry.byId must reference the exact descriptor for ${JSON.stringify(action.id)}.`,
                  ),
                );
              }
            } catch (error) {
              diagnostics.push(
                diagnostic(
                  'invalid-config', 'registry.byId', `registry.byId.get threw: ${describeAppShellError(error)}`));
            }
          }
        }
        if (
          typeof action.title !== 'string'
          || action.title.trim().length === 0
          || unsafeText(action.title)
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `${field}.title`,
              'Action title must be non-empty printable single-line text.',
            ),
          );
        }
        if (typeof action.run !== 'function') {
          diagnostics.push(
            diagnostic('invalid-config', `${field}.run`, 'Action run must be a function.'),
          );
        }
        if (action.when !== undefined && typeof action.when !== 'function') {
          diagnostics.push(
            diagnostic('invalid-config', `${field}.when`, 'Action when must be a function.'),
          );
        }
        for (const textField of ['description', 'category'] as const) {
          const textValue = action[textField];
          if (
            textValue !== undefined
            && (typeof textValue !== 'string' || unsafeText(textValue))
          ) {
            diagnostics.push(
              diagnostic(
                'invalid-config',
                `${field}.${textField}`,
                `${textField} must be printable single-line text when supplied.`,
              ),
            );
          }
        }
        if (
          action.scope !== undefined
          && action.scope !== 'app'
          && action.scope !== 'screen'
          && action.scope !== 'focused'
          && action.scope !== 'workspace'
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `${field}.scope`,
              'Action scope must be app, screen, focused, or workspace.',
            ),
          );
        }
        if (
          action.discoverable !== undefined
          && typeof action.discoverable !== 'boolean'
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `${field}.discoverable`,
              'Action discoverable must be boolean when supplied.',
            ),
          );
        }
        if (action.shortcuts !== undefined) {
          if (!Array.isArray(action.shortcuts)) {
            diagnostics.push(
              diagnostic(
                'invalid-config',
                `${field}.shortcuts`,
                'Action shortcuts must be an array.',
              ),
            );
          } else {
            for (const [shortcutIndex, shortcut] of action.shortcuts.entries()) {
              if (typeof shortcut !== 'string') {
                diagnostics.push(
                  diagnostic(
                    'invalid-shortcut',
                    `${field}.shortcuts[${String(shortcutIndex)}]`,
                    'Action shortcut must be a string.',
                  ),
                );
              }
            }
          }
        }
      }
    }
  }

  const store = value.notificationStore;
  if (!isNotificationStore(store)) {
    diagnostics.push(
      diagnostic(
        'invalid-config', 'notificationStore', 'notificationStore must be one canonical NotificationStore object.'));
  } else {
    for (const method of [
      'init',
      'validateModel',
      'enqueue',
      'markRead',
      'markAllRead',
      'hoverToast',
      'leaveToast',
      'hideToast',
      'hideLatestToast',
      'dismiss',
      'tick',
      'panic',
    ] as const) {
      if (typeof store[method] !== 'function') {
        diagnostics.push(
          diagnostic(
            'invalid-config',
            `notificationStore.${method}`,
            `notificationStore.${method} must be a function.`,
          ),
        );
      }
    }
  }

  if (value.shortcuts !== undefined) {
    if (!isRecord(value.shortcuts)) {
      diagnostics.push(
        diagnostic('invalid-config', 'shortcuts', 'shortcuts must be an object.'),
      );
    } else {
      const supported = new Set(Object.keys(DEFAULT_SHORTCUTS));
      for (const field of Object.keys(value.shortcuts)) {
        if (!supported.has(field)) {
          diagnostics.push(
            diagnostic(
              'invalid-shortcut',
              `shortcuts.${field}`,
              'Unknown shell shortcut name.',
            ),
          );
        }
      }
    }
  }
  if (value.notifications !== undefined) {
    if (!isRecord(value.notifications)) {
      diagnostics.push(
        diagnostic(
          'invalid-config',
          'notifications',
          'Notification-center options must be an object.',
        ),
      );
    } else {
      for (const forbidden of [
        'id',
        'store',
        'ownsToastEscape',
        'formatTimestamp',
        'resolveAction',
        'initiallyOpen',
        'initiallyFocused',
      ] as const) {
        if (Object.hasOwn(value.notifications, forbidden)) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `notifications.${forbidden}`,
              `${forbidden} is owned by the app shell.`,
            ),
          );
        }
      }
    }
  }
  if (value.toast !== undefined) {
    if (!isRecord(value.toast)) {
      diagnostics.push(
        diagnostic('invalid-config', 'toast', 'Toast options must be an object.'),
      );
    } else {
      for (const forbidden of [
        'store',
        'dismissalOwner',
        'maxToasts',
        'defaultDurationMs',
        'now',
      ] as const) {
        if (Object.hasOwn(value.toast, forbidden)) {
          diagnostics.push(
            diagnostic(
              'invalid-config',
              `toast.${forbidden}`,
              `${forbidden} is owned by the app shell's injected notification store.`,
            ),
          );
        }
      }
    }
  }
  return Object.freeze(diagnostics);
}

function unbindableDiagnostic(entry: UnbindableShortcut): AppShellDiagnostic {
  return diagnostic(
    entry.reason === 'conflicting-shortcut'
      ? 'conflicting-shortcut'
      : 'unbindable-shortcut',
    `registry.actions.${entry.actionId}.shortcuts`,
    entry.detail
      ?? `Shortcut is not bindable because its reason is ${entry.reason}.`,
    { actionId: entry.actionId, shortcut: entry.shortcut },
  );
}

function dedupeDiagnostics(
  diagnostics: readonly AppShellDiagnostic[],
): readonly AppShellDiagnostic[] {
  const seen = new Set<string>();
  return Object.freeze(
    diagnostics.filter((entry) => {
      const key = `${entry.code}\u0000${entry.field}\u0000${entry.message}\u0000${entry.actionId ?? ''}\u0000${entry.shortcut ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function bindingChord<M>(binding: KeyBinding<M>): string {
  const modifiers: Required<KeyModifiers> = {
    ctrl: binding.modifiers?.ctrl ?? false,
    alt: binding.modifiers?.alt ?? false,
    shift: binding.modifiers?.shift ?? false,
  };
  return `${modifiers.ctrl ? '1' : '0'}${modifiers.alt ? '1' : '0'}${modifiers.shift ? '1' : '0'}:${normalizeKeyBindingKey(binding.key, modifiers)}`;
}

function freezeCommand<M>(command: Command<M>): Command<M> {
  return Object.freeze({
    ...command,
    msg: isRecord(command.msg)
      ? Object.freeze({ ...command.msg })
      : command.msg,
    ...(command.keywords === undefined
      ? {}
      : { keywords: Object.freeze([...command.keywords]) as string[] }),
  });
}

function freezeBinding<M>(binding: KeyBinding<M>): KeyBinding<M> {
  return Object.freeze({
    ...binding,
    msg: isRecord(binding.msg)
      ? Object.freeze({ ...binding.msg })
      : binding.msg,
    ...(binding.modifiers === undefined
      ? {}
      : { modifiers: Object.freeze({ ...binding.modifiers }) }),
  });
}

function printablePaletteCharacter(event: KeyEvent): string | null {
  if (event.ctrl || event.alt) return null;
  const value = event.char ?? event.key;
  return Array.from(value).length === 1 && !unsafeText(value) ? value : null;
}

/**
 * Compose application-global action, notification, toast, and task state
 * without creating a view or executing a host action.
 */
export function createAppShell<HostModel, HostMsg>(
  config: AppShellConfig<HostModel, HostMsg>,
): AppShell<HostModel, HostMsg> {
  const normalizedConfig = normalizeAppShellConfig<HostModel, HostMsg>(config);
  if (!normalizedConfig.ok) {
    throw new AppShellValidationError('Invalid app shell config', normalizedConfig.diagnostics);
  }
  config = normalizedConfig.value;
  const shapeDiagnostics = validateConfigShape(config);
  const shortcutProjection = resolveShellShortcuts(
    isRecord(config.shortcuts) ? config.shortcuts : undefined,
  );
  const configDiagnostics = dedupeDiagnostics([
    ...shapeDiagnostics,
    ...shortcutProjection.diagnostics,
  ]);
  if (configDiagnostics.length > 0) {
    throw new AppShellValidationError('Invalid app shell config', configDiagnostics);
  }

  const shellId =
    config.id === undefined ? generateFocusGroupId('app-shell') : config.id;
  const store = config.notificationStore;
  let toastManager: ReturnType<typeof createToastManager>;
  try {
    toastManager = createToastManager({
      ...config.toast,
      id: config.toast?.id ?? `${shellId}:toasts`,
      store,
      dismissalOwner: 'host',
    });
  } catch (error) {
    throw new AppShellValidationError('Invalid app shell toast config', [
      diagnostic(
        'invalid-config', 'toast', describeAppShellError(error))]);
  }

  const globalFocusDecision = (
    hostModel: HostModel,
    model: AppShellModel,
  ): { readonly ok: true; readonly allowed: boolean } | { readonly ok: false; readonly diagnostics: readonly AppShellDiagnostic[] } => {
    try {
      const allowed = config.canUseGlobalShortcuts(hostModel, model);
      if (typeof allowed !== 'boolean') {
        return {
          ok: false,
          diagnostics: Object.freeze([diagnostic('invalid-context', 'canUseGlobalShortcuts', 'canUseGlobalShortcuts must return boolean.')]),
        };
      }
      return { ok: true, allowed };
    } catch (error) {
      return {
        ok: false,
        diagnostics: Object.freeze([diagnostic('invalid-context', 'canUseGlobalShortcuts', `Focus guard threw: ${describeAppShellError(error)}`)]),
      };
    }
  };

  const scopeAllowedOrThrow = (
    scope: ActionScope,
    action: ResolvedAction<HostModel, HostMsg>,
    hostModel: HostModel,
  ): boolean => {
    if (scope === 'app') return true;
    if (config.isScopeActive === undefined) return false;
    let allowed: unknown;
    try {
      allowed = config.isScopeActive(scope, action, hostModel);
    } catch (error) {
      throw new AppShellValidationError('Action scope resolution failed', [
        diagnostic(
          'invalid-context',
          `actions.${action.descriptor.id}.scope`, `isScopeActive threw: ${describeAppShellError(error)}`,
          { actionId: action.descriptor.id,
        }),
      ]);
    }
    if (typeof allowed !== 'boolean') {
      throw new AppShellValidationError('Action scope resolution failed', [
        diagnostic(
          'invalid-context',
          `actions.${action.descriptor.id}.scope`,
          'isScopeActive must return boolean.',
          { actionId: action.descriptor.id },
        ),
      ]);
    }
    return allowed;
  };

  const resolveRequestedAction = (
    actionId: unknown,
    hostModel: HostModel,
  ):
    | { readonly ok: true; readonly action: ResolvedAction<HostModel, HostMsg> }
    | { readonly ok: false; readonly diagnostics: readonly AppShellDiagnostic[] } => {
    if (
      typeof actionId !== 'string'
      || actionId.trim().length === 0
      || actionId.length > MAX_ACTION_ID_LENGTH
      || unsafeText(actionId)
    ) {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            'unknown-action',
            'actionId',
            `Action ID must be non-empty printable single-line text no longer than ${String(MAX_ACTION_ID_LENGTH)} characters.`,
          ),
        ]),
      };
    }

    let action: ResolvedAction<HostModel, HostMsg> | undefined;
    try {
      action = resolveAction(config.registry, actionId, hostModel);
    } catch (error) {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            'invalid-context',
            `actions.${actionId}.when`, `Action availability threw: ${describeAppShellError(error)}`, { actionId }),
        ]),
      };
    }
    if (action === undefined) {
      const registered = config.registry.byId.get(actionId);
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            registered === undefined ? 'unknown-action' : 'unavailable-action',
            `actions.${actionId}`,
            registered === undefined
              ? `Unknown action ${JSON.stringify(actionId)}.`
              : `Action ${JSON.stringify(actionId)} is hidden in the current model.`,
            { actionId },
          ),
        ]),
      };
    }
    if (action.availability === 'disabled') {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            'unavailable-action',
            `actions.${actionId}`,
            `Action ${JSON.stringify(actionId)} is disabled.`,
            { actionId },
          ),
        ]),
      };
    }
    const scope = action.descriptor.scope ?? 'app';
    try {
      if (!scopeAllowedOrThrow(scope, action, hostModel)) {
        return {
          ok: false,
          diagnostics: Object.freeze([
            diagnostic(
              'unavailable-action',
              `actions.${actionId}.scope`,
              `Action ${JSON.stringify(actionId)} is outside the active scope.`,
              { actionId },
            ),
          ]),
        };
      }
    } catch (error) {
      if (error instanceof AppShellValidationError) {
        return { ok: false, diagnostics: error.diagnostics };
      }
      throw error;
    }
    return { ok: true, action };
  };

  const makeCenter = (hostModel: HostModel): NotificationCenter =>
    createNotificationCenter({
      ...config.notifications,
      id: `${shellId}:notifications`,
      store,
      ownsToastEscape: false,
      formatTimestamp: config.formatTimestamp,
      resolveAction: (actionId) => {
        let action: ResolvedAction<HostModel, HostMsg> | undefined;
        try {
          action = resolveAction(config.registry, actionId, hostModel);
        } catch (error) {
          throw new AppShellValidationError(
            'Notification action cannot be resolved',
            [
              diagnostic(
                'invalid-context',
                `actions.${actionId}.when`, `Action availability threw: ${describeAppShellError(error)}`, { actionId }),
          ]);
        }
        if (action === undefined) {
          throw new AppShellValidationError(
            'Notification action cannot be resolved',
            [
              diagnostic(
                config.registry.byId.has(actionId)
                  ? 'unavailable-action'
                  : 'unknown-action',
                `actions.${actionId}`,
                config.registry.byId.has(actionId)
                  ? `Action ${JSON.stringify(actionId)} is hidden in the current model.`
                  : `Unknown action ${JSON.stringify(actionId)}.`,
                { actionId },
              ),
            ],
          );
        }
        const scope = action.descriptor.scope ?? 'app';
        const scopeActive = scopeAllowedOrThrow(scope, action, hostModel);
        return Object.freeze({
          label: action.descriptor.title,
          disabled: action.availability === 'disabled' || !scopeActive,
        });
      },
    });

  try {
    // Validate surface-only config eagerly. The resolver remains inert here.
    createNotificationCenter({
      ...config.notifications,
      id: `${shellId}:notifications`,
      store,
      ownsToastEscape: false,
      formatTimestamp: config.formatTimestamp,
      resolveAction: () => ({ label: 'Action' }),
    });
  } catch (error) {
    if (error instanceof AppShellValidationError) throw error;
    throw new AppShellValidationError('Invalid app shell notification config', [
      diagnostic(
        'invalid-config', 'notifications', describeAppShellError(error))]);
  }

  const toastProjection = (
    model: AppShellModel,
  ):
    | { readonly ok: true; readonly value: ToastModel }
    | { readonly ok: false; readonly diagnostics: readonly AppShellDiagnostic[] } => {
    try {
      const projected = toastManager.project(
        model.notifications,
        model.toastInteraction,
      );
      if (!projected.ok) {
        return {
          ok: false,
          diagnostics: Object.freeze(
            projected.diagnostics.map(notificationDiagnostic),
          ),
        };
      }
      return { ok: true, value: projected.value };
    } catch (error) {
      const entries =
        error instanceof ToastValidationError
          ? error.diagnostics.map(notificationDiagnostic)
          : [
              diagnostic(
                'invalid-model', 'toastInteraction', describeAppShellError(error))];
      return { ok: false, diagnostics: Object.freeze(entries) };
    }
  };

  const withChanges = (
    model: AppShellModel,
    changes: Partial<AppShellModel>,
  ): AppShellModel => snapshotModel({ ...model, ...changes });

  const commitToastModel = (
    model: AppShellModel,
    toastModel: ToastModel,
  ):
    | { readonly ok: true; readonly model: AppShellModel }
    | { readonly ok: false; readonly diagnostics: readonly AppShellDiagnostic[] } => {
    const validated = store.validateModel(toastModel);
    if (!validated.ok) {
      return {
        ok: false,
        diagnostics: Object.freeze(validated.diagnostics.map(notificationDiagnostic)),
      };
    }
    return {
      ok: true,
      model: withChanges(model, {
        notifications: validated.value,
        toastInteraction: toastManager.getInteraction(toastModel),
      }),
    };
  };

  const clearToastOwnership = (
    model: AppShellModel,
  ):
    | { readonly ok: true; readonly model: AppShellModel }
    | {
        readonly ok: false;
        readonly diagnostics: readonly AppShellDiagnostic[];
      } => {
    if (
      model.toastInteraction.mouseHoveredToastId === null
      && model.toastInteraction.focusedToastId === null
      && model.notifications.hoveredToastId === null
      && model.notifications.pausedToast === null
    ) {
      return { ok: true, model };
    }

    let projected: ReturnType<(typeof toastManager)['project']>;
    try {
      projected = toastManager.project(model.notifications, {
        mouseHoveredToastId: null,
        focusedToastId: null,
      });
    } catch (error) {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            'notification-store',
            'toastInteraction',
            `Hidden toast ownership could not be cleared: ${describeAppShellError(error)}`,
          ),
        ]),
      };
    }
    if (!projected.ok) {
      return {
        ok: false,
        diagnostics: Object.freeze(
          projected.diagnostics.map(notificationDiagnostic),
        ),
      };
    }
    return commitToastModel(model, projected.value);
  };

  const hasSurfaceAboveToast = (model: AppShellModel): boolean =>
    model.confirm !== null
    || model.palette.open
    || model.helpOpen
    || model.notificationCenter.open;

  const hasSurfaceAboveCenter = (model: AppShellModel): boolean =>
    model.confirm !== null || model.palette.open || model.helpOpen;

  const projectActions = (
    model: AppShellModel, hostModel: HostModel): AppShellProjection => {
    const normalizedModel = normalizeAppShellModel(model, store, config.registry.byId);
    if (!normalizedModel.ok) {
      return Object.freeze({
        commands: Object.freeze([]),
        keyBindings: Object.freeze([]),
        helpBindings: Object.freeze([]),
        diagnostics: normalizedModel.diagnostics,
      });
    }
    model = normalizedModel.value;

    const diagnostics: AppShellDiagnostic[] = [];
    let globalAllowed = false;
    const focusDecision = globalFocusDecision(hostModel, model);
    if (focusDecision.ok) globalAllowed = focusDecision.allowed;
    else diagnostics.push(...focusDecision.diagnostics);

    const scopeCache = new Map<string, boolean>();
    const projectScope = (
      scope: ActionScope,
      action: ResolvedAction<HostModel, HostMsg>,
    ): boolean => {
      const key = `${scope}\u0000${action.descriptor.id}`;
      const cached = scopeCache.get(key);
      if (cached !== undefined) return cached;
      try {
        const allowed = scopeAllowedOrThrow(scope, action, hostModel);
        scopeCache.set(key, allowed);
        return allowed;
      } catch (error) {
        if (error instanceof AppShellValidationError) {
          diagnostics.push(...error.diagnostics);
        } else {
          diagnostics.push(
            diagnostic(
              'invalid-context',
              `actions.${action.descriptor.id}.scope`, describeAppShellError(error),
              { actionId: action.descriptor.id }),
          );
        }
        scopeCache.set(key, false);
        return false;
      }
    };

    let commands: Command<AppShellMsg>[] = [];
    let actionBindings: KeyBinding<AppShellMsg>[] = [];
    try {
      const resolution = createActionResolutionSnapshot(config.registry, hostModel);
      commands = actionCommands(config.registry, hostModel, {
        includeDisabled: config.includeDisabledActions ?? true,
        includeUndiscoverable: config.includeUndiscoverableActions ?? false,
        resolution,
        isScopeActive: projectScope,
        toMsg: (actionId) =>
          Object.freeze({
            type: 'shell-request-action',
            actionId,
            source: 'palette',
          }),
      });
      actionBindings = actionKeyBindings(config.registry, hostModel, {
        includeDisabled: config.includeDisabledActions ?? true,
        resolution,
        isScopeActive: projectScope,
        toMsg: (actionId) =>
          Object.freeze({
            type: 'shell-request-action',
            actionId,
            source: 'shortcut',
          }),
      });
      diagnostics.push(
        ...unbindableActionShortcuts(config.registry, hostModel, {
          resolution,
          isScopeActive: projectScope,
        }).map(unbindableDiagnostic),
      );
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'invalid-context', 'registry', `Action projection threw: ${describeAppShellError(error)}`));
      commands = [];
      actionBindings = [];
    }

    const noBlockingSurface =
      model.confirm === null
      && !model.palette.open
      && !model.helpOpen
      && !model.notificationCenter.open;
    const hasDismissTarget =
      model.confirm !== null
      || model.palette.open
      || model.helpOpen
      || model.notificationCenter.actionCursor !== null
      || model.notificationCenter.expandedId !== null
      || model.notificationCenter.open
      || model.notifications.visibleToastIds.length > 0;
    const shortcut = shortcutProjection.shortcuts;
    const shellCommands: Command<AppShellMsg>[] = [
      {
        id: 'app-shell.help',
        label: 'Toggle keyboard help',
        category: 'Application',
        shortcut: shortcut.help.display,
        keywords: ['help', 'shortcuts', 'keys'],
        msg: { type: 'shell-toggle-help' },
      },
      {
        id: 'app-shell.notifications',
        label: 'Toggle notifications',
        category: 'Application',
        shortcut: shortcut.notifications.display,
        keywords: ['notifications', 'alerts', 'inbox'],
        msg: { type: 'shell-toggle-notifications' },
      },
      ...(model.notifications.entries.length === 0
        ? []
        : [
            {
              id: 'app-shell.clear-notifications',
              label: 'Clear notifications',
              category: 'Application',
              keywords: ['notifications', 'clear', 'dismiss all'],
              msg: { type: 'shell-clear-notifications' } as AppShellMsg,
            },
          ]),
    ];
    const actionCommandIds = new Set(commands.map((command) => command.id));
    for (const shellCommand of shellCommands) {
      if (actionCommandIds.has(shellCommand.id)) {
        diagnostics.push(
          diagnostic(
            'invalid-config',
            `registry.actions.${shellCommand.id}.id`,
            `Action ID ${JSON.stringify(shellCommand.id)} conflicts with a reserved app-shell command ID.`,
            { actionId: shellCommand.id },
          ),
        );
      } else {
        commands.push(shellCommand);
      }
    }
    const shellBinding = (
      name: AppShellShortcutName,
      msg: AppShellMsg,
      description: string,
      when: () => boolean,
    ): KeyBinding<AppShellMsg> => ({
      key: shortcut[name].key,
      modifiers: shortcut[name].modifiers,
      msg: Object.freeze(msg),
      description,
      category: 'Application',
      when,
    });
    const ownedShellBindings: Array<{
      readonly owner: AppShellShortcutName;
      readonly binding: KeyBinding<AppShellMsg>;
    }> = [
      {
        owner: 'palette',
        binding: shellBinding(
        'palette',
        { type: 'shell-open-palette' },
        'Open command palette',
        () => globalAllowed && noBlockingSurface,
        ),
      },
      {
        owner: 'help',
        binding: shellBinding(
        'help',
        { type: 'shell-toggle-help' },
        'Toggle keyboard help',
        () =>
          (
            model.helpOpen
            && model.confirm === null
            && !model.palette.open
          )
          || (globalAllowed
            && model.confirm === null
            && !model.palette.open
            && !model.notificationCenter.open),
        ),
      },
      {
        owner: 'notifications',
        binding: shellBinding(
        'notifications',
        { type: 'shell-toggle-notifications' },
        'Toggle notifications',
        () =>
          (
            model.notificationCenter.open
            && model.confirm === null
            && !model.palette.open
            && !model.helpOpen
          )
          || (globalAllowed
            && model.confirm === null
            && !model.palette.open
            && !model.helpOpen),
        ),
      },
    ];
    const configuredCloseBinding = shellBinding(
        'close',
        { type: 'shell-dismiss' },
        'Dismiss active surface',
        () => hasDismissTarget,
    );
    const canonicalEscapeBinding: KeyBinding<AppShellMsg> = {
      key: 'escape',
      modifiers: Object.freeze({ ctrl: false, alt: false, shift: false }),
      msg: Object.freeze({ type: 'shell-dismiss' }),
      description: 'Dismiss active surface',
      category: 'Application',
      when: () => hasDismissTarget,
    };
    ownedShellBindings.push({
      owner: 'close',
      binding: canonicalEscapeBinding,
    });
    if (bindingChord(configuredCloseBinding) !== bindingChord(canonicalEscapeBinding)) {
      ownedShellBindings.push({
        owner: 'close',
        binding: configuredCloseBinding,
      });
    }
    const shellBindings = ownedShellBindings.map(({ binding }) => binding);
    const reservedChords = new Map(
      ownedShellBindings.map(({ owner, binding }) => [bindingChord(binding), owner]),
    );
    const acceptedActionBindings: KeyBinding<AppShellMsg>[] = [];
    const rejectedShortcutDisplays = new Map<string, Set<string>>();
    const rejectedShortcutDeclarations = new Map<string, Set<string>>();
    for (const binding of actionBindings) {
      const chord = bindingChord(binding);
      const owner = reservedChords.get(chord);
      const actionId =
        binding.msg.type === 'shell-request-action'
          ? binding.msg.actionId
          : undefined;
      if (owner !== undefined) {
        const display = formatKeyBinding(binding.key, binding.modifiers);
        if (actionId !== undefined) {
          const displays = rejectedShortcutDisplays.get(actionId) ?? new Set();
          displays.add(display);
          rejectedShortcutDisplays.set(actionId, displays);

          const declarations = rejectedShortcutDeclarations.get(actionId) ?? new Set();
          for (const declaration of config.registry.byId.get(actionId)?.shortcuts ?? []) {
            try {
              if (formatActionShortcut(declaration) === display) {
                declarations.add(declaration);
              }
            } catch {
              // Malformed declarations are already covered by the unbindable
              // shortcut diagnostics from the coordinated projection.
            }
          }
          rejectedShortcutDeclarations.set(actionId, declarations);
        }
        diagnostics.push(
          diagnostic(
            'conflicting-shortcut',
            `actions.${actionId ?? 'unknown'}.shortcuts`,
            `Action shortcut conflicts with shell shortcuts.${owner}; the shell binding owns this chord.`,
            {
              ...(actionId === undefined ? {} : { actionId }),
              shortcut: display,
            },
          ),
        );
        continue;
      }
      const priorWhen = binding.when;
      acceptedActionBindings.push({
        ...binding,
        when: () =>
          globalAllowed
          && noBlockingSurface
          && (priorWhen === undefined || priorWhen()),
      });
    }
    commands = commands.map((command) => {
      const displays = rejectedShortcutDisplays.get(command.id);
      if (displays === undefined) return command;
      const remainingDisplays = command.shortcut?.split(', ').filter((display) => !displays.has(display)) ?? [];
      const descriptor = config.registry.byId.get(command.id);
      const rejectedDeclarations = rejectedShortcutDeclarations.get(command.id) ?? new Set();
      const keywords =
        descriptor === undefined
          ? command.keywords
          : [
              descriptor.id,
              ...(descriptor.description === undefined ? [] : [descriptor.description]),
              ...(descriptor.shortcuts ?? []).filter((declaration) => !rejectedDeclarations.has(declaration)),
            ];
      const { shortcut: _shortcut, keywords: _keywords, ...base } = command;
      return {
        ...base,
        ...(remainingDisplays.length === 0 ? {} : { shortcut: remainingDisplays.join(', ') }),
        ...(keywords === undefined ? {} : { keywords }),
      };
    });

    const localBindings: KeyBinding<AppShellMsg>[] = [];
    if (model.confirm !== null) {
      const selectedMessage: AppShellMsg =
        model.confirmSelection === 'cancel'
          ? { type: 'shell-cancel-confirm', id: model.confirm.id }
          : { type: 'shell-confirm', id: model.confirm.id };
      localBindings.push(
        {
          key: 'enter',
          msg: selectedMessage,
          description: 'Activate selected confirmation action',
          category: 'Confirmation',
          discoverable: false,
        },
        {
          key: 'y',
          msg: { type: 'shell-confirm', id: model.confirm.id },
          description: 'Confirm',
          category: 'Confirmation',
          discoverable: false,
        },
        {
          key: 'n',
          msg: { type: 'shell-cancel-confirm', id: model.confirm.id },
          description: 'Cancel',
          category: 'Confirmation',
          discoverable: false,
        },
        ...(['tab', 'left', 'right'] as const).map(
          (key): KeyBinding<AppShellMsg> => ({
            key,
            msg: { type: 'shell-confirm-toggle' },
            description: 'Move between confirmation actions',
            category: 'Confirmation',
            discoverable: false,
          }),
        ),
      );
    } else if (model.palette.open) {
      localBindings.push(
        {
          key: 'backspace',
          msg: { type: 'shell-palette-backspace' },
          description: 'Edit palette query',
          category: 'Command palette',
          discoverable: false,
        },
        {
          key: 'up',
          msg: { type: 'shell-palette-up' },
          description: 'Previous palette command',
          category: 'Command palette',
          discoverable: false,
        },
        {
          key: 'down',
          msg: { type: 'shell-palette-down' },
          description: 'Next palette command',
          category: 'Command palette',
          discoverable: false,
        },
        {
          key: 'enter',
          msg: { type: 'shell-palette-select' },
          description: 'Request palette command',
          category: 'Command palette',
          discoverable: false,
        },
      );
    }

    const frozenCommands = Object.freeze(commands.map(freezeCommand));
    const frozenBindings = Object.freeze(
      [...shellBindings, ...acceptedActionBindings, ...localBindings].map(
        freezeBinding,
      ),
    );
    const helpBindings = Object.freeze(
      frozenBindings.filter((binding) => binding.discoverable !== false),
    );
    return Object.freeze({
      commands: frozenCommands,
      keyBindings: frozenBindings,
      helpBindings,
      diagnostics: dedupeDiagnostics(diagnostics),
    });
  };

  const initialize = (
    hostModel: HostModel,
    seed: AppShellModelSeed = {}): AppShellModel => {
    let modelSeed: AppShellModelSeed;
    try {
      modelSeed = Object.freeze(snapshotOwnDataRecord(seed, 'seed')) as unknown as AppShellModelSeed;
    } catch (error) {
      throw new AppShellValidationError('Invalid app shell seed', [
        diagnostic('invalid-model', 'seed', `App shell seed could not be snapshotted: ${describeAppShellError(error)}`),
      ]);
    }

    let notifications: NotificationModel;
    try {
      notifications = store.init(modelSeed.notifications);
    } catch (error) {
      throw new AppShellValidationError('Invalid app shell notification seed', [
        diagnostic(
          'notification-store', 'notifications', describeAppShellError(error)),
      ]);
    }
    const requestedInteraction =
      modelSeed.toastInteraction === undefined
        ? toastManager.getInteraction(notifications)
        : modelSeed.toastInteraction;
    let initialToast: ToastModel;
    try {
      const projected = toastManager.project(notifications, requestedInteraction);
      if (!projected.ok) {
        throw new AppShellValidationError(
          'Invalid app shell toast seed',
          projected.diagnostics.map(notificationDiagnostic),
        );
      }
      initialToast = projected.value;
    } catch (error) {
      if (error instanceof AppShellValidationError) throw error;
      throw new AppShellValidationError('Invalid app shell toast seed', [
        diagnostic(
          'invalid-model', 'toastInteraction', describeAppShellError(error))]);
    }
    const validatedNotifications = store.validateModel(initialToast);
    if (!validatedNotifications.ok) {
      throw new AppShellValidationError(
        'Invalid app shell notification seed',
        validatedNotifications.diagnostics.map(notificationDiagnostic),
      );
    }

    let centerState: NotificationCenterState;
    try {
      centerState =
        modelSeed.notificationCenter === undefined
          ? makeCenter(hostModel).init(validatedNotifications.value)
          : modelSeed.notificationCenter;
    } catch (error) {
      throw new AppShellValidationError('Invalid app shell notification center seed', [
        diagnostic(
          'invalid-model', 'notificationCenter', describeAppShellError(error)),
      ]);
    }
    const candidate = {
      palette:
        modelSeed.palette === undefined
          ? createPaletteState()
          : modelSeed.palette,
      helpOpen: modelSeed.helpOpen === undefined ? false : modelSeed.helpOpen,
      confirm: modelSeed.confirm === undefined ? null : modelSeed.confirm,
      confirmSelection: modelSeed.confirmSelection ?? 'confirm',
      notificationCenter: centerState,
      notifications: validatedNotifications.value,
      toastInteraction: toastManager.getInteraction(initialToast),
      tasks: modelSeed.tasks === undefined ? [] : modelSeed.tasks,
    } as AppShellModel;
    const normalized = normalizeAppShellModel(candidate, store, config.registry.byId);
    if (!normalized.ok) {
      throw new AppShellValidationError('Invalid app shell seed', normalized.diagnostics);
    }
    if (!hasSurfaceAboveToast(normalized.value)) return normalized.value;
    const cleared = clearToastOwnership(normalized.value);
    if (!cleared.ok) {
      throw new AppShellValidationError(
        'Invalid layered app shell seed',
        cleared.diagnostics,
      );
    }
    return cleared.model;
  };

  const requestActionResult = (
    model: AppShellModel,
    actionId: unknown,
    source: AppShellActionSource,
    hostModel: HostModel,
  ): AppShellUpdateResult => {
    const resolved = resolveRequestedAction(actionId, hostModel);
    if (!resolved.ok) return frozenResult(model, [], resolved.diagnostics);
    return frozenResult(model, [
      {
        type: 'action-requested',
        actionId: resolved.action.descriptor.id,
        source,
      },
    ]);
  };

  const applyCenterMessage = (
    model: AppShellModel,
    msg: NotificationCenterMsg,
    context: AppShellContext<HostModel>,
  ): AppShellUpdateResult => {
    let transition: ReturnType<NotificationCenter['update']>;
    try {
      transition = makeCenter(context.hostModel).update(
        msg,
        model.notificationCenter,
        model.notifications,
        context.viewport,
      );
    } catch (error) {
      if (error instanceof AppShellValidationError) {
        return frozenResult(model, [], error.diagnostics);
      }
      return frozenResult(model, [], [
        diagnostic(
          'invalid-model', 'notificationCenter.message', describeAppShellError(error))]);
    }

    let projected: ReturnType<(typeof toastManager)['project']>;
    try {
      projected = toastManager.project(transition.store, model.toastInteraction);
    } catch (error) {
      return frozenResult(model, [], [
        diagnostic(
          'invalid-model', 'toastInteraction', describeAppShellError(error))]);
    }
    if (!projected.ok) {
      return frozenResult(
        model,
        [],
        projected.diagnostics.map(notificationDiagnostic),
      );
    }
    const committed = commitToastModel(
      withChanges(model, {
        notificationCenter: snapshotCenter(transition.state),
      }),
      projected.value,
    );
    if (!committed.ok) {
      return frozenResult(model, [], committed.diagnostics);
    }
    return frozenResult(
      committed.model,
      transition.action === undefined
        ? []
        : [
            {
              type: 'action-requested',
              actionId: transition.action.actionId,
              source: 'notification',
            },
          ],
    );
  };

  const openingFocusDiagnostics = (model: AppShellModel, hostModel: HostModel, surface: string): readonly AppShellDiagnostic[] => {
    const decision = globalFocusDecision(hostModel, model);
    if (!decision.ok) return decision.diagnostics;
    return decision.allowed
      ? Object.freeze([])
      : Object.freeze([diagnostic('unavailable-action', 'message.type', `${surface} cannot open while the host focus owner blocks global shortcuts.`)]);
  };

  const update = (
    msg: AppShellMsg,
    model: AppShellModel,
    context: AppShellContext<HostModel>): AppShellUpdateResult => {
    const normalizedModel = normalizeAppShellModel(model, store, config.registry.byId);
    const diagnostics: AppShellDiagnostic[] = normalizedModel.ok ? [] : [...normalizedModel.diagnostics];

    let contextSnapshot: AppShellContext<HostModel> | null = null;
    try {
      const captured = snapshotOwnDataRecord(context, 'context');
      if (isRecord(captured.viewport)) {
        captured.viewport = Object.freeze(snapshotOwnDataRecord(captured.viewport, 'context.viewport'));
      }
      contextSnapshot = Object.freeze(captured) as unknown as AppShellContext<HostModel>;
    } catch (error) {
      diagnostics.push(
        diagnostic('invalid-context', 'context', `App shell context could not be snapshotted: ${describeAppShellError(error)}`));
    }
    if (contextSnapshot !== null) {
      diagnostics.push(...validViewport(contextSnapshot.viewport));
    }

    let messageSnapshot: AppShellMsg | null = null;
    try {
      const captured = snapshotOwnDataRecord(msg, 'message');
      for (const field of ['confirm', 'msg', 'notification', 'task'] as const) {
        if (isRecord(captured[field])) {
          const nested = snapshotOwnDataRecord(captured[field], `message.${field}`);
          if (field === 'task' && isRecord(nested.state)) {
            nested.state = Object.freeze(snapshotOwnDataRecord(nested.state, 'message.task.state'));
          }
          if (field === 'msg' && isRecord(nested.toast)) {
            nested.toast = Object.freeze(
              snapshotOwnDataRecord(nested.toast, 'message.msg.toast'),
            );
          }
          captured[field] = Object.freeze(nested);
        }
      }
      messageSnapshot = Object.freeze(captured) as unknown as AppShellMsg;
    } catch (error) {
      diagnostics.push(diagnostic('invalid-model', 'message', `App shell message could not be snapshotted: ${describeAppShellError(error)}`));
    }
    if (messageSnapshot !== null && typeof messageSnapshot.type !== 'string') {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'message',
          'App shell message must be an object with a string type.',
        ),
      );
    }
    if (messageSnapshot !== null && typeof messageSnapshot.type === 'string') {
      diagnostics.push(
        ...validateAppShellMessageBoundary(
          messageSnapshot as unknown as Record<string, unknown>,
        ),
      );
    }
    if (diagnostics.length > 0) {
      return frozenResult(model, [], dedupeDiagnostics(diagnostics));
    }
    if (!normalizedModel.ok || contextSnapshot === null || messageSnapshot === null) {
      return frozenResult(
        model, [], [diagnostic('invalid-model', 'boundary', 'App shell boundary normalization failed.')]);
    }
    const current = normalizedModel.value;
    context = contextSnapshot;
    msg = messageSnapshot;

    switch (msg.type) {
      case 'shell-open-palette': {
        if (current.confirm !== null || current.palette.open || current.helpOpen || current.notificationCenter.open) {
          return frozenResult(
            current,
            [],
            [diagnostic('unavailable-action', 'message.type', 'Command palette cannot open while another shell surface owns focus.')],
          );
        }
        const focusDiagnostics = openingFocusDiagnostics(current, context.hostModel, 'Command palette');
        if (focusDiagnostics.length > 0) {
          return frozenResult(current, [], focusDiagnostics);
        }
        const cleared = clearToastOwnership(current);
        if (!cleared.ok) {
          return frozenResult(current, [], cleared.diagnostics);
        }
        const base = cleared.model;
        const projection = projectActions(base, context.hostModel);
        const commands = [...projection.commands];
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          base.notificationCenter,
          base.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(base, {
            palette: snapshotPalette(
              paletteUpdate({ type: 'pal-open' }, base.palette, commands),
            ),
            helpOpen: false,
            notificationCenter: snapshotCenter(center.state),
          }),
          [],
          projection.diagnostics,
        );
      }
      case 'shell-toggle-help': {
        if (current.confirm !== null || current.palette.open) {
          return frozenResult(current, [], [diagnostic('unavailable-action', 'message.type', 'Keyboard help cannot toggle while a higher-priority shell surface owns focus.')]);
        }
        const opening = !current.helpOpen;
        if (!opening) {
          return frozenResult(withChanges(current, { helpOpen: false }));
        }
        if (current.palette.open || current.notificationCenter.open) {
          return frozenResult(
            current,
            [],
            [diagnostic('unavailable-action', 'message.type', 'Keyboard help cannot open while another shell surface owns focus.')],
          );
        }
        const focusDiagnostics = openingFocusDiagnostics(current, context.hostModel, 'Keyboard help');
        if (focusDiagnostics.length > 0) {
          return frozenResult(current, [], focusDiagnostics);
        }
        const cleared = clearToastOwnership(current);
        if (!cleared.ok) {
          return frozenResult(current, [], cleared.diagnostics);
        }
        const base = cleared.model;
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          base.notificationCenter,
          base.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(base, {
            palette: snapshotPalette(createPaletteState()),
            helpOpen: true,
            notificationCenter: snapshotCenter(center.state),
          }),
        );
      }
      case 'shell-toggle-notifications': {
        if (
          current.confirm !== null
          || current.palette.open
          || current.helpOpen
        ) {
          return frozenResult(
            current,
            [],
            [diagnostic('unavailable-action', 'message.type', 'Notification center cannot toggle while a higher-priority shell surface owns focus.')],
          );
        }
        if (!current.notificationCenter.open) {
          if (current.palette.open || current.helpOpen) {
            return frozenResult(
              current,
              [],
              [diagnostic('unavailable-action', 'message.type', 'Notification center cannot open while another shell surface owns focus.')],
            );
          }
          const focusDiagnostics = openingFocusDiagnostics(current, context.hostModel, 'Notification center');
          if (focusDiagnostics.length > 0) {
            return frozenResult(current, [], focusDiagnostics);
          }
        }
        let base = current;
        if (!current.notificationCenter.open) {
          const cleared = clearToastOwnership(current);
          if (!cleared.ok) {
            return frozenResult(current, [], cleared.diagnostics);
          }
          base = withChanges(cleared.model, {
            palette: snapshotPalette(createPaletteState()),
            helpOpen: false,
          });
        }
        return applyCenterMessage(base, { type: 'toggle' }, context);
      }
      case 'shell-dismiss': {
        if (current.confirm !== null) {
          return frozenResult(
            withChanges(current, { confirm: null }),
            [
              {
                type: 'confirm-resolved',
                id: current.confirm.id,
                confirmed: false,
              },
            ],
          );
        }
        if (current.palette.open) {
          const projection = projectActions(current, context.hostModel);
          return frozenResult(
            withChanges(current, {
              palette: snapshotPalette(
                paletteUpdate(
                  { type: 'pal-close' },
                  current.palette, [...projection.commands])),
            }),
            [],
            projection.diagnostics,
          );
        }
        if (current.helpOpen) {
          return frozenResult(withChanges(current, { helpOpen: false }));
        }
        if (
          current.notificationCenter.actionCursor !== null
          || current.notificationCenter.expandedId !== null
          || current.notificationCenter.open
        ) {
          return applyCenterMessage(current, { type: 'escape' }, context);
        }
        if (current.notifications.visibleToastIds.length > 0) {
          const projected = toastProjection(current);
          if (!projected.ok) {
            return frozenResult(current, [], projected.diagnostics);
          }
          try {
            const [next] = toastManager.update(
              { type: 'dismiss-latest' },
              projected.value,
            );
            const committed = commitToastModel(current, next);
            return committed.ok
              ? frozenResult(committed.model)
              : frozenResult(current, [], committed.diagnostics);
          } catch (error) {
            const toastDiagnostics =
              error instanceof ToastValidationError
                ? error.diagnostics.map(notificationDiagnostic)
                : [
                    diagnostic(
                      'notification-store', 'toast', describeAppShellError(error))];
            return frozenResult(current, [], toastDiagnostics);
          }
        }
        return frozenResult(current);
      }
      case 'shell-open-confirm': {
        const confirmDiagnostics = validateConfirm(msg.confirm, 'message.confirm');
        if (confirmDiagnostics.length > 0) {
          return frozenResult(current, [], confirmDiagnostics);
        }
        const cleared = clearToastOwnership(current);
        if (!cleared.ok) {
          return frozenResult(current, [], cleared.diagnostics);
        }
        const base = cleared.model;
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          base.notificationCenter,
          base.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(base, {
            palette: snapshotPalette(createPaletteState()),
            helpOpen: false,
            confirm: snapshotConfirm(msg.confirm),
            confirmSelection: 'confirm',
            notificationCenter: snapshotCenter(center.state),
          }),
          base.confirm === null
            ? []
            : [
                {
                  type: 'confirm-resolved',
                  id: base.confirm.id,
                  confirmed: false,
                },
              ],
        );
      }
      case 'shell-confirm':
      case 'shell-cancel-confirm': {
        if (
          typeof msg.id !== 'string'
          || msg.id.trim().length === 0
          || unsafeText(msg.id)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message.id',
              'Confirmation ID must be non-empty printable single-line text.',
            ),
          ]);
        }
        if (current.confirm === null) return frozenResult(current);
        if (current.confirm.id !== msg.id) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.id',
              `Confirmation ${JSON.stringify(msg.id)} is no longer active.`,
            ),
          ]);
        }
        return frozenResult(
          withChanges(current, { confirm: null }),
          [
            {
              type: 'confirm-resolved',
              id: current.confirm.id,
              confirmed: msg.type === 'shell-confirm',
            },
          ],
        );
      }
      case 'shell-confirm-select': {
        if (current.confirm === null) return frozenResult(current);
        return frozenResult(
          withChanges(current, { confirmSelection: msg.selection }),
        );
      }
      case 'shell-confirm-toggle': {
        if (current.confirm === null) return frozenResult(current);
        return frozenResult(
          withChanges(current, {
            confirmSelection:
              current.confirmSelection === 'cancel' ? 'confirm' : 'cancel',
          }),
        );
      }
      case 'shell-palette-input': {
        if (!current.palette.open) return frozenResult(current);
        if (
          typeof msg.char !== 'string'
          || Array.from(msg.char).length !== 1
          || unsafeText(msg.char)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model', 'message.char', 'Palette input must be one printable Unicode scalar.')]);
        }
        if (current.confirm !== null) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Palette input is blocked while confirmation owns focus.',
            ),
          ]);
        }
        const projection = projectActions(current, context.hostModel);
        const commands = [...projection.commands];
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(
              paletteUpdate(
                { type: 'pal-input', char: msg.char },
                current.palette, commands)),
          }),
          [],
          projection.diagnostics,
        );
      }
      case 'shell-palette-backspace':
      case 'shell-palette-up':
      case 'shell-palette-down': {
        if (current.confirm !== null) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Palette navigation is blocked while confirmation owns focus.',
            ),
          ]);
        }
        if (!current.palette.open) return frozenResult(current);
        const paletteType =
          msg.type === 'shell-palette-backspace'
            ? 'pal-backspace'
            : msg.type === 'shell-palette-up'
              ? 'pal-up' : 'pal-down';
        const projection = projectActions(current, context.hostModel);
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(
              paletteUpdate(
                { type: paletteType },
                current.palette, [...projection.commands])),
          }),
          [],
          projection.diagnostics,
        );
      }
      case 'shell-palette-select': {
        if (current.confirm !== null) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Palette selection is blocked while confirmation owns focus.',
            ),
          ]);
        }
        if (!current.palette.open) return frozenResult(current);
        const projection = projectActions(current, context.hostModel);
        const commands = [...projection.commands];
        const selected = getSelectedCommand(current.palette, commands);
        if (selected === null) {
          const staleId = current.palette.filteredIds[current.palette.selectedIndex];
          return frozenResult(
            withChanges(current, {
              palette: reconcilePaletteCommands(current.palette, commands),
            }),
            [],
            dedupeDiagnostics([
              ...projection.diagnostics,
              diagnostic(
                'unavailable-action',
                staleId === undefined ? 'palette.selectedIndex' : `actions.${staleId}`,
                staleId === undefined ? 'Palette has no current command selection.' : 'The selected palette command is no longer available.',
                {
                  ...(staleId === undefined ? {} : { actionId: staleId }),
                },
              ),
            ]),
          );
        }
        if (selected.disabled) {
          return frozenResult(current,
            [],
            dedupeDiagnostics([
              ...projection.diagnostics,
              diagnostic('unavailable-action',
              `actions.${selected.id}`,
              `Action ${JSON.stringify(selected.id)} is disabled.`,
              { actionId: selected.id }),
            ]),
          );
        }
        const closedPalette = withChanges(current, {
          palette: snapshotPalette(createPaletteState()),
        });
        const selectedResult =
          selected.msg.type === 'shell-request-action'
          ? requestActionResult(
              closedPalette,
              selected.msg.actionId,
              'palette',
              context.hostModel,
            )
          : update(selected.msg, closedPalette, context);
        return appendResultDiagnostics(selectedResult, projection.diagnostics);
      }
      case 'shell-palette-highlight': {
        if (
          !current.palette.open
          || !Number.isInteger(msg.index)
          || msg.index < 0
          || msg.index >= current.palette.filteredIds.length
        ) {
          return frozenResult(current);
        }
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette({
              ...current.palette,
              selectedIndex: msg.index,
            }),
          }),
        );
      }
      case 'shell-palette-select-at': {
        if (
          !current.palette.open
          || !Number.isInteger(msg.index)
          || msg.index < 0
          || msg.index >= current.palette.filteredIds.length
        ) {
          return frozenResult(current);
        }
        const pointed = withChanges(current, {
          palette: snapshotPalette({
            ...current.palette,
            selectedIndex: msg.index,
          }),
        });
        return update({ type: 'shell-palette-select' }, pointed, context);
      }
      case 'shell-request-action':
        if (
          msg.source !== 'palette'
          && msg.source !== 'shortcut'
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message.source',
              'Direct action request source must be palette or shortcut.',
            ),
          ]);
        }
        if (
          msg.source === 'palette'
          && current.confirm !== null
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.source',
              'Palette action requests are blocked while confirmation owns focus.',
              { actionId: msg.actionId },
            ),
          ]);
        }
        if (msg.source === 'palette') {
          if (!current.palette.open) {
            return frozenResult(
              current,
              [],
              [diagnostic('unavailable-action', 'message.source', 'Palette action requests require an open command palette.', { actionId: msg.actionId })],
            );
          }
          const projection = projectActions(current, context.hostModel);
          const selected = getSelectedCommand(current.palette, [...projection.commands]);
          if (selected === null) {
            return frozenResult(
              withChanges(current, {
                palette: reconcilePaletteCommands(current.palette, projection.commands),
              }),
              [],
              dedupeDiagnostics([
                ...projection.diagnostics,
                diagnostic('unavailable-action', 'message.actionId', 'The selected palette command is no longer available.', { actionId: msg.actionId }),
              ]),
            );
          }
          if (selected.msg.type !== 'shell-request-action' || selected.msg.actionId !== msg.actionId) {
            return frozenResult(
              current,
              [],
              dedupeDiagnostics([
                ...projection.diagnostics,
                diagnostic('unavailable-action', 'message.actionId', 'Palette action request must match the current palette selection.', {
                  actionId: msg.actionId,
                }),
              ]),
            );
          }
          if (selected.disabled) {
            return frozenResult(
              current,
              [],
              dedupeDiagnostics([
                ...projection.diagnostics,
                diagnostic('unavailable-action', `actions.${selected.id}`, `Action ${JSON.stringify(selected.id)} is disabled.`, { actionId: selected.id }),
              ]),
            );
          }
          const closedPalette = withChanges(current, {
            palette: snapshotPalette(createPaletteState()),
          });
          return appendResultDiagnostics(requestActionResult(closedPalette, msg.actionId, 'palette', context.hostModel), projection.diagnostics);
        }
        if (msg.source === 'shortcut') {
          if (
            current.confirm !== null
            || current.palette.open
            || current.helpOpen
            || current.notificationCenter.open
          ) {
            return frozenResult(current, [], [
              diagnostic(
                'unavailable-action',
                'message.source',
                'Shortcut action requests are blocked while a shell surface owns focus.',
                { actionId: msg.actionId },
              ),
            ]);
          }
          let globalAllowed: unknown;
          try {
            globalAllowed = config.canUseGlobalShortcuts(
              context.hostModel,
              current,
            );
          } catch (error) {
            return frozenResult(current, [], [
              diagnostic(
                'invalid-context', 'canUseGlobalShortcuts', `Focus guard threw: ${describeAppShellError(error)}`,
                { actionId: msg.actionId })],
            );
          }
          if (typeof globalAllowed !== 'boolean') {
            return frozenResult(current, [], [
              diagnostic(
                'invalid-context',
                'canUseGlobalShortcuts',
                'canUseGlobalShortcuts must return boolean.',
                { actionId: msg.actionId },
              ),
            ]);
          }
          if (!globalAllowed) {
            return frozenResult(current, [], [
              diagnostic(
                'unavailable-action',
                'message.source',
                'Shortcut action requests are blocked by the host focus owner.',
                { actionId: msg.actionId },
              ),
            ]);
          }
        }
        return requestActionResult(
          current,
          msg.actionId,
          msg.source,
          context.hostModel,
        );
      case 'shell-notification-center':
        if (
          hasSurfaceAboveCenter(current)
          && msg.msg.type !== 'close'
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Notification-center interaction is blocked while a higher-priority shell surface owns focus.',
            ),
          ]);
        }
        if (
          !current.notificationCenter.open
          && (
            msg.msg.type === 'activate'
            || msg.msg.type === 'activate-action'
          )
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.msg',
              'Notification action requests require the open notification center.',
            ),
          ]);
        }
        if (
          !current.notificationCenter.open
          && (
            msg.msg.type === 'open'
            || msg.msg.type === 'toggle'
          )
        ) {
          const cleared = clearToastOwnership(current);
          if (!cleared.ok) {
            return frozenResult(current, [], cleared.diagnostics);
          }
          return applyCenterMessage(cleared.model, msg.msg, context);
        }
        return applyCenterMessage(current, msg.msg, context);
      case 'shell-activate-notification-action': {
        if (
          !Number.isSafeInteger(msg.id)
          || msg.id <= 0
          || typeof msg.actionId !== 'string'
          || msg.actionId.trim().length === 0
          || unsafeText(msg.actionId)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message',
              'Notification action requires a positive ID and printable action ID.',
            ),
          ]);
        }
        const entry = current.notifications.entries.find(
          (candidate) => candidate.id === msg.id,
        );
        if (
          entry === undefined
          || !current.notifications.visibleToastIds.includes(entry.id)
          || !entry.actionIds.includes(msg.actionId)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.actionId',
              'The requested toast action is no longer visible.',
              { actionId: msg.actionId },
            ),
          ]);
        }
        const projection = projectActions(current, context.hostModel);
        const command = projection.commands.find(
          (candidate) => candidate.id === msg.actionId,
        );
        if (command === undefined || command.disabled === true) {
          return frozenResult(current, [], [
            ...projection.diagnostics,
            diagnostic(
              'unavailable-action',
              `actions.${msg.actionId}`,
              'The requested toast action is unavailable.',
              { actionId: msg.actionId },
            ),
          ]);
        }
        const hidden = withChanges(current, {
          notifications: store.hideToast(current.notifications, entry.id),
        });
        return appendResultDiagnostics(
          requestActionResult(
            hidden,
            msg.actionId,
            'notification',
            context.hostModel,
          ),
          projection.diagnostics,
        );
      }
      case 'shell-notify': {
        let enqueued: ReturnType<NotificationStore['enqueue']>;
        try {
          enqueued = store.enqueue(current.notifications, msg.notification);
        } catch (error) {
          return frozenResult(current, [], [
            diagnostic(
              'notification-store', 'notification', describeAppShellError(error))]);
        }
        if (!enqueued.ok) {
          return frozenResult(
            current,
            [],
            enqueued.diagnostics.map(notificationDiagnostic));
        }
        const unknownActionIndex = enqueued.value.entry.actionIds.findIndex((actionId) => !config.registry.byId.has(actionId));
        if (unknownActionIndex >= 0) {
          const actionId = enqueued.value.entry.actionIds[unknownActionIndex]!;
          return frozenResult(
            current,
            [],
            [
              diagnostic(
                'unknown-action',
                `notification.actionIds[${String(unknownActionIndex)}]`,
                `Notification references unknown action ${JSON.stringify(actionId)}.`,
                { actionId },
              ),
            ],
          );
        }
        let projected: ReturnType<(typeof toastManager)['project']>;
        try {
          projected = toastManager.project(
            enqueued.value.model,
            current.toastInteraction,
          );
        } catch (error) {
          return frozenResult(current, [], [
            diagnostic(
              'notification-store', 'notification', describeAppShellError(error))]);
        }
        if (!projected.ok) {
          return frozenResult(
            current,
            [],
            projected.diagnostics.map(notificationDiagnostic),
          );
        }
        const committed = commitToastModel(current, projected.value);
        return committed.ok
          ? frozenResult(committed.model)
          : frozenResult(current, [], committed.diagnostics);
      }
      case 'shell-mark-notification-read': {
        if (!validPositiveId(msg.id)) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message.id',
              'Notification ID must be a positive safe integer.',
            ),
          ]);
        }
        try {
          return frozenResult(
            withChanges(current, {
              notifications: store.markRead(current.notifications, msg.id),
            }),
          );
        } catch (error) {
          return frozenResult(current, [], [
            diagnostic(
              'notification-store', 'notification', describeAppShellError(error))]);
        }
      }
      case 'shell-clear-notifications': {
        try {
          let nextNotifications = current.notifications;
          for (const entry of current.notifications.entries) {
            nextNotifications = store.dismiss(nextNotifications, entry.id);
          }
          const projected = toastManager.project(nextNotifications, {
            mouseHoveredToastId: null,
            focusedToastId: null,
          });
          if (!projected.ok) {
            return frozenResult(
              current,
              [],
              projected.diagnostics.map(notificationDiagnostic),
            );
          }
          const committed = commitToastModel(current, projected.value);
          return committed.ok
            ? frozenResult(
                withChanges(committed.model, {
                  notificationCenter: snapshotCenter(
                    makeCenter(context.hostModel).init(committed.model.notifications),
                  ),
                }),
              )
            : frozenResult(current, [], committed.diagnostics);
        } catch (error) {
          return frozenResult(current, [], [
            diagnostic(
              'notification-store', 'notifications', describeAppShellError(error))]);
        }
      }
      case 'shell-toast': {
        if (
          hasSurfaceAboveToast(current)
          && INTERACTIVE_TOAST_MESSAGES.has(msg.msg.type)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Toast interaction is blocked while a higher-priority shell surface owns focus.',
            ),
          ]);
        }
        const projected = toastProjection(current);
        if (!projected.ok) {
          return frozenResult(current, [], projected.diagnostics);
        }
        try {
          const [next] = toastManager.update(msg.msg, projected.value);
          const committed = commitToastModel(current, next);
          return committed.ok
            ? frozenResult(committed.model)
            : frozenResult(current, [], committed.diagnostics);
        } catch (error) {
          const toastDiagnostics =
            error instanceof ToastValidationError
              ? error.diagnostics.map(notificationDiagnostic)
              : [
                  diagnostic(
                    'notification-store', 'toast', describeAppShellError(error))];
          return frozenResult(current, [], toastDiagnostics);
        }
      }
      case 'shell-task-state': {
        const taskDiagnostics = validateTasks([msg.task]);
        if (taskDiagnostics.length > 0) {
          return frozenResult(current, [], taskDiagnostics);
        }
        const tasks = [...current.tasks];
        const index = tasks.findIndex((task) => task.id === msg.task.id);
        if (index < 0) tasks.push(msg.task);
        else tasks[index] = msg.task;
        return frozenResult(
          withChanges(current, { tasks: snapshotTasks(tasks) }),
        );
      }
      case 'shell-remove-task': {
        if (
          typeof msg.id !== 'string'
          || msg.id.trim().length === 0
          || unsafeText(msg.id)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message.id',
              'Task ID must be non-empty printable single-line text.',
            ),
          ]);
        }
        return frozenResult(
          withChanges(current, {
            tasks: snapshotTasks(
              current.tasks.filter((task) => task.id !== msg.id),
            ),
          }),
        );
      }
      case 'shell-noop':
        return frozenResult(current);
      default:
        return frozenResult(current, [], [
          diagnostic(
            'invalid-model',
            'message.type',
            `Unknown app shell message type ${JSON.stringify(
              (msg as { readonly type?: unknown }).type,
            )}.`,
          ),
        ]);
    }
  };

  const subscriptions = (
    model: AppShellModel,
    context: AppShellContext<HostModel>,
  ): Subscription<AppShellMsg> => {
    const normalizedModel = normalizeAppShellModel(model, store, config.registry.byId);
    if (!normalizedModel.ok) {
      throw new AppShellValidationError('Cannot subscribe from invalid app shell model', normalizedModel.diagnostics);
    }
    model = normalizedModel.value;

    let capturedContext: Record<string, unknown>;
    try {
      capturedContext = snapshotOwnDataRecord(context, 'context');
      if (isRecord(capturedContext.viewport)) {
        capturedContext.viewport = Object.freeze(snapshotOwnDataRecord(capturedContext.viewport, 'context.viewport'));
      }
    } catch (error) {
      throw new AppShellValidationError('Cannot subscribe from invalid app shell context', [
        diagnostic('invalid-context', 'context', `App shell context could not be snapshotted: ${describeAppShellError(error)}`),
      ]);
    }
    context = Object.freeze(capturedContext) as unknown as AppShellContext<HostModel>;
    const contextDiagnostics = validViewport(context.viewport);
    if (contextDiagnostics.length > 0) {
      throw new AppShellValidationError('Cannot subscribe from invalid app shell context', contextDiagnostics);
    }
    const projection = projectActions(model, context.hostModel);
    if (projection.diagnostics.length > 0) {
      throw new AppShellValidationError('Cannot subscribe from an invalid app shell projection', projection.diagnostics);
    }
    const subscriptions: Subscription<AppShellMsg>[] = [
      keyMap(projection.keyBindings),
    ];
    if (model.palette.open && model.confirm === null) {
      subscriptions.push(
        Sub.filter(
          Sub.keyEvent((event): AppShellMsg => {
            const char = printablePaletteCharacter(event);
            return char === null
              ? { type: 'shell-noop' }
              : { type: 'shell-palette-input', char };
          }),
          (message) => message.type !== 'shell-noop',
        ),
      );
    }

    if (
      !hasSurfaceAboveCenter(model)
      && model.notificationCenter.open
    ) {
      let centerSubscriptions: Subscription<NotificationCenterMsg>;
      try {
        centerSubscriptions = makeCenter(context.hostModel).subscriptions(
          model.notificationCenter,
          model.notifications,
        );
      } catch (error) {
        if (error instanceof AppShellValidationError) throw error;
        throw new AppShellValidationError(
          'Cannot subscribe to the notification center',
          [
            diagnostic(
              'invalid-context',
              'notificationCenter.subscriptions',
              describeAppShellError(error),
            ),
          ],
        );
      }
      subscriptions.push(
        Sub.map(
          removeEscapeSubscription(centerSubscriptions),
          (centerMsg): AppShellMsg => ({
            type: 'shell-notification-center',
            msg: centerMsg,
          }),
        ),
      );
    }

    if (!hasSurfaceAboveToast(model)) {
      const projectedToast = toastProjection(model);
      if (!projectedToast.ok) {
        throw new AppShellValidationError(
          'Cannot subscribe to invalid app shell toasts',
          projectedToast.diagnostics,
        );
      }
      subscriptions.push(
        Sub.map(
          toastManager.subscriptions(projectedToast.value),
          (toastMsg): AppShellMsg => ({ type: 'shell-toast', msg: toastMsg }),
        ),
      );
    } else if (
      model.notifications.visibleToastIds.some((id) =>
        model.notifications.entries.some(
          (entry) => entry.id === id && entry.expiresAt !== null,
        ),
      )
    ) {
      subscriptions.push(
        Sub.timer(500, (): AppShellMsg => ({
          type: 'shell-toast',
          msg: { type: 'tick' },
        })),
      );
    }
    return Sub.batch(...subscriptions);
  };

  const status = (
    model: AppShellModel,
    options: AppShellStatusOptions = {}): AppShellStatusSections => {
    const normalizedModel = normalizeAppShellModel(model, store, config.registry.byId);
    const diagnostics = normalizedModel.ok ? [] : [...normalizedModel.diagnostics];
    let optionsSnapshotted = false;
    try {
      options = Object.freeze(snapshotOwnDataRecord(options, 'status.options')) as unknown as AppShellStatusOptions;
      optionsSnapshotted = true;
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'invalid-context', 'status.options', `App shell status options could not be snapshotted: ${describeAppShellError(error)}`));
    }
    if (optionsSnapshotted) {
      for (const field of ['mode', 'title'] as const) {
        const value = options[field];
        if (
          value !== undefined
          && (typeof value !== 'string' || unsafeText(value))
        ) {
          diagnostics.push(
            diagnostic(
              'invalid-context',
              `status.options.${field}`,
              `${field} must be printable single-line text when supplied.`,
            ),
          );
        }
      }
      if (
        options.showShortcutHints !== undefined
        && typeof options.showShortcutHints !== 'boolean'
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-context',
            'status.options.showShortcutHints',
            'showShortcutHints must be boolean when supplied.',
          ),
        );
      }
    }
    if (diagnostics.length > 0) {
      throw new AppShellValidationError('Cannot derive status from invalid app shell input', diagnostics);
    }
    if (!normalizedModel.ok) {
      throw new AppShellValidationError('Cannot derive status from invalid app shell input', normalizedModel.diagnostics);
    }
    model = normalizedModel.value;

    const surfaceMode =
      model.confirm !== null
        ? 'CONFIRM'
        : model.palette.open
          ? 'PALETTE'
          : model.helpOpen
            ? 'HELP'
            : model.notificationCenter.open
              ? 'NOTIFICATIONS'
              : options.mode;
    const left: StatusBarSection[] = [];
    if (surfaceMode !== undefined && surfaceMode.length > 0) {
      left.push(Object.freeze({ text: surfaceMode, bold: true, mode: true }));
    }
    const center: StatusBarSection[] =
      options.title === undefined || options.title.length === 0
        ? []
        : [Object.freeze({ text: options.title, bold: true })];
    const right: StatusBarSection[] = [];

    const taskSummary = summarizeAppShellTasks(model.tasks);
    switch (taskSummary.overall) {
      case 'error':
        right.push(
          Object.freeze({
            text: `${String(taskSummary.failed)} failed`,
            bold: true,
          }),
        );
        break;
      case 'running':
        right.push(
          Object.freeze({ text: `${String(taskSummary.running)} running` }),
        );
        break;
      case 'cancelled':
        right.push(
          Object.freeze({ text: `${String(taskSummary.cancelled)} cancelled` }),
        );
        break;
      case 'success':
        right.push(
          Object.freeze({ text: `${String(taskSummary.succeeded)} complete` }),
        );
        break;
      case 'idle':
        right.push(Object.freeze({ text: `${String(taskSummary.idle)} idle` }));
        break;
      case null:
        break;
    }

    const unread = model.notifications.entries.reduce(
      (count, entry) =>
        count
        + (!entry.read
        && (entry.delivery === 'inbox' || entry.delivery === 'both')
          ? 1
          : 0),
      0,
    );
    if (unread > 0) {
      right.push(Object.freeze({ text: `${String(unread)} unread` }));
    }
    if (options.showShortcutHints === true) {
      right.push(
        Object.freeze({
          text: `Palette ${shortcutProjection.shortcuts.palette.display}`,
        }),
        Object.freeze({
          text: `Help ${shortcutProjection.shortcuts.help.display}`,
        }),
      );
    }

    return Object.freeze({
      left: Object.freeze(left),
      center: Object.freeze(center),
      right: Object.freeze(right),
    });
  };

  return Object.freeze({
    registry: config.registry,
    notificationStore: store,
    toastManager,
    init: initialize,
    validateModel(model: AppShellModel): readonly AppShellDiagnostic[] {
      const normalized = normalizeAppShellModel(model, store, config.registry.byId);
      return normalized.ok ? Object.freeze([]) : normalized.diagnostics;
    },
    update,
    project: projectActions,
    subscriptions,
    notificationCenter: makeCenter,
    projectToasts(model: AppShellModel): ToastModel {
      const normalized = normalizeAppShellModel(model, store, config.registry.byId);
      if (!normalized.ok) {
        throw new AppShellValidationError('Cannot project invalid app shell model', normalized.diagnostics);
      }
      model = normalized.value;
      const projected = toastProjection(model);
      if (!projected.ok) {
        throw new AppShellValidationError(
          'Cannot project app shell toasts',
          projected.diagnostics,
        );
      }
      return projected.value;
    },
    status,
  });
}
