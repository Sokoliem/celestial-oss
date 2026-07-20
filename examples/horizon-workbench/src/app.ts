import { type AppConfig, Cmd, column, defaultTheme, event, getTerminalSize, row, runtime, style, Sub, text, type VNode } from '@celestial/core';
import {
  createTabBar,
  createWindowManager,
  createWorkspaceModel,
  getActiveWorkspace,
  type ManagedWindow,
  panel,
  shellLayout,
  splitPane,
  type WindowManager,
  windowManagerUpdate,
  type WorkspaceModel,
  workspaceUpdate,
  withFloatingWindows,
} from '@celestial/horizon';
import { badge, type Command, commandPalette, type CommandPaletteModel, type CommandPaletteMsg, drawer, progressBar } from '@celestial/ui';

export type WorkspaceId = 'build' | 'observe' | 'review';

export interface WorkbenchWorkspace {
  id: WorkspaceId;
  name: string;
  tabs: readonly string[];
}

export interface HorizonWorkbenchModel {
  workspaces: WorkspaceModel<WorkbenchWorkspace>;
  activeTabs: Record<WorkspaceId, number>;
  ratio: number;
  focusedPane: 0 | 1;
  inspectorOpen: boolean;
  windows: WindowManager;
  tick: number;
  cols: number;
  rows: number;
  palette: CommandPaletteModel;
  lastAction: string;
}

export type HorizonWorkbenchMsg =
  | { type: 'switch-workspace'; index: number }
  | { type: 'next-pane'; direction: 1 | -1 }
  | { type: 'resize-split'; delta: number }
  | { type: 'select-tab'; index: number }
  | { type: 'toggle-inspector' }
  | { type: 'maximize-inspector' }
  | { type: 'window-action'; action: 'close' | 'minimize' | 'maximize' | 'restore' }
  | { type: 'palette'; msg: CommandPaletteMsg }
  | { type: 'mouse'; handlerTag: string }
  | { type: 'tick' }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'escape' }
  | { type: 'reset' }
  | { type: 'quit' }
  | { type: 'noop' };

export interface HorizonWorkbenchOptions {
  initialSize?: { cols: number; rows: number };
  fast?: boolean;
}

const workspaceDefinitions: WorkbenchWorkspace[] = [
  { id: 'build', name: 'Build', tabs: ['Pipeline', 'Output'] },
  { id: 'observe', name: 'Observe', tabs: ['Metrics', 'Events'] },
  { id: 'review', name: 'Review', tabs: ['Changes', 'Checklist'] },
];

const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted, dim: true });
const actionStyle = style({ color: defaultTheme.colors.interactive, bold: true });
const successStyle = style({ color: defaultTheme.colors.tones.success });
const warningStyle = style({ color: defaultTheme.colors.tones.warning });

function activeWorkspace(model: HorizonWorkbenchModel): WorkbenchWorkspace {
  return getActiveWorkspace(model.workspaces) ?? workspaceDefinitions[0]!;
}

function action(id: string, label: string, shortcut?: string): VNode {
  const node = event(
    `workbench-action:${id}`,
    text(`[${label}]`, actionStyle),
    { onClick: `workbench-action:${id}` },
    { label, intent: id, affordances: ['click'], cursor: 'pointer', keyboardHint: shortcut },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function inspectorWindow(model: HorizonWorkbenchModel): ManagedWindow {
  const existing = model.windows.windows.find((window) => window.id === 'inspector');
  return {
    id: 'inspector',
    title: 'Inspector',
    content: inspectorContent(model),
    x: existing?.x ?? Math.max(2, model.cols - 48),
    y: existing?.y ?? 4,
    width: existing?.width ?? 44,
    height: existing?.height ?? 14,
    zIndex: existing?.zIndex ?? 20,
    mode: existing?.mode ?? 'normal',
    role: 'window',
    focused: true,
    closable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    resizable: true,
    draggable: true,
    minimized: existing?.minimized ?? false,
    maximized: existing?.maximized ?? false,
    restoreBounds: existing?.restoreBounds,
    chrome: { showTitle: true, showClose: true, showMinimize: true, showMaximize: true, showFullscreen: false },
  };
}

function inspectorContent(model: HorizonWorkbenchModel): VNode {
  const workspace = activeWorkspace(model);
  const window = model.windows.windows.find((candidate) => candidate.id === 'inspector');
  return column(
    text(`Workspace: ${workspace.name}`),
    text(`Active tab: ${workspace.tabs[model.activeTabs[workspace.id]]}`),
    text(`Split ratio: ${Math.round(model.ratio * 100)} / ${Math.round((1 - model.ratio) * 100)}`),
    text(`Viewport: ${model.cols} x ${model.rows}`),
    text(`Window mode: ${window?.mode ?? 'normal'}`),
    text(`Frame tick: ${model.tick}`, mutedStyle),
  );
}

function pipelineContent(model: HorizonWorkbenchModel): VNode {
  const completed = Math.min(1, (model.tick % 20) / 16);
  return column(
    row(text('compile  '), badge({ label: 'ready', variant: 'success', size: 'sm' }).view({ visible: true })),
    progressBar({ value: completed, width: 24, label: 'tests' }),
    row(
      text('package  '),
      badge({ label: completed > 0.8 ? 'ready' : 'waiting', variant: completed > 0.8 ? 'success' : 'info', size: 'sm' }).view({ visible: true }),
    ),
  );
}

function workspaceTabContent(model: HorizonWorkbenchModel, workspace: WorkbenchWorkspace, index: number): VNode {
  if (workspace.id === 'build') {
    return index === 0
      ? pipelineContent(model)
      : column(text('Build output', headingStyle), text(`tick ${model.tick}: public surface compiled`), text(`tick ${model.tick}: demo fixtures verified`));
  }
  if (workspace.id === 'observe') {
    return index === 0
      ? column(
          text(`Render budget  ${6 + (model.tick % 5)} ms`),
          progressBar({ value: 0.58 + (model.tick % 4) / 20, width: 24, label: 'CPU' }),
          progressBar({ value: 0.42 + (model.tick % 3) / 20, width: 24, label: 'heap' }),
        )
      : column(
          text('Deterministic event stream', headingStyle),
          ...Array.from({ length: 6 }, (_, offset) => text(`event ${Math.max(0, model.tick - offset)}: frame committed`)),
        );
  }
  return index === 0
    ? column(text('M  examples/horizon-workbench/src/app.ts', warningStyle), text('A  responsive workspaces'), text('A  PTY validation'))
    : column(
        text('Preview checklist', headingStyle),
        text('[x] root-only imports', successStyle),
        text('[x] Escape dismissal', successStyle),
        text('[x] responsive breakpoints', successStyle),
      );
}

function tabbedWorkspace(model: HorizonWorkbenchModel): VNode {
  const workspace = activeWorkspace(model);
  const activeIndex = model.activeTabs[workspace.id];
  return createTabBar({
    tabs: workspace.tabs.map((label, index) => ({ id: `${workspace.id}:${index}`, label, content: workspaceTabContent(model, workspace, index) })),
    active: `${workspace.id}:${activeIndex}`,
    onSelect: (id) => `workbench-tab:${id}`,
  });
}

function activityPane(model: HorizonWorkbenchModel): VNode {
  const workspace = activeWorkspace(model);
  return column(
    text(`${workspace.name} activity`, headingStyle),
    text(`frame ${model.tick}: layout resolved`),
    text(`frame ${Math.max(0, model.tick - 1)}: input reconciled`),
    text(`frame ${Math.max(0, model.tick - 2)}: subscriptions stable`),
    text(''),
    text('This stream is deterministic and offline.', mutedStyle),
  );
}

function workspaceBar(model: HorizonWorkbenchModel): VNode {
  const workspace = activeWorkspace(model);
  return createTabBar({
    tabs: workspaceDefinitions.map((definition) => ({ id: definition.id, label: definition.name, content: text('') })),
    active: workspace.id,
    onSelect: (id) => `workbench-workspace:${id}`,
  });
}

function createInspector(manager: WindowManager, model: HorizonWorkbenchModel): WindowManager {
  if (manager.windows.some((window) => window.id === 'inspector')) return manager;
  return windowManagerUpdate({ type: 'create-window', window: inspectorWindow({ ...model, windows: manager }) }, manager);
}

function closeInspector(manager: WindowManager): WindowManager {
  return windowManagerUpdate({ type: 'close-window', id: 'inspector', reason: 'dismissed', policy: 'remove' }, manager);
}

export function createHorizonWorkbenchApp(options: HorizonWorkbenchOptions = {}): AppConfig<HorizonWorkbenchModel, HorizonWorkbenchMsg> {
  const terminalSize = options.initialSize ?? getTerminalSize();
  const fast = options.fast ?? process.env['CELESTIAL_DEMO_FAST'] === '1';
  const paletteCommands: Array<Command<HorizonWorkbenchMsg>> = [
    { id: 'build', label: 'Open Build workspace', category: 'Workspaces', shortcut: '1', msg: { type: 'switch-workspace', index: 0 } },
    { id: 'observe', label: 'Open Observe workspace', category: 'Workspaces', shortcut: '2', msg: { type: 'switch-workspace', index: 1 } },
    { id: 'review', label: 'Open Review workspace', category: 'Workspaces', shortcut: '3', msg: { type: 'switch-workspace', index: 2 } },
    { id: 'inspector', label: 'Toggle inspector', category: 'Windows', shortcut: 'I', msg: { type: 'toggle-inspector' } },
    { id: 'reset', label: 'Reset layout', category: 'Layout', shortcut: 'R', msg: { type: 'reset' } },
  ];
  const paletteComponent = commandPalette<HorizonWorkbenchMsg>({ commands: paletteCommands, placeholder: 'Open a workspace or window...' });
  const [initialPalette] = paletteComponent.init();

  const freshModel = (): HorizonWorkbenchModel => ({
    workspaces: createWorkspaceModel(workspaceDefinitions),
    activeTabs: { build: 0, observe: 0, review: 0 },
    ratio: 0.52,
    focusedPane: 0,
    inspectorOpen: false,
    windows: createWindowManager([], terminalSize),
    tick: 0,
    cols: terminalSize.cols,
    rows: terminalSize.rows,
    palette: initialPalette,
    lastAction: 'Ready.',
  });

  return {
    init: () => [freshModel(), Cmd.none()],

    update(message, model) {
      switch (message.type) {
        case 'switch-workspace': {
          const workspaces = workspaceUpdate({ type: 'ws-switch', index: message.index }, model.workspaces, (_msg, workspace) => workspace);
          return [{ ...model, workspaces }, Cmd.none()];
        }
        case 'next-pane':
          return [{ ...model, focusedPane: model.focusedPane === 0 ? 1 : 0 }, Cmd.none()];
        case 'resize-split':
          return [{ ...model, ratio: Math.max(0.25, Math.min(0.75, model.ratio + message.delta)) }, Cmd.none()];
        case 'select-tab': {
          const workspace = activeWorkspace(model);
          const index = Math.max(0, Math.min(workspace.tabs.length - 1, message.index));
          return [{ ...model, activeTabs: { ...model.activeTabs, [workspace.id]: index } }, Cmd.none()];
        }
        case 'toggle-inspector': {
          if (model.inspectorOpen) return [{ ...model, inspectorOpen: false, windows: closeInspector(model.windows) }, Cmd.none()];
          return [{ ...model, inspectorOpen: true, windows: createInspector(model.windows, model) }, Cmd.none()];
        }
        case 'maximize-inspector': {
          if (!model.inspectorOpen) return [model, Cmd.none()];
          const target = model.windows.windows.find((window) => window.id === 'inspector');
          const type = target?.mode === 'maximized' ? 'restore-window' : 'maximize-window';
          return [{ ...model, windows: windowManagerUpdate({ type, id: 'inspector' }, model.windows) }, Cmd.none()];
        }
        case 'window-action': {
          if (message.action === 'close') return [{ ...model, inspectorOpen: false, windows: closeInspector(model.windows) }, Cmd.none()];
          const type = `${message.action}-window` as 'minimize-window' | 'maximize-window' | 'restore-window';
          const windows = windowManagerUpdate({ type, id: 'inspector' }, model.windows);
          return [{ ...model, inspectorOpen: message.action === 'minimize' ? false : model.inspectorOpen, windows }, Cmd.none()];
        }
        case 'palette': {
          const selectedId = message.msg.type === 'cp-select' ? model.palette.palette.filteredIds[model.palette.palette.selectedIndex] : undefined;
          const selectedCommand = paletteCommands.find((command) => command.id === selectedId);
          const [palette, innerCmd] = paletteComponent.update(message.msg, model.palette);
          const mapped = Cmd.map(innerCmd, (msg) => ({ type: 'palette', msg }) as HorizonWorkbenchMsg);
          return [{ ...model, palette }, selectedCommand ? Cmd.batch(mapped, Cmd.msg(selectedCommand.msg)) : mapped];
        }
        case 'mouse': {
          if (message.handlerTag.startsWith('workbench-workspace:')) {
            const id = message.handlerTag.slice('workbench-workspace:'.length) as WorkspaceId;
            const index = workspaceDefinitions.findIndex((workspace) => workspace.id === id);
            return this.update({ type: 'switch-workspace', index }, model);
          }
          if (message.handlerTag.startsWith('workbench-tab:')) {
            const index = Number(message.handlerTag.split(':').at(-1));
            return this.update({ type: 'select-tab', index }, model);
          }
          if (message.handlerTag === 'workbench-action:inspector') return this.update({ type: 'toggle-inspector' }, model);
          if (message.handlerTag === 'workbench-action:commands') return this.update({ type: 'palette', msg: { type: 'cp-open' } }, model);
          if (message.handlerTag === 'window:inspector:close') return this.update({ type: 'window-action', action: 'close' }, model);
          if (message.handlerTag === 'window:inspector:minimize') return this.update({ type: 'window-action', action: 'minimize' }, model);
          if (message.handlerTag === 'window:inspector:maximize') return this.update({ type: 'window-action', action: 'maximize' }, model);
          if (message.handlerTag === 'window:inspector:restore') return this.update({ type: 'window-action', action: 'restore' }, model);
          if (model.inspectorOpen && model.cols < 80 && (message.handlerTag.endsWith(':close') || message.handlerTag.includes(':backdrop:'))) {
            return this.update({ type: 'window-action', action: 'close' }, model);
          }
          return [model, Cmd.none()];
        }
        case 'tick':
          return [{ ...model, tick: model.tick + 1 }, Cmd.none()];
        case 'resize': {
          const windows: WindowManager = {
            ...model.windows,
            bounds: { cols: message.cols, rows: message.rows },
            windows: model.windows.windows.map((window) => (window.mode === 'maximized' ? { ...window, width: message.cols, height: message.rows } : window)),
          };
          return [{ ...model, cols: message.cols, rows: message.rows, windows }, Cmd.none()];
        }
        case 'escape':
          return model.inspectorOpen
            ? [{ ...model, inspectorOpen: false, windows: closeInspector(model.windows), lastAction: 'Inspector dismissed with Escape.' }, Cmd.none()]
            : [model, Cmd.none()];
        case 'reset':
          return [
            { ...freshModel(), cols: model.cols, rows: model.rows, windows: createWindowManager([], { cols: model.cols, rows: model.rows }) },
            Cmd.none(),
          ];
        case 'quit':
          return [model, Cmd.quit()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model) {
      const workspace = activeWorkspace(model);
      const primary = panel({ title: `${workspace.name} workspace`, content: tabbedWorkspace(model), focused: model.focusedPane === 0, fill: true });
      const secondaryContent = model.cols < 120 && model.inspectorOpen ? inspectorContent(model) : activityPane(model);
      const secondary = panel({
        title: model.cols < 120 && model.inspectorOpen ? 'Inspector' : 'Activity',
        content: secondaryContent,
        focused: model.focusedPane === 1,
        fill: true,
      });
      const split = splitPane({ direction: 'horizontal', ratio: model.ratio, first: primary, second: secondary, minSize: 24 });
      const sidebar = panel({
        title: 'Navigator',
        content: column(
          ...workspaceDefinitions.map((definition, index) =>
            text(`${index + 1}  ${definition.name}`, definition.id === workspace.id ? actionStyle : undefined),
          ),
          text(''),
          text('Tab moves focus', mutedStyle),
          text('[ and ] resize', mutedStyle),
        ),
        fill: true,
      });
      const content = model.cols < 80 ? primary : split;
      const shell = shellLayout({
        header: column(
          row(
            text('Celestial Horizon Workbench', headingStyle),
            text('  '),
            badge({ label: 'Horizon beta', variant: 'warning', size: 'sm' }).view({ visible: true }),
          ),
          workspaceBar(model),
        ),
        sidebar: model.cols >= 120 ? sidebar : undefined,
        content,
        statusBar: row(
          text(`${model.lastAction}  `, mutedStyle),
          action('inspector', model.inspectorOpen ? 'Close inspector' : 'Open inspector', 'I'),
          text(' '),
          action('commands', 'Commands', 'Ctrl+P'),
          text(
            `  ${model.cols}x${model.rows} | ratio ${Math.round(model.ratio * 100)}% | 1-3 workspace | Tab focus | [/] resize | I inspector | M max | R reset | Q quit`,
            mutedStyle,
          ),
        ),
        sidebarRatio: 0.2,
      });

      let base = shell;
      if (model.cols >= 120 && model.inspectorOpen) {
        const dynamicManager: WindowManager = {
          ...model.windows,
          windows: model.windows.windows.map((window) => (window.id === 'inspector' ? { ...window, content: inspectorContent(model) } : window)),
        };
        base = withFloatingWindows(shell, dynamicManager);
      }

      const layers: VNode[] = [base];
      if (model.cols < 80 && model.inspectorOpen) {
        const inspectorDrawerWidth = Math.min(model.cols, Math.min(42, Math.max(30, Math.floor(model.cols * 0.6))));
        const inspectorDrawerHeight = Math.max(12, model.rows - 2);
        const inspectorDrawer = drawer({
          title: 'Inspector',
          content: inspectorContent(model),
          position: 'right',
          variant: 'overlay',
          width: inspectorDrawerWidth,
          height: inspectorDrawerHeight,
        });
        layers.push(inspectorDrawer.view({ open: true, width: inspectorDrawerWidth, height: inspectorDrawerHeight, focusTrapActive: true }));
      }
      if (model.palette.palette.open) layers.push(paletteComponent.view(model.palette));
      return runtime.stackedLayers(...layers);
    },

    subscriptions(model) {
      const persistent = [
        Sub.resize<HorizonWorkbenchMsg>((cols, rows) => ({ type: 'resize', cols, rows })),
        Sub.timer<HorizonWorkbenchMsg>(fast ? 50 : 500, { type: 'tick' }),
      ];
      if (model.palette.palette.open) {
        return Sub.batch(
          ...persistent,
          Sub.map(paletteComponent.subscriptions?.(model.palette) ?? Sub.none<CommandPaletteMsg>(), (msg) => ({ type: 'palette', msg }) as HorizonWorkbenchMsg),
        );
      }
      return Sub.batch(
        ...persistent,
        Sub.key('1', { type: 'switch-workspace', index: 0 }),
        Sub.key('2', { type: 'switch-workspace', index: 1 }),
        Sub.key('3', { type: 'switch-workspace', index: 2 }),
        Sub.keyEvent<HorizonWorkbenchMsg>((key) => (key.key === 'tab' ? { type: 'next-pane', direction: key.shift ? -1 : 1 } : { type: 'noop' })),
        Sub.key('[', { type: 'resize-split', delta: -0.05 }),
        Sub.key(']', { type: 'resize-split', delta: 0.05 }),
        Sub.key('i', { type: 'toggle-inspector' }),
        Sub.key('m', { type: 'maximize-inspector' }),
        Sub.key('r', { type: 'reset' }),
        Sub.keyWithModifiers('p', { ctrl: true }, { type: 'palette', msg: { type: 'cp-open' } }),
        Sub.key('escape', { type: 'escape' }),
        Sub.key('q', { type: 'quit' }),
        Sub.elementMouse<HorizonWorkbenchMsg>((mouse) => ({ type: 'mouse', handlerTag: mouse.handlerTag })),
      );
    },
  };
}
