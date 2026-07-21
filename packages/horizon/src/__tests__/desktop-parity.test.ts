import { defaultTheme } from '@celestial/core/corona';
import type { BoxNode, ColumnNode, EventNode, FlexNode, RowNode, VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import {
  applySnapZone,
  computeSnapZones,
  createDesktopWindow,
  createHorizonMouseModel,
  createHorizonSplitController,
  createKeymap,
  createWindowManager,
  createWorkspaceDescriptor,
  desktopWorkspaceUpdate,
  findKeymapConflicts,
  fullscreenWindow,
  getWindowChromeControlWidth,
  hitTestWindowChromeTitleBar,
  horizonMouseUpdate,
  moveWindowToWorkspace,
  normalizeAccelerator,
  normalizeWorkspaceModel,
  previewSnapZone,
  renderWindowChrome,
  resolvePlatformKeyAction,
  windowLifecycleUpdate,
  windowManagerHoverAt,
  windowManagerMsgFromChromeEvent,
  windowManagerUpdate,
} from '../index.js';
import type { FloatGeometry, GeometryCache } from '../primitives/geometry.js';

function text(content: string): VNode {
  return { kind: 'text', content };
}

function emptyGeometry(): GeometryCache {
  return { splits: [], tabs: [], floats: [], panes: [] };
}

function pressEvent(x: number, y: number) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'press' as const, button: 0 as const, x, y, ctrl: false, alt: false, shift: false },
  };
}

function moveEvent(x: number, y: number) {
  return {
    type: 'mouse-event' as const,
    event: { type: 'move' as const, button: 'none' as const, x, y, ctrl: false, alt: false, shift: false },
  };
}

describe('desktop parity primitives', () => {
  it('applies window lifecycle close, fullscreen, and restore commands with focus recovery', () => {
    const first = createDesktopWindow({ id: 'a', content: text('a'), x: 1, y: 1, width: 20, height: 10, zIndex: 1, focused: true });
    const second = createDesktopWindow({ id: 'b', content: text('b'), x: 2, y: 2, width: 20, height: 10, zIndex: 2 });

    const fullscreen = fullscreenWindow([first, second], 'a', { cols: 80, rows: 24 });
    expect(fullscreen.accepted).toBe(true);
    expect(fullscreen.windows.find((window) => window.id === 'a')?.mode).toBe('fullscreen');
    expect(fullscreen.windows.find((window) => window.id === 'a')?.width).toBe(80);

    const restored = windowLifecycleUpdate({ type: 'restore', id: 'a' }, fullscreen.windows);
    expect(restored.windows.find((window) => window.id === 'a')?.mode).toBe('normal');
    expect(restored.windows.find((window) => window.id === 'a')?.x).toBe(1);

    const closed = windowLifecycleUpdate({ type: 'close', id: 'a' }, restored.windows);
    expect(closed.windows.map((window) => window.id)).toEqual(['b']);
    expect(closed.windows[0]?.focused).toBe(true);
  });

  it('extends the window manager with create, hide, show, fullscreen, and close messages', () => {
    let manager = createWindowManager([], { cols: 100, rows: 30 });
    manager = windowManagerUpdate({ type: 'create-window', window: { id: 'search', content: text('search'), x: 4, y: 3, width: 30, height: 8 } }, manager);
    expect(manager.windows[0]?.id).toBe('search');

    manager = windowManagerUpdate({ type: 'hide-window', id: 'search' }, manager);
    expect(manager.windows[0]?.hidden).toBe(true);

    manager = windowManagerUpdate({ type: 'show-window', id: 'search' }, manager);
    expect(manager.windows[0]?.focused).toBe(true);

    manager = windowManagerUpdate({ type: 'fullscreen-window', id: 'search' }, manager);
    expect(manager.windows[0]?.mode).toBe('fullscreen');
    expect(manager.windows[0]?.height).toBe(30);

    manager = windowManagerUpdate({ type: 'close-window', id: 'search', policy: 'mark-closed', reason: 'test' }, manager);
    expect(manager.windows[0]?.closed).toBe(true);
    expect(manager.windows[0]?.lastCloseReason).toBe('test');
  });

  it('renders shared window chrome with command metadata', () => {
    const window = createDesktopWindow({ id: 'modal', role: 'modal', title: 'Modal', content: text('body'), x: 0, y: 0, width: 20, height: 5 });
    const rendered = renderWindowChrome(window) as EventNode;
    expect(rendered.kind).toBe('event');
    expect(rendered.metadata?.extra?.integratedChrome).toBe(true);
    expect(rendered.metadata?.affordances).toEqual(['hover', 'drag', 'resize']);
    const frame = rendered.child as BoxNode;
    expect(frame.kind).toBe('box');
    expect(frame.width).toBe(20);
    expect(frame.height).toBe(5);
    const chrome = frame.children[0] as ColumnNode;
    const titleBar = chrome.children[0] as EventNode;
    expect(titleBar.metadata?.intent).toBe('drag');
    expect(titleBar.handlers.onMouseEnter).toBe('window:modal:hover:titlebar');
    expect(titleBar.metadata?.extra?.escapeCommand).toMatchObject({ type: 'close', id: 'modal', source: 'escape' });

    const titleSurface = titleBar.child as BoxNode;
    const bodySurface = (chrome.children[1] as FlexNode).child as BoxNode;
    expect(titleSurface.style?.bg).not.toBe(bodySurface.style?.bg);
    expect(bodySurface.style?.bg).not.toBe(defaultTheme.colors.bg.bg());
  });

  it('drags from blank titlebar fill but leaves chrome controls clickable', () => {
    const window = createDesktopWindow({
      id: 'telemetry',
      title: 'Telemetry',
      content: text('body'),
      x: 5,
      y: 3,
      width: 40,
      height: 9,
      chrome: { showFullscreen: false },
    });
    expect(getWindowChromeControlWidth(window)).toBe(9);
    expect(hitTestWindowChromeTitleBar(window, 25, 4)).toBe(true);
    expect(hitTestWindowChromeTitleBar(window, 36, 4)).toBe(false);
  });

  it('uses shared hover state for title, control, and resize-border cues', () => {
    const base = createDesktopWindow({
      id: 'telemetry',
      title: 'Telemetry',
      content: text('body'),
      x: 4,
      y: 3,
      width: 24,
      height: 8,
      focused: true,
    });
    const resting = renderWindowChrome(base) as EventNode;
    const hovered = renderWindowChrome({ ...base, chrome: { hoveredTarget: 'titlebar' } }) as EventNode;
    const restingFrame = resting.child as BoxNode;
    const hoveredFrame = hovered.child as BoxNode;
    const restingTitle = ((restingFrame.children[0] as ColumnNode).children[0] as EventNode).child as BoxNode;
    const hoveredTitle = ((hoveredFrame.children[0] as ColumnNode).children[0] as EventNode).child as BoxNode;
    expect(restingTitle.style?.bg).not.toBe(hoveredTitle.style?.bg);
    expect(restingFrame.style?.fg).not.toBe(hoveredFrame.style?.fg);

    const manager = createWindowManager([base], { cols: 80, rows: 24 });
    const edgeHovered = windowManagerHoverAt(manager, base.x, base.y + 3);
    expect(edgeHovered.windows[0]?.chrome?.hoveredTarget).toBe('resize:left');
    const msg = windowManagerMsgFromChromeEvent({ handlerTag: 'window:telemetry:hover:close' });
    expect(msg).toEqual({ type: 'hover-window-chrome', id: 'telemetry', target: 'close' });
  });

  it('emits floating resize effects from edge hit regions', () => {
    const float: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 10,
      titleBarY: 5,
      titleBarWidth: 30,
      titleBarHeight: 1,
      contentX: 10,
      contentY: 6,
      contentWidth: 30,
      contentHeight: 10,
    };
    const model = {
      ...createHorizonMouseModel({ cols: 80, rows: 24 }),
      enabled: true,
      geometry: { ...emptyGeometry(), floats: [float] },
    };

    const { model: resizing } = horizonMouseUpdate(pressEvent(39, 8), model);
    expect(resizing.active).toEqual({ kind: 'resize-float', floatId: 'f1', edge: 'right' });

    const { effects } = horizonMouseUpdate(moveEvent(45, 8), resizing);
    expect(effects).toContainEqual({ effect: 'resize-float', floatId: 'f1', edge: 'right', frame: { x: 10, y: 5, width: 36, height: 11 } });
  });

  it('emits snap-window effects while dragging a floating title bar across snap zones', () => {
    const float: FloatGeometry = {
      floatId: 'f1',
      titleBarX: 10,
      titleBarY: 5,
      titleBarWidth: 30,
      titleBarHeight: 1,
      contentX: 10,
      contentY: 6,
      contentWidth: 30,
      contentHeight: 10,
    };
    const model = {
      ...createHorizonMouseModel({ cols: 80, rows: 24 }),
      enabled: true,
      geometry: { ...emptyGeometry(), floats: [float] },
    };
    const zones = computeSnapZones({ cols: 80, rows: 24 });

    const { model: dragging } = horizonMouseUpdate(pressEvent(20, 5), model);
    const { effects } = horizonMouseUpdate(moveEvent(0, 0), dragging, { snapZones: zones });

    expect(effects).toContainEqual({ effect: 'snap-window', floatId: 'f1', zoneId: 'quadrant:top-left', frame: { x: 0, y: 0, width: 40, height: 12 } });
  });

  it('computes snap zones and previews the same frame that will be applied', () => {
    const zones = computeSnapZones({ cols: 80, rows: 24 });
    const preview = previewSnapZone({ x: 0, y: 0 }, { x: 5, y: 5, width: 20, height: 10 }, zones);
    expect(preview?.zone.id).toBe('quadrant:top-left');
    expect(preview?.frame).toEqual({ x: 0, y: 0, width: 40, height: 12 });
    expect(applySnapZone({ x: 5, y: 5, width: 20, height: 10 }, preview!.zone)).toEqual(preview?.frame);
  });

  it('normalizes and updates descriptor-backed workspaces', () => {
    const model = normalizeWorkspaceModel({
      workspaces: [createWorkspaceDescriptor({ id: 'main', name: 'Main', order: 0, windowIds: ['w1'] }), 'aux'],
      activeIndex: 0,
      overviewMode: false,
    });

    const added = desktopWorkspaceUpdate({ type: 'workspace-add', workspace: createWorkspaceDescriptor({ id: 'third', name: 'Third', order: 2 }) }, model);
    const moved = moveWindowToWorkspace(added, 'w1', 'third');

    expect(moved.workspaces.find((workspace) => workspace.id === 'main')?.windowIds).toEqual([]);
    expect(moved.workspaces.find((workspace) => workspace.id === 'third')?.windowIds).toEqual(['w1']);
    expect(moved.workspaces.find((workspace) => workspace.id === 'third')?.activeWindowId).toBe('w1');
  });

  it('normalizes platform key accelerators and reports conflicts', () => {
    const keymap = createKeymap({
      platform: 'macos',
      commands: [
        { id: 'close-window', scope: 'window' },
        { id: 'close-pane', scope: 'window' },
      ],
      bindings: [
        { commandId: 'close-window', scope: 'window', accelerator: 'mod+w' },
        { commandId: 'close-pane', scope: 'window', accelerator: 'meta+w' },
      ],
    });

    expect(normalizeAccelerator('mod+w', 'macos')).toBe('meta+w');
    expect(normalizeAccelerator('mod+w', 'windows')).toBe('ctrl+w');
    expect(resolvePlatformKeyAction('command+w', keymap, { scope: 'window' })?.id).toBe('close-window');
    expect(findKeymapConflicts(keymap)).toEqual([{ scope: 'window', accelerator: 'meta+w', commandIds: ['close-window', 'close-pane'] }]);
  });

  it('renders controller-backed split handles with drag metadata and serializes weights', () => {
    const split = createHorizonSplitController({
      direction: 'row',
      panes: [
        { id: 'left', child: text('left'), weight: 0.25 },
        { id: 'right', child: text('right'), weight: 0.75 },
      ],
    });

    const rendered = split
      .render()
      .render({ terminal: { cols: 80, rows: 20 }, available: { cols: 80, rows: 20 }, container: { cols: 80, rows: 20 } }) as RowNode;
    const handle = rendered.children[1] as EventNode;
    expect(handle.metadata?.intent).toBe('drag');
    expect(handle.metadata?.extra?.leadingPaneId).toBe('left');
    expect((rendered.children[0] as BoxNode).width).toBe(19);
    expect(split.serialize().panes.map((pane) => pane.id)).toEqual(['left', 'right']);
  });
});
