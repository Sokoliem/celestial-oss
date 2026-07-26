import {
  createActionRegistry,
  type KeyModifiers,
  type Sub,
  subKind,
  type TaskState,
} from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import {
  type AppShell,
  type AppShellConfig,
  type AppShellModel,
  AppShellValidationError,
  createAppShell,
  summarizeAppShellTasks,
} from '../app-shell.js';
import {
  createNotificationStore,
  type NotificationModel,
  type NotificationStore,
} from '../notification-store.js';

interface HostModel {
  readonly canSave: boolean;
  readonly textFocused: boolean;
}

type HostMsg = { readonly type: 'host-save' };

const host: HostModel = { canSave: true, textFocused: false };
const viewport = { cols: 80, rows: 24 } as const;

function createHarness(options: {
  readonly store?: NotificationStore;
  readonly shortcuts?: AppShellConfig<HostModel, HostMsg>['shortcuts'];
  readonly extraActions?: Parameters<
    typeof createActionRegistry<HostModel, HostMsg>
  >[0];
  readonly canUseGlobalShortcuts?: AppShellConfig<
    HostModel,
    HostMsg
  >['canUseGlobalShortcuts'];
} = {}) {
  let runs = 0;
  const registry = createActionRegistry<HostModel, HostMsg>([
    {
      id: 'file.save',
      title: 'Save file',
      category: 'File',
      shortcuts: ['ctrl+s'],
      when: (model) => (model.canSave ? true : 'disabled'),
      run: () => {
        runs++;
        return { type: 'host-save' };
      },
    },
    {
      id: 'hidden.action',
      title: 'Hidden action',
      when: () => false,
      run: () => null,
    },
    ...(options.extraActions ?? []),
  ]);
  const store =
    options.store
    ?? createNotificationStore({
      now: () => 10,
      defaultDurationMs: 1_000,
    });
  const shell = createAppShell({
    id: 'test-shell',
    registry,
    notificationStore: store,
    formatTimestamp: (timestamp) => `T${String(timestamp)}`,
    canUseGlobalShortcuts:
      options.canUseGlobalShortcuts
      ?? ((model) => !model.textFocused),
    ...(options.shortcuts === undefined ? {} : { shortcuts: options.shortcuts }),
  });
  return {
    registry,
    store,
    shell,
    get runs() {
      return runs;
    },
  };
}

function enqueue(
  store: NotificationStore,
  model: NotificationModel,
  actionIds: readonly string[] = [],
): NotificationModel {
  const result = store.enqueue(model, {
    message: 'Saved',
    level: 'success',
    delivery: 'both',
    durationMs: null,
    actionIds,
  });
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.value.model;
}

type AnySubKind = ReturnType<typeof subKind<unknown>>;

function flattenSubscriptions(subscription: Sub<unknown>): AnySubKind[] {
  const kind = subKind(subscription);
  if (kind.kind === 'batch') {
    return kind.subs.flatMap((entry) =>
      flattenSubscriptions(entry as Sub<unknown>),
    );
  }
  if (
    kind.kind === 'map'
    || kind.kind === 'filter'
    || kind.kind === 'debounce'
    || kind.kind === 'throttle'
    || kind.kind === 'distinct'
  ) {
    return [kind, ...flattenSubscriptions(kind.sub)];
  }
  return [kind];
}

function isChord(
  kind: AnySubKind,
  key: string,
  modifiers: KeyModifiers = {},
): boolean {
  if (kind.kind === 'key') {
    return (
      kind.key === key
      && modifiers.ctrl !== true
      && modifiers.alt !== true
      && modifiers.shift !== true
    );
  }
  return (
    kind.kind === 'keyWithModifiers'
    && kind.key === key
    && (kind.modifiers.ctrl ?? false) === (modifiers.ctrl ?? false)
    && (kind.modifiers.alt ?? false) === (modifiers.alt ?? false)
    && (kind.modifiers.shift ?? false) === (modifiers.shift ?? false)
  );
}

function update(
  shell: AppShell<HostModel, HostMsg>,
  model: AppShellModel,
  msg: Parameters<AppShell<HostModel, HostMsg>['update']>[0],
  hostModel: HostModel = host,
) {
  return shell.update(msg, model, { hostModel, viewport });
}

describe('createAppShell action projection', () => {
  it('projects one exact registry into palette, keys, help, and immutable receipts without running host actions', () => {
    const harness = createHarness();
    const model = harness.shell.init(host);
    const projection = harness.shell.project(model, host);
    const command = projection.commands.find(
      (candidate) => candidate.id === 'file.save',
    );
    const binding = projection.keyBindings.find(
      (candidate) =>
        candidate.msg.type === 'shell-request-action'
        && candidate.msg.actionId === 'file.save',
    );

    expect(harness.shell.registry).toBe(harness.registry);
    expect(command?.msg).toEqual({
      type: 'shell-request-action',
      actionId: 'file.save',
      source: 'palette',
    });
    expect(binding?.msg).toEqual({
      type: 'shell-request-action',
      actionId: 'file.save',
      source: 'shortcut',
    });
    expect(projection.helpBindings).toContain(binding);
    expect(Object.isFrozen(projection.commands)).toBe(true);
    expect(Object.isFrozen(command)).toBe(true);
    expect(
      projection.commands.map((candidate) => candidate.id),
    ).toEqual(
      expect.arrayContaining(['app-shell.help', 'app-shell.notifications']),
    );

    const paletteReceipt = update(
      harness.shell,
      model,
      command!.msg,
    );
    expect(paletteReceipt.receipts).toEqual([
      {
        type: 'action-requested',
        actionId: 'file.save',
        source: 'palette',
      },
    ]);
    expect(Object.isFrozen(paletteReceipt.receipts)).toBe(true);
    expect(Object.isFrozen(paletteReceipt.receipts[0])).toBe(true);

    const helpFromPalette = update(
      harness.shell,
      harness.shell.init(host, {
        palette: {
          open: true,
          query: 'help',
          selectedIndex: 0,
          filteredIds: ['app-shell.help'],
        },
      }),
      { type: 'shell-palette-select' },
    ).model;
    expect(helpFromPalette.palette.open).toBe(false);
    expect(helpFromPalette.helpOpen).toBe(true);

    let withNotification = update(harness.shell, model, {
      type: 'shell-notify',
      notification: {
        message: 'Save available',
        level: 'info',
        delivery: 'inbox',
        actionIds: ['file.save'],
      },
    }).model;
    const notificationId = withNotification.notifications.entries[0]!.id;
    withNotification = update(harness.shell, withNotification, {
      type: 'shell-notification-center',
      msg: { type: 'open' },
    }).model;
    const notificationReceipt = update(harness.shell, withNotification, {
      type: 'shell-notification-center',
      msg: {
        type: 'activate-action',
        id: notificationId,
        actionId: 'file.save',
      },
    });
    expect(notificationReceipt.receipts).toEqual([
      {
        type: 'action-requested',
        actionId: 'file.save',
        source: 'notification',
      },
    ]);
    const centerClosed = update(harness.shell, withNotification, {
      type: 'shell-notification-center',
      msg: { type: 'close' },
    }).model;
    const staleNotificationAction = update(harness.shell, centerClosed, {
      type: 'shell-notification-center',
      msg: {
        type: 'activate-action',
        id: notificationId,
        actionId: 'file.save',
      },
    });
    expect(staleNotificationAction.receipts).toEqual([]);
    expect(staleNotificationAction.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.msg' },
    ]);
    expect(harness.runs).toBe(0);
  });

  it('keeps disabled, hidden, scoped, malformed, and colliding shortcuts explicit', () => {
    const harness = createHarness({
      extraActions: [
        {
          id: 'bad.sequence',
          title: 'Bad sequence',
          shortcuts: ['ctrl+k ctrl+x'],
          run: () => null,
        },
        {
          id: 'bad.modifier',
          title: 'Bad modifier',
          shortcuts: ['cmd+x'],
          run: () => null,
        },
        {
          id: 'bad.decoder',
          title: 'Bad decoder chord',
          shortcuts: ['ctrl+enter'],
          run: () => null,
        },
        {
          id: 'shell.collision',
          title: 'Shell collision',
          shortcuts: ['ctrl+p'],
          run: () => null,
        },
      ],
    });
    const disabledHost = { ...host, canSave: false };
    const projection = harness.shell.project(
      harness.shell.init(disabledHost),
      disabledHost,
    );
    const save = projection.keyBindings.find(
      (binding) =>
        binding.msg.type === 'shell-request-action'
        && binding.msg.actionId === 'file.save',
    );

    expect(save?.when?.()).toBe(false);
    expect(
      projection.commands.find((command) => command.id === 'file.save')?.disabled,
    ).toBe(true);
    expect(
      projection.commands.some((command) => command.id === 'hidden.action'),
    ).toBe(false);
    expect(
      projection.diagnostics.filter(
        (entry) =>
          entry.code === 'unbindable-shortcut'
          || entry.code === 'conflicting-shortcut',
      ),
    ).toHaveLength(4);
    expect(
      projection.keyBindings.some(
        (binding) =>
          binding.msg.type === 'shell-request-action'
          && binding.msg.actionId === 'shell.collision',
      ),
    ).toBe(false);
  });
});

describe('createAppShell dismissal and shared notifications', () => {
  it('owns one close chord and dismisses exactly confirm > palette > help > center internals/open > toast', () => {
    const harness = createHarness();
    const notifications = enqueue(
      harness.store,
      harness.store.init(),
      ['file.save'],
    );
    const id = notifications.entries[0]!.id;
    let model = harness.shell.init(host, {
      palette: {
        open: true,
        query: '',
        selectedIndex: 0,
        filteredIds: ['file.save'],
      },
      helpOpen: true,
      confirm: { id: 'delete', title: 'Delete it?' },
      notificationCenter: {
        open: true,
        selectedId: id,
        expandedId: id,
        actionCursor: { notificationId: id, actionId: 'file.save' },
        rowScrollOffset: 0,
        hoveredTarget: null,
        focusWithin: true,
      },
      notifications,
    });
    const flattened = flattenSubscriptions(
      harness.shell.subscriptions(model, { hostModel: host, viewport }),
    );
    expect(
      flattened.filter((kind) => isChord(kind, 'escape')),
    ).toHaveLength(1);
    const enterBindings = harness.shell
      .project(model, host)
      .keyBindings.filter((binding) => binding.key === 'enter');
    expect(enterBindings.map((binding) => binding.msg)).toEqual([
      { type: 'shell-confirm', id: 'delete' },
    ]);
    const blockedPalette = update(harness.shell, model, {
      type: 'shell-palette-select',
    });
    expect(blockedPalette.receipts).toEqual([]);
    expect(blockedPalette.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.type' },
    ]);
    const blockedNotification = update(harness.shell, model, {
      type: 'shell-notification-center',
      msg: { type: 'activate-action', id, actionId: 'file.save' },
    });
    expect(blockedNotification.receipts).toEqual([]);
    expect(blockedNotification.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.type' },
    ]);
    expect(harness.shell.status(model).left[0]?.text).toBe('CONFIRM');

    const result = update(harness.shell, model, { type: 'shell-dismiss' });
    expect(result.receipts).toEqual([
      { type: 'confirm-resolved', id: 'delete', confirmed: false },
    ]);
    expect(result.model.palette.open).toBe(true);
    model = result.model;

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.palette.open).toBe(false);
    expect(model.helpOpen).toBe(true);

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.helpOpen).toBe(false);
    expect(model.notificationCenter.actionCursor).not.toBeNull();

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.notificationCenter.actionCursor).toBeNull();
    expect(model.notificationCenter.expandedId).toBe(id);

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.notificationCenter.expandedId).toBeNull();
    expect(model.notificationCenter.open).toBe(true);

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.notificationCenter.open).toBe(false);
    expect(model.notifications.visibleToastIds).toEqual([id]);

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.notifications.visibleToastIds).toEqual([]);
    expect(model.notifications.entries.map((entry) => entry.id)).toEqual([id]);
  });

  it('retains one canonical Escape owner when a configured close chord adds an alias', () => {
    const harness = createHarness({ shortcuts: { close: 'ctrl+w' } });
    const model = harness.shell.init(host, {
      confirm: { id: 'replace', title: 'Replace the file?' },
    });
    const flattened = flattenSubscriptions(
      harness.shell.subscriptions(model, { hostModel: host, viewport }),
    );

    expect(flattened.filter((kind) => isChord(kind, 'escape'))).toHaveLength(1);
    expect(
      flattened.filter((kind) => isChord(kind, 'w', { ctrl: true })),
    ).toHaveLength(1);
  });

  it('resolves a displaced confirmation as cancelled before installing its replacement', () => {
    const harness = createHarness();
    const first = harness.shell.init(host, {
      confirm: { id: 'first', title: 'First confirmation' },
    });
    const replaced = update(harness.shell, first, {
      type: 'shell-open-confirm',
      confirm: { id: 'second', title: 'Second confirmation' },
    });

    expect(replaced.model.confirm?.id).toBe('second');
    expect(replaced.receipts).toEqual([
      { type: 'confirm-resolved', id: 'first', confirmed: false },
    ]);
    const staleFirst = update(harness.shell, replaced.model, {
      type: 'shell-confirm',
      id: 'first',
    });
    expect(staleFirst.model.confirm?.id).toBe('second');
    expect(staleFirst.receipts).toEqual([]);
    expect(staleFirst.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.id' },
    ]);
    const confirmedSecond = update(harness.shell, staleFirst.model, {
      type: 'shell-confirm',
      id: 'second',
    });
    expect(confirmedSecond.model.confirm).toBeNull();
    expect(confirmedSecond.receipts).toEqual([
      { type: 'confirm-resolved', id: 'second', confirmed: true },
    ]);
  });

  it('round-trips one exact store through center and toast projections without duplicate entries', () => {
    const harness = createHarness();
    let model = harness.shell.init(host);
    model = update(harness.shell, model, {
      type: 'shell-notify',
      notification: {
        message: 'Durable toast',
        level: 'warning',
        delivery: 'both',
        durationMs: null,
      },
    }).model;
    const id = model.notifications.entries[0]!.id;
    const firstToast = harness.shell.projectToasts(model);

    expect(harness.shell.notificationStore).toBe(harness.store);
    expect(firstToast.toasts.map((toast) => toast.id)).toEqual([id]);
    expect(firstToast.entries).toHaveLength(1);

    model = update(harness.shell, model, {
      type: 'shell-notification-center',
      msg: { type: 'open' },
    }).model;
    model = update(harness.shell, model, {
      type: 'shell-notification-center',
      msg: { type: 'mark-read', id },
    }).model;
    expect(model.notifications.entries[0]?.read).toBe(true);
    expect(harness.shell.projectToasts(model).entries[0]?.read).toBe(true);

    model = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'hover', id },
    }).model;
    expect(model.notifications.hoveredToastId).toBe(id);
    expect(model.toastInteraction.mouseHoveredToastId).toBe(id);

    model = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'dismiss', id },
    }).model;
    expect(model.notifications.visibleToastIds).toEqual([]);
    expect(model.notifications.entries).toHaveLength(1);
    expect(model.toastInteraction.mouseHoveredToastId).toBeNull();
  });
});

describe('createAppShell validation and focus ownership', () => {
  it('uses defaults only for absent shortcuts and aggregates configured shortcut failures', () => {
    const defaults = createHarness({ shortcuts: {} });
    const defaultProjection = defaults.shell.project(
      defaults.shell.init(host),
      host,
    );
    expect(
      defaultProjection.keyBindings.some(
        (binding) =>
          binding.key === 'p'
          && binding.modifiers?.ctrl === true
          && binding.msg.type === 'shell-open-palette',
      ),
    ).toBe(true);

    expect(() =>
      createHarness({
        shortcuts: {
          palette: '',
          help: 'cmd+h',
          notifications: 'ctrl+enter',
          close: 'ctrl+k ctrl+w',
        },
      }),
    ).toThrow(AppShellValidationError);
    try {
      createHarness({
        shortcuts: {
          palette: '',
          help: 'cmd+h',
          notifications: 'ctrl+enter',
          close: 'ctrl+k ctrl+w',
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppShellValidationError);
      expect((error as AppShellValidationError).diagnostics).toHaveLength(4);
    }

    expect(() =>
      createHarness({ shortcuts: { palette: '', close: 'escape' } }),
    ).toThrow(/shortcuts\.palette/u);
    expect(() =>
      createHarness({ shortcuts: { palette: 'ctrl+p', close: 'ctrl+p' } }),
    ).toThrow(/conflicts/u);
    expect(() =>
      createHarness({ shortcuts: { help: 'escape', close: 'ctrl+w' } }),
    ).toThrow(/Escape is reserved/u);
  });

  it('rejects malformed registry/store/config and reports malformed model/context without mutation', () => {
    const valid = createHarness();
    const ghostAction = {
      id: 'ghost',
      title: 'Ghost action',
      when: () => true,
      run: () => null,
    };
    const forgedById = new Map(valid.registry.byId);
    forgedById.set(ghostAction.id, ghostAction);
    expect(() =>
      createAppShell({
        registry: {
          actions: valid.registry.actions,
          byId: forgedById,
        },
        notificationStore: valid.store,
        formatTimestamp: (timestamp) => `T${String(timestamp)}`,
        canUseGlobalShortcuts: () => true,
      }),
    ).toThrow(/no extras/u);
    expect(() =>
      createHarness({
        extraActions: [
          {
            id: 'app-shell.help',
            title: 'Shadow shell help',
            when: () => true,
            run: () => null,
          },
        ],
      }),
    ).toThrow(/reserved/u);
    expect(() =>
      createAppShell({
        registry: { actions: [], byId: {} } as never,
        notificationStore: {} as never,
        formatTimestamp: null as never,
        canUseGlobalShortcuts: null as never,
      }),
    ).toThrow(AppShellValidationError);

    const model = valid.shell.init(host);
    const malformed = {
      ...model,
      palette: { ...model.palette, query: '\u0000' },
      tasks: [{ id: 'failed', state: { status: 'error' } }],
    } as AppShellModel;
    const result = valid.shell.update(
      { type: 'shell-noop' },
      malformed,
      { hostModel: host, viewport: { cols: 0, rows: Number.NaN } },
    );
    expect(result.model).toBe(malformed);
    expect(result.diagnostics.map((entry) => entry.field)).toEqual(
      expect.arrayContaining([
        'palette.query',
        'tasks[0].state.error',
        'viewport.cols',
        'viewport.rows',
      ]),
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(() => valid.shell.status(malformed)).toThrow(
      AppShellValidationError,
    );
    expect(() => valid.shell.status(model, null as never)).toThrow(
      /status options/u,
    );
  });

  it('suppresses global bindings while a text input owns focus but retains surface-local dismissal', () => {
    const harness = createHarness();
    const focusedHost = { ...host, textFocused: true };
    const closed = harness.shell.init(focusedHost);
    const closedProjection = harness.shell.project(closed, focusedHost);
    const globalBindings = closedProjection.keyBindings.filter(
      (binding) =>
        binding.msg.type === 'shell-open-palette'
        || binding.msg.type === 'shell-request-action',
    );
    expect(globalBindings.every((binding) => binding.when?.() === false)).toBe(
      true,
    );
    const closedSubscriptions = flattenSubscriptions(
      harness.shell.subscriptions(closed, {
        hostModel: focusedHost,
        viewport,
      }),
    );
    expect(
      closedSubscriptions.some((kind) => isChord(kind, 'p', { ctrl: true })),
    ).toBe(false);
    expect(
      closedSubscriptions.some((kind) => isChord(kind, 's', { ctrl: true })),
    ).toBe(false);

    const blockedByFocus = update(
      harness.shell,
      closed,
      {
        type: 'shell-request-action',
        actionId: 'file.save',
        source: 'shortcut',
      },
      focusedHost,
    );
    expect(blockedByFocus.receipts).toEqual([]);
    expect(blockedByFocus.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.source' },
    ]);

    const confirming = harness.shell.init(host, {
      confirm: { id: 'modal', title: 'Modal confirmation' },
    });
    const blockedByModal = update(harness.shell, confirming, {
      type: 'shell-request-action',
      actionId: 'file.save',
      source: 'shortcut',
    });
    expect(blockedByModal.receipts).toEqual([]);
    expect(blockedByModal.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.source' },
    ]);

    const forgedNotificationSource = update(harness.shell, closed, {
      type: 'shell-request-action',
      actionId: 'file.save',
      source: 'notification',
    } as never);
    expect(forgedNotificationSource.receipts).toEqual([]);
    expect(forgedNotificationSource.diagnostics).toMatchObject([
      { code: 'invalid-model', field: 'message.source' },
    ]);

    const open = harness.shell.init(focusedHost, {
      palette: {
        open: true,
        query: '',
        selectedIndex: 0,
        filteredIds: ['file.save'],
      },
    });
    const openProjection = harness.shell.project(open, focusedHost);
    const close = openProjection.keyBindings.find(
      (binding) => binding.msg.type === 'shell-dismiss',
    );
    expect(close?.when?.()).toBe(true);
    expect(
      flattenSubscriptions(
        harness.shell.subscriptions(open, {
          hostModel: focusedHost,
          viewport,
        }),
      ).filter((kind) => isChord(kind, 'escape')),
    ).toHaveLength(1);
  });
});

describe('createAppShell task evidence and immutable state', () => {
  it('derives task status only from evidence and never reports success for zero tasks', () => {
    const harness = createHarness();
    let model = harness.shell.init(host);
    expect(summarizeAppShellTasks([])).toEqual({
      total: 0,
      idle: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      overall: null,
    });
    expect(harness.shell.status(model).right).toEqual([]);

    expect(
      summarizeAppShellTasks([
        { id: 'done', state: { status: 'success' } },
        { id: 'not-started', state: { status: 'idle' } },
      ]).overall,
    ).toBe('idle');

    const states: Array<{ readonly id: string; readonly state: TaskState }> = [
      { id: 'success', state: { status: 'success', finishedAt: 2 } },
      { id: 'running', state: { status: 'running', startedAt: 1 } },
      { id: 'cancelled', state: { status: 'cancelled', finishedAt: 2 } },
      {
        id: 'failed',
        state: { status: 'error', finishedAt: 2, error: new Error('boom') },
      },
    ];
    for (const task of states) {
      model = update(harness.shell, model, {
        type: 'shell-task-state',
        task,
      }).model;
    }
    const summary = summarizeAppShellTasks(model.tasks);
    expect(summary.overall).toBe('error');
    expect(summary.failed).toBe(1);
    expect(harness.shell.status(model).right[0]?.text).toBe('1 failed');
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.tasks)).toBe(true);
    expect(model.tasks.every(Object.isFrozen)).toBe(true);

    const invalid = update(harness.shell, model, {
      type: 'shell-task-state',
      task: { id: 'missing-error', state: { status: 'error' } },
    });
    expect(invalid.diagnostics[0]?.field).toContain('.error');
    expect(invalid.model.tasks).toHaveLength(4);
  });
});
