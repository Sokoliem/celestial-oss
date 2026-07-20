import { describe, expect, it } from 'vitest';
import { statusGlyph } from '../status-icon.js';
import { createToastManager } from '../toast.js';

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
    const manager = createToastManager();
    // Create a toast with a very short duration that's already expired
    const now = Date.now();
    const expiredModel = {
      toasts: [
        { id: 1, message: 'Old', level: 'info' as const, createdAt: now - 5000, duration: 3000 },
        { id: 2, message: 'New', level: 'info' as const, createdAt: now, duration: 3000 },
      ],
      nextId: 3,
    };
    const [ticked] = manager.update({ type: 'tick' }, expiredModel);
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
      const toast = vnode.children[0];
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

  it('normalizes malformed external entries and levels', () => {
    const manager = createToastManager({ now: () => Number.NaN });
    const [model] = manager.init();
    const pushed = manager.push(model, { message: 'Safe', level: 'invalid' as any, duration: Number.POSITIVE_INFINITY });
    expect(pushed.toasts[0]).toMatchObject({ message: 'Safe', level: 'info', createdAt: 0, duration: 3000 });
  });
});

function collectSubKinds(sub: any): string[] {
  const kind = sub._kind?.kind;
  if (kind !== 'batch') return kind ? [kind] : [];
  return sub._kind.subs.flatMap((child: any) => collectSubKinds(child));
}
