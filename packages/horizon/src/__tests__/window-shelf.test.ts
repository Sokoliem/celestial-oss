import type { BoxNode, EventNode, FocusNode, RowNode, TextNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { createWindowManager, windowShelf, windowShelfActionFromEvent } from '../index.js';

const content = (value: string): VNode => ({ kind: 'text', content: value });

describe('windowShelf', () => {
  it('is absent until a window is minimized', () => {
    const manager = createWindowManager([{ id: 'one', content: content('one'), x: 0, y: 0, width: 20, height: 8 }]);
    expect(windowShelf({ manager, width: 40 }).kind).toBe('empty');
  });

  it('renders active-workspace windows as mouse and keyboard targets', () => {
    const manager = createWindowManager(
      [
        { id: 'alpha:logs', title: 'Logs', workspaceId: 'alpha', content: content('logs'), x: 0, y: 0, width: 20, height: 8, minimized: true },
        { id: 'beta', title: 'Beta', workspaceId: 'beta', content: content('beta'), x: 0, y: 0, width: 20, height: 8, minimized: true },
      ],
      { cols: 80, rows: 24 },
      { activeWorkspaceId: 'alpha' },
    );
    const shelf = windowShelf({ manager, width: 40, focusedWindowId: 'alpha:logs' }) as BoxNode;
    const shelfRow = shelf.children[0] as RowNode;
    const label = shelfRow.children[0] as TextNode;
    const focusNode = shelfRow.children.find((child): child is FocusNode => child.kind === 'focus')!;
    const button = focusNode.child as EventNode;

    expect(shelf.height).toBe(1);
    expect(label.content).toBe(' MINIMIZED 1 ');
    expect(shelfRow.children).toHaveLength(2);
    expect(focusNode.focused).toBe(true);
    expect(button.handlers.onClick).toBe('window-shelf:alpha%3Alogs:activate');
    expect(button.handlers.onRightClick).toBe('window-shelf:alpha%3Alogs:context');
    expect(windowShelfActionFromEvent({ handlerTag: button.handlers.onClick as string })).toEqual({ type: 'activate', id: 'alpha:logs' });
    expect(windowShelfActionFromEvent({ handlerTag: button.handlers.onRightClick as string })).toEqual({ type: 'context', id: 'alpha:logs' });
  });

  it('fits whole labels and exposes overflow instead of clipping controls', () => {
    const manager = createWindowManager(
      ['alpha', 'beta', 'gamma'].map((id) => ({ id, title: `${id} telemetry`, content: content(id), x: 0, y: 0, width: 20, height: 8, minimized: true })),
    );
    const shelf = windowShelf({ manager, width: 12, theme: { unicodeLevel: 'none' } }) as BoxNode;
    const shelfRow = shelf.children[0] as RowNode;
    const overflow = shelfRow.children.at(-1) as EventNode;
    const overflowText = overflow.child as TextNode;

    expect(overflow.handlers.onClick).toBe('window-shelf:overflow');
    expect(overflowText.content).toMatch(/\.\.\.[1-3]/);
    expect(windowShelfActionFromEvent({ handlerTag: 'window-shelf:overflow' })).toEqual({ type: 'overflow' });
    expect(windowShelfActionFromEvent({ handlerTag: 'window-shelf:__proto__:activate' })).toBeNull();
  });

  it('can include minimized windows from every workspace', () => {
    const manager = createWindowManager(
      [
        { id: 'alpha', workspaceId: 'alpha', content: content('alpha'), x: 0, y: 0, width: 20, height: 8, minimized: true },
        { id: 'beta', workspaceId: 'beta', content: content('beta'), x: 0, y: 0, width: 20, height: 8, minimized: true },
      ],
      { cols: 80, rows: 24 },
      { activeWorkspaceId: 'alpha' },
    );
    const shelf = windowShelf({ manager, width: 60, allWorkspaces: true }) as BoxNode;
    const children = (shelf.children[0] as RowNode).children;
    expect((children[0] as TextNode).content).toBe(' MINIMIZED 2 ');
    expect(children.filter((child) => child.kind === 'focus')).toHaveLength(2);
  });
});
