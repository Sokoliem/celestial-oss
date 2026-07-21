import type { BoxNode, ColumnNode, EventNode, RowNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import {
  applyWindowCommand,
  createDesktopWindow,
  createWindowManager,
  getFrontmostWindow,
  getVisibleWindows,
  renderWindowChrome,
  windowManagerMsgFromWindowEvent,
  windowManagerUpdate,
  windowManagerUpdateResult,
  withFloatingWindows,
} from '../index.js';

const content = (value: string): VNode => ({ kind: 'text', content: value });

function textContent(node: VNode): string[] {
  if (node.kind === 'text') return [node.content];
  if ('child' in node) return textContent(node.child);
  if ('children' in node) return node.children.flatMap(textContent);
  return [];
}

describe('window lifecycle hardening', () => {
  it.each(['maximized', 'fullscreen'] as const)('restores a minimized %s window to its prior visible mode', (mode) => {
    const normal = createDesktopWindow({ id: 'report', content: content('report'), x: 5, y: 6, width: 30, height: 10 });
    const visible = applyWindowCommand({ type: mode === 'maximized' ? 'maximize' : 'fullscreen', id: 'report' }, [normal], {
      bounds: { cols: 100, rows: 40, leftInset: 2, rightInset: 3, topInset: 4, bottomInset: 5 },
    }).windows;
    const minimized = applyWindowCommand({ type: 'minimize', id: 'report' }, visible).windows;
    const restored = applyWindowCommand({ type: 'focus', id: 'report' }, minimized, {
      bounds: { cols: 80, rows: 30, leftInset: 1, rightInset: 2, topInset: 3, bottomInset: 4 },
    });
    const window = restored.windows[0]!;

    expect(restored.accepted).toBe(true);
    expect(window.mode).toBe(mode);
    expect(window.focused).toBe(true);
    expect(window.restoreFrame).toEqual({ x: 5, y: 6, width: 30, height: 10 });
    expect(window.frame).toEqual(mode === 'maximized' ? { x: 1, y: 3, width: 77, height: 23 } : { x: 0, y: 0, width: 80, height: 30 });
  });

  it('preserves the prior mode across repeated suspension and rejects closed-window revival', () => {
    const maximized = applyWindowCommand(
      { type: 'maximize', id: 'dialog' },
      [createDesktopWindow({ id: 'dialog', content: content('dialog'), x: 2, y: 2, width: 20, height: 8 })],
      { bounds: { cols: 60, rows: 20 } },
    ).windows;
    const minimized = applyWindowCommand({ type: 'minimize', id: 'dialog' }, maximized).windows;
    const hidden = applyWindowCommand({ type: 'hide', id: 'dialog' }, minimized).windows;
    expect(hidden[0]?.restoreMode).toBe('maximized');

    const closed = applyWindowCommand({ type: 'close', id: 'dialog' }, hidden, { closePolicy: 'mark-closed' }).windows;
    expect(applyWindowCommand({ type: 'show', id: 'dialog' }, closed).reason).toBe('window-closed');
    expect(applyWindowCommand({ type: 'minimize', id: 'dialog' }, closed).reason).toBe('window-closed');
    expect(applyWindowCommand({ type: 'maximize', id: 'dialog' }, closed).reason).toBe('window-closed');
  });

  it('enforces focus, movement, resize, and lifecycle capability flags', () => {
    const manager = createWindowManager([
      {
        id: 'locked',
        content: content('locked'),
        x: 4,
        y: 4,
        width: 20,
        height: 8,
        focusable: false,
        draggable: false,
        resizable: false,
        closable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
      },
    ]);

    expect(windowManagerUpdateResult({ type: 'focus-window', id: 'locked' }, manager).diagnostics[0]?.code).toBe('window-not-focusable');
    expect(windowManagerUpdateResult({ type: 'move-window', id: 'locked', x: 9, y: 9 }, manager).diagnostics[0]?.code).toBe('window-not-draggable');
    expect(windowManagerUpdateResult({ type: 'resize-window', id: 'locked', width: 30, height: 10 }, manager).diagnostics[0]?.code).toBe(
      'window-not-resizable',
    );
    expect(windowManagerUpdateResult({ type: 'close-window', id: 'locked' }, manager).diagnostics[0]?.code).toBe('window-not-closable');
    expect(windowManagerUpdateResult({ type: 'minimize-window', id: 'locked' }, manager).diagnostics[0]?.code).toBe('window-not-minimizable');
    expect(windowManagerUpdateResult({ type: 'maximize-window', id: 'locked' }, manager).diagnostics[0]?.code).toBe('window-not-maximizable');
    expect(windowManagerUpdateResult({ type: 'fullscreen-window', id: 'locked' }, manager).diagnostics[0]?.code).toBe('window-not-fullscreenable');
  });
});

describe('window manager invariants', () => {
  it('reflows normal, maximized, fullscreen, and restore frames when bounds change', () => {
    const manager = createWindowManager(
      [
        { id: 'normal', content: content('n'), x: 90, y: 35, width: 30, height: 10, restoreFrame: { x: 90, y: 35, width: 30, height: 10 } },
        { id: 'max', content: content('m'), x: 0, y: 0, width: 100, height: 40, mode: 'maximized', restoreFrame: { x: 4, y: 4, width: 20, height: 8 } },
        { id: 'full', content: content('f'), x: 0, y: 0, width: 100, height: 40, mode: 'fullscreen', restoreFrame: { x: 5, y: 5, width: 20, height: 8 } },
      ],
      { cols: 120, rows: 50 },
    );

    const outcome = windowManagerUpdateResult(
      { type: 'set-bounds', bounds: { cols: 60, rows: 20, leftInset: 2, rightInset: 3, topInset: 2, bottomInset: 2 } },
      manager,
    );
    const byId = Object.fromEntries(outcome.model.windows.map((window) => [window.id, window]));

    expect(outcome.changed).toBe(true);
    expect(byId.normal?.frame).toEqual({ x: 27, y: 8, width: 30, height: 10 });
    expect(byId.normal?.restoreFrame).toEqual({ x: 27, y: 8, width: 30, height: 10 });
    expect(byId.max?.frame).toEqual({ x: 2, y: 2, width: 55, height: 16 });
    expect(byId.full?.frame).toEqual({ x: 0, y: 0, width: 60, height: 20 });
  });

  it('rebases z-order without violating normal, always-on-top, and modal layers', () => {
    const manager = createWindowManager([
      { id: 'modal', role: 'modal', content: content('modal'), x: 1, y: 1, width: 20, height: 8, zIndex: 1 },
      { id: 'top', alwaysOnTop: true, content: content('top'), x: 1, y: 1, width: 20, height: 8, zIndex: 999_999 },
      { id: 'normal', content: content('normal'), x: 1, y: 1, width: 20, height: 8, zIndex: 999_999_999 },
    ]);

    expect(manager.windows.map((window) => [window.id, window.zIndex])).toEqual([
      ['normal', 1],
      ['top', 2],
      ['modal', 3],
    ]);
    expect(getFrontmostWindow(manager)?.id).toBe('modal');
    expect(manager.windows.find((window) => window.id === 'modal')?.focused).toBe(true);
  });

  it('blocks background manipulation while a modal is visible', () => {
    const manager = createWindowManager([
      { id: 'main', content: content('main'), x: 1, y: 1, width: 20, height: 8 },
      { id: 'modal', role: 'modal', content: content('modal'), x: 3, y: 2, width: 20, height: 8 },
    ]);

    for (const message of [
      { type: 'focus-window', id: 'main' } as const,
      { type: 'move-window', id: 'main', x: 8, y: 8 } as const,
      { type: 'close-window', id: 'main' } as const,
    ]) {
      const outcome = windowManagerUpdateResult(message, manager);
      expect(outcome.accepted).toBe(false);
      expect(outcome.diagnostics[0]?.code).toBe('modal-blocked');
      expect(outcome.model).toEqual(manager);
    }
  });

  it('filters workspace rendering and activate-window restores the target workspace', () => {
    const manager = createWindowManager(
      [
        { id: 'one', workspaceId: 'alpha', content: content('one'), x: 1, y: 1, width: 20, height: 8 },
        { id: 'two', workspaceId: 'beta', content: content('two'), x: 2, y: 2, width: 20, height: 8, minimized: true },
      ],
      { cols: 80, rows: 24 },
      { activeWorkspaceId: 'alpha' },
    );
    expect(getVisibleWindows(manager).map((window) => window.id)).toEqual(['one']);

    const rendered = withFloatingWindows(content('base'), manager);
    expect(JSON.stringify(rendered)).toContain('one');
    expect(JSON.stringify(rendered)).not.toContain('two');

    const activated = windowManagerUpdate({ type: 'activate-window', id: 'two' }, manager);
    expect(activated.activeWorkspaceId).toBe('beta');
    expect(activated.windows.find((window) => window.id === 'two')?.mode).toBe('normal');
    expect(activated.windows.find((window) => window.id === 'two')?.focused).toBe(true);
  });

  it('returns diagnostics for invalid ids and reports semantic no-ops', () => {
    const manager = createWindowManager([{ id: 'only', content: content('only'), x: 0, y: 0, width: 20, height: 8 }]);
    const missing = windowManagerUpdateResult({ type: 'focus-window', id: 'missing' }, manager);
    expect(missing).toMatchObject({ accepted: false, changed: false });
    expect(missing.diagnostics[0]?.code).toBe('window-not-found');

    const alreadyFront = windowManagerUpdateResult({ type: 'focus-window', id: 'only' }, manager);
    expect(alreadyFront).toMatchObject({ accepted: true, changed: false });
  });
});

describe('window chrome hardening', () => {
  it('round-trips ids containing delimiters through command handlers', () => {
    const id = 'telemetry:one/ß';
    const window = createDesktopWindow({ id, title: 'Telemetry', content: content('body'), x: 0, y: 0, width: 30, height: 8 });
    const rendered = renderWindowChrome(window) as EventNode;
    const frame = rendered.child as BoxNode;
    const titleBar = ((frame.children[0] as ColumnNode).children[0] as EventNode).child as BoxNode;
    const titleRow = titleBar.children[0] as RowNode;
    const close = titleRow.children.find(
      (node) => node.kind === 'event' && typeof node.handlers.onClick === 'string' && node.handlers.onClick.endsWith(':close'),
    ) as EventNode;
    const handler = close.handlers.onClick;

    expect(typeof handler).toBe('string');
    expect(windowManagerMsgFromWindowEvent({ handlerTag: handler as string })).toEqual({ type: 'close-window', id });
  });

  it('renders only complete controls and graphemes in very narrow chrome', () => {
    const window = createDesktopWindow({ id: 'narrow', title: 'A😀B', content: content('body'), x: 0, y: 0, width: 6, height: 4 });
    const rendered = renderWindowChrome(window);
    const labels = textContent(rendered);

    expect(labels).toContain('[x]');
    expect(labels).not.toContain('[_]');
    expect(labels).not.toContain('[fs]');
    expect(labels.some((label) => label.includes('\uFFFD'))).toBe(false);
    expect(labels.join('')).not.toContain('😀');
  });
});
