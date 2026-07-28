import { collectFocusNodes, collectHitRegions, planLayout, type VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import {
  createFloatingWindow,
  createPip,
  createSplitLayout,
  createTabBar,
  createWindowManager,
  createWorkspaceManager,
  loadWorkspace,
  saveWorkspace,
  splitH,
  splitV,
  withFloatingWindows,
  withPip,
} from '../index.js';

function textNode(content: string): VNode {
  return { kind: 'text', content };
}

function focusNode(id: string): VNode {
  return { kind: 'focus', id, focused: false, child: textNode(id) };
}

function resolve(node: VNode): VNode {
  if (node.kind === 'component') {
    return resolve(node.render());
  }
  return node;
}

function collectOverlays(node: VNode): Array<{ kind: 'overlay'; x?: number; y?: number; width?: number; height?: number; zIndex?: number }> {
  const overlays: Array<{ kind: 'overlay'; x?: number; y?: number; width?: number; height?: number; zIndex?: number }> = [];

  const walk = (current: VNode): void => {
    const next = current.kind === 'component' ? current.render() : current;
    switch (next.kind) {
      case 'overlay':
        overlays.push(next as any);
        walk(next.child);
        break;
      case 'row':
      case 'column':
        next.children.forEach(walk);
        break;
      case 'box':
        next.children.forEach(walk);
        break;
      case 'focus':
      case 'scroll':
      case 'event':
      case 'flex':
        walk(next.child);
        break;
      default:
        break;
    }
  };

  walk(node);
  return overlays;
}

describe('horizon compatibility API', () => {
  it('supports docs-style split helpers', () => {
    const layout = splitH({
      panes: [
        { id: 'left', content: textNode('left'), size: 20 },
        { id: 'right', content: textNode('right'), size: 'flex' },
      ],
      gap: 1,
    });

    const vertical = splitV({
      panes: [
        { id: 'top', content: textNode('top'), size: 3 },
        { id: 'bottom', content: textNode('bottom'), size: 'flex' },
      ],
    });

    expect(resolve(layout).kind).toBe('row');
    expect(resolve(vertical).kind).toBe('column');

    const created = createSplitLayout({
      direction: 'horizontal',
      panes: [
        { id: 'one', content: textNode('1'), size: 1 },
        { id: 'two', content: textNode('2'), size: 1 },
      ],
    });

    expect(resolve(created).kind).toBe('row');
  });

  it('supports docs-style tab bar config', () => {
    const tabBar = createTabBar({
      tabs: [
        { id: 'tab1', label: 'File 1', content: textNode('one') },
        { id: 'tab2', label: 'File 2', content: textNode('two'), icon: '*' },
      ],
      active: 'tab2',
      position: 'bottom',
    });

    const rendered = resolve(tabBar);
    expect(rendered.kind).toBe('column');
    if (rendered.kind === 'column') {
      expect(rendered.children[0]).toEqual({ kind: 'text', content: 'two' });
    }
  });

  it('createTabBar wires focus and event handlers', () => {
    const tabBar = createTabBar({
      tabs: [{ id: 'tab1', label: 'File 1', content: textNode('one'), closable: true }],
      active: 'tab1',
      onSelect: (id) => `select:${id}`,
      onClose: (id) => `close:${id}`,
    });

    const rendered = resolve(tabBar);
    expect(rendered.kind).toBe('column');
    if (rendered.kind === 'column') {
      const tabRow = rendered.children[0]! as any;
      expect(JSON.stringify(tabRow)).toContain('select:tab1');
      expect(JSON.stringify(tabRow)).toContain('close:tab1');
      expect(JSON.stringify(tabRow)).toContain('focus');
    }
  });

  it('supports floating window helpers', () => {
    const search = createFloatingWindow({
      id: 'search',
      title: 'Search',
      content: textNode('popup'),
      x: 10,
      y: 5,
      width: 30,
      height: 8,
      zIndex: 20,
      draggable: true,
      resizable: true,
      focusable: true,
    });

    const rendered = withFloatingWindows(textNode('base'), [search]);
    const overlays = collectOverlays(rendered);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.x).toBe(10);
    expect(overlays[0]?.zIndex).toBe(20);
  });

  it('withFloatingWindows respects manager z-order and minimized state', () => {
    const manager = createWindowManager([
      { id: 'a', title: 'A', content: textNode('A'), x: 0, y: 0, width: 10, height: 5, zIndex: 5 },
      { id: 'b', title: 'B', content: textNode('B'), x: 1, y: 1, width: 10, height: 5, zIndex: 10, minimized: true },
    ]);

    const rendered = withFloatingWindows(textNode('base'), manager);
    const overlays = collectOverlays(rendered);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.zIndex).toBe(1);
  });

  it('withFloatingWindows exposes focus targets from only the focused layer', () => {
    const manager = createWindowManager([
      { id: 'front', content: focusNode('front-action'), x: 1, y: 1, width: 20, height: 6, zIndex: 20 },
      { id: 'selected', content: focusNode('selected-action'), x: 0, y: 0, width: 20, height: 6, zIndex: 10, focused: true },
    ]);

    expect(manager.windows.find((window) => window.id === 'selected')?.focused).toBe(true);
    expect(collectFocusNodes(withFloatingWindows(focusNode('workspace-action'), manager)).map((node) => node.id)).toEqual(['selected-action']);
  });

  it('withFloatingWindows gives raw arrays a frontmost focus fallback', () => {
    const rendered = withFloatingWindows(focusNode('workspace-action'), [
      { id: 'back', content: focusNode('back-action'), x: 0, y: 0, width: 20, height: 6, zIndex: 5 },
      { id: 'front', content: focusNode('front-action'), x: 1, y: 1, width: 20, height: 6, zIndex: 10 },
    ]);

    expect(collectFocusNodes(rendered).map((node) => node.id)).toEqual(['front-action']);
  });

  it('withFloatingWindows blocks background focus behind a non-focusable modal', () => {
    const manager = createWindowManager([
      { id: 'main', content: focusNode('main-action'), x: 0, y: 0, width: 20, height: 6, focused: true },
      { id: 'shield', role: 'modal', focusable: false, content: focusNode('shield-action'), x: 1, y: 1, width: 20, height: 6 },
    ]);

    expect(manager.windows.every((window) => window.focused === false)).toBe(true);
    expect(collectFocusNodes(withFloatingWindows(focusNode('workspace-action'), manager))).toEqual([]);
  });

  it('supports workspace manager helpers', () => {
    const manager = createWorkspaceManager();
    const workspace = {
      name: 'development',
      layout: { kind: 'split', direction: 'horizontal', panes: [] },
    };

    const updated = saveWorkspace(manager, workspace);
    expect(loadWorkspace(updated, 'development')).toEqual(workspace);
  });

  it('supports picture-in-picture helpers', () => {
    const pip = createPip({
      content: textNode('pip'),
      x: 'right',
      y: 'bottom',
      width: 20,
      height: 6,
      cornerRadius: 2,
    });

    const rendered = withPip(textNode('base'), pip, { cols: 100, rows: 30 });
    const overlays = collectOverlays(rendered);
    expect(overlays[0]?.x).toBe(80);
    expect(overlays[0]?.y).toBe(24);
  });

  it('clamps oversized and off-screen picture-in-picture geometry to the viewport', () => {
    const oversized = withPip(textNode('base'), createPip({ content: textNode('surface'), x: 'right', y: 'bottom', width: 50, height: 20 }), {
      cols: 30,
      rows: 10,
    });
    const displaced = withPip(textNode('base'), createPip({ content: textNode('surface'), x: 99, y: -4, width: 10, height: 4 }), { cols: 30, rows: 10 });

    expect(collectOverlays(oversized)[0]).toMatchObject({ x: 0, y: 0, width: 30, height: 10 });
    expect(collectOverlays(displaced)[0]).toMatchObject({ x: 20, y: 0, width: 10, height: 4 });
  });

  it('routes click-away through a full-screen backdrop shielded by the PiP surface', () => {
    const rendered = withPip(
      textNode('base'),
      createPip({
        content: textNode('surface'),
        x: 12,
        y: 4,
        width: 20,
        height: 6,
        surfaceId: 'inspector',
        onClickAway: 'close-inspector',
      }),
      { cols: 80, rows: 24 },
    );
    const regions = collectHitRegions(planLayout(rendered, 80, 24));
    const backdrop = regions.find((region) => region.id === 'pip-backdrop:inspector');
    const surface = regions.find((region) => region.id === 'pip-surface:inspector');

    expect(backdrop?.rect).toEqual({ x: 0, y: 0, width: 80, height: 24 });
    expect(backdrop?.handlers.onClick).toBe('close-inspector');
    expect(surface?.rect).toEqual({ x: 12, y: 4, width: 20, height: 6 });
    expect(surface?.handlers.onClick).toBeUndefined();
    expect(surface?.zIndex).toBeGreaterThan(backdrop?.zIndex ?? 0);
  });
});
