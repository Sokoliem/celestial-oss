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
  getAppShellTaskMessage,
  summarizeAppShellTasks,
} from '../app-shell.js';
import {
  createNotificationStore,
  type NotificationModel,
  type NotificationStore,
} from '../notification-store.js';
import type { NotificationCenterHoverTarget } from '../notification-center.js';

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
      expect.arrayContaining(['app-shell.help', 'app-shell.notifications']));

    const paletteOpen = harness.shell.init(host, {
      palette: {
        open: true,
        query: '',
        selectedIndex: 0,
        filteredIds: ['file.save'],
      },
    });
    const paletteReceipt = update(
      harness.shell, paletteOpen, command!.msg);
    expect(paletteReceipt.receipts).toEqual([
      {
        type: 'action-requested',
        actionId: 'file.save',
        source: 'palette',
      },
    ]);
    expect(Object.isFrozen(paletteReceipt.receipts)).toBe(true);
    expect(Object.isFrozen(paletteReceipt.receipts[0])).toBe(true);
    expect(paletteReceipt.model.palette.open).toBe(false);

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
    const collidingCommand = projection.commands.find((command) => command.id === 'shell.collision');
    expect(collidingCommand?.shortcut).toBeUndefined();
    expect(collidingCommand?.keywords).not.toContain('ctrl+p');
  });

  it('reconciles and reports a palette selection that disappears from the current projection', () => {
    const harness = createHarness({
      extraActions: [
        {
          id: 'dynamic.action',
          title: 'Dynamic action',
          when: (model) => model.canSave,
          run: () => null,
        },
      ],
    });
    const open = harness.shell.init(host, {
      palette: {
        open: true,
        query: 'dynamic',
        selectedIndex: 0,
        filteredIds: ['dynamic.action'],
      },
    });
    const hiddenHost = { ...host, canSave: false };
    const selected = update(harness.shell, open, { type: 'shell-palette-select' }, hiddenHost);

    expect(selected.receipts).toEqual([]);
    expect(selected.model.palette.open).toBe(true);
    expect(selected.model.palette.filteredIds).not.toContain('dynamic.action');
    expect(selected.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unavailable-action',
          actionId: 'dynamic.action',
        }),
      ]),
    );
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
    expect(flattened.filter((kind) => isChord(kind, 'enter'))).toHaveLength(1);
    expect(flattened.some((kind) => isChord(kind, 'space'))).toBe(false);
    expect(flattened.some((kind) => isChord(kind, 'delete'))).toBe(false);
    expect(flattened.some((kind) => isChord(kind, 'down'))).toBe(false);
    expect(flattened.some((kind) => kind.kind === 'keyEvent')).toBe(false);
    expect(flattened.some((kind) => isChord(kind, 'f1'))).toBe(false);
    expect(
      flattened.some((kind) => isChord(kind, 'n', { alt: true })),
    ).toBe(false);
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
    for (const hiddenMessage of [
      { type: 'shell-palette-input', char: 'x' },
      { type: 'shell-palette-backspace' },
      { type: 'shell-palette-up' },
      { type: 'shell-palette-down' },
      { type: 'shell-toggle-help' },
      { type: 'shell-toggle-notifications' },
    ] as const) {
      const blocked = update(harness.shell, model, hiddenMessage);
      expect(blocked.model).toEqual(model);
      expect(blocked.diagnostics).toMatchObject([
        { code: 'unavailable-action', field: 'message.type' },
      ]);
    }
    expect(harness.shell.status(model).left[0]?.text).toBe('CONFIRM');

    const result = update(harness.shell, model, { type: 'shell-dismiss' });
    expect(result.receipts).toEqual([
      { type: 'confirm-resolved', id: 'delete', confirmed: false },
    ]);
    expect(result.model.palette.open).toBe(true);
    const blockedBelowPalette = update(harness.shell, result.model, {
      type: 'shell-notification-center',
      msg: { type: 'activate-action', id, actionId: 'file.save' },
    });
    expect(blockedBelowPalette.receipts).toEqual([]);
    expect(blockedBelowPalette.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.type' },
    ]);
    for (const hiddenToggle of [
      { type: 'shell-toggle-help' },
      { type: 'shell-toggle-notifications' },
    ] as const) {
      const blocked = update(harness.shell, result.model, hiddenToggle);
      expect(blocked.model).toEqual(result.model);
      expect(blocked.diagnostics).toMatchObject([
        { code: 'unavailable-action', field: 'message.type' },
      ]);
    }
    const paletteTopSubscriptions = flattenSubscriptions(
      harness.shell.subscriptions(result.model, { hostModel: host, viewport }),
    );
    expect(
      paletteTopSubscriptions.some((kind) => isChord(kind, 'f1')),
    ).toBe(false);
    expect(
      paletteTopSubscriptions.some((kind) =>
        isChord(kind, 'n', { alt: true }),
      ),
    ).toBe(false);
    model = result.model;

    model = update(harness.shell, model, { type: 'shell-dismiss' }).model;
    expect(model.palette.open).toBe(false);
    expect(model.helpOpen).toBe(true);
    const blockedBelowHelp = update(harness.shell, model, {
      type: 'shell-toggle-notifications',
    });
    expect(blockedBelowHelp.model).toEqual(model);
    expect(blockedBelowHelp.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.type' },
    ]);

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
      type: 'shell-notification-center',
      msg: { type: 'close' },
    }).model;

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

  it('rejects unknown notification actions before commit and preserves hydrated diagnostics', () => {
    const harness = createHarness();
    const initial = harness.shell.init(host);
    const rejected = update(harness.shell, initial, {
      type: 'shell-notify',
      notification: {
        message: 'Unknown action',
        level: 'info',
        delivery: 'inbox',
        actionIds: ['missing.action'],
      },
    });
    expect(rejected.model).toEqual(initial);
    expect(rejected.model.notifications.entries).toEqual([]);
    expect(rejected.diagnostics).toMatchObject([
      {
        code: 'unknown-action',
        actionId: 'missing.action',
        field: 'notification.actionIds[0]',
      },
    ]);

    const hiddenAccepted = update(harness.shell, initial, {
      type: 'shell-notify',
      notification: {
        message: 'Hidden action may become available',
        level: 'info',
        delivery: 'inbox',
        actionIds: ['hidden.action'],
      },
    });
    expect(hiddenAccepted.diagnostics).toEqual([]);
    expect(hiddenAccepted.model.notifications.entries[0]?.actionIds).toEqual(['hidden.action']);

    const hydrated = enqueue(harness.store, harness.store.init(), ['missing.action']);
    const malformed = { ...initial, notifications: hydrated };
    const hydratedResult = update(harness.shell, malformed, { type: 'shell-noop' });
    expect(hydratedResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unknown-action',
          actionId: 'missing.action',
          field: 'notifications.entries[0].actionIds[0]',
        }),
      ]),
    );
    expect(hydratedResult.diagnostics.some((entry) => entry.field === 'notificationCenter.message')).toBe(false);
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

    expect(() =>
      createAppShell({
        registry: defaults.registry,
        notificationStore: defaults.store,
        formatTimestamp: (timestamp) => String(timestamp),
        canUseGlobalShortcuts: () => true,
        shortcuts: { palette: undefined } as never,
      }),
    ).toThrow(/shortcuts\.palette/u);

    const shortcutDiagnostics = (declaration: string) => {
      try {
        createHarness({ shortcuts: { palette: declaration } });
      } catch (error) {
        expect(error).toBeInstanceOf(AppShellValidationError);
        return (error as AppShellValidationError).diagnostics;
      }
      throw new Error('Expected invalid shortcut configuration');
    };
    expect(
      shortcutDiagnostics('x'.repeat(4_096)).some((entry) =>
        entry.message.includes('no longer than 4096'),
      ),
    ).toBe(false);
    expect(
      shortcutDiagnostics('x'.repeat(4_097)),
    ).toMatchObject([
      {
        code: 'invalid-shortcut',
        field: 'shortcuts.palette',
        message: expect.stringContaining('no longer than 4096'),
      },
    ]);
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
    ).toThrow(/canonical ActionRegistry/u);
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

  it('enforces canonical notification-center cursor and hover bounds at every shell boundary', () => {
    const harness = createHarness();
    const model = harness.shell.init(host);
    const oversizedActionId = 'a'.repeat(257);
    const invalidCenters = [
      {
        ...model.notificationCenter,
        actionCursor: {
          notificationId: 1,
          actionId: oversizedActionId,
        },
      },
      {
        ...model.notificationCenter,
        hoveredTarget: `action:1:${encodeURIComponent(oversizedActionId)}` as NotificationCenterHoverTarget,
      },
      {
        ...model.notificationCenter,
        hoveredTarget: `row:${'1'.repeat(4_097)}` as NotificationCenterHoverTarget,
      },
    ];

    for (const notificationCenter of invalidCenters) {
      expect(() =>
        harness.shell.init(host, { notificationCenter }),
      ).toThrow(AppShellValidationError);
      const forged = { ...model, notificationCenter } as AppShellModel;
      expect(harness.shell.validateModel(forged)).not.toEqual([]);
      expect(() =>
        harness.shell.subscriptions(forged, { hostModel: host, viewport }),
      ).toThrow(AppShellValidationError);
    }
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
      { code: 'unavailable-action', field: 'message.source' }]);

    const forgedClosedPaletteRequest = update(
      harness.shell,
      closed,
      {
        type: 'shell-request-action',
        actionId: 'file.save',
        source: 'palette',
      },
      focusedHost,
    );
    expect(forgedClosedPaletteRequest.receipts).toEqual([]);
    expect(forgedClosedPaletteRequest.diagnostics).toMatchObject([{ code: 'unavailable-action', field: 'message.source' }]);

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
      { code: 'unavailable-action', field: 'message.source' }]);
    let hostileLengthReads = 0;
    const hostileActionId = Object.defineProperty({}, 'length', {
      enumerable: true,
      get: () => {
        hostileLengthReads += 1;
        throw new Error('length escaped');
      },
    });
    for (const actionId of [
      hostileActionId,
      Symbol('action'),
      '',
      'a'.repeat(257),
    ]) {
      const malformed = update(harness.shell, confirming, {
        type: 'shell-request-action',
        actionId,
        source: 'shortcut',
      } as never);
      expect(malformed.model).toEqual(confirming);
      expect(malformed.receipts).toEqual([]);
      expect(malformed.diagnostics).toMatchObject([
        { code: 'invalid-model', field: 'message.actionId' },
      ]);
    }
    expect(hostileLengthReads).toBe(0);
    for (const msg of [{ type: 'shell-toggle-help' }, { type: 'shell-toggle-notifications' }] as const) {
      const blockedToggle = update(harness.shell, confirming, msg);
      expect(blockedToggle.model).toEqual(confirming);
      expect(blockedToggle.diagnostics).toMatchObject([{ code: 'unavailable-action', field: 'message.type' }]);
    }

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

  it('rechecks queued global opens against the current host focus owner', () => {
    const harness = createHarness();
    const closed = harness.shell.init(host);
    const focusedHost = { ...host, textFocused: true };

    for (const msg of [{ type: 'shell-open-palette' }, { type: 'shell-toggle-help' }, { type: 'shell-toggle-notifications' }] as const) {
      const blocked = update(harness.shell, closed, msg, focusedHost);
      expect(blocked.model).toEqual(closed);
      expect(blocked.diagnostics).toMatchObject([{ code: 'unavailable-action', field: 'message.type' }]);
    }
  });

  it('validates nested center messages before focus precedence without dereferencing accessors', () => {
    const harness = createHarness();
    const confirming = harness.shell.init(host, {
      confirm: { id: 'confirm', title: 'Confirm?' },
    });

    for (const nested of [
      null,
      7,
      { type: 'activate-action', id: 0, actionId: '' },
    ]) {
      const result = update(harness.shell, confirming, {
        type: 'shell-notification-center',
        msg: nested,
      } as never);
      expect(result.model).toEqual(confirming);
      expect(result.receipts).toEqual([]);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'invalid-model' }),
        ]),
      );
      expect(
        result.diagnostics.some((entry) => entry.code === 'unavailable-action'),
      ).toBe(false);
    }

    let nestedTypeReads = 0;
    const accessorNested = Object.defineProperty({}, 'type', {
      enumerable: true,
      get: () => {
        nestedTypeReads += 1;
        return 'activate';
      },
    });
    const accessorResult = update(harness.shell, confirming, {
      type: 'shell-notification-center',
      msg: accessorNested,
    } as never);
    expect(accessorResult.model).toEqual(confirming);
    expect(accessorResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-model' }),
      ]),
    );
    expect(nestedTypeReads).toBe(0);
  });

  it('clears hidden toast ownership and gates lower-layer interaction while timers continue', () => {
    const harness = createHarness();
    const enqueued = harness.store.enqueue(harness.store.init(), {
      message: 'Timed toast',
      level: 'info',
      delivery: 'toast',
      durationMs: 1_000,
    });
    if (!enqueued.ok) throw new Error(enqueued.diagnostics[0]?.message);
    const id = enqueued.value.entry.id;
    const layeredSeed = harness.shell.init(host, {
      confirm: { id: 'seed-blocker', title: 'Seed blocker' },
      notifications: enqueued.value.model,
      toastInteraction: {
        mouseHoveredToastId: null,
        focusedToastId: id,
      },
    });
    expect(layeredSeed.toastInteraction.focusedToastId).toBeNull();
    expect(layeredSeed.notifications.hoveredToastId).toBeNull();
    expect(layeredSeed.notifications.pausedToast).toBeNull();

    let model = harness.shell.init(host, {
      notifications: enqueued.value.model,
    });
    model = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'focus', id },
    }).model;
    expect(model.toastInteraction.focusedToastId).toBe(id);
    expect(model.notifications.pausedToast?.id).toBe(id);

    model = update(harness.shell, model, {
      type: 'shell-notification-center',
      msg: { type: 'open' },
    }).model;
    expect(model.notificationCenter.open).toBe(true);
    expect(model.toastInteraction).toEqual({
      mouseHoveredToastId: null,
      focusedToastId: null,
    });
    expect(model.notifications.hoveredToastId).toBeNull();
    expect(model.notifications.pausedToast).toBeNull();
    model = update(harness.shell, model, {
      type: 'shell-notification-center',
      msg: { type: 'close' },
    }).model;
    model = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'focus', id },
    }).model;
    expect(model.toastInteraction.focusedToastId).toBe(id);
    expect(model.notifications.pausedToast?.id).toBe(id);

    model = update(harness.shell, model, {
      type: 'shell-open-confirm',
      confirm: { id: 'blocking', title: 'Blocking confirmation' },
    }).model;
    expect(model.toastInteraction).toEqual({
      mouseHoveredToastId: null,
      focusedToastId: null,
    });
    expect(model.notifications.hoveredToastId).toBeNull();
    expect(model.notifications.pausedToast).toBeNull();

    const blockedFocus = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'focus', id },
    });
    expect(blockedFocus.model.toastInteraction.focusedToastId).toBeNull();
    expect(blockedFocus.diagnostics).toMatchObject([
      { code: 'unavailable-action', field: 'message.type' },
    ]);

    const tick = update(harness.shell, model, {
      type: 'shell-toast',
      msg: { type: 'tick' },
    });
    expect(tick.diagnostics).toEqual([]);
    const subscriptions = flattenSubscriptions(
      harness.shell.subscriptions(model, { hostModel: host, viewport }),
    );
    expect(subscriptions.filter((kind) => isChord(kind, 'enter'))).toHaveLength(1);
    expect(subscriptions.some((kind) => isChord(kind, 'space'))).toBe(false);
    expect(subscriptions.some((kind) => kind.kind === 'timer')).toBe(true);
  });

  it('snapshots public boundaries once and rejects accessors or revoked proxies observably', () => {
    const harness = createHarness();
    const model = harness.shell.init(host);
    let paletteReads = 0;
    const accessorModel = Object.defineProperty({ ...model }, 'palette', {
      enumerable: true,
      get: () => {
        paletteReads += 1;
        return model.palette;
      },
    }) as AppShellModel;
    const accessorResult = update(harness.shell, accessorModel, {
      type: 'shell-noop',
    });
    expect(accessorResult.model).toBe(accessorModel);
    expect(accessorResult.diagnostics).toMatchObject([{ code: 'invalid-model', field: 'model' }]);
    expect(paletteReads).toBe(0);

    let typeReads = 0;
    const accessorMessage = Object.defineProperty({}, 'type', {
      enumerable: true,
      get: () => {
        typeReads += 1;
        return 'shell-open-palette';
      },
    });
    const messageResult = update(harness.shell, model, accessorMessage as never);
    expect(messageResult.model.palette.open).toBe(false);
    expect(messageResult.diagnostics).toMatchObject([{ code: 'invalid-model', field: 'message' }]);
    expect(typeReads).toBe(0);

    for (const unsafeType of ['unknown\n', 'unknown\u001b', 'unknown\u202e', 'unknown\ud800']) {
      const unknown = update(harness.shell, model, { type: unsafeType } as never);
      expect(unknown.diagnostics).toMatchObject([{ code: 'invalid-model', field: 'message.type' }]);
      expect(unknown.diagnostics[0]?.message).not.toContain(unsafeType);
    }

    const revokedModel = Proxy.revocable(model, {});
    revokedModel.revoke();
    expect(
      update(harness.shell, revokedModel.proxy as AppShellModel, {
        type: 'shell-noop',
      }).diagnostics,
    ).toMatchObject([{ code: 'invalid-model', field: 'model' }]);

    const huge = new Array<string>(4_294_967_295);
    const hugePalette = update(
      harness.shell,
      {
        ...model,
        palette: { ...model.palette, filteredIds: huge },
      },
      { type: 'shell-noop' },
    );
    expect(hugePalette.diagnostics).toMatchObject([{ code: 'invalid-model', field: 'model' }]);
    const hugeTasks = update(harness.shell, { ...model, tasks: huge as never }, { type: 'shell-noop' });
    expect(hugeTasks.diagnostics).toMatchObject([{ code: 'invalid-model', field: 'model' }]);

    expect(() => harness.shell.subscriptions({ ...model, palette: { ...model.palette, query: '\ud800' } }, { hostModel: host, viewport })).toThrow(
      AppShellValidationError,
    );

    const oversizedViewport = {
      hostModel: host,
      viewport: {
        cols: Number.MAX_SAFE_INTEGER,
        rows: Number.MAX_SAFE_INTEGER,
      },
    };
    const oversizedResult = harness.shell.update({ type: 'shell-open-palette' }, model, oversizedViewport);
    expect(oversizedResult.model).toBe(model);
    expect(oversizedResult.diagnostics.map((entry) => entry.field)).toEqual(expect.arrayContaining(['viewport.cols', 'viewport.rows']));
    expect(() => harness.shell.subscriptions(model, oversizedViewport)).toThrow(AppShellValidationError);
  });

  it('snapshots construction config so later caller mutation cannot change ownership', () => {
    const registry = createActionRegistry<HostModel, HostMsg>([]);
    const store = createNotificationStore();
    const mutableConfig = {
      registry,
      notificationStore: store,
      formatTimestamp: (timestamp: number) => String(timestamp),
      canUseGlobalShortcuts: () => false,
    };
    const shell = createAppShell(mutableConfig);
    const model = shell.init(host);
    (
      mutableConfig as {
        canUseGlobalShortcuts: AppShellConfig<HostModel, HostMsg>['canUseGlobalShortcuts'];
      }
    ).canUseGlobalShortcuts = () => true;

    const paletteBinding = shell.project(model, host).keyBindings.find((binding) => binding.msg.type === 'shell-open-palette');
    expect(paletteBinding?.when?.()).toBe(false);
  });

  it('evaluates action availability once per projection and propagates projection failures through palette transitions', () => {
    let alternatingCalls = 0;
    const stable = createHarness({
      extraActions: [
        {
          id: 'alternating',
          title: 'Alternating',
          shortcuts: ['ctrl+a'],
          when: () => {
            alternatingCalls += 1;
            return alternatingCalls % 2 === 1;
          },
          run: () => null,
        },
      ],
    });
    const stableModel = stable.shell.init(host);
    const stableProjection = stable.shell.project(stableModel, host);
    expect(alternatingCalls).toBe(1);
    expect(stableProjection.commands.some((command) => command.id === 'alternating')).toBe(true);
    expect(stableProjection.keyBindings.some((binding) => binding.msg.type === 'shell-request-action' && binding.msg.actionId === 'alternating')).toBe(true);

    const failing = createHarness({
      extraActions: [
        {
          id: 'failing',
          title: 'Failing',
          when: () => {
            throw new Error('availability failed');
          },
          run: () => null,
        },
      ],
    });
    const closed = failing.shell.init(host);
    const opened = update(failing.shell, closed, {
      type: 'shell-open-palette',
    });
    expect(opened.model.palette.open).toBe(true);
    expect(opened.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-context',
          field: 'registry',
          message: expect.stringContaining('availability failed'),
        }),
      ]),
    );
    for (const msg of [{ type: 'shell-palette-input', char: 'x' }, { type: 'shell-palette-backspace' }, { type: 'shell-palette-select' }] as const) {
      expect(update(failing.shell, opened.model, msg).diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-context',
            message: expect.stringContaining('availability failed'),
          }),
        ]),
      );
    }
    expect(() => failing.shell.subscriptions(closed, { hostModel: host, viewport })).toThrow(AppShellValidationError);
  });

  it('rejects invalid action availability without emitting an action receipt', () => {
    const harness = createHarness({
      extraActions: [
        {
          id: 'invalid-availability',
          title: 'Invalid availability',
          when: (() => 'enabled') as never,
          run: () => null,
        },
      ],
    });
    const model = harness.shell.init(host);
    const result = update(harness.shell, model, {
      type: 'shell-request-action',
      actionId: 'invalid-availability',
      source: 'shortcut',
    });

    expect(result.receipts).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-context',
          message: expect.stringContaining('must return true, false, or "disabled"'),
        }),
      ]),
    );
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

  it('validates exported task helpers without invoking hostile accessors', () => {
    expect(() => summarizeAppShellTasks([{ id: 'bogus', state: { status: 'bogus' } as never }])).toThrow(/task status is invalid/i);
    expect(() =>
      getAppShellTaskMessage({ status: 'bogus' } as never, {
        running: 'Running',
        success: 'Done',
        error: 'Failed',
        cancelled: 'Cancelled',
      }),
    ).toThrow(/task status is invalid/i);

    let stateReads = 0;
    const hostileTask = Object.defineProperties(
      {},
      {
        id: { enumerable: true, value: 'hostile' },
        state: {
          enumerable: true,
          get: () => {
            stateReads += 1;
            return { status: 'running' };
          },
        },
      },
    );
    expect(() => summarizeAppShellTasks([hostileTask as never])).toThrow(/state.*own data property/i);
    expect(stateReads).toBe(0);

    let runningReads = 0;
    const hostileMessages = Object.defineProperty({}, 'running', {
      enumerable: true,
      get: () => {
        runningReads += 1;
        return 'Running';
      },
    });
    expect(() => getAppShellTaskMessage({ status: 'running' }, hostileMessages as never)).toThrow(/running.*own data property/i);
    expect(runningReads).toBe(0);
  });
});
