import {
  canGoBack,
  createRouter,
  createScreenStack,
  currentScreen,
  type RouterModel,
  type ScreenStackModel,
  screenStackUpdate,
} from '@celestial/compass';
import {
  Cmd,
  type Cmd as Command,
  column,
  row,
  Sub,
  type Sub as Subscription,
  text,
  type VNode,
} from '@celestial/core';
import {
  type ConfigLoadResult,
  type ConfigSource,
  createActionRegistry,
  invokeAction,
  loadConfig,
} from '@celestial/core/nebula';
import type { ThemeInput } from '@celestial/core/corona';
import {
  type AppShellModel,
  type AppShellMsg,
  badge,
  button,
  createAppShell,
  createAppShellView,
  createNotificationStore,
  progressBar,
  semanticStyles,
  statusBar,
  type ToastModel,
} from '@celestial/ui';

type AppShellRouteId = 'overview' | 'jobs' | 'settings';
type AppShellScreenId = AppShellRouteId | 'release-confirm';

interface AppShellHostState {
  readonly canGoBack: boolean;
  readonly releaseApproved: boolean;
  readonly routeHref: string;
  readonly taskRunning: boolean;
}

export interface AppShellLabConfig {
  readonly profile: 'preview';
  readonly verificationChecks: number;
}

export type AppShellLabAction =
  | 'overview'
  | 'jobs'
  | 'back'
  | 'confirm'
  | 'start'
  | 'cancel'
  | 'notify'
  | 'inbox'
  | 'help'
  | 'palette'
  | 'dismiss'
  | 'confirm-approve'
  | 'confirm-cancel';

export type AppShellLabMsg =
  | { readonly type: 'shell'; readonly msg: AppShellMsg }
  | { readonly type: 'activate'; readonly action: AppShellLabAction }
  | { readonly type: 'navigate'; readonly location: '/overview' | '/jobs/flight-42?view=queue' }
  | { readonly type: 'navigate-back' }
  | { readonly type: 'open-release-confirm' }
  | { readonly type: 'start-task' }
  | { readonly type: 'cancel-task' }
  | { readonly type: 'enqueue-notification' }
  | {
      readonly type: 'task-completed';
      readonly generation: number;
      readonly config: ConfigLoadResult<AppShellLabConfig>;
    }
  | { readonly type: 'task-cancelled'; readonly generation: number }
  | { readonly type: 'task-failed'; readonly generation: number; readonly message: string }
  ;

export interface AppShellLabModel {
  readonly shell: AppShellModel;
  readonly router: RouterModel;
  readonly screens: ScreenStackModel<AppShellScreenId, boolean>;
  readonly releaseApproved: boolean;
  readonly taskGeneration: number;
  readonly configLoadResult: ConfigLoadResult<AppShellLabConfig> | null;
  readonly lastShellReceipt: string;
  readonly lastHostReceipt: string;
  readonly evidenceVersion: number;
  readonly lastEvidenceReceipt: string;
  readonly diagnostics: readonly string[];
}

export interface AppShellLabUpdateOptions {
  readonly cols: number;
  readonly rows: number;
  readonly fast: boolean;
}

const TASK_ID = 'app-shell-preview-validation';
export const APP_SHELL_LAB_TASK_OWNER = 'showcase:app-shell';
const DEFAULT_VIEWPORT = { cols: 80, rows: 32 } as const;
const PALETTE_MAX_VISIBLE = 8;
const SHELL_ID = 'showcase-app-shell';
const CONFIG_PRECEDENCE = 'first-listed-wins' as const;
const DEFAULT_APP_SHELL_LAB_CONFIG_SOURCES: readonly ConfigSource[] =
  Object.freeze([
    Object.freeze({
      id: 'project-config',
      read: () => undefined,
    }),
    Object.freeze({
      id: 'workspace-config',
      read: () =>
        JSON.stringify({
          profile: 'preview',
          verificationChecks: 2,
        }),
    }),
  ]);

export async function loadAppShellLabConfig(
  sources: readonly ConfigSource[] = DEFAULT_APP_SHELL_LAB_CONFIG_SOURCES,
): Promise<ConfigLoadResult<AppShellLabConfig>> {
  return loadConfig<AppShellLabConfig>({
    precedence: CONFIG_PRECEDENCE,
    sources,
    parse: (contents) => JSON.parse(contents) as unknown,
    validate: (candidate) => {
      if (
        candidate === null
        || typeof candidate !== 'object'
        || Array.isArray(candidate)
      ) {
        return {
          valid: false,
          issues: ['Config must be a plain object.'],
        };
      }
      const record = candidate as Record<string, unknown>;
      const keys = Object.keys(record);
      if (
        keys.length !== 2
        || record['profile'] !== 'preview'
        || typeof record['verificationChecks'] !== 'number'
        || !Number.isSafeInteger(record['verificationChecks'])
        || record['verificationChecks'] <= 0
      ) {
        return {
          valid: false,
          issues: [
            'Config requires profile "preview" and a positive integer verificationChecks value.',
          ],
        };
      }
      return {
        valid: true,
        value: {
          profile: 'preview',
          verificationChecks: record['verificationChecks'],
        },
      };
    },
  });
}

function configFailureMessage(
  result: ConfigLoadResult<AppShellLabConfig>,
): string {
  const code = result.diagnostics[0]?.code ?? 'config-not-found';
  return `Config load failed: ${code}`;
}

function configReceipt(
  result: ConfigLoadResult<AppShellLabConfig> | null,
): string {
  if (result === null) return 'not loaded';
  if (!result.ok) {
    return `${result.sourceId ?? 'none'} | ${String(result.checkedSources.length)} checked | ${CONFIG_PRECEDENCE} | failed`;
  }
  return `${result.sourceId} | ${String(result.checkedSources.length)} checked | ${CONFIG_PRECEDENCE}`;
}

const router = createRouter<AppShellRouteId>({
  routes: [
    { id: 'overview', pattern: '/overview' },
    { id: 'jobs', pattern: '/jobs/:jobId' },
    { id: 'settings', pattern: '/settings' },
  ],
  initialLocation: '/overview',
});

const notificationStore = createNotificationStore({
  defaultDurationMs: 8_000,
  maxEntries: 40,
  now: () => 1_000,
});

function hostState(model: Pick<AppShellLabModel, 'releaseApproved' | 'router' | 'shell'>): AppShellHostState {
  const resolution = router.resolve(model.router);
  const task = model.shell.tasks.find((entry) => entry.id === TASK_ID);
  return Object.freeze({
    canGoBack: canGoBack(model.router.history),
    releaseApproved: model.releaseApproved,
    routeHref: resolution.location.href,
    taskRunning: task?.state.status === 'running',
  });
}

const actionRegistry = createActionRegistry<AppShellHostState, AppShellLabMsg>([
  {
    id: 'demo.navigate-overview',
    title: 'Open overview screen',
    description: 'Navigate through Compass to the overview route.',
    category: 'Navigation',
    shortcuts: ['g'],
    run: () => ({ type: 'navigate', location: '/overview' }),
  },
  {
    id: 'demo.navigate-jobs',
    title: 'Open job queue',
    description: 'Match a parameterized Compass route and retain history.',
    category: 'Navigation',
    shortcuts: ['j'],
    run: () => ({ type: 'navigate', location: '/jobs/flight-42?view=queue' }),
  },
  {
    id: 'demo.navigate-back',
    title: 'Go back',
    category: 'Navigation',
    shortcuts: ['b'],
    when: (model) => (model.canGoBack ? true : 'disabled'),
    run: () => ({ type: 'navigate-back' }),
  },
  {
    id: 'demo.release-confirm',
    title: 'Confirm preview release',
    description: 'Open a shell confirmation over a modal-safe Compass screen.',
    category: 'Workflow',
    shortcuts: ['x'],
    run: () => ({ type: 'open-release-confirm' }),
  },
  {
    id: 'demo.task-start',
    title: 'Start background verification',
    description: 'Start an abortable runtime task and project its state into shell status.',
    category: 'Tasks',
    shortcuts: ['s'],
    when: (model) => (model.taskRunning ? 'disabled' : true),
    run: () => ({ type: 'start-task' }),
  },
  {
    id: 'demo.task-cancel',
    title: 'Cancel background verification',
    category: 'Tasks',
    shortcuts: ['c'],
    when: (model) => (model.taskRunning ? true : 'disabled'),
    run: () => ({ type: 'cancel-task' }),
  },
  {
    id: 'demo.notification-enqueue',
    title: 'Send shared notification',
    description: 'Enqueue one entry for both the durable inbox and toast projection.',
    category: 'Notifications',
    shortcuts: ['n'],
    run: () => ({ type: 'enqueue-notification' }),
  },
]);

const shell = createAppShell<AppShellHostState, AppShellLabMsg>({
  id: SHELL_ID,
  registry: actionRegistry,
  notificationStore,
  shortcuts: {
    help: '?',
    notifications: 'i',
  },
  formatTimestamp: (timestamp) => `T+${String(timestamp)}`,
  canUseGlobalShortcuts: () => true,
  includeDisabledActions: true,
  notifications: {
    title: 'Shared notification center',
    width: 54,
    maxHeight: 18,
  },
  toast: {
    placement: 'top-right',
    width: 46,
    maxVisibleToasts: 1,
  },
});

const labActions = new Set<AppShellLabAction>([
  'overview',
  'jobs',
  'back',
  'confirm',
  'start',
  'cancel',
  'notify',
  'inbox',
  'help',
  'palette',
  'dismiss',
  'confirm-approve',
  'confirm-cancel',
]);

const actionIds: Partial<Record<AppShellLabAction, string>> = {
  overview: 'demo.navigate-overview',
  jobs: 'demo.navigate-jobs',
  back: 'demo.navigate-back',
  confirm: 'demo.release-confirm',
  start: 'demo.task-start',
  cancel: 'demo.task-cancel',
  notify: 'demo.notification-enqueue',
};

function viewport(options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'>): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor(options.cols)),
    rows: Math.max(1, Math.floor(options.rows)),
  };
}

function diagnosticsText(diagnostics: readonly { readonly code: string; readonly field: string }[]): readonly string[] {
  return Object.freeze(diagnostics.map((entry) => `${entry.code}:${entry.field}`));
}

function recordEvidence(
  model: AppShellLabModel,
  receipt: string,
  owner: 'shell' | 'host',
): AppShellLabModel {
  return {
    ...model,
    ...(owner === 'shell'
      ? { lastShellReceipt: receipt }
      : { lastHostReceipt: receipt }),
    evidenceVersion: model.evidenceVersion + 1,
    lastEvidenceReceipt: receipt,
  };
}

export function appShellLabPaletteWindow(
  model: AppShellLabModel,
  maxVisible = PALETTE_MAX_VISIBLE,
): { readonly start: number; readonly end: number } {
  const total = model.shell.palette.filteredIds.length;
  if (total === 0) return { start: 0, end: 0 };
  const visible = Math.max(1, Math.floor(maxVisible));
  const selected = Math.max(
    0,
    Math.min(model.shell.palette.selectedIndex, total - 1),
  );
  const maxStart = Math.max(0, total - visible);
  const start = Math.min(
    maxStart,
    selected < visible ? 0 : selected - visible + 1,
  );
  return {
    start,
    end: Math.min(total, start + visible),
  };
}

function shellUpdate(
  model: AppShellLabModel,
  msg: AppShellMsg,
  options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'>,
): ReturnType<typeof shell.update> {
  return shell.update(msg, model.shell, {
    hostModel: hostState(model),
    viewport: viewport(options),
  });
}

function withShellOutcome(
  model: AppShellLabModel,
  msg: AppShellMsg,
  options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'>,
): AppShellLabModel {
  const outcome = shellUpdate(model, msg, options);
  return {
    ...model,
    shell: outcome.model,
    diagnostics: diagnosticsText(outcome.diagnostics),
  };
}

function shellSurfaceReceipt(
  before: AppShellModel,
  after: AppShellModel,
): string | null {
  if (
    after.notifications.visibleToastIds.length
    < before.notifications.visibleToastIds.length
  ) {
    return 'Dismissed the latest shared toast.';
  }
  if (after.palette.open !== before.palette.open) {
    return after.palette.open
      ? 'Opened the coordinated action palette.'
      : 'Closed the coordinated action palette.';
  }
  if (after.helpOpen !== before.helpOpen) {
    return after.helpOpen
      ? 'Opened canonical keyboard help.'
      : 'Closed canonical keyboard help.';
  }
  if (
    after.notificationCenter.open
    !== before.notificationCenter.open
  ) {
    return after.notificationCenter.open
      ? 'Opened the shared notification center.'
      : 'Closed the shared notification center.';
  }
  return null;
}

function taskStatus(model: AppShellLabModel): string {
  return model.shell.tasks.find((entry) => entry.id === TASK_ID)?.state.status ?? 'idle';
}

function replaceRouteScreen(
  screens: ScreenStackModel<AppShellScreenId, boolean>,
  route: AppShellRouteId,
  href: string,
): ScreenStackModel<AppShellScreenId, boolean> {
  return screenStackUpdate(
    {
      type: 'screen:replace',
      id: route,
      params: { href },
    },
    screens,
  );
}

function combineCommands(...commands: readonly Command<AppShellLabMsg>[]): Command<AppShellLabMsg> {
  return commands.length === 0 ? Cmd.none() : commands.length === 1 ? commands[0]! : Cmd.batch(...commands);
}

function abortError(): Error {
  const error = new Error('Background verification cancelled.');
  error.name = 'AbortError';
  return error;
}

function waitForTask(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      finish();
      reject(abortError());
    };
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(() => {
      finish();
      resolve();
    }, ms);
  });
}

function invokeHostAction(
  actionId: string,
  model: AppShellLabModel,
  options: AppShellLabUpdateOptions,
): [AppShellLabModel, Command<AppShellLabMsg>] {
  const messages = invokeAction(actionRegistry, actionId, hostState(model));
  if (!messages || messages.length === 0) {
    return [model, Cmd.none()];
  }

  let next = model;
  const commands: Command<AppShellLabMsg>[] = [];
  for (const message of messages) {
    const [updated, command] = updateAppShellLab(message, next, options);
    next = updated;
    commands.push(command);
  }
  return [next, combineCommands(...commands)];
}

function handleConfirmReceipt(
  model: AppShellLabModel,
  confirmed: boolean,
  options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'>,
): AppShellLabModel {
  const top = currentScreen(model.screens);
  const screens =
    top.id === 'release-confirm' && top.modal === true
      ? screenStackUpdate(
          { type: 'screen:dismiss', result: confirmed },
          model.screens,
        )
      : model.screens;
  const receipt = confirmed
    ? 'Confirmation receipt: preview release approved.'
    : 'Confirmation receipt: preview release cancelled.';
  let next: AppShellLabModel = {
    ...model,
    screens,
    releaseApproved: confirmed,
    lastShellReceipt: receipt,
    lastHostReceipt: receipt,
  };
  next = withShellOutcome(
    next,
    {
      type: 'shell-notify',
      notification: {
        message: confirmed
          ? 'Release approved from the modal receipt.'
          : 'Release confirmation cancelled safely.',
        level: confirmed ? 'success' : 'warning',
        delivery: 'both',
        durationMs: null,
        ...(confirmed ? { actionIds: ['demo.navigate-jobs'] } : {}),
      },
    },
    options,
  );
  return recordEvidence(next, receipt, 'shell');
}

export function createAppShellLabModel(): AppShellLabModel {
  const initialRouter = router.init();
  const initialHost: AppShellHostState = Object.freeze({
    canGoBack: false,
    releaseApproved: false,
    routeHref: '/overview',
    taskRunning: false,
  });
  let shellModel = shell.init(initialHost);
  let model: AppShellLabModel = {
    shell: shellModel,
    router: initialRouter,
    screens: createScreenStack<AppShellScreenId, boolean>({
      id: 'overview',
      params: { href: '/overview' },
    }),
    releaseApproved: false,
    taskGeneration: 0,
    configLoadResult: null,
    lastShellReceipt: 'Shell initialized with one action registry.',
    lastHostReceipt: 'Compass route receipt: /overview -> overview.',
    evidenceVersion: 0,
    lastEvidenceReceipt: 'No app-shell interaction receipt yet.',
    diagnostics: Object.freeze([]),
  };
  model = withShellOutcome(
    model,
    {
      type: 'shell-task-state',
      task: {
        id: TASK_ID,
        label: 'Preview validation',
        state: { status: 'idle' },
      },
    },
    DEFAULT_VIEWPORT,
  );
  model = withShellOutcome(
    model,
    {
      type: 'shell-notify',
      notification: {
        message: 'App shell ready: one entry powers inbox and toast.',
        level: 'info',
        delivery: 'both',
        durationMs: null,
        actionIds: ['demo.navigate-jobs'],
      },
    },
    DEFAULT_VIEWPORT,
  );
  shellModel = model.shell;
  return {
    ...model,
    shell: shellModel,
  };
}

export function isAppShellLabAction(value: string): value is AppShellLabAction {
  return labActions.has(value as AppShellLabAction);
}

export function appShellLabHasBlockingSurface(model: AppShellLabModel): boolean {
  return (
    model.shell.confirm !== null
    || model.shell.palette.open
    || model.shell.helpOpen
    || model.shell.notificationCenter.actionCursor !== null
    || model.shell.notificationCenter.expandedId !== null
    || model.shell.notificationCenter.open
  );
}

export function appShellLabHasDismissTarget(model: AppShellLabModel): boolean {
  return appShellLabHasBlockingSurface(model) || model.shell.notifications.visibleToastIds.length > 0;
}

export function projectAppShellLabToasts(model: AppShellLabModel): ToastModel {
  return shell.projectToasts(model.shell);
}

export function updateAppShellLab(
  message: AppShellLabMsg,
  model: AppShellLabModel,
  options: AppShellLabUpdateOptions,
): [AppShellLabModel, Command<AppShellLabMsg>] {
  switch (message.type) {
    case 'shell': {
      const outcome = shellUpdate(model, message.msg, options);
      let next: AppShellLabModel = {
        ...model,
        shell: outcome.model,
        diagnostics: diagnosticsText(outcome.diagnostics),
      };
      const commands: Command<AppShellLabMsg>[] = [];
      for (const receipt of outcome.receipts) {
        if (receipt.type === 'action-requested') {
          next = recordEvidence(
            next,
            `Action receipt: ${receipt.actionId} via ${receipt.source}.`,
            'shell',
          );
          const [updated, command] = invokeHostAction(receipt.actionId, next, options);
          next = updated;
          commands.push(command);
        } else if (receipt.id === 'release-preview') {
          next = handleConfirmReceipt(next, receipt.confirmed, options);
        } else {
          next = recordEvidence(
            next,
            `Confirmation receipt: ${receipt.id} ${receipt.confirmed ? 'approved' : 'cancelled'}.`,
            'shell',
          );
        }
      }
      if (next.evidenceVersion === model.evidenceVersion) {
        const surfaceReceipt = shellSurfaceReceipt(model.shell, outcome.model);
        if (surfaceReceipt !== null) {
          next = recordEvidence(next, surfaceReceipt, 'shell');
        }
      }
      return [next, combineCommands(...commands)];
    }
    case 'activate': {
      if (message.action === 'dismiss') {
        return updateAppShellLab(
          { type: 'shell', msg: { type: 'shell-dismiss' } },
          model,
          options,
        );
      }
      if (message.action === 'confirm-approve' || message.action === 'confirm-cancel') {
        const confirm = model.shell.confirm;
        if (confirm === null) return [model, Cmd.none()];
        return updateAppShellLab(
          {
            type: 'shell',
            msg:
              message.action === 'confirm-approve'
                ? { type: 'shell-confirm', id: confirm.id }
                : { type: 'shell-cancel-confirm', id: confirm.id },
          },
          model,
          options,
        );
      }
      if (appShellLabHasBlockingSurface(model)) return [model, Cmd.none()];
      if (message.action === 'inbox') {
        return updateAppShellLab(
          { type: 'shell', msg: { type: 'shell-toggle-notifications' } },
          model,
          options,
        );
      }
      if (message.action === 'help') {
        return updateAppShellLab(
          { type: 'shell', msg: { type: 'shell-toggle-help' } },
          model,
          options,
        );
      }
      if (message.action === 'palette') {
        return updateAppShellLab(
          { type: 'shell', msg: { type: 'shell-open-palette' } },
          model,
          options,
        );
      }
      const actionId = actionIds[message.action];
      return actionId === undefined
        ? [model, Cmd.none()]
        : invokeHostAction(actionId, model, options);
    }
    case 'navigate': {
      if (model.shell.confirm !== null) return [model, Cmd.none()];
      const nextRouter = router.update(
        { type: 'router:navigate', location: message.location },
        model.router,
      );
      const resolution = router.resolve(nextRouter);
      if (resolution.status !== 'matched') {
        return [
          {
            ...model,
            router: nextRouter,
            lastHostReceipt: `Compass rejected route: ${resolution.diagnostic.href}.`,
          },
          Cmd.none(),
        ];
      }
      const screens = replaceRouteScreen(
        model.screens,
        resolution.match.route.id,
        resolution.location.href,
      );
      return [
        recordEvidence(
          {
            ...model,
            router: nextRouter,
            screens,
          },
          `Compass route receipt: ${resolution.location.href} -> ${resolution.match.route.id}.`,
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'navigate-back': {
      if (!canGoBack(model.router.history) || model.shell.confirm !== null) {
        return [model, Cmd.none()];
      }
      const nextRouter = router.update({ type: 'router:back' }, model.router);
      const resolution = router.resolve(nextRouter);
      if (resolution.status !== 'matched') return [model, Cmd.none()];
      return [
        recordEvidence(
          {
            ...model,
            router: nextRouter,
            screens: replaceRouteScreen(
              model.screens,
              resolution.match.route.id,
              resolution.location.href,
            ),
          },
          `Compass back receipt: ${resolution.location.href} -> ${resolution.match.route.id}.`,
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'open-release-confirm': {
      if (appShellLabHasBlockingSurface(model)) return [model, Cmd.none()];
      const screens = screenStackUpdate(
        {
          type: 'screen:push',
          id: 'release-confirm',
          params: { route: router.resolve(model.router).location.href },
          modal: true,
        },
        model.screens,
      );
      const next = withShellOutcome(
        {
          ...model,
          screens,
          lastHostReceipt: 'Modal screen pushed; only a confirmation receipt may dismiss it.',
        },
        {
          type: 'shell-open-confirm',
          confirm: {
            id: 'release-preview',
            title: 'Approve preview release?',
            description: 'The host will dismiss the Compass modal screen only after this shell receipt.',
            confirmLabel: 'Approve',
            cancelLabel: 'Keep reviewing',
            variant: 'warning',
          },
        },
        options,
      );
      return [
        recordEvidence(
          next,
          'Modal screen pushed; only a confirmation receipt may dismiss it.',
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'start-task': {
      if (taskStatus(model) === 'running') return [model, Cmd.none()];
      const generation = model.taskGeneration + 1;
      let next: AppShellLabModel = {
        ...model,
        taskGeneration: generation,
        lastHostReceipt: `Background task ${String(generation)} started; cancellation is armed.`,
      };
      next = withShellOutcome(
        next,
        {
          type: 'shell-task-state',
          task: {
            id: TASK_ID,
            label: 'Preview validation',
            state: { status: 'running', startedAt: generation },
          },
        },
        options,
      );
      next = withShellOutcome(
        next,
        {
          type: 'shell-notify',
          notification: {
            message: 'Background verification is running.',
            level: 'info',
            delivery: 'both',
            durationMs: null,
          },
        },
        options,
      );
      const durationMs = options.fast ? 1_500 : 3_000;
      return [
        recordEvidence(
          next,
          `Background task ${String(generation)} started; cancellation is armed.`,
          'host',
        ),
        Cmd.startTask<AppShellLabMsg>({
          id: TASK_ID,
          owner: APP_SHELL_LAB_TASK_OWNER,
          exclusive: true,
          run: async (signal) => {
            const config = await loadAppShellLabConfig();
            if (!config.ok) {
              return {
                type: 'task-failed',
                generation,
                message: configFailureMessage(config),
              } as const;
            }
            await waitForTask(durationMs, signal);
            return { type: 'task-completed', generation, config } as const;
          },
          onCancel: () => ({ type: 'task-cancelled', generation }),
          onError: (error) => ({
            type: 'task-failed',
            generation,
            message: error instanceof Error ? error.message : 'Unknown task failure',
          }),
        }),
      ];
    }
    case 'cancel-task': {
      if (taskStatus(model) !== 'running') return [model, Cmd.none()];
      let next = withShellOutcome(
        {
          ...model,
          lastHostReceipt: `Background task ${String(model.taskGeneration)} cancellation requested.`,
        },
        {
          type: 'shell-task-state',
          task: {
            id: TASK_ID,
            label: 'Preview validation',
            state: {
              status: 'cancelled',
              startedAt: model.taskGeneration,
              finishedAt: model.taskGeneration,
            },
          },
        },
        options,
      );
      next = withShellOutcome(
        next,
        {
          type: 'shell-notify',
          notification: {
            message: 'Background verification cancelled by the host.',
            level: 'warning',
            delivery: 'both',
            durationMs: null,
          },
        },
        options,
      );
      return [
        recordEvidence(
          next,
          `Background task ${String(model.taskGeneration)} cancellation requested.`,
          'host',
        ),
        Cmd.cancelTask(TASK_ID),
      ];
    }
    case 'enqueue-notification': {
      const next = withShellOutcome(
        model,
        {
          type: 'shell-notify',
          notification: {
            message: 'Shared notification receipt: inbox and toast agree.',
            level: 'success',
            delivery: 'both',
            durationMs: null,
            actionIds: ['demo.navigate-jobs'],
          },
        },
        options,
      );
      return [
        recordEvidence(
          next,
          'Notification enqueued once and projected twice.',
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'task-completed': {
      if (
        message.generation !== model.taskGeneration
        || taskStatus(model) !== 'running'
      ) {
        return [model, Cmd.none()];
      }
      if (!message.config.ok) {
        return updateAppShellLab(
          {
            type: 'task-failed',
            generation: message.generation,
            message: configFailureMessage(message.config),
          },
          model,
          options,
        );
      }
      let next = withShellOutcome(
        {
          ...model,
          configLoadResult: message.config,
          lastHostReceipt: `Background task ${String(message.generation)} completed.`,
        },
        {
          type: 'shell-task-state',
          task: {
            id: TASK_ID,
            label: 'Preview validation',
            state: {
              status: 'success',
              startedAt: message.generation,
              finishedAt: message.generation + 1,
            },
          },
        },
        options,
      );
      next = withShellOutcome(
        next,
        {
          type: 'shell-notify',
          notification: {
            message: 'Background verification completed successfully.',
            level: 'success',
            delivery: 'both',
            durationMs: null,
          },
        },
        options,
      );
      return [
        recordEvidence(
          next,
          `Background task ${String(message.generation)} completed.`,
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'task-cancelled': {
      if (message.generation !== model.taskGeneration) return [model, Cmd.none()];
      return [
        recordEvidence(
          model,
          `Background task ${String(message.generation)} cancellation confirmed.`,
          'host',
        ),
        Cmd.none(),
      ];
    }
    case 'task-failed': {
      if (message.generation !== model.taskGeneration) return [model, Cmd.none()];
      let next = withShellOutcome(
        {
          ...model,
          lastHostReceipt: `Background task ${String(message.generation)} failed.`,
        },
        {
          type: 'shell-task-state',
          task: {
            id: TASK_ID,
            label: 'Preview validation',
            state: {
              status: 'error',
              startedAt: message.generation,
              finishedAt: message.generation + 1,
              error: new Error(message.message),
            },
          },
        },
        options,
      );
      next = withShellOutcome(
        next,
        {
          type: 'shell-notify',
          notification: {
            message: `Background verification failed: ${message.message}`,
            level: 'error',
            delivery: 'both',
            durationMs: null,
          },
        },
        options,
      );
      return [
        recordEvidence(
          next,
          `Background task ${String(message.generation)} failed.`,
          'host',
        ),
        Cmd.none(),
      ];
    }
  }
}

export function closeAppShellLabTransientSurfaces(
  model: AppShellLabModel,
  options: AppShellLabUpdateOptions,
): AppShellLabModel {
  let next = model;
  for (let count = 0; count < 12 && appShellLabHasBlockingSurface(next); count += 1) {
    const [updated] = updateAppShellLab(
      { type: 'shell', msg: { type: 'shell-dismiss' } },
      next,
      options,
    );
    if (updated === next) break;
    next = updated;
  }
  return next;
}

export function appShellLabSubscriptions(
  model: AppShellLabModel,
  options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'>,
): Subscription<AppShellLabMsg> {
  return Sub.map(
    createAppShellView(shell, { id: SHELL_ID }).subscriptions(model.shell, {
      hostModel: hostState(model),
      viewport: viewport(options),
    }),
    (msg): AppShellLabMsg => ({ type: 'shell', msg }),
  );
}

function actionNode(
  action: AppShellLabAction,
  label: string,
  shortcut: string,
  hoveredRegion: string | null,
  disabled = false,
): VNode {
  const id = `app-shell-${action}`;
  const hovered = hoveredRegion === `action:${id}`;
  return button({
    id: `showcase-action:${id}`,
    label,
    onClick: `showcase-action:${id}`,
    onRightClick: `showcase-context:action:${id}`,
    onMouseEnter: `showcase-hover:action:${id}`,
    onMouseLeave: `showcase-leave:action:${id}`,
    hovered,
    disabled,
    tone: disabled ? 'neutral' : 'accent',
    keyboardHint: shortcut,
    intent: id,
  });
}

function contentWidth(cols: number): number {
  if (cols >= 120) return Math.max(40, Math.min(92, Math.floor(cols * 0.7)));
  if (cols >= 80) return Math.max(36, Math.floor(cols * 0.66));
  return Math.max(24, cols - 8);
}

export function renderAppShellLab(
  model: AppShellLabModel,
  cols: number,
  hoveredRegion: string | null,
  theme?: ThemeInput,
): VNode {
  const {
    heading: headingStyle,
    title: titleStyle,
    muted: mutedStyle,
    action: actionStyle,
    success: successStyle,
    warning: warningStyle,
    danger: dangerStyle,
  } = semanticStyles({ theme });
  const resolution = router.resolve(model.router);
  const routeId =
    resolution.status === 'matched' ? resolution.match.route.id : 'not-found';
  const routeParam =
    resolution.status === 'matched'
      ? resolution.match.params['jobId']
      : undefined;
  const activeScreen = currentScreen(model.screens);
  const toastProjection = projectAppShellLabToasts(model);
  const latestToast = toastProjection.toasts.at(-1);
  const unread = model.shell.notifications.entries.filter(
    (entry) =>
      !entry.read
      && (entry.delivery === 'inbox' || entry.delivery === 'both'),
  ).length;
  const task = taskStatus(model);
  const status = shell.status(model.shell, {
    mode: 'APP SHELL',
    title: resolution.location.href,
    showShortcutHints: cols >= 100,
  });
  const width = contentWidth(cols);
  const statusNode = statusBar({ width }).view({
    ...status,
    width,
  });

  return column(
    row(
      text('APP SHELL GOLDEN PATH', headingStyle),
      text('  '),
      badge({ label: 'Compass live', variant: 'success', size: 'sm' }).view({
        visible: true,
    }),
    text(' '),
    badge({ label: 'headless host', variant: 'info', size: 'sm' }).view({
        visible: true,
      }),
    ),
    text(
      'One host view composes Compass navigation with createAppShell receipts, surfaces, tasks, status, and shared notifications.',
      mutedStyle,
      { wrap: true },
    ),
    statusNode,
    text(
      `Config receipt: ${configReceipt(model.configLoadResult)}`,
      model.configLoadResult?.ok === true ? successStyle : mutedStyle,
      { wrap: true },
    ),
    text(''),
    row(
      actionNode('overview', 'Overview', 'G', hoveredRegion),
      text(' '),
      actionNode('jobs', 'Jobs', 'J', hoveredRegion),
      text(' '),
      actionNode(
        'back',
        'Back',
        'B',
        hoveredRegion,
        !canGoBack(model.router.history),
      ),
    ),
    row(
      actionNode('confirm', 'Confirm', 'X', hoveredRegion),
      text(' '),
      actionNode('start', 'Start task', 'S', hoveredRegion),
      text(' '),
      actionNode(
        'cancel',
        'Cancel task',
        'C',
        hoveredRegion,
        task !== 'running',
      ),
    ),
    row(
      actionNode('notify', 'Notify', 'N', hoveredRegion),
      text(' '),
      actionNode('inbox', 'Inbox', 'I', hoveredRegion),
      text(' '),
      actionNode('help', 'Keys', '?', hoveredRegion),
      text(' '),
      actionNode('palette', 'Palette', 'Ctrl+P', hoveredRegion),
    ),
    text(''),
    text('Compass navigation', titleStyle),
    text(
      `Route receipt: ${resolution.location.href} -> ${routeId}${routeParam === undefined ? '' : ` (jobId ${routeParam})`}`,
      successStyle,
      { wrap: true },
    ),
    text(
      `History ${String(model.router.history.index + 1)}/${String(model.router.history.entries.length)} | Screen stack ${model.screens.stack.map((entry) => entry.id).join(' > ')}`,
      mutedStyle,
      { wrap: true },
    ),
    text(
      `Modal confirmation: ${model.shell.confirm === null ? (model.releaseApproved ? 'approved' : 'ready') : 'awaiting receipt'} | active screen ${activeScreen.id}`,
      model.shell.confirm === null ? mutedStyle : warningStyle,
      { wrap: true },
    ),
    text(''),
    text('Coordinated runtime', titleStyle),
    text(
      `Background task: ${task}`,
      task === 'success'
        ? successStyle
        : task === 'error'
          ? dangerStyle
          : task === 'cancelled'
            ? warningStyle
            : mutedStyle,
    ),
    progressBar({
      label: 'completion',
      value: task === 'success' ? 1 : 0,
      width: Math.max(12, Math.min(24, width - 14)),
      showPercentage: false,
    }),
    text(
      `Shared state: ${String(model.shell.notifications.entries.length)} inbox | ${String(unread)} unread | ${String(toastProjection.toasts.length)} visible toast`,
      mutedStyle,
      { wrap: true },
    ),
    text(
      `Toast receipt: ${latestToast?.message ?? 'none'}`,
      latestToast === undefined ? mutedStyle : actionStyle,
      { wrap: true },
    ),
    text(`Shell: ${model.lastShellReceipt}`, mutedStyle, { wrap: true }),
    text(`Host: ${model.lastHostReceipt}`, mutedStyle, { wrap: true }),
    text(
      `Diagnostics: ${model.diagnostics.length === 0 ? 'none' : model.diagnostics.join(', ')}`,
      model.diagnostics.length === 0 ? successStyle : dangerStyle,
      { wrap: true },
    ),
  );
}

export function composeAppShellLabSurfaces(
  base: VNode,
  model: AppShellLabModel,
  options: Pick<AppShellLabUpdateOptions, 'cols' | 'rows'> & {
    readonly theme?: ThemeInput;
  },
): VNode {
  const normalized = viewport(options);
  return createAppShellView(shell, {
    id: SHELL_ID,
    theme: options.theme,
  }).layer(base, model.shell, {
    hostModel: hostState(model),
    viewport: normalized,
  });
}
