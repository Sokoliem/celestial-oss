import { app, Cmd, cmdKind, collectFocusNodes, collectHitRegions, column, focus, planLayout, stackedLayers, Sub, text } from '@celestial/core/nebula';
import { renderToLines } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { drawer, drawerGroup } from '../drawer.js';

describe('drawer', () => {
  class TestTerminal {
    readonly writes: string[] = [];
    private cols = 60;
    private rows = 20;
    private inputHandlers: Array<(data: Buffer) => void> = [];
    private resizeHandlers: Array<() => void> = [];

    enterRawMode(): void {}
    exitRawMode(): void {}
    write(data: string): void {
      this.writes.push(data);
    }
    onInput(handler: (data: Buffer) => void): void {
      this.inputHandlers.push(handler);
    }
    offInput(handler: (data: Buffer) => void): void {
      this.inputHandlers = this.inputHandlers.filter((current) => current !== handler);
    }
    onResize(handler: () => void): void {
      this.resizeHandlers.push(handler);
    }
    offResize(handler: () => void): void {
      this.resizeHandlers = this.resizeHandlers.filter((current) => current !== handler);
    }
    getSize(): { cols: number; rows: number } {
      return { cols: this.cols, rows: this.rows };
    }
    simulateInput(data: Buffer): void {
      for (const handler of this.inputHandlers) {
        handler(data);
      }
    }
  }

  it('initializes with open true by default', () => {
    const comp = drawer({ content: text('Drawer content') });
    const [model, cmd] = comp.init();
    expect(model.open).toBe(true);
    expect(model.focusTrapActive).toBe(false);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('initializes with configurable width and height', () => {
    const comp = drawer({ content: text('Drawer content'), width: 50, height: 30 });
    const [model] = comp.init();
    expect(model.width).toBe(50);
    expect(model.height).toBe(30);
    expect(model.focusTrapActive).toBe(false);
  });

  it('opens drawer on open message', () => {
    const comp = drawer({ content: text('Drawer content') });
    const [model] = comp.init();
    const [closed] = comp.update({ type: 'close' }, model);
    expect(closed.open).toBe(false);
    const [opened, cmd] = comp.update({ type: 'open' }, closed);
    expect(opened.open).toBe(true);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('closes drawer on close message', () => {
    const comp = drawer({ content: text('Drawer content') });
    const [model] = comp.init();
    const [closed] = comp.update({ type: 'close' }, model);
    expect(closed.open).toBe(false);
  });

  it('toggles drawer open state', () => {
    const comp = drawer({ content: text('Drawer content') });
    const [model] = comp.init();
    const [toggled1] = comp.update({ type: 'toggle' }, model);
    expect(toggled1.open).toBe(false);
    const [toggled2] = comp.update({ type: 'toggle' }, toggled1);
    expect(toggled2.open).toBe(true);
  });

  it('tracks hover for visible open and close controls', () => {
    const comp = drawer({ content: text('Drawer content'), variant: 'overlay' });
    const [model] = comp.init();
    const [hoveredClose] = comp.update({ type: 'hover-control', control: 'close' }, model);
    expect(hoveredClose.hoveredControl).toBe('close');
    const [closed] = comp.update({ type: 'close' }, hoveredClose);
    const [hoveredOpen] = comp.update({ type: 'hover-control', control: 'open' }, closed);
    expect(hoveredOpen.hoveredControl).toBe('open');
  });

  it('calls onClose callback when closed', () => {
    let closed = false;
    const comp = drawer({
      content: text('Drawer content'),
      onClose: () => {
        closed = true;
      },
    });
    const [model] = comp.init();
    comp.update({ type: 'close' }, model);
    expect(closed).toBe(true);
  });

  it('overlay drawers push and pop focus groups', () => {
    const comp = drawer({ content: text('Drawer content'), variant: 'overlay' });
    const [model, initCmd] = comp.init();
    expect(cmdKind(initCmd).kind).toBe('pushFocusGroup');
    expect(model.focusTrapActive).toBe(true);

    const [closed, closeCmd] = comp.update({ type: 'close' }, model);
    expect(closed.open).toBe(false);
    expect(closed.focusTrapActive).toBe(false);
    expect(cmdKind(closeCmd).kind).toBe('popFocusGroup');

    const [opened, openCmd] = comp.update({ type: 'open' }, closed);
    expect(opened.open).toBe(true);
    expect(opened.focusTrapActive).toBe(true);
    expect(cmdKind(openCmd).kind).toBe('pushFocusGroup');
  });

  it('overlay drawer open and close are idempotent for focus trap commands', () => {
    const comp = drawer({ content: text('Drawer content'), variant: 'overlay' });
    const [openModel] = comp.init();

    const [stillOpen, duplicateOpenCmd] = comp.update({ type: 'open' }, openModel);
    expect(stillOpen).toEqual(openModel);
    expect(cmdKind(duplicateOpenCmd).kind).toBe('none');

    const [closedModel] = comp.update({ type: 'close' }, openModel);
    const [stillClosed, duplicateCloseCmd] = comp.update({ type: 'close' }, closedModel);
    expect(stillClosed).toEqual(closedModel);
    expect(cmdKind(duplicateCloseCmd).kind).toBe('none');
  });

  it('rejects non-dismissible drawers in favor of persistent panels', () => {
    expect(() => drawer({ content: text('Drawer content'), variant: 'overlay', closable: false })).toThrow(/must be dismissible/);
  });

  it('overlay drawers assign a shared focus group to nested focus nodes', () => {
    const comp = drawer({
      variant: 'overlay',
      content: column(focus('drawer-field-a', text('Alpha')), focus('drawer-field-b', text('Beta'))),
    });

    const vnode = comp.view({ open: true, width: 40, height: 20, focusTrapActive: true });
    const focusNodes = collectFocusNodes(vnode);
    const first = focusNodes.find((node) => node.id === 'drawer-field-a');
    const second = focusNodes.find((node) => node.id === 'drawer-field-b');

    expect(first?.group).toBeDefined();
    expect(first?.group).toBe(second?.group);
  });

  it('renders nested content once and anchors a right overlay to the viewport edge', () => {
    const comp = drawer({
      title: 'Request history',
      position: 'right',
      variant: 'overlay',
      width: 20,
      height: 10,
      content: column(text('GET /health  200')),
    });

    const lines = renderToLines(comp.view({ open: true, width: 20, height: 10, focusTrapActive: true }), { width: 60, height: 20 });
    const rendered = lines.join('\n');
    const contentLine = lines.find((line) => line.includes('GET /health'));

    expect(rendered.match(/GET \/health/g)).toHaveLength(1);
    expect(lines[0]?.indexOf('╔')).toBe(40);
    expect(contentLine?.indexOf('GET /health')).toBeGreaterThanOrEqual(42);
  });

  it('preserves the composed application outside its default transparent backdrop', () => {
    const width = 60;
    const height = 20;
    const base = column(...Array.from({ length: height }, (_, index) => text(`BASE ${index}`.padEnd(width, '.'))));
    const comp = drawer({
      title: 'Request history',
      position: 'right',
      variant: 'overlay',
      width: 20,
      height: 10,
      content: text('GET /health  200'),
    });
    const overlay = comp.view({ open: true, width: 20, height: 10, focusTrapActive: true });
    const layered = stackedLayers(base, overlay);
    const lines = renderToLines(layered, { width, height });

    expect(lines[0]?.startsWith('BASE 0')).toBe(true);
    expect(lines[0]?.indexOf('╔')).toBe(40);
    expect(lines[12]?.startsWith('BASE 12')).toBe(true);
  });

  it('keeps transparent outside-click regions in the overlay hit map', () => {
    const width = 60;
    const height = 20;
    const base = column(...Array.from({ length: height }, () => text('base'.padEnd(width, '.'))));
    const comp = drawer({ content: text('Details'), position: 'right', variant: 'overlay', width: 20, height: 10 });
    const layered = stackedLayers(base, comp.view({ open: true, width: 20, height: 10, focusTrapActive: true }));
    const regions = collectHitRegions(planLayout(layered, width, height));
    const side = regions.find((region) => region.id.includes(':backdrop:side'));
    const below = regions.find((region) => region.id.includes(':backdrop:below'));

    expect(side?.rect).toMatchObject({ x: 0, y: 0, width: 40, height: 10 });
    expect(below?.rect).toMatchObject({ x: 0, y: 10, width: 60, height: 10 });
    expect(side?.handlers.onClick).toBeDefined();
    expect(below?.handlers.onClick).toBeDefined();
  });

  it('supports an explicitly opaque backdrop without changing drawer geometry', () => {
    const width = 60;
    const height = 20;
    const base = column(...Array.from({ length: height }, (_, index) => text(`BASE ${index}`.padEnd(width, '.'))));
    const comp = drawer({
      content: text('Details'),
      position: 'right',
      variant: 'overlay',
      backdrop: 'opaque',
      width: 20,
      height: 10,
    });
    const layered = stackedLayers(base, comp.view({ open: true, width: 20, height: 10, focusTrapActive: true }));
    const lines = renderToLines(layered, { width, height });

    expect(lines[0]?.startsWith('BASE 0')).toBe(false);
    expect(lines[0]?.indexOf('╔')).toBe(40);
    expect(lines.join('\n')).not.toContain('BASE 12');
  });

  it('anchors a left overlay to the viewport edge', () => {
    const comp = drawer({
      title: 'Inspector',
      position: 'left',
      variant: 'overlay',
      width: 18,
      height: 8,
      content: text('Details'),
    });

    const lines = renderToLines(comp.view({ open: true, width: 18, height: 8, focusTrapActive: true }), { width: 50, height: 16 });

    expect(lines[0]?.startsWith('╔')).toBe(true);
    expect(lines.join('\n').match(/Details/g)).toHaveLength(1);
  });

  it.each([
    ['top', 0],
    ['bottom', 8],
  ] as const)('anchors a %s overlay to the expected viewport edge', (position, expectedRow) => {
    const comp = drawer({
      title: 'Inspector',
      position,
      variant: 'overlay',
      width: 18,
      height: 8,
      content: text('Details'),
    });
    const lines = renderToLines(comp.view({ open: true, width: 18, height: 8, focusTrapActive: true }), { width: 50, height: 16 });

    expect(lines[expectedRow]?.startsWith('╔')).toBe(true);
    expect(lines.join('\n').match(/Details/g)).toHaveLength(1);
  });

  it('overlay drawers trap tab navigation until closed', async () => {
    const comp = drawer({
      variant: 'overlay',
      content: column(focus('drawer-field-a', text('Alpha')), focus('drawer-field-b', text('Beta'))),
    });
    const [initialDrawer, initialCmd] = comp.init();

    type RootMsg = { type: 'drawer'; msg: import('../drawer.js').DrawerMsg } | { type: 'focus'; id: string | null };

    const terminal = new TestTerminal();
    const focusEvents: Array<string | null> = [];
    const handle = app(
      {
        init: () => [{ drawer: initialDrawer }, Cmd.map(initialCmd, (msg) => ({ type: 'drawer', msg }) as RootMsg)],
        update: (msg, model) => {
          if (msg.type === 'drawer') {
            const [drawerModel, cmd] = comp.update(msg.msg, model.drawer);
            return [{ ...model, drawer: drawerModel }, Cmd.map(cmd, (inner) => ({ type: 'drawer', msg: inner }) as RootMsg)];
          }
          return [model, Cmd.none<RootMsg>()];
        },
        view: (model) => column(focus('page', text('Page action')), comp.view(model.drawer)),
        subscriptions: (model) =>
          Sub.batch<RootMsg>(
            Sub.focus((id) => ({ type: 'focus', id })),
            Sub.map(comp.subscriptions!(model.drawer), (msg) => ({ type: 'drawer', msg })),
          ),
      },
      {
        terminal,
        accessibility: {
          onAnnouncements() {},
          onFocusChange(_description, focusedId) {
            focusEvents.push(focusedId);
          },
        },
      },
    );

    const flush = async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    };

    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    expect(focusEvents[0]).toContain('-close');
    expect(focusEvents[1]).toBe('drawer-field-a');
    expect(focusEvents[2]).toBe('drawer-field-b');
    expect(focusEvents).not.toContain('page');

    terminal.simulateInput(Buffer.from('\x1b', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    expect(focusEvents.at(-1)).toBe('page');
    handle.stop();
  });
});

describe('drawerGroup', () => {
  it('initializes with no active drawer', () => {
    const comp = drawerGroup({
      drawers: [
        { id: 'settings', content: text('Settings') },
        { id: 'info', content: text('Info') },
      ],
    });
    const [model] = comp.init();
    expect(model.activeId).toBeNull();
  });

  it('initializes with active drawer when specified', () => {
    const comp = drawerGroup({
      drawers: [
        { id: 'settings', content: text('Settings') },
        { id: 'info', content: text('Info') },
      ],
      activeId: 'settings',
    });
    const [model] = comp.init();
    expect(model.activeId).toBe('settings');
  });

  it('toggles drawer visibility', () => {
    const comp = drawerGroup({
      drawers: [
        { id: 'settings', content: text('Settings') },
        { id: 'info', content: text('Info') },
      ],
    });
    const [model] = comp.init();
    const [opened] = comp.update({ type: 'toggle' }, model);
    expect(opened.activeId).toBe('settings');
  });

  it('closes active drawer', () => {
    const comp = drawerGroup({
      drawers: [
        { id: 'settings', content: text('Settings') },
        { id: 'info', content: text('Info') },
      ],
      activeId: 'settings',
    });
    const [model] = comp.init();
    const [closed] = comp.update({ type: 'close' }, model);
    expect(closed.activeId).toBeNull();
  });
});
