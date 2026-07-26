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
  Sub as Subscription,
  TaskState,
  TaskStatus,
} from '@celestial/core/nebula';
import { resolveAction, Sub, subKind } from '@celestial/core/nebula';
import {
  actionCommands,
  actionKeyBindings,
  type UnbindableShortcut,
  unbindableActionShortcuts,
} from './actions.js';
import { generateFocusGroupId } from './focus-group.js';
import {
  formatKeyBinding,
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
import type {
  NotificationDiagnostic,
  NotificationEnqueueInput,
  NotificationModel,
  NotificationModelSeed,
  NotificationStore,
} from './notification-store.js';
import {
  type Command,
  createPaletteState,
  getSelectedCommand,
  type PaletteState,
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

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;
const TASK_STATUSES = new Set<TaskStatus>(['idle', 'running', 'success', 'error', 'cancelled']);
const MODIFIERS = new Set(['ctrl', 'alt', 'shift']);

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
  | { readonly type: 'shell-palette-input'; readonly char: string }
  | { readonly type: 'shell-palette-backspace' }
  | { readonly type: 'shell-palette-up' }
  | { readonly type: 'shell-palette-down' }
  | { readonly type: 'shell-palette-select' }
  | {
      readonly type: 'shell-request-action';
      readonly actionId: string;
      readonly source: Exclude<AppShellActionSource, 'notification'>;
    }
  | { readonly type: 'shell-notification-center'; readonly msg: NotificationCenterMsg }
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
  return Object.freeze({
    code,
    field,
    message,
    ...(extra.actionId === undefined ? {} : { actionId: extra.actionId }),
    ...(extra.shortcut === undefined ? {} : { shortcut: extra.shortcut }),
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
        'invalid-shortcut',
        field,
        error instanceof Error ? error.message : String(error),
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
    const configuredValue = configured?.[name];
    const source = configuredValue === undefined ? 'default' : 'configured';
    const result = parseShellShortcut(
      name,
      configuredValue === undefined ? DEFAULT_SHORTCUTS[name] : configuredValue,
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

function snapshotConfirm(confirm: AppShellConfirmState | null): AppShellConfirmState | null {
  return confirm === null ? null : Object.freeze({ ...confirm });
}

function snapshotCenter(state: NotificationCenterState): NotificationCenterState {
  return Object.freeze({
    ...state,
    actionCursor:
      state.actionCursor === null
        ? null
        : Object.freeze({
            notificationId: state.actionCursor.notificationId,
            actionId: state.actionCursor.actionId,
          }),
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

export function summarizeAppShellTasks(tasks: readonly AppShellTaskRecord[]): AppShellTaskSummary {
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

export function getAppShellTaskMessage(
  state: TaskState,
  messages: AppShellTaskMessages,
): string | null {
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
    || viewport.cols <= 0
  ) {
    diagnostics.push(
      diagnostic('invalid-context', 'viewport.cols', 'Viewport columns must be a positive safe integer.'),
    );
  }
  if (
    typeof viewport.rows !== 'number'
    || !Number.isSafeInteger(viewport.rows)
    || viewport.rows <= 0
  ) {
    diagnostics.push(
      diagnostic('invalid-context', 'viewport.rows', 'Viewport rows must be a positive safe integer.'),
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
  if (typeof value !== 'string') return false;
  const idTarget = /^(?:row|dismiss):([1-9][0-9]*)$/u.exec(value);
  if (idTarget) return validPositiveId(Number(idTarget[1]));
  const actionTarget = /^action:([1-9][0-9]*):(.+)$/u.exec(value);
  if (!actionTarget || !validPositiveId(Number(actionTarget[1]))) return false;
  try {
    const actionId = decodeURIComponent(actionTarget[2]!);
    return (
      actionId.trim().length > 0
      && !unsafeText(actionId)
      && encodeURIComponent(actionId) === actionTarget[2]
    );
  } catch {
    return false;
  }
}

function validateAppShellModel(
  value: unknown,
  store: NotificationStore,
): readonly AppShellDiagnostic[] {
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
            `notifications.${entry.field}`,
            entry.message,
          ),
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        'notification-store',
        'notifications',
        `Notification store validation threw: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  diagnostics.push(...validateToastInteraction(value.toastInteraction));
  diagnostics.push(...validateTasks(value.tasks));
  return Object.freeze(diagnostics);
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
  if (!isRecord(registry)) {
    diagnostics.push(
      diagnostic(
        'invalid-config',
        'registry',
        'registry must be one ActionRegistry object.',
      ),
    );
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
                  'invalid-config',
                  'registry.byId',
                  `registry.byId.get threw: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                ),
              );
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
  if (!isRecord(store)) {
    diagnostics.push(
      diagnostic(
        'invalid-config',
        'notificationStore',
        'notificationStore must be one exact NotificationStore object.',
      ),
    );
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
  const shapeDiagnostics = validateConfigShape(config);
  if (!isRecord(config)) {
    throw new AppShellValidationError('Invalid app shell config', shapeDiagnostics);
  }
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
        'invalid-config',
        'toast',
        error instanceof Error ? error.message : String(error),
      ),
    ]);
  }

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
          `actions.${action.descriptor.id}.scope`,
          `isScopeActive threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { actionId: action.descriptor.id },
        ),
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
      || unsafeText(actionId)
    ) {
      return {
        ok: false,
        diagnostics: Object.freeze([
          diagnostic(
            'unknown-action',
            'actionId',
            'Action ID must be non-empty printable single-line text.',
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
            `actions.${actionId}.when`,
            `Action availability threw: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { actionId },
          ),
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
                `actions.${actionId}.when`,
                `Action availability threw: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                { actionId },
              ),
            ],
          );
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
        'invalid-config',
        'notifications',
        error instanceof Error ? error.message : String(error),
      ),
    ]);
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
                'invalid-model',
                'toastInteraction',
                error instanceof Error ? error.message : String(error),
              ),
            ];
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

  const projectActions = (
    model: AppShellModel,
    hostModel: HostModel,
  ): AppShellProjection => {
    const modelDiagnostics = validateAppShellModel(model, store);
    if (modelDiagnostics.length > 0) {
      return Object.freeze({
        commands: Object.freeze([]),
        keyBindings: Object.freeze([]),
        helpBindings: Object.freeze([]),
        diagnostics: modelDiagnostics,
      });
    }

    const diagnostics: AppShellDiagnostic[] = [];
    let globalAllowed = false;
    try {
      const focusDecision = config.canUseGlobalShortcuts(hostModel, model);
      if (typeof focusDecision !== 'boolean') {
        diagnostics.push(
          diagnostic(
            'invalid-context',
            'canUseGlobalShortcuts',
            'canUseGlobalShortcuts must return boolean.',
          ),
        );
      } else {
        globalAllowed = focusDecision;
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'invalid-context',
          'canUseGlobalShortcuts',
          `Focus guard threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }

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
              `actions.${action.descriptor.id}.scope`,
              error instanceof Error ? error.message : String(error),
              { actionId: action.descriptor.id },
            ),
          );
        }
        scopeCache.set(key, false);
        return false;
      }
    };

    let commands: Command<AppShellMsg>[] = [];
    let actionBindings: KeyBinding<AppShellMsg>[] = [];
    try {
      commands = actionCommands(config.registry, hostModel, {
        includeDisabled: config.includeDisabledActions ?? true,
        includeUndiscoverable: config.includeUndiscoverableActions ?? false,
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
          isScopeActive: projectScope,
        }).map(unbindableDiagnostic),
      );
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'invalid-context',
          'registry',
          `Action projection threw: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
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
          model.helpOpen
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
          model.notificationCenter.open
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
    for (const binding of actionBindings) {
      const chord = bindingChord(binding);
      const owner = reservedChords.get(chord);
      const actionId =
        binding.msg.type === 'shell-request-action'
          ? binding.msg.actionId
          : undefined;
      if (owner !== undefined) {
        diagnostics.push(
          diagnostic(
            'conflicting-shortcut',
            `actions.${actionId ?? 'unknown'}.shortcuts`,
            `Action shortcut conflicts with shell shortcuts.${owner}; the shell binding owns this chord.`,
            {
              ...(actionId === undefined ? {} : { actionId }),
              shortcut: formatKeyBinding(binding.key, binding.modifiers),
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

    const localBindings: KeyBinding<AppShellMsg>[] = [];
    if (model.confirm !== null) {
      localBindings.push({
        key: 'enter',
        msg: { type: 'shell-confirm', id: model.confirm.id },
        description: 'Confirm',
        category: 'Confirmation',
        discoverable: false,
      });
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
    seed: AppShellModelSeed = {},
  ): AppShellModel => {
    if (!isRecord(seed)) {
      throw new AppShellValidationError('Invalid app shell seed', [
        diagnostic('invalid-model', 'seed', 'App shell seed must be an object.'),
      ]);
    }
    const modelSeed = seed as AppShellModelSeed;

    let notifications: NotificationModel;
    try {
      notifications = store.init(modelSeed.notifications);
    } catch (error) {
      throw new AppShellValidationError('Invalid app shell notification seed', [
        diagnostic(
          'notification-store',
          'notifications',
          error instanceof Error ? error.message : String(error),
        ),
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
          'invalid-model',
          'toastInteraction',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
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
          'invalid-model',
          'notificationCenter',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }
    const candidate = {
      palette:
        modelSeed.palette === undefined
          ? createPaletteState()
          : modelSeed.palette,
      helpOpen: modelSeed.helpOpen === undefined ? false : modelSeed.helpOpen,
      confirm: modelSeed.confirm === undefined ? null : modelSeed.confirm,
      notificationCenter: centerState,
      notifications: validatedNotifications.value,
      toastInteraction: toastManager.getInteraction(initialToast),
      tasks: modelSeed.tasks === undefined ? [] : modelSeed.tasks,
    } as AppShellModel;
    const diagnostics = validateAppShellModel(candidate, store);
    if (diagnostics.length > 0) {
      throw new AppShellValidationError('Invalid app shell seed', diagnostics);
    }
    return snapshotModel(candidate);
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
          'invalid-model',
          'notificationCenter.message',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
    }

    let projected: ReturnType<(typeof toastManager)['project']>;
    try {
      projected = toastManager.project(transition.store, model.toastInteraction);
    } catch (error) {
      return frozenResult(model, [], [
        diagnostic(
          'invalid-model',
          'toastInteraction',
          error instanceof Error ? error.message : String(error),
        ),
      ]);
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

  const update = (
    msg: AppShellMsg,
    model: AppShellModel,
    context: AppShellContext<HostModel>,
  ): AppShellUpdateResult => {
    const diagnostics: AppShellDiagnostic[] = [
      ...validateAppShellModel(model, store),
    ];
    if (!isRecord(context)) {
      diagnostics.push(
        diagnostic('invalid-context', 'context', 'App shell context must be an object.'),
      );
    } else {
      diagnostics.push(...validViewport(context.viewport));
    }
    if (!isRecord(msg) || typeof msg.type !== 'string') {
      diagnostics.push(
        diagnostic(
          'invalid-model',
          'message',
          'App shell message must be an object with a string type.',
        ),
      );
    }
    if (diagnostics.length > 0) {
      return frozenResult(model, [], dedupeDiagnostics(diagnostics));
    }

    const canonicalNotifications = store.validateModel(model.notifications);
    if (!canonicalNotifications.ok) {
      return frozenResult(
        model,
        [],
        canonicalNotifications.diagnostics.map(notificationDiagnostic),
      );
    }
    const current = snapshotModel({
      ...model,
      notifications: canonicalNotifications.value,
    });

    switch (msg.type) {
      case 'shell-open-palette': {
        if (current.confirm !== null) return frozenResult(current);
        const commands = [...projectActions(current, context.hostModel).commands];
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          current.notificationCenter,
          current.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(
              paletteUpdate({ type: 'pal-open' }, current.palette, commands),
            ),
            helpOpen: false,
            notificationCenter: snapshotCenter(center.state),
          }),
        );
      }
      case 'shell-toggle-help': {
        if (current.confirm !== null) return frozenResult(current);
        const opening = !current.helpOpen;
        if (!opening) {
          return frozenResult(withChanges(current, { helpOpen: false }));
        }
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          current.notificationCenter,
          current.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(createPaletteState()),
            helpOpen: true,
            notificationCenter: snapshotCenter(center.state),
          }),
        );
      }
      case 'shell-toggle-notifications': {
        if (current.confirm !== null) return frozenResult(current);
        const base = current.notificationCenter.open
          ? current
          : withChanges(current, {
              palette: snapshotPalette(createPaletteState()),
              helpOpen: false,
            });
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
          return frozenResult(
            withChanges(current, {
              palette: snapshotPalette(
                paletteUpdate(
                  { type: 'pal-close' },
                  current.palette,
                  [...projectActions(current, context.hostModel).commands],
                ),
              ),
            }),
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
                      'notification-store',
                      'toast',
                      error instanceof Error ? error.message : String(error),
                    ),
                  ];
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
        const center = makeCenter(context.hostModel).update(
          { type: 'close' },
          current.notificationCenter,
          current.notifications,
          context.viewport,
        );
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(createPaletteState()),
            helpOpen: false,
            confirm: snapshotConfirm(msg.confirm),
            notificationCenter: snapshotCenter(center.state),
          }),
          current.confirm === null
            ? []
            : [
                {
                  type: 'confirm-resolved',
                  id: current.confirm.id,
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
      case 'shell-palette-input': {
        if (!current.palette.open) return frozenResult(current);
        if (
          typeof msg.char !== 'string'
          || Array.from(msg.char).length !== 1
          || unsafeText(msg.char)
        ) {
          return frozenResult(current, [], [
            diagnostic(
              'invalid-model',
              'message.char',
              'Palette input must be one printable Unicode scalar.',
            ),
          ]);
        }
        const commands = [...projectActions(current, context.hostModel).commands];
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(
              paletteUpdate(
                { type: 'pal-input', char: msg.char },
                current.palette,
                commands,
              ),
            ),
          }),
        );
      }
      case 'shell-palette-backspace':
      case 'shell-palette-up':
      case 'shell-palette-down': {
        if (!current.palette.open) return frozenResult(current);
        const paletteType =
          msg.type === 'shell-palette-backspace'
            ? 'pal-backspace'
            : msg.type === 'shell-palette-up'
              ? 'pal-up'
              : 'pal-down';
        return frozenResult(
          withChanges(current, {
            palette: snapshotPalette(
              paletteUpdate(
                { type: paletteType },
                current.palette,
                [...projectActions(current, context.hostModel).commands],
              ),
            ),
          }),
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
        const commands = [...projectActions(current, context.hostModel).commands];
        const selected = getSelectedCommand(current.palette, commands);
        if (selected === null) return frozenResult(current);
        if (selected.disabled) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              `actions.${selected.id}`,
              `Action ${JSON.stringify(selected.id)} is disabled.`,
              { actionId: selected.id },
            ),
          ]);
        }
        const closedPalette = withChanges(current, {
          palette: snapshotPalette(createPaletteState()),
        });
        return selected.msg.type === 'shell-request-action'
          ? requestActionResult(
              closedPalette,
              selected.msg.actionId,
              'palette',
              context.hostModel,
            )
          : update(selected.msg, closedPalette, context);
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
                'invalid-context',
                'canUseGlobalShortcuts',
                `Focus guard threw: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                { actionId: msg.actionId },
              ),
            ]);
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
        if (current.confirm !== null) {
          return frozenResult(current, [], [
            diagnostic(
              'unavailable-action',
              'message.type',
              'Notification-center interaction is blocked while confirmation owns focus.',
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
        return applyCenterMessage(current, msg.msg, context);
      case 'shell-notify': {
        let enqueued: ReturnType<NotificationStore['enqueue']>;
        try {
          enqueued = store.enqueue(current.notifications, msg.notification);
        } catch (error) {
          return frozenResult(current, [], [
            diagnostic(
              'notification-store',
              'notification',
              error instanceof Error ? error.message : String(error),
            ),
          ]);
        }
        if (!enqueued.ok) {
          return frozenResult(
            current,
            [],
            enqueued.diagnostics.map(notificationDiagnostic),
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
              'notification-store',
              'notification',
              error instanceof Error ? error.message : String(error),
            ),
          ]);
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
              'notification-store',
              'notification',
              error instanceof Error ? error.message : String(error),
            ),
          ]);
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
              'notification-store',
              'notifications',
              error instanceof Error ? error.message : String(error),
            ),
          ]);
        }
      }
      case 'shell-toast': {
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
                    'notification-store',
                    'toast',
                    error instanceof Error ? error.message : String(error),
                  ),
                ];
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
    if (
      validateAppShellModel(model, store).length > 0
      || !isRecord(context)
      || validViewport(context.viewport).length > 0
    ) {
      return Sub.none();
    }

    const projection = projectActions(model, context.hostModel);
    const subscriptions: Subscription<AppShellMsg>[] = [
      keyMap(projection.keyBindings),
    ];
    if (model.palette.open) {
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

    let centerSubscriptions: Subscription<NotificationCenterMsg>;
    try {
      centerSubscriptions = makeCenter(context.hostModel).subscriptions(
        model.notificationCenter,
        model.notifications,
      );
    } catch {
      centerSubscriptions = Sub.none();
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

    const projectedToast = toastProjection(model);
    if (projectedToast.ok) {
      subscriptions.push(
        Sub.map(
          toastManager.subscriptions(projectedToast.value),
          (toastMsg): AppShellMsg => ({ type: 'shell-toast', msg: toastMsg }),
        ),
      );
    }
    return Sub.batch(...subscriptions);
  };

  const status = (
    model: AppShellModel,
    options: AppShellStatusOptions = {},
  ): AppShellStatusSections => {
    const diagnostics = [...validateAppShellModel(model, store)];
    if (!isRecord(options)) {
      diagnostics.push(
        diagnostic(
          'invalid-context',
          'status.options',
          'App shell status options must be an object.',
        ),
      );
    } else {
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
      throw new AppShellValidationError(
        'Cannot derive status from invalid app shell input',
        diagnostics,
      );
    }

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
    init: initialize,
    validateModel(model: AppShellModel): readonly AppShellDiagnostic[] {
      return validateAppShellModel(model, store);
    },
    update,
    project: projectActions,
    subscriptions,
    notificationCenter: makeCenter,
    projectToasts(model: AppShellModel): ToastModel {
      const modelDiagnostics = validateAppShellModel(model, store);
      if (modelDiagnostics.length > 0) {
        throw new AppShellValidationError(
          'Cannot project invalid app shell model',
          modelDiagnostics,
        );
      }
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
