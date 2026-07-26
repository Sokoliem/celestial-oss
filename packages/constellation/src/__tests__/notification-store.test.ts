import { describe, expect, it } from 'vitest';
import {
  createNotificationStore,
  type NotificationEnqueueInput,
  type NotificationEntry,
  type NotificationModel,
} from '../notification-store.js';

const bothNotification: NotificationEnqueueInput = {
  message: 'Build complete',
  detail: 'All checks passed.',
  level: 'success',
  delivery: 'both',
  dedupeKey: 'build:complete',
  actionIds: ['open-log'],
};

function enqueueOrThrow(
  store: ReturnType<typeof createNotificationStore>,
  model: NotificationModel,
  input: NotificationEnqueueInput,
): { readonly model: NotificationModel; readonly entry: NotificationEntry } {
  const result = store.enqueue(model, input);
  if (!result.ok) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
  return result.value;
}

function transitionOrThrow(result: ReturnType<ReturnType<typeof createNotificationStore>['tick']>): NotificationModel {
  if (!result.ok) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('; '));
  return result.value;
}

describe('createNotificationStore', () => {
  it('creates a frozen empty model with stable initial identity state', () => {
    const store = createNotificationStore();
    const model = store.init();

    expect(model).toEqual({
      entries: [],
      visibleToastIds: [],
      nextId: 1,
      hoveredToastId: null,
      pausedToast: null,
    });
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.entries)).toBe(true);
    expect(Object.isFrozen(model.visibleToastIds)).toBe(true);
  });

  it.each([
    [{ maxEntries: 0 }, 'maxEntries'],
    [{ maxEntries: Number.NaN }, 'maxEntries'],
    [{ maxEntries: 10_001 }, 'maxEntries'],
    [{ defaultDurationMs: Number.POSITIVE_INFINITY }, 'defaultDurationMs'],
    [{ defaultDurationMs: -1 }, 'defaultDurationMs'],
    [{ now: 42 as never }, 'now'],
  ])('rejects invalid factory configuration with a field-specific error: %o', (config, field) => {
    expect(() => createNotificationStore(config)).toThrow(field);
  });

  it('returns explicit enqueue diagnostics and leaves the source model untouched', () => {
    const store = createNotificationStore({ now: () => 10 });
    const model = store.init();
    const input = {
      message: '   ',
      level: 'fatal',
      delivery: 'desktop',
      durationMs: Number.NaN,
      dedupeKey: '',
      actionIds: ['retry', 'retry'],
    } as unknown as NotificationEnqueueInput;

    const result = store.enqueue(model, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-message',
      'invalid-level',
      'invalid-delivery',
      'invalid-duration',
      'invalid-dedupe-key',
      'duplicate-action-id',
    ]);
    expect(model).toEqual(store.init());

    const nonJsonScalars = store.enqueue(model, {
      message: 'Unsupported scalar values',
      level: 1n as never,
      delivery: 2n as never,
    });
    expect(nonJsonScalars).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'invalid-level', field: 'level', message: expect.stringContaining('1') },
        { code: 'invalid-delivery', field: 'delivery', message: expect.stringContaining('2') },
      ],
    });
  });

  it('rejects terminal controls and ill-formed UTF-16 while permitting line feeds and valid surrogate pairs', () => {
    const store = createNotificationStore({ now: () => 10 });
    const model = store.init();
    const invalidCases: readonly [NotificationEnqueueInput, string, string][] = [
      [{ ...bothNotification, message: 'Build\ncomplete' }, 'invalid-message', 'message'],
      [{ ...bothNotification, message: 'Build\u0085complete' }, 'invalid-message', 'message'],
      [{ ...bothNotification, detail: 'First\rSecond' }, 'invalid-message', 'detail'],
      [{ ...bothNotification, detail: 'First\tSecond' }, 'invalid-message', 'detail'],
      [{ ...bothNotification, dedupeKey: 'build\u0000complete' }, 'invalid-dedupe-key', 'dedupeKey'],
      [{ ...bothNotification, actionIds: ['open\nlog'] }, 'invalid-action-id', 'actionIds[0]'],
      [{ ...bothNotification, message: 'Build\uD800complete' }, 'invalid-message', 'message'],
      [{ ...bothNotification, detail: 'First\uDC00Second' }, 'invalid-message', 'detail'],
      [{ ...bothNotification, dedupeKey: 'build\uD800complete' }, 'invalid-dedupe-key', 'dedupeKey'],
      [{ ...bothNotification, actionIds: ['open\uDC00log'] }, 'invalid-action-id', 'actionIds[0]'],
    ];

    for (const [input, code, field] of invalidCases) {
      expect(store.enqueue(model, input)).toMatchObject({
        ok: false,
        diagnostics: [{ code, field }],
      });
    }

    const valid = enqueueOrThrow(store, model, { ...bothNotification, detail: 'First line 😀\nSecond line' });
    expect(valid.entry.detail).toBe('First line 😀\nSecond line');
  });

  it('snapshots a valid enqueue, applies toast defaults, and advances nextId exactly once', () => {
    const actionIds = ['open-log'];
    const input: NotificationEnqueueInput = { ...bothNotification, actionIds };
    const store = createNotificationStore({ now: () => 42, defaultDurationMs: 4_000 });
    const initial = store.init();

    const { model, entry } = enqueueOrThrow(store, initial, input);
    actionIds.push('mutated-after-enqueue');

    expect(entry).toEqual({
      id: 1,
      message: 'Build complete',
      detail: 'All checks passed.',
      level: 'success',
      delivery: 'both',
      durationMs: 4_000,
      createdAt: 42,
      updatedAt: 42,
      expiresAt: 4_042,
      read: false,
      occurrences: 1,
      dedupeKey: 'build:complete',
      actionIds: ['open-log'],
    });
    expect(model.entries).toEqual([entry]);
    expect(model.visibleToastIds).toEqual([1]);
    expect(model.nextId).toBe(2);
    expect(initial.entries).toEqual([]);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.actionIds)).toBe(true);
  });

  it('uses null duration for inbox delivery and rejects a duration that would be silently ignored', () => {
    const store = createNotificationStore({ now: () => 1 });
    const initial = store.init();
    const inbox = enqueueOrThrow(store, initial, {
      message: 'Release notes',
      level: 'info',
      delivery: 'inbox',
    });

    expect(inbox.entry.durationMs).toBeNull();
    expect(inbox.entry.expiresAt).toBeNull();
    expect(inbox.model.visibleToastIds).toEqual([]);

    const invalid = store.enqueue(inbox.model, {
      message: 'Release notes',
      level: 'info',
      delivery: 'inbox',
      durationMs: 500,
    });
    expect(invalid).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-duration', field: 'durationMs' }],
    });
  });

  it('coalesces by dedupeKey without consuming an ID and makes the occurrence unread and visible again', () => {
    let now = 10;
    const store = createNotificationStore({ now: () => now });
    const first = enqueueOrThrow(store, store.init(), bothNotification);
    const read = store.markRead(first.model, first.entry.id);
    const hidden = store.hideToast(read, first.entry.id);
    expect(hidden.entries[0]?.read).toBe(true);
    expect(hidden.visibleToastIds).toEqual([]);

    now = 20;
    const repeated = enqueueOrThrow(store, hidden, {
      ...bothNotification,
      message: 'Build complete again',
      detail: undefined,
      actionIds: ['open-log', 'open-artifact'],
    });

    expect(repeated.entry).toMatchObject({
      id: first.entry.id,
      message: 'Build complete again',
      createdAt: 10,
      updatedAt: 20,
      expiresAt: 3_020,
      occurrences: 2,
      read: false,
      actionIds: ['open-log', 'open-artifact'],
    });
    expect(repeated.entry).not.toHaveProperty('detail');
    expect(repeated.model.nextId).toBe(2);
    expect(repeated.model.entries).toHaveLength(1);
    expect(repeated.model.visibleToastIds).toEqual([first.entry.id]);
  });

  it('expires transient delivery while preserving inbox history for both delivery', () => {
    let now = 0;
    const store = createNotificationStore({ now: () => now, defaultDurationMs: 100 });
    const toast = enqueueOrThrow(store, store.init(), {
      message: 'Transient',
      level: 'info',
      delivery: 'toast',
    });
    const both = enqueueOrThrow(store, toast.model, {
      message: 'Durable',
      level: 'warning',
      delivery: 'both',
    });

    now = 100;
    const expired = transitionOrThrow(store.tick(both.model));

    expect(expired.entries.map((entry) => entry.message)).toEqual(['Durable']);
    expect(expired.visibleToastIds).toEqual([]);
    expect(expired.nextId).toBe(3);
  });

  it('hides a toast without deleting a both-delivery entry and dismisses inbox state completely', () => {
    const store = createNotificationStore({ now: () => 3 });
    const both = enqueueOrThrow(store, store.init(), bothNotification);

    const hidden = store.hideToast(both.model, both.entry.id);
    expect(hidden.entries).toEqual([both.entry]);
    expect(hidden.visibleToastIds).toEqual([]);

    const dismissed = store.dismiss(hidden, both.entry.id);
    expect(dismissed.entries).toEqual([]);
    expect(dismissed.visibleToastIds).toEqual([]);
    expect(dismissed.nextId).toBe(2);
  });

  it('hides the latest visible toast using visibility order', () => {
    const store = createNotificationStore({ now: () => 3 });
    const first = enqueueOrThrow(store, store.init(), { message: 'First', level: 'info', delivery: 'both' });
    const second = enqueueOrThrow(store, first.model, { message: 'Second', level: 'info', delivery: 'both' });

    const hidden = store.hideLatestToast(second.model);
    expect(hidden.visibleToastIds).toEqual([first.entry.id]);
    expect(hidden.entries).toHaveLength(2);
  });

  it('panic clears transient state but preserves inbox and both-delivery entries', () => {
    const store = createNotificationStore({ now: () => 7 });
    const toast = enqueueOrThrow(store, store.init(), { message: 'Toast', level: 'info', delivery: 'toast' });
    const inbox = enqueueOrThrow(store, toast.model, { message: 'Inbox', level: 'success', delivery: 'inbox' });
    const both = enqueueOrThrow(store, inbox.model, { message: 'Both', level: 'error', delivery: 'both' });
    const hovered = transitionOrThrow(store.hoverToast(both.model, both.entry.id));

    const cleared = store.panic(hovered);

    expect(cleared.entries.map((entry) => entry.message)).toEqual(['Inbox', 'Both']);
    expect(cleared.visibleToastIds).toEqual([]);
    expect(cleared.hoveredToastId).toBeNull();
    expect(cleared.pausedToast).toBeNull();
    expect(cleared.nextId).toBe(4);
  });

  it('pauses timed expiry without changing the content timestamp and extends only the deadline', () => {
    let now = 0;
    const store = createNotificationStore({ now: () => now, defaultDurationMs: 100 });
    const shown = enqueueOrThrow(store, store.init(), bothNotification);

    now = 90;
    const paused = transitionOrThrow(store.hoverToast(shown.model, shown.entry.id));
    expect(paused.hoveredToastId).toBe(shown.entry.id);
    expect(paused.pausedToast).toEqual({ id: shown.entry.id, startedAt: 90 });

    now = 150;
    const stillVisible = transitionOrThrow(store.tick(paused));
    expect(stillVisible.visibleToastIds).toEqual([shown.entry.id]);

    const resumed = transitionOrThrow(store.leaveToast(stillVisible, shown.entry.id));
    expect(resumed.entries[0]?.updatedAt).toBe(0);
    expect(resumed.entries[0]?.expiresAt).toBe(160);
    expect(resumed.hoveredToastId).toBeNull();
    expect(resumed.pausedToast).toBeNull();

    now = 159;
    expect(transitionOrThrow(store.tick(resumed)).visibleToastIds).toEqual([shown.entry.id]);
    now = 160;
    expect(transitionOrThrow(store.tick(resumed)).visibleToastIds).toEqual([]);
  });

  it('reports a clock regression while a toast is paused instead of silently skipping expiry', () => {
    let now = 0;
    const store = createNotificationStore({ now: () => now, defaultDurationMs: 100 });
    const shown = enqueueOrThrow(store, store.init(), bothNotification);
    now = 90;
    const paused = transitionOrThrow(store.hoverToast(shown.model, shown.entry.id));

    now = 89;
    expect(store.tick(paused)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-clock', field: 'now' }],
    });
    expect(paused.entries[0]).toMatchObject({ updatedAt: 0, expiresAt: 100 });
  });

  it('reports deadline overflow on enqueue and pause resume without mutating the source model', () => {
    let now = Number.MAX_SAFE_INTEGER - 5;
    const overflowingStore = createNotificationStore({ now: () => now, defaultDurationMs: 10 });
    const empty = overflowingStore.init();
    expect(overflowingStore.enqueue(empty, bothNotification)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-clock', field: 'now' }],
    });
    expect(empty.nextId).toBe(1);

    now = Number.MAX_SAFE_INTEGER - 10;
    const resumableStore = createNotificationStore({ now: () => now, defaultDurationMs: 5 });
    const shown = enqueueOrThrow(resumableStore, resumableStore.init(), bothNotification);
    now = Number.MAX_SAFE_INTEGER - 8;
    const paused = transitionOrThrow(resumableStore.hoverToast(shown.model, shown.entry.id));
    now = Number.MAX_SAFE_INTEGER;
    expect(resumableStore.leaveToast(paused, shown.entry.id)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-clock', field: 'now' }],
    });
    expect(paused.entries[0]).toMatchObject({
      updatedAt: Number.MAX_SAFE_INTEGER - 10,
      expiresAt: Number.MAX_SAFE_INTEGER - 5,
    });
  });

  it('reports invalid clock values without mutating the current model', () => {
    let now = 1;
    const store = createNotificationStore({ now: () => now });
    const shown = enqueueOrThrow(store, store.init(), bothNotification);
    now = Number.NaN;

    for (const result of [store.enqueue(shown.model, bothNotification), store.tick(shown.model), store.hoverToast(shown.model, shown.entry.id)]) {
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'invalid-clock', field: 'now' }] });
    }
    expect(shown.model.visibleToastIds).toEqual([shown.entry.id]);
    expect(shown.model.entries[0]?.occurrences).toBe(1);
  });

  it('contains hostile clock values and thrown objects inside invalid-clock diagnostics', () => {
    const hostile = {
      toJSON() {
        throw new Error('toJSON escaped');
      },
      toString() {
        throw new Error('toString escaped');
      },
    };
    const invalidValueStore = createNotificationStore({
      now: () => hostile as never,
    });
    expect(() => invalidValueStore.enqueue(invalidValueStore.init(), bothNotification)).not.toThrow();
    expect(invalidValueStore.enqueue(invalidValueStore.init(), bothNotification)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'invalid-clock',
          field: 'now',
          message: expect.stringContaining('<unprintable>'),
        },
      ],
    });

    const throwingStore = createNotificationStore({
      now: () => {
        throw hostile;
      },
    });
    expect(() => throwingStore.enqueue(throwingStore.init(), bothNotification)).not.toThrow();
    expect(throwingStore.enqueue(throwingStore.init(), bothNotification)).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'invalid-clock',
          field: 'now',
          message: expect.stringContaining('<unprintable>'),
        },
      ],
    });
  });

  it('retains 100 entries by default without recycling nextId', () => {
    const store = createNotificationStore({ now: () => 1 });
    let model = store.init();
    for (let index = 0; index < 101; index++) {
      model = enqueueOrThrow(store, model, {
        message: `Notification ${index}`,
        level: 'info',
        delivery: 'inbox',
      }).model;
    }

    expect(model.entries).toHaveLength(100);
    expect(model.entries[0]?.id).toBe(2);
    expect(model.entries.at(-1)?.id).toBe(101);
    expect(model.nextId).toBe(102);
  });

  it('validates and snapshots hydrated models with field-specific invariant failures', () => {
    const store = createNotificationStore();
    const actionIds = ['retry'];
    const entry: NotificationEntry = {
      id: 4,
      message: 'Retry failed',
      level: 'error',
      delivery: 'both',
      durationMs: 500,
      createdAt: 10,
      updatedAt: 10,
      expiresAt: 510,
      read: false,
      occurrences: 1,
      actionIds,
    };
    const hydrated = store.init({
      entries: [entry],
      visibleToastIds: [4],
      nextId: 5,
      hoveredToastId: 4,
      pausedToast: { id: 4, startedAt: 20 },
    });
    actionIds.push('mutated');

    expect(hydrated.entries[0]?.actionIds).toEqual(['retry']);
    expect(Object.isFrozen(hydrated.pausedToast)).toBe(true);

    expect(() =>
      store.init({
        entries: [{ ...entry, expiresAt: undefined as never }],
        visibleToastIds: [4],
        nextId: 5,
      }),
    ).toThrow('expiresAt');
    expect(() =>
      store.init({
        entries: [{ ...entry, expiresAt: null }],
        visibleToastIds: [4],
        nextId: 5,
      }),
    ).toThrow('expiresAt');
    expect(() =>
      store.init({
        entries: [{ ...entry, expiresAt: 509 }],
        visibleToastIds: [4],
        nextId: 5,
      }),
    ).toThrow('expiresAt');
    expect(() =>
      store.init({
        entries: [{ ...entry, delivery: 'inbox', durationMs: null, expiresAt: 510 }],
        visibleToastIds: [],
        nextId: 5,
      }),
    ).toThrow('expiresAt');
    expect(() =>
      store.init({
        entries: [{ ...entry, durationMs: null, expiresAt: 510 }],
        visibleToastIds: [4],
        nextId: 5,
      }),
    ).toThrow('expiresAt');
    expect(() =>
      store.init({
        entries: [{ ...entry, actionIds: ['retry', 'retry'] }],
        visibleToastIds: [4],
        nextId: 5,
      }),
    ).toThrow('entries[0].actionIds[1]');
    expect(() =>
      store.init({
        entries: [entry],
        visibleToastIds: [99],
        nextId: 5,
      }),
    ).toThrow('visibleToastIds[0]');
    expect(() =>
      store.init({
        entries: [entry],
        visibleToastIds: [4],
        nextId: 4,
      }),
    ).toThrow('nextId');
    expect(() =>
      store.init({
        entries: [entry],
        visibleToastIds: [4],
        nextId: 5,
        hoveredToastId: 4,
        pausedToast: null,
      }),
    ).toThrow('pausedToast');
    expect(() => store.init({ entries: null } as never)).toThrow('entries');
    expect(() => store.init({ visibleToastIds: null } as never)).toThrow('visibleToastIds');
    expect(() => store.init({ nextId: null } as never)).toThrow('nextId');
  });

  it('rejects ill-formed UTF-16 in every hydrated notification text field', () => {
    const store = createNotificationStore();
    const entry: NotificationEntry = {
      id: 1,
      message: 'Valid',
      detail: 'Valid detail',
      level: 'info',
      delivery: 'both',
      durationMs: 100,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 101,
      read: false,
      occurrences: 1,
      dedupeKey: 'valid',
      actionIds: ['retry'],
    };
    const invalidCases: readonly [Partial<NotificationEntry>, string][] = [
      [{ message: 'Invalid\uD800' }, 'entries[0].message'],
      [{ detail: 'Invalid\uDC00' }, 'entries[0].detail'],
      [{ dedupeKey: 'invalid\uD800' }, 'entries[0].dedupeKey'],
      [{ actionIds: ['invalid\uDC00'] }, 'entries[0].actionIds[0]'],
    ];

    for (const [patch, field] of invalidCases) {
      expect(() =>
        store.init({
          entries: [{ ...entry, ...patch }],
          visibleToastIds: [1],
          nextId: 2,
        }),
      ).toThrow(field);
    }
  });

  it('rejects duplicate action IDs before consuming an ID', () => {
    const store = createNotificationStore({ now: () => 1 });
    const model = store.init();
    const result = store.enqueue(model, {
      message: 'Choose',
      level: 'warning',
      delivery: 'both',
      actionIds: ['retry', 'retry'],
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'duplicate-action-id', field: 'actionIds[1]' }],
    });
    expect(model.nextId).toBe(1);
  });
});
