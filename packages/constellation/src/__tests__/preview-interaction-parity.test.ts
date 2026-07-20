import type { AppConfig, Cmd, Sub, VNode } from '@celestial/core/nebula';
import { Sub as SubBuilder, text } from '@celestial/core/nebula';
import { assertMouseKeyboardParity, createTestApp, type KeyModifiers, type TestAppHandle } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { type ConfirmDialogModel, type ConfirmDialogMsg, confirmDialog } from '../confirm-dialog.js';
import { type BreadcrumbModel, type BreadcrumbMsg, breadcrumb } from '../breadcrumb.js';
import { type CommandPaletteModel, type CommandPaletteMsg, commandPalette } from '../command-palette.js';
import { type DataTableModel, type DataTableMsg, dataTable } from '../data-table.js';
import { type DrawerModel, type DrawerMsg, drawer } from '../drawer.js';
import { type ModalModel, type ModalMsg, modal } from '../modal.js';
import { type PaginationModel, type PaginationMsg, pagination } from '../pagination.js';
import { type RadioGroupModel, type RadioGroupMsg, radioGroup } from '../radio.js';
import { type SliderModel, type SliderMsg, slider } from '../slider.js';
import { type TabsModel, type TabsMsg, tabs } from '../tabs.js';
import { createToastManager, type ToastModel, type ToastMsg } from '../toast.js';
import { type TreeModel, type TreeMsg, tree } from '../tree.js';
import type { ComponentDescriptor } from '../types.js';

function asApp<Model, M>(descriptor: ComponentDescriptor<Model, M>, initialize?: (model: Model) => Model): AppConfig<Model, M> {
  return {
    init(): [Model, Cmd<M>] {
      const [model, command] = descriptor.init();
      return [initialize?.(model) ?? model, command];
    },
    update: (message, model) => descriptor.update(message, model),
    view: (model) => descriptor.view(model),
    subscriptions(model): Sub<M> {
      return descriptor.subscriptions?.(model) ?? SubBuilder.none();
    },
  };
}

function clickText<Model, M>(app: TestAppHandle<Model, M>, needle: string, modifiers?: KeyModifiers): void {
  const lines = app.lastFrame().split('\n');
  const row = lines.findIndex((line) => line.includes(needle));
  if (row < 0) throw new Error(`Could not find ${JSON.stringify(needle)} in:\n${app.lastFrame()}`);
  app.click(lines[row]!.indexOf(needle), row, 'left', modifiers);
}

describe('preview interaction parity', () => {
  it('breadcrumbs activate the pointed segment or keyboard cursor', () => {
    const build = (): TestAppHandle<BreadcrumbModel, BreadcrumbMsg> =>
      createTestApp(
        asApp(
          breadcrumb({
            items: [
              { label: 'Home', key: 'home' },
              { label: 'Settings', key: 'settings' },
            ],
            focused: true,
          }),
        ),
      );
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'activate the first breadcrumb segment',
          byMouse: (app) => clickText(app, 'Home'),
          byKey: (app) => {
            app.pressKey('left');
            app.pressKey('enter');
          },
          predicate: (model) => model.selectedIndex === 0,
        },
      ]),
    ).not.toThrow();
  });

  it('tabs select by mouse or keyboard', () => {
    const build = (): TestAppHandle<TabsModel, TabsMsg> =>
      createTestApp(
        asApp(
          tabs({
            tabs: [
              { label: 'Home', key: 'home' },
              { label: 'Settings', key: 'settings' },
            ],
            focused: true,
          }),
        ),
      );
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'select the next tab',
          byMouse: (app) => clickText(app, 'Settings'),
          byKey: (app) => app.pressKey('right'),
          predicate: (model) => model.active === 1,
        },
      ]),
    ).not.toThrow();
  });

  it('pagination advances by mouse or keyboard', () => {
    const build = (): TestAppHandle<PaginationModel, PaginationMsg> => createTestApp(asApp(pagination({ total: 30, pageSize: 10 })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'advance one page',
          byMouse: (app) => {
            const line = app.lastFrame().split('\n')[0] ?? '';
            app.click(line.lastIndexOf('>'), 0);
          },
          byKey: (app) => app.pressKey('right'),
          predicate: (model) => model.current === 2,
        },
      ]),
    ).not.toThrow();
  });

  it('tree rows select by mouse or keyboard', () => {
    const build = (): TestAppHandle<TreeModel, TreeMsg> => createTestApp(asApp(tree({ nodes: [{ label: 'Root', key: 'root' }], focused: true })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'select a tree row',
          byMouse: (app) => clickText(app, 'Root'),
          byKey: (app) => app.pressKey('enter'),
          predicate: (model) => model.selected === 'root',
        },
      ]),
    ).not.toThrow();
  });

  it('data table rows select by mouse or keyboard', () => {
    const rows = [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
    ];
    const build = (): TestAppHandle<DataTableModel, DataTableMsg> => {
      const descriptor = dataTable({
        columns: [{ key: 'name', header: 'Name', width: 10 }],
        data: rows,
        getKey: (row) => row.id,
      });
      return createTestApp(asApp(descriptor, (model) => ({ ...model, focused: true })));
    };
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'select the first row',
          byMouse: (app) => clickText(app, 'Alpha'),
          byKey: (app) => app.pressKey('space'),
          predicate: (model) => model.selectedKeys.has('alpha'),
        },
      ]),
    ).not.toThrow();
  });

  it('data table rows accumulate explicit mouse and keyboard selections in multi-select mode', () => {
    const rows = [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
    ];
    const build = (): TestAppHandle<DataTableModel, DataTableMsg> => {
      const descriptor = dataTable({
        columns: [{ key: 'name', header: 'Name', width: 10 }],
        data: rows,
        getKey: (row) => row.id,
        multiSelect: true,
      });
      return createTestApp(asApp(descriptor, (model) => ({ ...model, focused: true })));
    };
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'select two independent rows',
          byMouse: (app) => {
            clickText(app, 'Alpha');
            clickText(app, 'Beta');
          },
          byKey: (app) => {
            app.pressKey('space');
            app.pressKey('down');
            app.pressKey('space');
          },
          predicate: (model) => model.selectedKeys.has('alpha') && model.selectedKeys.has('beta'),
        },
      ]),
    ).not.toThrow();
  });

  it('data table consumes real Shift+click modifiers for contiguous range selection', () => {
    const rows = [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
      { id: 'gamma', name: 'Gamma' },
      { id: 'delta', name: 'Delta' },
    ];
    const descriptor = dataTable({
      columns: [{ key: 'name', header: 'Name', width: 10 }],
      data: rows,
      getKey: (row) => row.id,
      multiSelect: true,
    });
    const app = createTestApp(asApp(descriptor, (model) => ({ ...model, focused: true })));

    clickText(app, 'Beta');
    clickText(app, 'Delta', { shift: true });

    expect([...app.model.selectedKeys]).toEqual(['beta', 'gamma', 'delta']);
    expect([...app.model.rangeSelectionKeys]).toEqual(['beta', 'gamma', 'delta']);
    app.stop();
  });

  it('radio groups select the clicked option instead of cycling', () => {
    const options = [
      { label: 'Compact', value: 'compact' },
      { label: 'Balanced', value: 'balanced' },
      { label: 'Dense', value: 'dense' },
    ];
    const build = (): TestAppHandle<RadioGroupModel, RadioGroupMsg> => createTestApp(asApp(radioGroup({ options, focused: true })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'select the third option directly',
          byMouse: (app) => clickText(app, 'Dense'),
          byKey: (app) => {
            app.pressKey('down');
            app.pressKey('down');
            app.pressKey('enter');
          },
          predicate: (model) => model.selected === 2,
        },
      ]),
    ).not.toThrow();
  });

  it('sliders use the clicked track cell as the value source', () => {
    const build = (): TestAppHandle<SliderModel, SliderMsg> =>
      createTestApp(asApp(slider({ min: 0, max: 100, step: 10, width: 11, value: 50 }), (model) => ({ ...model, focused: true })));
    const app = build();
    try {
      app.click(0, 0);
      expect(app.model.value).toBe(0);
      app.click(10, 0);
      expect(app.model.value).toBe(100);
    } finally {
      app.stop();
    }
  });

  it('drawers dismiss by mouse or Escape', () => {
    const build = (): TestAppHandle<DrawerModel, DrawerMsg> =>
      createTestApp(asApp(drawer({ content: text('Drawer content') as VNode, title: 'Details', variant: 'overlay' })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'dismiss the drawer',
          byMouse: (app) => {
            const { cols, rows } = app.terminal.getSize();
            app.click(cols - 1, rows - 1);
          },
          byKey: (app) => app.pressKey('escape'),
          predicate: (model) => !model.open,
        },
      ]),
    ).not.toThrow();
  });

  it('modals dismiss by mouse or Escape', () => {
    const build = (): TestAppHandle<ModalModel, ModalMsg> => createTestApp(asApp(modal({ title: 'Details', content: text('Modal content') })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'dismiss the modal',
          byMouse: (app) => clickText(app, '[esc] close'),
          byKey: (app) => app.pressKey('escape'),
          predicate: (model) => !model.open,
        },
      ]),
    ).not.toThrow();
  });

  it('confirmation dialogs confirm by mouse or keyboard', () => {
    const build = (): TestAppHandle<ConfirmDialogModel, ConfirmDialogMsg> =>
      createTestApp(asApp(confirmDialog({ title: 'Proceed?', message: 'Continue with the operation?' })));
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'confirm the dialog',
          byMouse: (app) => clickText(app, '[Confirm]'),
          byKey: (app) => app.pressKey('y'),
          predicate: (model) => !model.open,
        },
      ]),
    ).not.toThrow();
  });

  it('command palette rows execute by direct mouse selection or keyboard', () => {
    const build = (): TestAppHandle<CommandPaletteModel, CommandPaletteMsg> => {
      const descriptor = commandPalette({
        commands: [
          { id: 'first', label: 'First action', msg: 'first' },
          { id: 'second', label: 'Second action', msg: 'second' },
        ],
      });
      return createTestApp({
        init() {
          const [model, command] = descriptor.init();
          const [opened] = descriptor.update({ type: 'cp-open' }, model);
          return [opened, command];
        },
        update: (message, model) => descriptor.update(message, model),
        view: (model) => descriptor.view(model),
        subscriptions: (model) => descriptor.subscriptions?.(model) ?? SubBuilder.none(),
      });
    };
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'execute the second command',
          byMouse: (app) => clickText(app, 'Second action'),
          byKey: (app) => {
            app.pressKey('down');
            app.pressKey('enter');
          },
          predicate: (model) => !model.palette.open,
        },
      ]),
    ).not.toThrow();
  });

  it('toasts dismiss by mouse or Escape', () => {
    const build = (): TestAppHandle<ToastModel, ToastMsg> => {
      const manager = createToastManager();
      return createTestApp(asApp(manager, (model) => manager.push(model, { message: 'Saved', level: 'success', duration: 60_000 })));
    };
    expect(() =>
      assertMouseKeyboardParity(build, [
        {
          name: 'dismiss the latest toast',
          byMouse: (app) => clickText(app, '[x]'),
          byKey: (app) => app.pressKey('escape'),
          predicate: (model) => model.toasts.length === 0,
        },
      ]),
    ).not.toThrow();
  });
});
