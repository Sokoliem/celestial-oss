import {
  Cmd,
  type ElementMouseEvent,
  getVNodeMeta,
  Sub,
  subKind,
  type VNode,
} from '@celestial/core/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import {
  assertMouseKeyboardParity,
  auditA11y,
  createTestApp,
  renderToLines,
} from '@celestial/test';
import { describe, expect, it } from 'vitest';
import {
  createNotificationCenter,
  type NotificationCenterActionReceipt,
  type NotificationCenterMsg,
  type NotificationCenterState,
} from '../notification-center.js';
import {
  createNotificationStore,
  type NotificationEnqueueInput,
  type NotificationModel,
  type NotificationStore,
} from '../notification-store.js';

const viewport = { cols: 44, rows: 12 } as const;

function enqueue(
  store: NotificationStore,
  model: NotificationModel,
  input: NotificationEnqueueInput,
): NotificationModel {
  const result = store.enqueue(model, input);
  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
  }
  return result.value.model;
}

function controller(store: NotificationStore, options: { initiallyFocused?: boolean; ownsToastEscape?: boolean } = {}) {
  return createNotificationCenter({
    id: 'test-notification-center',
    initiallyOpen: true,
    ...(options.initiallyFocused === undefined ? {} : { initiallyFocused: options.initiallyFocused }),
    store,
    ownsToastEscape: options.ownsToastEscape ?? true,
    formatTimestamp: (timestamp) => `T${String(timestamp)}`,
    resolveAction: (actionId) => ({
      label: actionId === 'retry' ? 'Retry the operation' : actionId === 'disabled' ? 'Unavailable action' : `Run ${actionId}`,
      disabled: actionId === 'disabled',
    }),
  });
}

function inbox(
  message: string,
  options: Partial<Omit<NotificationEnqueueInput, 'message' | 'level' | 'delivery'>> = {},
): NotificationEnqueueInput {
  return {
    message,
    level: 'info',
    delivery: 'inbox',
    ...options,
  };
}

function both(
  message: string,
  options: Partial<Omit<NotificationEnqueueInput, 'message' | 'level' | 'delivery'>> = {},
): NotificationEnqueueInput {
  return {
    message,
    level: 'success',
    delivery: 'both',
    ...options,
  };
}

function flattenSubs<M>(subscription: Sub<M>): ReturnType<typeof subKind<M>>[] {
  const kind = subKind(subscription);
  if (kind.kind !== 'batch') return [kind];
  return kind.subs.flatMap(flattenSubs);
}

function elementMouseMapper(
  center: ReturnType<typeof controller>,
  state: NotificationCenterState,
  model: NotificationModel,
) {
  const kind = flattenSubs(center.subscriptions(state, model)).find((candidate) => candidate.kind === 'elementMouse');
  if (!kind || kind.kind !== 'elementMouse') throw new Error('element mouse subscription is missing');
  return kind.toMsg;
}

function elementMouse(
  handlerTag: string,
  elementId: string,
  deltaY = 0,
): ElementMouseEvent {
  return {
    handlerTag,
    elementId,
    phase: 'target',
    targetId: elementId,
    currentTargetId: elementId,
    path: [elementId],
    type: deltaY === -1 ? 'scroll-up' : deltaY === 1 ? 'scroll-down' : 'release',
    deltaY: deltaY as ElementMouseEvent['deltaY'],
    x: 0,
    y: 0,
    button: deltaY === 0 ? 0 : 'none',
    ctrl: false,
    alt: false,
    shift: false,
    stopPropagation() {},
    isPropagationStopped: () => false,
  };
}

function findTestNode(node: VNode, testId: string): VNode | undefined {
  if (getVNodeMeta(node)?.testId === testId) return node;
  switch (node.kind) {
    case 'box':
    case 'column':
    case 'row':
      for (const child of node.children) {
        const found = findTestNode(child, testId);
        if (found) return found;
      }
      return undefined;
    case 'event':
    case 'focus':
    case 'hover':
    case 'scroll':
    case 'flex':
      return findTestNode(node.child, testId);
    default:
      return undefined;
  }
}

describe('createNotificationCenter', () => {
  it('projects inbox state without duplicating or rendering toast-only entries', () => {
    const store = createNotificationStore({ now: () => 1 });
    let model = store.init();
    model = enqueue(store, model, { message: 'Toast only', level: 'warning', delivery: 'toast' });
    model = enqueue(store, model, both('Durable and transient'));
    model = enqueue(store, model, inbox('Inbox only'));
    const center = controller(store);
    const state = center.init(model);

    expect(state.selectedId).toBe(model.entries[1]?.id);
    const rendered = renderToLines(center.view(state, model, viewport), { width: viewport.cols, height: viewport.rows }).join('\n');
    expect(rendered).toContain('Durable');
    expect(rendered).toContain('Inbox only');
    expect(rendered).not.toContain('Toast only');
    expect(model.entries).toHaveLength(3);
  });

  it('preserves selection by stable ID across insertion, dedupe reordering, and selected dismissal', () => {
    let now = 1;
    const store = createNotificationStore({ now: () => now });
    let model = enqueue(store, store.init(), inbox('First', { dedupeKey: 'first' }));
    model = enqueue(store, model, inbox('Second'));
    const center = controller(store);
    let state = center.init(model);
    const firstId = model.entries[0]!.id;
    state = center.update({ type: 'select', id: firstId }, state, model, viewport).state;

    model = enqueue(store, model, inbox('Third'));
    state = center.update({ type: 'noop' }, state, model, viewport).state;
    expect(state.selectedId).toBe(firstId);

    now = 2;
    model = enqueue(store, model, inbox('First, updated', { dedupeKey: 'first' }));
    state = center.update({ type: 'noop' }, state, model, viewport).state;
    expect(model.entries.at(-1)?.id).toBe(firstId);
    expect(state.selectedId).toBe(firstId);

    const dismissed = center.update({ type: 'dismiss', id: firstId }, state, model, viewport);
    expect(dismissed.store.entries.some((entry) => entry.id === firstId)).toBe(false);
    expect(dismissed.state.selectedId).toBe(dismissed.store.entries.at(-1)?.id);
  });

  it('uses the exact injected store policy for models larger than the default retention limit', () => {
    const store = createNotificationStore({ now: () => 1, maxEntries: 150 });
    let model = store.init();
    for (let index = 0; index < 120; index++) {
      model = enqueue(store, model, inbox(`Retained ${index}`));
    }
    const center = controller(store);
    const state = center.init(model);
    const dismissed = center.update({ type: 'dismiss', id: model.entries[0]!.id }, state, model, viewport);

    expect(dismissed.store.entries).toHaveLength(119);
    expect(dismissed.store.nextId).toBe(121);
  });

  it('keeps the action cursor and hover bound to action IDs when external state reorders actions', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(store, store.init(), inbox('Action order', { actionIds: ['retry', 'disabled'] }));
    const id = model.entries[0]!.id;
    const reordered = store.init({
      ...model,
      entries: [{ ...model.entries[0]!, actionIds: ['disabled', 'retry'] }],
    });
    const center = controller(store);
    const state: NotificationCenterState = {
      ...center.init(model),
      expandedId: id,
      actionCursor: { notificationId: id, actionId: 'retry' },
      hoveredTarget: `action:${id}:retry`,
    };
    const reconciled = center.update({ type: 'noop' }, state, reordered, viewport);
    const activated = center.update({ type: 'activate' }, reconciled.state, reordered, viewport);

    expect(reconciled.state.actionCursor).toEqual({ notificationId: id, actionId: 'retry' });
    expect(reconciled.state.hoveredTarget).toBe(`action:${id}:retry`);
    expect(activated.action).toEqual({ notificationId: id, actionId: 'retry' });
  });

  it('gives one Escape exactly one precedence transition', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(store, store.init(), both('Build failed', { actionIds: ['retry'] }));
    const id = model.entries[0]!.id;
    const center = controller(store);
    const original: NotificationCenterState = {
      ...center.init(model),
      open: true,
      selectedId: id,
      expandedId: id,
      actionCursor: { notificationId: id, actionId: 'retry' },
      focusWithin: true,
    };

    // Mutation-critical: removing or reordering the action-cursor guard makes
    // this first assertion collapse/close/hide more than the one owned layer.
    const cursorCleared = center.update({ type: 'escape' }, original, model, viewport);
    expect(cursorCleared.state).toEqual({ ...original, actionCursor: null });
    expect(cursorCleared.store).toBe(model);

    const collapsed = center.update({ type: 'escape' }, cursorCleared.state, cursorCleared.store, viewport);
    expect(collapsed.state).toEqual({ ...cursorCleared.state, expandedId: null });
    expect(collapsed.store).toBe(model);

    const closed = center.update({ type: 'escape' }, collapsed.state, collapsed.store, viewport);
    expect(closed.state).toEqual({
      ...collapsed.state,
      open: false,
      hoveredTarget: null,
      focusWithin: false,
    });
    expect(closed.store).toBe(model);

    const toastHidden = center.update({ type: 'escape' }, closed.state, closed.store, viewport);
    expect(toastHidden.state).toBe(closed.state);
    expect(toastHidden.store.visibleToastIds).toEqual([]);
    expect(toastHidden.store.entries).toHaveLength(1);
  });

  it('marks an expanded inbox entry read and returns only enabled action receipts', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(store, store.init(), both('Choose', { actionIds: ['retry', 'disabled'] }));
    const center = controller(store);
    const id = model.entries[0]!.id;
    const initial = center.init(model);

    const expanded = center.update({ type: 'activate-row', id }, initial, model, viewport);
    expect(expanded.state.expandedId).toBe(id);
    expect(expanded.store.entries[0]?.read).toBe(true);

    const cursor = center.update({ type: 'action-next' }, expanded.state, expanded.store, viewport);
    const activated = center.update({ type: 'activate' }, cursor.state, cursor.store, viewport);
    expect(activated.action).toEqual({ notificationId: id, actionId: 'retry' });
    expect(activated.store).toBe(cursor.store);

    const disabled = center.update(
      { type: 'activate-action', id, actionId: 'disabled' },
      activated.state,
      activated.store,
      viewport,
    );
    expect(disabled).not.toHaveProperty('action');
  });

  it('renders deterministic timestamps, occurrence badges, and real multiline details', () => {
    let now = 1;
    const store = createNotificationStore({ now: () => now });
    let model = enqueue(
      store,
      store.init(),
      inbox('Repeated event', { detail: 'First line\nSecond line', dedupeKey: 'repeat' }),
    );
    now = 2;
    model = enqueue(
      store,
      model,
      inbox('Repeated event', { detail: 'First line\nSecond line', dedupeKey: 'repeat' }),
    );
    const center = controller(store);
    const id = model.entries[0]!.id;
    const rendered = renderToLines(
      center.view({ ...center.init(model), expandedId: id }, model, viewport),
      { width: viewport.cols, height: viewport.rows },
    ).join('\n');

    expect(rendered).toContain('T2 [x2]');
    expect(rendered).toContain('First line');
    expect(rendered).toContain('Second line');
    expect(rendered).not.toContain('␊');
  });

  it('does not age the inbox timestamp when the shared toast projection is paused', () => {
    let now = 0;
    const store = createNotificationStore({ now: () => now, defaultDurationMs: 100 });
    const model = enqueue(store, store.init(), both('Shared timestamp'));
    const id = model.entries[0]!.id;
    now = 90;
    const paused = store.hoverToast(model, id);
    if (!paused.ok) throw new Error(paused.diagnostics[0]?.message);
    now = 150;
    const resumed = store.leaveToast(paused.value, id);
    if (!resumed.ok) throw new Error(resumed.diagnostics[0]?.message);

    const center = controller(store);
    const rendered = renderToLines(center.view(center.init(resumed.value), resumed.value, viewport), {
      width: viewport.cols,
      height: viewport.rows,
    }).join('\n');
    expect(resumed.value.entries[0]).toMatchObject({ updatedAt: 0, expiresAt: 160 });
    expect(rendered).toContain('T0');
    expect(rendered).not.toContain('T150');
  });

  it('measures expanded and wrapped VNodes for page movement and bounded cell-row scrolling', () => {
    const store = createNotificationStore({ now: () => 1 });
    let model = store.init();
    for (let index = 0; index < 8; index++) {
      model = enqueue(
        store,
        model,
        inbox(`Notification ${index} has a message long enough to wrap`, {
          detail: index === 0 ? 'A tall detail paragraph that occupies several terminal rows at this width.' : undefined,
          actionIds: index === 0 ? ['retry'] : undefined,
        }),
      );
    }
    const center = controller(store);
    const narrowViewport = { cols: 24, rows: 8 };
    let state = center.init(model);
    state = center.update({ type: 'toggle-expanded' }, state, model, narrowViewport).state;
    const paged = center.update({ type: 'page-down' }, state, model, narrowViewport);

    expect(paged.state.selectedId).not.toBe(state.selectedId);
    expect(paged.state.rowScrollOffset).toBeGreaterThan(0);

    const bottom = center.update({ type: 'scroll', delta: 100_000 }, paged.state, model, narrowViewport);
    const beyondBottom = center.update({ type: 'scroll', delta: 100_000 }, bottom.state, model, narrowViewport);
    expect(bottom.state.rowScrollOffset).toBeGreaterThan(paged.state.rowScrollOffset);
    expect(beyondBottom.state.rowScrollOffset).toBe(bottom.state.rowScrollOffset);
    const bottomLines = renderToLines(center.view(bottom.state, model, narrowViewport), {
      width: narrowViewport.cols,
      height: narrowViewport.rows,
    });
    expect(bottomLines).toHaveLength(narrowViewport.rows);
    expect(bottomLines.join('\n')).toContain('Notification 7');
  });

  it('reconciles the selected ID into view after external prepend, reorder, width, and expansion changes', () => {
    const store = createNotificationStore({ now: () => 1 });
    let model = store.init();
    for (let index = 0; index < 9; index++) {
      model = enqueue(store, model, inbox(`Prior ${index} with wrapping text for narrow layouts`));
    }
    model = enqueue(
      store,
      model,
      inbox('Stable target', {
        detail: 'Expanded target detail that becomes taller after an external state change and narrow reflow.',
      }),
    );
    const targetId = model.entries.at(-1)!.id;
    const center = controller(store);
    let state = center.update({ type: 'select-last' }, center.init(model), model, viewport).state;

    const appended = enqueue(store, model, inbox('Externally prepended'));
    const prependedEntry = appended.entries.at(-1)!;
    const prepended = store.init({
      entries: [prependedEntry, ...model.entries],
      visibleToastIds: [],
      nextId: appended.nextId,
    });
    state = center.update({ type: 'noop' }, state, prepended, viewport).state;
    expect(state.selectedId).toBe(targetId);

    const selected = prepended.entries.find((entry) => entry.id === targetId)!;
    const reordered = store.init({
      entries: [selected, ...prepended.entries.filter((entry) => entry.id !== targetId)],
      visibleToastIds: [],
      nextId: prepended.nextId,
    });
    state = center.update({ type: 'noop' }, state, reordered, viewport).state;
    expect(state.rowScrollOffset).toBe(0);

    const narrowViewport = { cols: 16, rows: 8 };
    const expanded = { ...state, expandedId: targetId };
    state = center.update({ type: 'noop' }, expanded, reordered, narrowViewport).state;
    const rendered = renderToLines(center.view(state, reordered, narrowViewport), {
      width: narrowViewport.cols,
      height: narrowViewport.rows,
    }).join('\n');
    expect(state.selectedId).toBe(targetId);
    expect(rendered).toContain('Stable');
  });

  it('rejects forged control-bearing store models instead of sanitizing them into plausible state', () => {
    const unsafeModel: NotificationModel = {
      entries: [{
        id: 1,
        message: 'Unsafe \u001b[31m red \u009b31m text and 👩🏽‍💻 graphemes',
        detail: 'Detail\u0007bell',
        level: 'error',
        delivery: 'inbox',
        durationMs: null,
        createdAt: 0,
        updatedAt: 0,
        expiresAt: null,
        read: false,
        occurrences: 1,
        actionIds: [],
      }],
      visibleToastIds: [],
      nextId: 2,
      hoveredToastId: null,
      pausedToast: null,
    };
    const center = controller(createNotificationStore());
    expect(() => center.init(unsafeModel)).toThrow('entries[0].message');
    expect(() => center.view(center.init(), unsafeModel, viewport)).toThrow('entries[0].message');
  });

  it.each([16, 24, 44])('stays within %i cells without splitting grapheme clusters', (width) => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(
      store,
      store.init(),
      inbox('Valid 👩🏽‍💻 graphemes and e\u0301 combining text', {
        detail: 'First line\nSecond 👨‍👩‍👧‍👦 line',
      }),
    );
    const center = controller(store);
    const state = {
      ...center.init(model),
      expandedId: model.entries[0]!.id,
    };
    const tree = center.view(state, model, { cols: width, rows: 12 });
    const lines = renderToLines(tree, {
      width,
      height: 12,
    });
    const rendered = lines.join('\n');

    expect(lines.every((line) => measureTextWidth(line) <= width)).toBe(true);
    expect(auditA11y(tree).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
    if (width === 44) {
      expect(rendered).toContain('👩🏽‍💻');
      expect(rendered).toContain('e\u0301');
      expect(rendered).toContain('👨‍👩‍👧‍👦');
    }
  });

  it('exposes clean region/heading/list/listitem/detail/button semantics', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(
      store,
      store.init(),
      inbox('Semantic notification', {
        detail: 'A useful explanation.',
        actionIds: ['retry', 'disabled'],
      }),
    );
    const center = controller(store);
    const id = model.entries[0]!.id;
    const state = { ...center.init(model), expandedId: id };
    const tree = center.view(state, model, viewport);
    const audit = auditA11y(tree);
    const app = createTestApp<NotificationCenterState, NotificationCenterMsg>({
      init: () => [state, Cmd.none()],
      update: (_msg, current) => [current, Cmd.none()],
      view: (current) => center.view(current, model, viewport),
      subscriptions: () => Sub.none(),
    }, { cols: viewport.cols, rows: viewport.rows });
    try {
      const snapshot = app.snapshot();
      expect(audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
      expect(snapshot.elements.some((element) => element.role === 'region' && element.a11y?.live === 'off')).toBe(true);
      expect(snapshot.elements.some((element) => element.role === 'heading' && element.a11y?.level === 2)).toBe(true);
      expect(snapshot.elements.some((element) => element.role === 'list')).toBe(true);
      expect(snapshot.elements.some((element) =>
        element.role === 'listitem'
        && element.a11y?.label?.includes('info, unread, 1 occurrence'),
      )).toBe(true);
      expect(snapshot.elements.some((element) => element.role === 'region')).toBe(true);
      expect(snapshot.elements.filter((element) => element.role === 'button').length).toBeGreaterThanOrEqual(4);
      expect(snapshot.actions.filter((action) => action.role === 'button').length).toBeGreaterThanOrEqual(3);
      const disabled = findTestNode(tree, `notification-action-${id}-disabled`);
      expect(disabled?.kind).toBe('event');
      if (disabled?.kind === 'event') expect(disabled.handlers.onClick).toBeUndefined();
    } finally {
      app.stop();
    }
  });

  it('routes visible controls and scopes wheel input to the center list', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(store, store.init(), inbox('Interactive', { actionIds: ['retry'] }));
    const center = controller(store);
    const id = model.entries[0]!.id;
    const state = { ...center.init(model), expandedId: id };
    const toMsg = elementMouseMapper(center, state, model);

    expect(toMsg(elementMouse('test-notification-center:close-click', 'test-notification-center:close'))).toEqual({ type: 'close' });
    expect(toMsg(elementMouse('test-notification-center:row-click', `test-notification-center:row:${id}`))).toEqual({
      type: 'activate-row',
      id,
    });
    expect(toMsg(elementMouse('test-notification-center:dismiss-click', `test-notification-center:dismiss:${id}`))).toEqual({
      type: 'dismiss',
      id,
    });
    expect(toMsg(elementMouse('test-notification-center:action-click', `test-notification-center:action:${id}:retry`))).toEqual({
      type: 'activate-action',
      id,
      actionId: 'retry',
    });
    expect(toMsg(elementMouse('test-notification-center:scroll', 'another:list', 1))).toEqual({ type: 'noop' });
    expect(toMsg(elementMouse('test-notification-center:scroll', 'test-notification-center:list', 1))).toEqual({
      type: 'scroll',
      delta: 1,
    });
    expect(toMsg(elementMouse('test-notification-center:scroll', 'test-notification-center:list', 3))).toEqual({
      type: 'scroll',
      delta: 3,
    });
  });

  it('focus-gates navigation keys while retaining the single Escape chain', () => {
    const store = createNotificationStore({ now: () => 1 });
    let model = enqueue(store, store.init(), inbox('Focusable first'));
    model = enqueue(store, model, inbox('Focusable last'));
    const center = controller(store);
    const unfocused = center.init(model);
    const unfocusedKeys = flattenSubs(center.subscriptions(unfocused, model))
      .filter((kind) => kind.kind === 'key')
      .map((kind) => kind.kind === 'key' ? kind.key : '');
    const focusedKeys = flattenSubs(center.subscriptions({ ...unfocused, focusWithin: true }, model))
      .filter((kind) => kind.kind === 'key')
      .map((kind) => kind.kind === 'key' ? kind.key : '');

    expect(unfocusedKeys).toEqual(['escape']);
    expect(focusedKeys).toEqual(expect.arrayContaining([
      'escape',
      'up',
      'down',
      'pageup',
      'pagedown',
      'home',
      'end',
      'enter',
      'space',
      'delete',
    ]));

    const last = center.update({ type: 'select-last' }, unfocused, model, viewport);
    const first = center.update({ type: 'select-first' }, last.state, model, viewport);
    expect(last.state.selectedId).toBe(model.entries.at(-1)?.id);
    expect(first.state.selectedId).toBe(model.entries[0]?.id);
  });

  it('does not subscribe to or mutate toast Escape when another surface owns it', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = enqueue(store, store.init(), both('Externally owned toast'));
    const center = controller(store, { ownsToastEscape: false });
    const closed = {
      ...center.init(model),
      open: false,
      expandedId: null,
      actionCursor: null,
      focusWithin: false,
    };
    const keys = flattenSubs(center.subscriptions(closed, model))
      .filter((kind) => kind.kind === 'key')
      .map((kind) => kind.kind === 'key' ? kind.key : '');
    const escaped = center.update({ type: 'escape' }, closed, model, viewport);

    expect(keys).toEqual([]);
    expect(escaped.state).toBe(closed);
    expect(escaped.store).toBe(model);
    expect(escaped.store.visibleToastIds).toHaveLength(1);
  });

  it('keeps row expansion reachable through both the real mouse and keyboard pipelines', () => {
    interface HarnessModel {
      readonly state: NotificationCenterState;
      readonly store: NotificationModel;
      readonly receipt?: NotificationCenterActionReceipt;
    }

    const buildApp = (expanded = false) => {
      const notificationStore = createNotificationStore({ now: () => 1 });
      const initialStore = enqueue(
        notificationStore,
        notificationStore.init(),
        inbox('Parity target', { actionIds: ['retry'] }),
      );
      const center = controller(notificationStore, { initiallyFocused: true });
      const initialState = center.init(initialStore);
      const parityState = expanded
        ? {
            ...initialState,
            expandedId: initialStore.entries[0]!.id,
            actionCursor: {
              notificationId: initialStore.entries[0]!.id,
              actionId: 'retry',
            },
          }
        : initialState;
      return createTestApp<HarnessModel, NotificationCenterMsg>(
        {
          init: () => [{ state: parityState, store: initialStore }, Cmd.none()],
          update: (msg, model) => {
            const result = center.update(msg, model.state, model.store, viewport);
            return [{
              state: result.state,
              store: result.store,
              ...(result.action ? { receipt: result.action } : {}),
            }, Cmd.none()];
          },
          view: (model) => center.view(model.state, model.store, viewport),
          subscriptions: (model) => center.subscriptions(model.state, model.store),
        },
        { cols: viewport.cols, rows: viewport.rows },
      );
    };

    assertMouseKeyboardParity(() => buildApp(), [
      {
        name: 'expand notification row',
        byMouse(app) {
          const lines = app.lastFrame().split('\n');
          const rowIndex = lines.findIndex((line) => line.includes('Parity target'));
          const colIndex = rowIndex < 0 ? -1 : lines[rowIndex]!.indexOf('Parity target');
          expect(rowIndex).toBeGreaterThanOrEqual(0);
          expect(colIndex).toBeGreaterThanOrEqual(0);
          app.click(colIndex, rowIndex);
        },
        byKey(app) {
          app.pressKey('enter');
        },
        predicate(model) {
          return model.state.expandedId === model.state.selectedId && model.store.entries[0]?.read === true;
        },
      },
      {
        name: 'dismiss notification',
        byMouse(app) {
          const lines = app.lastFrame().split('\n');
          const rowIndex = lines.findIndex((line) => line.includes('Parity target'));
          app.click(lines[rowIndex]!.lastIndexOf('[x]') + 1, rowIndex);
        },
        byKey(app) {
          app.pressKey('delete');
        },
        predicate(model) {
          return model.store.entries.length === 0;
        },
      },
      {
        name: 'close notification center',
        byMouse(app) {
          const lines = app.lastFrame().split('\n');
          const closeRow = lines.findIndex((line) => line.includes('[x]'));
          app.click(lines[closeRow]!.indexOf('[x]') + 1, closeRow);
        },
        byKey(app) {
          app.pressKey('escape');
        },
        predicate(model) {
          return model.state.open === false;
        },
      },
    ]);

    assertMouseKeyboardParity(() => buildApp(true), [{
      name: 'activate notification action',
      byMouse(app) {
        const lines = app.lastFrame().split('\n');
        const actionRow = lines.findIndex((line) => line.includes('Retry the operation'));
        app.click(lines[actionRow]!.indexOf('Retry the operation'), actionRow);
      },
      byKey(app) {
        app.pressKey('enter');
      },
      predicate(model) {
        return model.receipt?.actionId === 'retry';
      },
    }]);
  });

  it('rejects invalid dimensions and missing action resolutions observably', () => {
    const store = createNotificationStore({ now: () => 1 });
    const required = {
      store,
      ownsToastEscape: true,
      formatTimestamp: (timestamp: number) => String(timestamp),
    } as const;
    expect(() =>
      createNotificationCenter({
        ...required,
        width: Number.NaN,
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('width');
    expect(() =>
      createNotificationCenter({
        ...required,
        maxHeight: 0,
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('maxHeight');
    expect(() =>
      createNotificationCenter({
        ...required,
        title: 'Bad\nTitle',
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('title');
    expect(() =>
      createNotificationCenter({
        ...required,
        title: null as never,
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('title');
    expect(() =>
      createNotificationCenter({
        ...required,
        initiallyOpen: 'yes' as never,
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('initiallyOpen');
    expect(() =>
      createNotificationCenter({
        ...required,
        store: { init: store.init, dismiss: store.dismiss } as never,
        resolveAction: (id) => ({ label: id }),
      }),
    ).toThrow('exact NotificationStore');

    const model = enqueue(store, store.init(), inbox('Broken action', { actionIds: ['missing'] }));
    const center = createNotificationCenter({
      ...required,
      initiallyOpen: true,
      resolveAction: () => undefined as never,
    });
    const id = model.entries[0]!.id;
    expect(() => center.view({ ...center.init(model), expandedId: id }, model, viewport)).toThrow('did not resolve');
    expect(() => center.update({ type: 'noop' }, center.init(model), model, { cols: Number.NaN, rows: 12 })).toThrow('cols');
    expect(() => center.update({ type: 'noop' }, center.init(model), model, null as never)).toThrow('viewport');
    expect(() => center.update({ type: 'scroll', delta: Number.POSITIVE_INFINITY }, center.init(model), model, viewport)).toThrow('delta');
    expect(() => center.update({ type: 'select', id: Number.NaN }, center.init(model), model, viewport)).toThrow('id');
    expect(() => center.update({ type: 'unknown' } as never, center.init(model), model, viewport)).toThrow('Unknown');
    expect(() =>
      center.update(
        { type: 'noop' },
        { ...center.init(model), rowScrollOffset: Number.NaN },
        model,
        viewport,
      ),
    ).toThrow('rowScrollOffset');

    const invalidLabel = createNotificationCenter({
      ...required,
      initiallyOpen: true,
      resolveAction: () => ({ label: 'Bad\u0007label' }),
    });
    expect(() => invalidLabel.view({ ...invalidLabel.init(model), expandedId: id }, model, viewport)).toThrow('controls');

    const invalidDisabled = createNotificationCenter({
      ...required,
      initiallyOpen: true,
      resolveAction: () => ({ label: 'Retry', disabled: 'no' as never }),
    });
    expect(() => invalidDisabled.view({ ...invalidDisabled.init(model), expandedId: id }, model, viewport)).toThrow('disabled');
  });
});
