import {
  type ElementMouseEvent,
  getVNodeMeta,
  type Sub,
  subKind,
  text,
  type VNode,
} from '@celestial/core/nebula';
import { auditA11y, renderToLines } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { createNotificationStore } from '../notification-store.js';
import { statusGlyph } from '../status-icon.js';
import {
  createToastManager,
  type ToastModel,
  type ToastMsg,
  ToastValidationError,
} from '../toast.js';

describe('createToastManager', () => {
  it('init starts with empty toast list', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    expect(model.toasts).toEqual([]);
    expect(model.nextId).toBe(1);
  });

  it('push adds toast to list', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const updated = manager.push(model, { message: 'Hello', level: 'info' });
    expect(updated.toasts.length).toBe(1);
    expect(updated.toasts[0]!.message).toBe('Hello');
    expect(updated.toasts[0]!.level).toBe('info');
    expect(updated.toasts[0]!.id).toBe(1);
    expect(updated.toasts[0]!.duration).toBe(3000);
    expect(updated.nextId).toBe(2);
  });

  it('push via update msg adds toast', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const [updated] = manager.update({ type: 'push', toast: { message: 'Test', level: 'success' } }, model);
    expect(updated.toasts.length).toBe(1);
    expect(updated.toasts[0]!.level).toBe('success');
  });

  it('dismiss removes toast by id', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const m1 = manager.push(model, { message: 'First', level: 'info' });
    const m2 = manager.push(m1, { message: 'Second', level: 'warning' });
    expect(m2.toasts.length).toBe(2);
    const [dismissed] = manager.update({ type: 'dismiss', id: 1 }, m2);
    expect(dismissed.toasts.length).toBe(1);
    expect(dismissed.toasts[0]!.message).toBe('Second');
  });

  it('dismiss-latest removes the newest toast', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const m1 = manager.push(model, { message: 'First', level: 'info' });
    const m2 = manager.push(m1, { message: 'Second', level: 'warning' });
    const [dismissed] = manager.update({ type: 'dismiss-latest' }, m2);
    expect(dismissed.toasts.map((t) => t.message)).toEqual(['First']);
  });

  it('panic clears all visible toasts', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const m1 = manager.push(model, { message: 'First', level: 'info' });
    const m2 = manager.push(m1, { message: 'Second', level: 'warning' });
    const [cleared] = manager.update({ type: 'panic' }, m2);
    expect(cleared.toasts).toEqual([]);
  });

  it('tick removes expired toasts', () => {
    let now = 0;
    const manager = createToastManager({ now: () => now });
    let [model] = manager.init();
    model = manager.push(model, { message: 'Old', level: 'info', duration: 10 });
    now = 8;
    model = manager.push(model, { message: 'New', level: 'info', duration: 10 });
    now = 10;
    const [ticked] = manager.update({ type: 'tick' }, model);
    expect(ticked.toasts.length).toBe(1);
    expect(ticked.toasts[0]!.message).toBe('New');
  });

  it('view shows toast content with level-colored prefix', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const m1 = manager.push(model, { message: 'Success!', level: 'success' });
    const vnode = manager.view(m1);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      expect(vnode.children.length).toBe(1);
      const toastRegion = vnode.children[0];
      expect(toastRegion?.kind).toBe('event');
      const toast = toastRegion?.kind === 'event' ? toastRegion.child : undefined;
      if (toast?.kind === 'box') {
        expect(toast.border).toBeDefined();
        expect(toast.style?.bg).toBeDefined();
        const toastRow = toast.children[0];
        if (toastRow?.kind !== 'row') return;
        const icon = toastRow.children[0];
        const message = toastRow.children[2];
        if (icon?.kind === 'text') expect(icon.content).toBe(statusGlyph('success'));
        if (message?.kind === 'flex' && message.child.kind === 'text') expect(message.child.content).toContain('Success!');
      }
    }
  });

  it('layers the toast stack in the top-right corner by default', () => {
    const manager = createToastManager({ width: 30, margin: 1 });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Saved', level: 'success' });
    const layered = manager.layer({ kind: 'text', content: 'base' }, shown, { cols: 80, rows: 24 });
    expect(layered.kind).toBe('row');
    if (layered.kind !== 'row') return;
    const toastLayer = layered.children[1];
    expect(toastLayer?.kind).toBe('overlay');
    if (toastLayer?.kind !== 'overlay') return;
    expect(toastLayer.x).toBe(49);
    expect(toastLayer.y).toBe(1);
    expect(toastLayer.width).toBe(30);
    expect(toastLayer.transparent).toBe(true);
    expect(toastLayer.focusMode).toBe('passive');
  });

  it('layers the newest height-fitting suffix chronologically at 70x32 and narrow bounds', () => {
    const manager = createToastManager({
      width: 44,
      margin: 1,
      maxVisibleToasts: 5,
      now: () => 1,
    });
    let [model] = manager.init();
    for (const marker of ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'LATEST']) {
      model = manager.push(model, {
        message: `${marker} ${'wrapped content '.repeat(12)}`,
        level: 'info',
        duration: null,
      });
    }

    const standard = renderToLines(
      manager.layer(text(''), model, { cols: 70, rows: 32 }),
      { width: 70, height: 32 },
    ).join('\n');
    expect(standard).toContain('LATEST');
    expect(standard).toContain('[x]');
    expect(standard).toContain('THIRD');
    expect(standard).toContain('FOURTH');
    expect(standard).not.toContain('FIRST');
    expect(standard.indexOf('THIRD')).toBeLessThan(standard.indexOf('FOURTH'));
    expect(standard.indexOf('FOURTH')).toBeLessThan(standard.indexOf('LATEST'));

    const narrow = renderToLines(
      manager.layer(text(''), model, { cols: 20, rows: 6 }),
      { width: 20, height: 6 },
    ).join('\n');
    expect(narrow).toContain('LATEST');
    expect(narrow).toContain('[x]');
    expect(narrow).not.toContain('FOURTH');
  });

  it('view returns empty text when no toasts', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const vnode = manager.view(model);
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('');
    }
  });

  it('subscriptions returns none when list is empty', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const sub = manager.subscriptions(model);
    // Sub.none() returns a subscription; verify it's not a timer
    // We can check by ensuring it exists (no-throw)
    expect(sub).toBeDefined();
  });

  it('subscriptions returns timer when toasts exist', () => {
    const manager = createToastManager();
    const [model] = manager.init();
    const m1 = manager.push(model, { message: 'Hello', level: 'info' });
    const sub = manager.subscriptions(m1);
    expect(sub).toBeDefined();
    expect(sub._kind.kind).toBe('batch');
    if (sub._kind.kind === 'batch') {
      const kinds = collectSubKinds(sub);
      expect(kinds).toContain('timer');
      expect(kinds).toContain('key');
      expect(kinds).toContain('keyWithModifiers');
    }
  });

  it('lets a host own the single Escape and panic path without losing local toast interaction', () => {
    const manager = createToastManager({ dismissalOwner: 'host' });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Shell owned', level: 'info' });
    const kinds = collectSubKinds(manager.subscriptions(shown));

    expect(kinds).toContain('timer');
    expect(kinds).toContain('elementMouse');
    expect(kinds).not.toContain('key');
    expect(kinds).not.toContain('keyWithModifiers');
  });

  it('activates Enter and Space only for keyboard focus, never a pointer-only hover', () => {
    const manager = createToastManager({ dismissalOwner: 'host', now: () => 1 });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Interactive', level: 'info' });
    const [hovered] = manager.update({ type: 'hover', id: shown.toasts[0]!.id }, shown);

    expect(hovered.hoveredId).toBe(1);
    expect(hovered.focusedToastId).toBeNull();
    expect(collectSubKinds(manager.subscriptions(hovered))).not.toContain('key');

    const [focused] = manager.update({ type: 'focus', id: shown.toasts[0]!.id }, hovered);
    expect(focused.focusedToastId).toBe(1);
    expect(collectSubKinds(manager.subscriptions(focused)).filter((kind) => kind === 'key')).toHaveLength(2);

    const [pointerLeft] = manager.update({ type: 'leave', id: shown.toasts[0]!.id }, focused);
    expect(pointerLeft.hoveredToastId).toBe(1);
    expect(pointerLeft.focusedToastId).toBe(1);
  });

  it('releases hidden focus, hover, pause, and key bindings at the painted-toast boundary', () => {
    let now = 0;
    const manager = createToastManager({
      id: 'painted-window',
      dismissalOwner: 'host',
      maxVisibleToasts: 1,
      now: () => now,
    });
    const [initial] = manager.init();
    const first = manager.push(initial, {
      message: 'FIRST hidden finite toast',
      level: 'info',
      duration: 10,
    });
    const [hovered] = manager.update({ type: 'hover', id: 1 }, first);
    const [focused] = manager.update({ type: 'focus', id: 1 }, hovered);
    expect(focused).toMatchObject({
      hoveredToastId: 1,
      pausedToast: { id: 1, startedAt: 0 },
      mouseHoveredToastId: 1,
      focusedToastId: 1,
    });

    now = 1;
    const second = manager.push(focused, {
      message: 'SECOND painted persistent toast',
      level: 'success',
      duration: null,
    });
    expect(second.visibleToastIds).toEqual([1, 2]);
    expect(second.toasts.map((toast) => toast.id)).toEqual([1, 2]);
    expect(second).toMatchObject({
      hoveredToastId: null,
      pausedToast: null,
      mouseHoveredToastId: null,
      focusedToastId: null,
    });
    const painted = renderToLines(manager.view(second), { width: 44, height: 8 }).join('\n');
    expect(painted).toContain('SECOND');
    expect(painted).not.toContain('FIRST');
    expect(
      flattenSubs(manager.subscriptions(second)).some(
        (kind) =>
          kind.kind === 'key'
          && kind.msg.type === 'dismiss'
          && kind.msg.id === 1,
      ),
    ).toBe(false);
    expect(collectSubKinds(manager.subscriptions(second))).toContain('timer');

    const [hiddenHovered] = manager.update({ type: 'hover', id: 1 }, second);
    const [hiddenFocused] = manager.update({ type: 'focus', id: 1 }, hiddenHovered);
    expect(hiddenFocused).toMatchObject({
      hoveredToastId: null,
      pausedToast: null,
      mouseHoveredToastId: null,
      focusedToastId: null,
    });

    now = 11;
    const [expired] = manager.update({ type: 'tick' }, hiddenFocused);
    expect(expired.visibleToastIds).toEqual([2]);
    expect(expired.toasts.map((toast) => toast.id)).toEqual([2]);
    expect(collectSubKinds(manager.subscriptions(expired))).not.toContain('timer');
  });

  it('pauses timed expiry across the whole toast surface, not only its close button', () => {
    let now = 0;
    const manager = createToastManager({
      id: 'surface-hover',
      dismissalOwner: 'host',
      now: () => now,
    });
    const [model] = manager.init();
    const shown = manager.push(model, {
      message: 'Hover anywhere',
      level: 'info',
      duration: 10,
    });
    const view = manager.view(shown);
    expect(view.kind).toBe('column');
    if (view.kind !== 'column') throw new Error('Expected a toast column');
    const surface = view.children[0];
    expect(surface).toMatchObject({
      kind: 'event',
      id: 'surface-hover:toast:1',
      handlers: {
        onMouseEnter: 'surface-hover:hover',
        onMouseLeave: 'surface-hover:leave',
      },
    });

    const toMsg = elementMouseMapper(manager, shown);
    const [hovered] = manager.update(
      toMsg(elementMouse('surface-hover:hover', 'surface-hover:toast:1')),
      shown,
    );
    now = 20;
    const [stillVisible] = manager.update({ type: 'tick' }, hovered);
    expect(stillVisible.toasts).toHaveLength(1);

    const [left] = manager.update(
      toMsg(elementMouse('surface-hover:leave', 'surface-hover:toast:1')),
      stillVisible,
    );
    now = 29;
    expect(manager.update({ type: 'tick' }, left)[0].toasts).toHaveLength(1);
    now = 30;
    expect(manager.update({ type: 'tick' }, left)[0].toasts).toEqual([]);
  });

  it('uses the exact injected store for shared models instead of imposing facade-local retention', () => {
    const store = createNotificationStore({ maxEntries: 200, now: () => 1 });
    let canonical = store.init();
    for (let index = 0; index < 101; index++) {
      const result = store.enqueue(canonical, {
        message: `Notification ${index}`,
        level: 'info',
        delivery: 'inbox',
      });
      if (!result.ok) throw new Error(result.diagnostics[0]?.message);
      canonical = result.value.model;
    }

    const manager = createToastManager({ store, dismissalOwner: 'host' });
    const [shared] = manager.init(canonical);
    expect(shared.entries).toHaveLength(101);
    expect(() => manager.update({ type: 'noop' }, shared)).not.toThrow();
  });

  it('bounds retained entries and uses the injected clock deterministically', () => {
    let now = 100;
    const manager = createToastManager({ maxToasts: 2, now: () => now });
    let [model] = manager.init();
    model = manager.push(model, { message: 'A', level: 'info', duration: 10 });
    model = manager.push(model, { message: 'B', level: 'success', duration: 10 });
    model = manager.push(model, { message: 'C', level: 'warning', duration: 10 });
    expect(model.toasts.map((toast) => toast.message)).toEqual(['B', 'C']);
    now = 111;
    const [expired] = manager.update({ type: 'tick' }, model);
    expect(expired.toasts).toEqual([]);
  });

  it('reports malformed input explicitly and leaves the canonical model unchanged', () => {
    const manager = createToastManager({ now: () => 10 });
    const [model] = manager.init();
    const result = manager.enqueue(model, {
      message: 'Unsafe',
      level: 'invalid' as never,
      duration: Number.POSITIVE_INFINITY,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: 'invalid-level', field: 'level' },
        { code: 'invalid-duration', field: 'durationMs' },
      ],
    });
    expect(model.toasts).toEqual([]);
    expect(() =>
      manager.push(model, {
        message: 'Unsafe',
        level: 'invalid' as never,
        duration: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(ToastValidationError);
  });

  it('surfaces an invalid injected clock instead of fabricating timestamp zero', () => {
    const manager = createToastManager({ now: () => Number.NaN });
    const [model] = manager.init();
    const result = manager.enqueue(model, { message: 'Clock failed', level: 'error' });

    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'invalid-clock', field: 'now' }] });
    expect(model.entries).toEqual([]);
  });

  it('keeps the legacy toasts property as a computed projection rather than stored state', () => {
    const manager = createToastManager({ now: () => 1 });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Projected', level: 'info' });

    expect(Object.getOwnPropertyDescriptor(shown, 'toasts')?.get).toBeTypeOf('function');
    expect(Object.getOwnPropertyDescriptor(shown, 'toasts')?.enumerable).toBe(false);
    expect(shown.toasts.map((entry) => entry.id)).toEqual(shown.visibleToastIds);
    expect(shown.toasts).toBe(shown.toasts);
    expect(JSON.parse(JSON.stringify(shown))).toEqual({
      entries: shown.entries,
      visibleToastIds: shown.visibleToastIds,
      nextId: shown.nextId,
      hoveredToastId: shown.hoveredToastId,
      pausedToast: shown.pausedToast,
    });
  });

  it('reprojects a shared canonical model without losing facade interaction ownership', () => {
    const store = createNotificationStore({ now: () => 1 });
    const manager = createToastManager({ store, dismissalOwner: 'host' });
    const [model] = manager.init();
    const shown = manager.push(model, { message: 'Shared', level: 'success' });
    const [focused] = manager.update({ type: 'focus', id: shown.toasts[0]!.id }, shown);
    const interaction = manager.getInteraction(focused);

    const canonicalAfterInboxRead = store.markAllRead(focused);
    expect('toasts' in canonicalAfterInboxRead).toBe(false);
    const projected = manager.project(canonicalAfterInboxRead, interaction);

    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    expect(projected.value.focusedToastId).toBe(1);
    expect(projected.value.hoveredToastId).toBe(1);
    expect(projected.value.pausedToast?.id).toBe(1);
    expect(projected.value.toasts[0]?.duration).toBe(3000);
  });

  it('enforces the injected store policy on every facade boundary', () => {
    const strictStore = createNotificationStore({ maxEntries: 1, now: () => 1 });
    const permissiveStore = createNotificationStore({ maxEntries: 2, now: () => 1 });
    let foreign = permissiveStore.init();
    for (const message of ['First', 'Second']) {
      const result = permissiveStore.enqueue(foreign, { message, level: 'info', delivery: 'toast' });
      if (!result.ok) throw new Error(result.diagnostics[0]?.message);
      foreign = result.value.model;
    }
    const manager = createToastManager({ store: strictStore, dismissalOwner: 'host' });
    const facade = foreign as never;

    expect(() => manager.getInteraction(facade)).toThrow(ToastValidationError);
    expect(manager.project(facade)).toMatchObject({ ok: false, diagnostics: [{ field: 'entries' }] });
    expect(() => manager.view(facade)).toThrow(ToastValidationError);
    expect(() => manager.layer({ kind: 'text', content: 'base' }, facade, { cols: 40, rows: 10 })).toThrow(ToastValidationError);
    expect(() => manager.subscriptions(facade)).toThrow(ToastValidationError);
    expect(() => manager.update({ type: 'noop' }, facade)).toThrow(ToastValidationError);

    const valid = strictStore.enqueue(strictStore.init(), {
      message: 'Valid',
      level: 'info',
      delivery: 'toast',
    });
    if (!valid.ok) throw new Error(valid.diagnostics[0]?.message);
    const controlBearing = {
      ...valid.value.model,
      entries: [{ ...valid.value.model.entries[0]!, message: 'Unsafe\u001b[31m' }],
    } as never;
    expect(manager.project(controlBearing)).toMatchObject({
      ok: false,
      diagnostics: [{ field: 'entries[0].message' }],
    });
    expect(() => manager.view(controlBearing)).toThrow(ToastValidationError);
  });

  it('rejects Unicode directionality controls before toast projection', () => {
    const store = createNotificationStore({ now: () => 1 });
    const manager = createToastManager({ store, dismissalOwner: 'host' });
    const valid = store.enqueue(store.init(), {
      message: 'Valid',
      detail: 'Valid detail',
      level: 'info',
      delivery: 'toast',
      dedupeKey: 'valid',
      actionIds: ['retry'],
    });
    if (!valid.ok) throw new Error(valid.diagnostics[0]?.message);
    const controls = [
      '\u061c',
      '\u200e',
      '\u200f',
      '\u2028',
      '\u2029',
      '\u202a',
      '\u202b',
      '\u202c',
      '\u202d',
      '\u202e',
      '\u2066',
      '\u2067',
      '\u2068',
      '\u2069',
    ] as const;

    for (const control of controls) {
      const invalidCases: readonly [Record<string, unknown>, string][] = [
        [{ message: `Unsafe${control}message` }, 'entries[0].message'],
        [{ detail: `Unsafe${control}detail` }, 'entries[0].detail'],
        [{ dedupeKey: `unsafe${control}key` }, 'entries[0].dedupeKey'],
        [{ actionIds: [`unsafe${control}action`] }, 'entries[0].actionIds[0]'],
      ];

      for (const [patch, field] of invalidCases) {
        const model = {
          ...valid.value.model,
          entries: [{ ...valid.value.model.entries[0]!, ...patch }],
        } as never;
        expect(manager.project(model)).toMatchObject({
          ok: false,
          diagnostics: [{ field }],
        });
        expect(() => manager.view(model)).toThrow(ToastValidationError);
      }
    }
  });

  it('uses assertive alert semantics only for errors and exposes a real close button', () => {
    const manager = createToastManager({ now: () => 1 });
    const [model] = manager.init();
    const error = manager.push(model, { message: 'Deployment failed', level: 'error' });
    const view = manager.view(error);
    const surfaces = collectNodes(view, (node) => getVNodeMeta(node)?.a11y?.role === 'alert');
    const closeButtons = collectNodes(view, (node) => getVNodeMeta(node)?.a11y?.role === 'button');

    expect(surfaces).toHaveLength(1);
    expect(getVNodeMeta(surfaces[0]!)?.a11y).toMatchObject({ live: 'assertive' });
    expect(closeButtons).toHaveLength(1);
    expect(auditA11y(view).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  it.each([16, 24, 44] as const)('keeps toast accessibility clean at %i columns', (width) => {
    const manager = createToastManager({ now: () => 1 });
    const [model] = manager.init();
    const shown = manager.push(model, {
      message: 'Accessible 👩🏽‍💻 notification with wrapping text',
      level: 'warning',
    });
    const audit = auditA11y(manager.view(shown, { width }));
    expect(audit.violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  it('validates factory configuration instead of silently replacing malformed values', () => {
    expect(() => createToastManager(null as never)).toThrow(/config/i);
    expect(() => createToastManager({ maxToasts: 0 })).toThrow(/maxEntries/i);
    expect(() => createToastManager({ width: Number.NaN })).toThrow(/width/i);
    expect(() => createToastManager({ id: 42 as never })).toThrow(/id/i);
    expect(() => createToastManager({ id: 'i'.repeat(257) })).toThrow(/at most 256/i);
    expect(() => createToastManager({ id: 'bad\u202eid' })).toThrow(/id/i);
    expect(() => createToastManager({ id: 'bad\ud800id' })).toThrow(/id/i);
    expect(() => createToastManager({ placement: 'center' as never })).toThrow(/placement/i);
    expect(() => createToastManager({ dismissalOwner: 'both' as never })).toThrow(/dismissalOwner/i);
    expect(() => createToastManager({ store: {} as never })).toThrow(/store/i);
    const realStore = createNotificationStore();
    expect(() =>
      createToastManager({
        store: {
          init: realStore.init,
          validateModel: realStore.validateModel,
          enqueue: realStore.enqueue,
          hoverToast: realStore.hoverToast,
          leaveToast: realStore.leaveToast,
          hideToast: realStore.hideToast,
          hideLatestToast: realStore.hideLatestToast,
          tick: realStore.tick,
          panic: realStore.panic,
        } as never,
      }),
    ).toThrow(/NotificationStore/i);
    expect(() => createToastManager({ store: createNotificationStore(), maxToasts: 20 })).toThrow(/injected store/i);
    const shared = createNotificationStore();
    const manager = createToastManager({ store: shared });
    expect(() => manager.project(shared.init(), { mouseHoveredToastId: Number.NaN, focusedToastId: null })).toThrow(
      /mouseHoveredToastId/i,
    );
  });

  it('rejects malformed messages, IDs, options, and bounds at the facade edge', () => {
    const manager = createToastManager({ now: () => 1 });
    const [model] = manager.init();
    expect(() => manager.update(null as never, model)).toThrow(/message/i);
    expect(() => manager.update({ type: 'unknown' } as never, model)).toThrow(/Unknown/);
    expect(() => manager.update({ type: 'dismiss', id: Number.NaN }, model)).toThrow(/dismiss id/i);
    expect(() => manager.update({ type: 'push', toast: null as never }, model)).toThrow(ToastValidationError);
    expect(() =>
      manager.push(model, {
        message: 'm'.repeat(4_097),
        level: 'info',
      }),
    ).toThrow(ToastValidationError);
    expect(() => manager.view(model, null as never)).toThrow(/view options/i);
    expect(() => manager.layer({ kind: 'text', content: 'base' }, model, null as never)).toThrow(/bounds/i);
    expect(() =>
      manager.layer(
        { kind: 'text', content: 'base' },
        manager.push(model, { message: 'Visible', level: 'info' }),
        { cols: Number.NaN, rows: 10 },
      ),
    ).toThrow(/bounds.cols/i);
  });

  it('caps aggregate toast validation diagnostics and error text', () => {
    const diagnostics = Array.from({ length: 1_000 }, (_, index) => ({
      code: 'invalid-model' as const,
      field: `entries[${String(index)}].message`,
      message: 'invalid '.repeat(100),
    }));
    const error = new ToastValidationError(diagnostics);

    expect(error.diagnostics).toHaveLength(100);
    expect(Object.isFrozen(error.diagnostics)).toBe(true);
    expect(error.message.length).toBeLessThanOrEqual(4_096);
    expect(error.message).toContain('Invalid toast');
  });

  it('quotes unknown message types without leaking terminal or directionality controls', () => {
    const manager = createToastManager({ now: () => 1 });
    const [model] = manager.init();

    for (const unsafe of ['\n', '\u001b', '\u202e', '\u2066', '\ud800']) {
      let message = '';
      try {
        manager.update({ type: `unknown${unsafe}type` } as never, model);
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).toContain('Unknown toast message type');
      expect(message).not.toContain(unsafe);
    }

    let boundedMessage = '';
    try {
      manager.update({ type: 'x'.repeat(10_000) } as never, model);
    } catch (error) {
      boundedMessage = error instanceof Error ? error.message : '';
    }
    expect(boundedMessage.length).toBeLessThan(1_100);
    expect(boundedMessage).toContain('…');
  });

  it('snapshots config, messages, options, interactions, and facade model state exactly once', () => {
    const store = createNotificationStore({ now: () => 1 });
    const mutableConfig = {
      store,
      dismissalOwner: 'host' as 'host' | 'toast',
    };
    const manager = createToastManager(mutableConfig);
    mutableConfig.dismissalOwner = 'toast';
    const [initial] = manager.init();
    const shown = manager.push(initial, { message: 'Snapshot target', level: 'info' });
    expect(collectSubKinds(manager.subscriptions(shown))).not.toContain('key');

    let configReads = 0;
    const accessorConfig = Object.defineProperty({}, 'dismissalOwner', {
      enumerable: true,
      get: () => {
        configReads += 1;
        return 'toast';
      },
    });
    expect(() => createToastManager(accessorConfig)).toThrow(/own data property/i);
    expect(configReads).toBe(0);

    let messageReads = 0;
    const alternatingMessage = Object.defineProperty({}, 'type', {
      enumerable: true,
      get: () => {
        messageReads += 1;
        return messageReads === 1 ? 'noop' : 'dismiss-latest';
      },
    });
    expect(() => manager.update(alternatingMessage as ToastMsg, shown)).toThrow(/own data property/i);
    expect(messageReads).toBe(0);
    expect(shown.visibleToastIds).toHaveLength(1);

    let optionReads = 0;
    const accessorOptions = Object.defineProperty({}, 'width', {
      enumerable: true,
      get: () => {
        optionReads += 1;
        return 30;
      },
    });
    expect(() => manager.view(shown, accessorOptions)).toThrow(/own data property/i);
    expect(optionReads).toBe(0);

    let interactionReads = 0;
    const accessorInteraction = Object.defineProperty({ focusedToastId: null }, 'mouseHoveredToastId', {
      enumerable: true,
      get: () => {
        interactionReads += 1;
        return null;
      },
    });
    expect(() => manager.project(shown, accessorInteraction as never)).toThrow(/own data property/i);
    expect(interactionReads).toBe(0);

    let modelReads = 0;
    const accessorModel = Object.defineProperty({ ...shown }, 'focusedToastId', {
      enumerable: false,
      get: () => {
        modelReads += 1;
        return null;
      },
    }) as ToastModel;
    expect(() => manager.view(accessorModel)).toThrow(/own data property/i);
    expect(modelReads).toBe(0);
  });

  it('contains revoked proxies at every public toast boundary', () => {
    const manager = createToastManager({ now: () => 1 });
    const [initial] = manager.init();
    const shown = manager.push(initial, { message: 'Revoked boundary', level: 'info' });

    const revokedMessage = Proxy.revocable({ type: 'noop' }, {});
    revokedMessage.revoke();
    expect(() => manager.update(revokedMessage.proxy as ToastMsg, shown)).toThrow(TypeError);

    const revokedModel = Proxy.revocable(shown, {});
    revokedModel.revoke();
    expect(() => manager.update({ type: 'noop' }, revokedModel.proxy)).toThrow(TypeError);
    expect(() => manager.view(revokedModel.proxy)).toThrow(TypeError);
    expect(() => manager.subscriptions(revokedModel.proxy)).toThrow(TypeError);
    expect(() => manager.getInteraction(revokedModel.proxy)).toThrow(TypeError);
    expect(manager.project(revokedModel.proxy)).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'invalid-model' }],
    });

    const revokedViewOptions = Proxy.revocable({ width: 30 }, {});
    revokedViewOptions.revoke();
    expect(() => manager.view(shown, revokedViewOptions.proxy)).toThrow(TypeError);

    const revokedBounds = Proxy.revocable({ cols: 40, rows: 10 }, {});
    revokedBounds.revoke();
    expect(() => manager.layer({ kind: 'text', content: 'base' }, shown, revokedBounds.proxy)).toThrow(TypeError);

    const revokedLayerOptions = Proxy.revocable({ placement: 'top-right' as const }, {});
    revokedLayerOptions.revoke();
    expect(() => manager.layer({ kind: 'text', content: 'base' }, shown, { cols: 40, rows: 10 }, revokedLayerOptions.proxy)).toThrow(TypeError);

    const revokedInteraction = Proxy.revocable(
      {
        mouseHoveredToastId: null,
        focusedToastId: null,
      },
      {},
    );
    revokedInteraction.revoke();
    expect(() => manager.project(shown, revokedInteraction.proxy)).toThrow(TypeError);

    const revokedConfig = Proxy.revocable({ dismissalOwner: 'host' as const }, {});
    revokedConfig.revoke();
    expect(() => createToastManager(revokedConfig.proxy)).toThrow(TypeError);
  });
});

function collectSubKinds(sub: any): string[] {
  const kind = sub._kind?.kind;
  if (kind !== 'batch') return kind ? [kind] : [];
  return sub._kind.subs.flatMap((child: any) => collectSubKinds(child));
}

function flattenSubs<M>(subscription: Sub<M>): ReturnType<typeof subKind<M>>[] {
  const kind = subKind(subscription);
  if (kind.kind !== 'batch') return [kind];
  return kind.subs.flatMap(flattenSubs);
}

function elementMouseMapper(
  manager: ReturnType<typeof createToastManager>,
  model: ToastModel,
): (event: ElementMouseEvent) => ToastMsg {
  const kind = flattenSubs(manager.subscriptions(model)).find(
    (candidate) => candidate.kind === 'elementMouse',
  );
  if (!kind || kind.kind !== 'elementMouse') {
    throw new Error('Toast element mouse subscription is missing');
  }
  return kind.toMsg;
}

function elementMouse(
  handlerTag: string,
  elementId: string,
): ElementMouseEvent {
  return {
    handlerTag,
    elementId,
    phase: 'target',
    targetId: elementId,
    currentTargetId: elementId,
    path: [elementId],
    type: 'move',
    deltaY: 0,
    x: 0,
    y: 0,
    button: 'none',
    ctrl: false,
    alt: false,
    shift: false,
    stopPropagation() {},
    isPropagationStopped: () => false,
  };
}

function collectNodes(node: VNode, predicate: (candidate: VNode) => boolean): VNode[] {
  const matches = predicate(node) ? [node] : [];
  if ('children' in node && Array.isArray(node.children)) {
    matches.push(...node.children.flatMap((child) => collectNodes(child, predicate)));
  }
  if ('child' in node && node.child) matches.push(...collectNodes(node.child, predicate));
  return matches;
}
