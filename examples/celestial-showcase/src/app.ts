import {
  type AppConfig,
  type AtlasCapabilities,
  Cmd,
  type Cmd as CmdEffect,
  column,
  createDragState,
  type DropTarget,
  defaultTheme,
  dragUpdate,
  event,
  getCapabilities,
  getDroppedResult,
  getTerminalSize,
  row,
  runtime,
  Sub,
  type Sub as Subscription,
  shouldAnimate,
  style,
  text,
  type VNode,
} from '@celestial/core';
import {
  beginFloatingWindowResize,
  createPip,
  createWindowManager,
  createWorkspaceModel,
  getMinimizedWindows,
  getVisibleWindows,
  hitTestFloatingWindowResizeEdge,
  hitTestWindowChromeTitleBar,
  type ManagedWindow,
  panel,
  resizeFloatingWindowFrame,
  shellLayout,
  splitPane,
  translateFloatingWindowFromDragState,
  type WindowManager,
  type WindowManagerBounds,
  windowManagerHoverAt,
  windowManagerMsgFromWindowEvent,
  windowManagerUpdate,
  windowManagerUpdateResult,
  windowShelf,
  windowShelfActionFromEvent,
  withFloatingWindows,
  withPip,
  workspaceUpdate,
} from '@celestial/horizon';
import type { ComponentDescriptor, MenuItem } from '@celestial/ui';
import { badge, contextMenuUpdate, contextMenuView, createContextMenuState, getSelectedItem, measureContextMenuLayout, progressBar } from '@celestial/ui';
import {
  createShowcaseComponents,
  GALLERY_PAGE_COUNT,
  initialComponentModels,
  renderComponentGallery,
  type ShowcaseComponents,
  UI_BUILDER_COUNT,
} from './components.js';
import {
  LABS,
  labForSmoke,
  renderCoreLab,
  renderLayersLab,
  renderMouseLab,
  renderSmokeLab,
  renderVisualsLab,
  renderWindowContent,
  renderWindowsLab,
  renderWorkflowsLab,
  SMOKE_STEPS,
  setReactiveTick,
  viewportTier,
} from './labs.js';
import type {
  CelestialShowcaseModel,
  CelestialShowcaseMsg,
  ComponentFocus,
  LabId,
  MouseDragPayload,
  ShowcaseContextAction,
  ShowcaseWorkspace,
  SmokeEvidence,
  SmokeId,
  SurfaceId,
} from './types.js';

export interface CelestialShowcaseOptions {
  initialSize?: { cols: number; rows: number };
  fast?: boolean;
}

export const SHOWCASE_MIN_COLS = 70;
export const SHOWCASE_MIN_ROWS = 32;

const SHOWCASE_TOP_INSET = 3;
const SHOWCASE_STATUS_INSET = 2;

const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const titleStyle = style({ color: defaultTheme.colors.text, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted });
const actionStyle = style({ color: defaultTheme.colors.interactive, bold: true });
const successStyle = style({ color: defaultTheme.colors.tones.success });
const warningStyle = style({ color: defaultTheme.colors.tones.warning });

const contextMenuTokens = {
  background: defaultTheme.colors.surface,
  border: defaultTheme.colors.border,
  text: defaultTheme.colors.text,
  textMuted: defaultTheme.colors.muted,
  selectedBackground: defaultTheme.states.active.bg ?? defaultTheme.colors.interactive,
  selectedText: defaultTheme.colors.inverse,
  separator: defaultTheme.colors.border,
  shortcut: defaultTheme.colors.textSoft,
};

const workspaceDefinitions: ShowcaseWorkspace[] = [
  { id: 'flight', name: 'Flight', summary: 'Operate the primary capability labs.' },
  { id: 'systems', name: 'Systems', summary: 'Inspect runtime, layout, and pointer telemetry.' },
  { id: 'verification', name: 'Verify', summary: 'Collect interactive and automated smoke receipts.' },
];

const dragTargets: DropTarget<MouseDragPayload>[] = [{ id: 'verification-bay', canDrop: (payload) => payload.id === 'verification-receipt' }];

function instrumentWindow(id: 'telemetry' | 'events', size: { cols: number; rows: number }): ManagedWindow {
  const telemetry = id === 'telemetry';
  const width = telemetry ? 44 : 42;
  const height = telemetry ? 13 : 12;
  const x = telemetry ? Math.max(24, Math.min(size.cols - width - 2, 34)) : Math.max(28, Math.min(size.cols - width - 2, 82));
  const y = telemetry ? 7 : 13;
  return {
    id,
    title: telemetry ? 'Telemetry instrument' : 'Event instrument',
    content: text('instrument starting'),
    x,
    y,
    width,
    height,
    zIndex: telemetry ? 20 : 21,
    mode: 'normal',
    role: 'window',
    workspaceId: telemetry ? 'flight' : 'systems',
    focused: !telemetry,
    closable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    resizable: true,
    draggable: true,
    chrome: { showTitle: true, showClose: true, showMinimize: true, showMaximize: true, showFullscreen: true },
  };
}

function windowBounds(manager: WindowManager, size: { cols: number; rows: number }): WindowManagerBounds {
  return {
    cols: size.cols,
    rows: size.rows,
    topInset: SHOWCASE_TOP_INSET,
    bottomInset: SHOWCASE_STATUS_INSET + (getMinimizedWindows(manager, { allWorkspaces: true }).length > 0 ? 1 : 0),
  };
}

function syncWindowBounds(manager: WindowManager, size: { cols: number; rows: number }): WindowManager {
  return windowManagerUpdate({ type: 'set-bounds', bounds: windowBounds(manager, size) }, manager);
}

function initialWindows(size: { cols: number; rows: number }, activeWorkspaceId: string): WindowManager {
  const manager = createWindowManager(
    [instrumentWindow('telemetry', size), instrumentWindow('events', size)],
    { ...size, topInset: SHOWCASE_TOP_INSET, bottomInset: SHOWCASE_STATUS_INSET },
    { activeWorkspaceId },
  );
  return syncWindowBounds(manager, size);
}

function activeLabIndex(lab: LabId): number {
  return Math.max(
    0,
    LABS.findIndex((entry) => entry.id === lab),
  );
}

const EMPTY_EVIDENCE: SmokeEvidence = {
  coreVisits: 0,
  componentChanges: 0,
  workflowAdvances: 0,
  visualVisits: 0,
  mouseClicks: 0,
  payloadDrops: 0,
  contextMenus: 0,
  layersOpened: 0,
  breakpointCrossings: 0,
  windowChanges: 0,
  helpOpens: 0,
};

const evidenceField: Record<SmokeId, keyof SmokeEvidence> = {
  core: 'coreVisits',
  component: 'componentChanges',
  workflow: 'workflowAdvances',
  visual: 'visualVisits',
  'mouse-click': 'mouseClicks',
  'mouse-drag': 'payloadDrops',
  'context-menu': 'contextMenus',
  layer: 'layersOpened',
  adaptive: 'breakpointCrossings',
  window: 'windowChanges',
  help: 'helpOpens',
};

function completedFromEvidence(evidence: SmokeEvidence): Set<SmokeId> {
  return new Set((Object.entries(evidenceField) as Array<[SmokeId, keyof SmokeEvidence]>).filter(([, field]) => evidence[field] > 0).map(([id]) => id));
}

function mark(model: CelestialShowcaseModel, receipt: SmokeId, action?: string): CelestialShowcaseModel {
  const field = evidenceField[receipt];
  const evidence = { ...model.evidence, [field]: model.evidence[field] + 1 };
  return { ...model, evidence, completed: completedFromEvidence(evidence), lastAction: action ?? model.lastAction };
}

function withAction(model: CelestialShowcaseModel, action: string): CelestialShowcaseModel {
  return { ...model, lastAction: action };
}

function stateChanged(before: unknown, after: unknown): boolean {
  const replacer = (_key: string, value: unknown) => (value instanceof Set ? [...value].sort() : value);
  return JSON.stringify(before, replacer) !== JSON.stringify(after, replacer);
}

function markChanged(model: CelestialShowcaseModel, before: unknown, after: unknown, receipt: SmokeId, action: string): CelestialShowcaseModel {
  return stateChanged(before, after) ? mark(model, receipt, action) : model;
}

function effectiveCapabilities(model: CelestialShowcaseModel, capabilities: AtlasCapabilities): AtlasCapabilities {
  const userReducedMotion = model.schemaForm.values['reducedMotion'] === true;
  return userReducedMotion || capabilities.reducedMotion ? { ...capabilities, reducedMotion: true } : capabilities;
}

const actionLabels: Record<string, string> = {
  help: 'Open contextual help',
  palette: 'Open command palette',
  modal: 'Open modal',
  confirm: 'Open confirmation',
  drawer: 'Open drawer',
  tooltip: 'Open tooltip',
  toast: 'Push toast',
  'gallery-prev': 'Previous component page',
  'gallery-next': 'Next component page',
  'workflow-toggle-motion': 'Toggle reduced motion',
  'workflow-prev': 'Previous workflow step',
  'workflow-next': 'Advance workflow step',
  'reopen-telemetry': 'Reopen telemetry instrument',
  'reopen-events': 'Reopen event instrument',
};

function switchLabItems(model: CelestialShowcaseModel): MenuItem<ShowcaseContextAction>[] {
  return LABS.map((lab) => ({
    label: lab.label,
    shortcut: lab.key,
    hint: lab.id === model.activeLab ? 'current' : undefined,
    disabled: lab.id === model.activeLab,
    msg: { type: 'switch-lab', lab: lab.id },
  }));
}

function sharedContextItems(model: CelestialShowcaseModel): MenuItem<ShowcaseContextAction>[] {
  const active = LABS[activeLabIndex(model.activeLab)]!;
  const next = SMOKE_STEPS.find((step) => !model.completed.has(step.id));
  return [
    { label: `Help for ${active.label}`, shortcut: '?', msg: { type: 'open-help', lab: active.id } },
    { label: 'Command palette', shortcut: 'Ctrl+P', msg: { type: 'run-action', action: 'palette' } },
    {
      label: next ? 'Next incomplete receipt' : 'All receipts verified',
      hint: next ? LABS[activeLabIndex(next.lab)]?.label : 'complete',
      disabled: !next,
      msg: next ? { type: 'next-receipt' } : undefined,
    },
    { label: '', separator: true },
    { label: 'Switch lab', submenu: switchLabItems(model) },
    { label: 'Reset Flight Deck', shortcut: 'R', msg: { type: 'reset' } },
    { label: 'Close menu', shortcut: 'Esc', msg: { type: 'close' } },
  ];
}

function contextItemsForTarget(model: CelestialShowcaseModel, target: string): MenuItem<ShowcaseContextAction>[] {
  if (target.startsWith('action:')) {
    const action = target.slice('action:'.length);
    const label = actionLabels[action] ?? action.replaceAll('-', ' ');
    return [{ label, shortcut: 'Enter', msg: { type: 'run-action', action } }, { label: '', separator: true }, ...sharedContextItems(model)];
  }

  if (target.startsWith('lab:')) {
    const labId = target.slice('lab:'.length) as LabId;
    const lab = LABS.find((entry) => entry.id === labId) ?? LABS[activeLabIndex(model.activeLab)]!;
    return [
      { label: `Open ${lab.label} lab`, shortcut: lab.key, disabled: lab.id === model.activeLab, msg: { type: 'switch-lab', lab: lab.id } },
      { label: `Open ${lab.label} help`, shortcut: '?', msg: { type: 'open-help', lab: lab.id } },
      { label: '', separator: true },
      { label: 'Switch lab', submenu: switchLabItems(model) },
      { label: 'Close menu', shortcut: 'Esc', msg: { type: 'close' } },
    ];
  }

  if (target === 'window-shelf-overflow') {
    const minimized = getMinimizedWindows(model.windows, { allWorkspaces: true });
    return [
      ...minimized.map((window) => ({
        label: `Restore ${window.title ?? window.id}`,
        hint: window.workspaceId,
        msg: { type: 'window-action' as const, id: window.id, action: 'focus' as const },
      })),
      { label: '', separator: true },
      { label: 'Close menu', shortcut: 'Esc', msg: { type: 'close' } },
    ];
  }

  if (target.startsWith('window:')) {
    const id = target.slice('window:'.length);
    const window = model.windows.windows.find((entry) => entry.id === id);
    if (window) {
      const restore = window.mode !== 'normal' || window.minimized;
      return [
        { label: `Focus ${window.title}`, msg: { type: 'window-action', id, action: 'focus' } },
        {
          label: window.minimized ? 'Restore window' : 'Minimize window',
          msg: { type: 'window-action', id, action: window.minimized ? 'restore' : 'minimize' },
        },
        {
          label: window.mode === 'maximized' ? 'Restore window size' : 'Maximize window',
          disabled: window.minimized,
          msg: { type: 'window-action', id, action: window.mode === 'maximized' ? 'restore' : 'maximize' },
        },
        {
          label: window.mode === 'fullscreen' ? 'Exit fullscreen' : 'Enter fullscreen',
          disabled: window.minimized,
          msg: { type: 'window-action', id, action: window.mode === 'fullscreen' ? 'restore' : 'fullscreen' },
        },
        { label: '', separator: true },
        { label: restore ? 'Focus restored window' : 'Window is ready', hint: window.mode, disabled: true },
        { label: 'Close window', msg: { type: 'window-action', id, action: 'close' } },
        { label: 'Close menu', shortcut: 'Esc', msg: { type: 'close' } },
      ];
    }
  }

  return sharedContextItems(model);
}

function openContextMenu(model: CelestialShowcaseModel, target: string, x: number, y: number, trigger = 'right-click'): CelestialShowcaseModel {
  const cancelled = cancelActiveInteractions(model, true);
  const contextMenu = contextMenuUpdate({ type: 'ctx-open', x, y, items: contextItemsForTarget(cancelled, target) }, cancelled.contextMenu);
  return mark({ ...cancelled, contextMenu, contextMenuSource: target }, 'context-menu', `Opened ${trigger} context menu for ${target}.`);
}

function contextMenuRowAt(model: CelestialShowcaseModel, x: number, y: number): number | null {
  const layout = measureContextMenuLayout({ state: model.contextMenu, viewport: { cols: model.cols, rows: model.rows } });
  if (!layout || x <= layout.x || x >= layout.x + layout.width - 1 || y <= layout.y || y >= layout.y + layout.height - 1) return null;
  const rowIndex = layout.firstItemIndex + y - layout.y - 1;
  return rowIndex >= layout.firstItemIndex && rowIndex < layout.firstItemIndex + layout.rowCount ? rowIndex : null;
}

function recordDemoDrop(model: CelestialShowcaseModel): CelestialShowcaseModel {
  const result = getDroppedResult(model.dragDemo);
  if (!result) return model;
  return mark(
    {
      ...model,
      droppedReceipts: model.droppedReceipts + 1,
      lastDroppedReceipt: `${result.data.label} accepted`,
      pointer: { ...model.pointer, target: `drop:${result.targetId}` },
    },
    'mouse-drag',
    `Dropped ${result.data.label} into the verification bay.`,
  );
}

function dismissSurfaces(model: CelestialShowcaseModel): CelestialShowcaseModel {
  return {
    ...model,
    helpOpen: false,
    contextMenu: createContextMenuState<ShowcaseContextAction>(),
    contextMenuSource: null,
    galleryContextMenu: contextMenuUpdate({ type: 'ctx-close' }, model.galleryContextMenu),
    tooltip: { ...model.tooltip, visible: false },
    modal: { ...model.modal, open: false },
    confirm: { ...model.confirm, open: false },
    drawer: { ...model.drawer, open: false, focusTrapActive: false },
    palette: { ...model.palette, palette: { ...model.palette.palette, open: false } },
  };
}

function withComponentFocus(model: CelestialShowcaseModel, focus: ComponentFocus): CelestialShowcaseModel {
  return {
    ...model,
    componentFocus: focus,
    textInput: { ...model.textInput, focused: focus === 'text' },
    textarea: { ...model.textarea, focused: focus === 'textarea' },
    checkbox: { ...model.checkbox, focused: focus === 'checkbox' },
    radio: { ...model.radio, focused: focus === 'radio' },
    select: { ...model.select, focused: focus === 'select', open: focus === 'select' ? model.select.open : false },
    toggle: { ...model.toggle, focused: focus === 'toggle' },
    slider: { ...model.slider, focused: focus === 'slider' },
    tabs: { ...model.tabs, focused: focus === 'tabs' },
    table: { ...model.table, focused: focus === 'table' },
    tree: { ...model.tree, focused: focus === 'tree' },
  };
}

function cancelActiveInteractions(model: CelestialShowcaseModel, dismissLayered = false): CelestialShowcaseModel {
  const next = dismissLayered
    ? dismissSurfaces(model)
    : {
        ...model,
        contextMenu: createContextMenuState<ShowcaseContextAction>(),
        contextMenuSource: null,
        galleryContextMenu: contextMenuUpdate({ type: 'ctx-close' }, model.galleryContextMenu),
      };
  return withComponentFocus(
    {
      ...next,
      dragDemo: next.dragDemo.phase === 'dragging' ? dragUpdate({ type: 'drag-cancel' }, next.dragDemo, dragTargets) : next.dragDemo,
      windowDrag: null,
      hoveredRegion: null,
      shelfHoveredWindowId: null,
    },
    'none',
  );
}

function workspaceModelForManager(model: CelestialShowcaseModel, manager: WindowManager): CelestialShowcaseModel['workspaces'] {
  const index = workspaceDefinitions.findIndex((workspace) => workspace.id === manager.activeWorkspaceId);
  if (index < 0 || index === model.workspaces.activeIndex) return model.workspaces;
  return workspaceUpdate({ type: 'ws-switch', index }, model.workspaces, (_msg, workspace) => workspace);
}

function sampleGalleryContextMenu(open: boolean, model: CelestialShowcaseModel): CelestialShowcaseModel['galleryContextMenu'] {
  if (!open) return contextMenuUpdate({ type: 'ctx-close' }, model.galleryContextMenu);
  return contextMenuUpdate(
    {
      type: 'ctx-open',
      x: 0,
      y: 0,
      items: [
        { label: 'Open', shortcut: 'Enter', msg: 'open' },
        { label: 'Inspect', shortcut: 'I', msg: 'inspect' },
      ],
    },
    model.galleryContextMenu,
  );
}

function mapDescriptor<Model, Msg>(
  descriptor: ComponentDescriptor<Model, Msg>,
  message: Msg,
  model: Model,
  wrap: (message: Msg) => CelestialShowcaseMsg,
): [Model, CmdEffect<CelestialShowcaseMsg>] {
  const [next, command] = descriptor.update(message, model);
  return [next, Cmd.map(command, wrap)];
}

function mapSubscriptions<Model, Msg>(
  descriptor: ComponentDescriptor<Model, Msg>,
  model: Model,
  wrap: (message: Msg) => CelestialShowcaseMsg,
): Subscription<CelestialShowcaseMsg> {
  return Sub.map(descriptor.subscriptions?.(model) ?? Sub.none<Msg>(), wrap);
}

function layerPip(
  base: VNode,
  content: VNode,
  width: number,
  height: number,
  model: CelestialShowcaseModel,
  position: 'center' | 'right' = 'center',
  zIndex = 80,
  surfaceId = 'surface',
  clickAway = true,
): VNode {
  const horizontalMargin = model.cols > 2 ? 1 : 0;
  const verticalMargin = model.rows > 2 ? 1 : 0;
  const surfaceWidth = Math.max(1, Math.min(width, model.cols - horizontalMargin * 2));
  const measuredHeight = runtime.measure(content, surfaceWidth).height;
  const surfaceHeight = Math.max(1, Math.min(Math.max(height, measuredHeight), model.rows - verticalMargin * 2));
  const x = position === 'right' ? Math.max(0, model.cols - surfaceWidth - horizontalMargin) : Math.max(0, Math.floor((model.cols - surfaceWidth) / 2));
  const y = Math.max(0, Math.floor((model.rows - surfaceHeight) / 2));
  return withPip(
    base,
    createPip({
      content,
      x,
      y,
      width: surfaceWidth,
      height: surfaceHeight,
      zIndex,
      surfaceId,
      onClickAway: clickAway ? `showcase-click-away:${surfaceId}` : undefined,
    }),
    {
      cols: model.cols,
      rows: model.rows,
    },
  );
}

function actionNode(model: CelestialShowcaseModel, id: string, label: string, shortcut?: string): VNode {
  const hovered = model.hoveredRegion === `action:${id}`;
  const node = event(
    `showcase-action:${id}`,
    text(`[${label}]`, hovered ? style({ color: defaultTheme.colors.inverse, background: defaultTheme.colors.interactive, bold: true }) : actionStyle),
    {
      onClick: `showcase-action:${id}`,
      onRightClick: `showcase-context:action:${id}`,
      onMouseEnter: `showcase-hover:action:${id}`,
      onMouseLeave: `showcase-leave:action:${id}`,
    },
    { label, intent: id, affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: shortcut },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function labTab(model: CelestialShowcaseModel, lab: (typeof LABS)[number], active: boolean): VNode {
  const hovered = model.hoveredRegion === `lab:${lab.id}`;
  const node = event(
    `showcase-lab:${lab.id}`,
    text(
      `${active ? '[' : ' '}${lab.key} ${lab.label}${active ? ']' : ' '}`,
      hovered ? style({ color: defaultTheme.colors.inverse, background: defaultTheme.colors.interactive, bold: true }) : active ? actionStyle : mutedStyle,
    ),
    {
      onClick: `showcase-lab:${lab.id}`,
      onRightClick: `showcase-context:lab:${lab.id}`,
      onMouseEnter: `showcase-hover:lab:${lab.id}`,
      onMouseLeave: `showcase-leave:lab:${lab.id}`,
    },
    { label: `Open ${lab.label} lab`, intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: lab.key },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'tab', label: lab.label, selected: active } });
  return node;
}

function missionRail(model: CelestialShowcaseModel): VNode {
  return column(
    text('MISSION RAIL', headingStyle),
    text(''),
    ...LABS.flatMap((lab) => [
      labTab(model, lab, model.activeLab === lab.id),
      text(`   ${lab.summary}`, model.activeLab === lab.id ? titleStyle : mutedStyle),
      text(''),
    ]),
    progressBar({ label: 'receipts', value: model.completed.size / SMOKE_STEPS.length, width: 18 }),
    text(`${model.completed.size}/${SMOKE_STEPS.length} verified`, model.completed.size === SMOKE_STEPS.length ? successStyle : mutedStyle),
  );
}

function adaptiveContext(model: CelestialShowcaseModel): VNode {
  const active = LABS[activeLabIndex(model.activeLab)]!;
  const next = SMOKE_STEPS.find((step) => !model.completed.has(step.id));
  const front = getVisibleWindows(model.windows)[0];
  return panel({
    title: 'Context',
    content: column(
      text('MEDIUM SPLIT', headingStyle),
      text(active.summary, undefined, { wrap: true }),
      text(''),
      text('Next receipt', titleStyle),
      text(next?.instruction ?? 'All interactive receipts complete.', next ? mutedStyle : successStyle, { wrap: true }),
      text(''),
      text('Front window', titleStyle),
      text(front ? `${front.title}: ${front.mode}` : 'none', mutedStyle, { wrap: true }),
      ...(front && model.activeLab === 'windows' ? [renderWindowContent(model, front.id)] : []),
      text(''),
      actionNode(model, 'help', 'Help', '?'),
    ),
    fill: true,
  });
}

function minimumViewport(model: CelestialShowcaseModel): VNode {
  return panel({
    title: 'Resize required',
    content: column(
      text('CELESTIAL FLIGHT DECK', headingStyle),
      text(''),
      text('The terminal is below the supported showcase viewport.', warningStyle, { wrap: true }),
      text(`${model.cols}x${model.rows} detected; minimum ${SHOWCASE_MIN_COLS}x${SHOWCASE_MIN_ROWS}.`, mutedStyle, { wrap: true }),
      text('Resize to continue. Current lab state, windows, controls, and smoke receipts are preserved.', mutedStyle, { wrap: true }),
      text(''),
      text(`Current lab: ${LABS[activeLabIndex(model.activeLab)]?.label ?? model.activeLab}`, titleStyle),
      text(`Last action: ${model.lastAction}`, mutedStyle, { wrap: true }),
      text(''),
      text('Q quits | Escape dismisses the top surface', actionStyle, { wrap: true }),
    ),
    focused: true,
    fill: true,
  });
}

function composeSurfaces(base: VNode, components: ShowcaseComponents, model: CelestialShowcaseModel): VNode {
  let layered = base;
  if (model.toast.toasts.length) {
    layered = components.toastManager.layer(
      layered,
      model.toast,
      { cols: model.cols, rows: model.rows },
      { width: Math.min(52, Math.max(28, model.cols - 4)), zIndex: 60 },
    );
  }
  if (model.tooltip.visible) layered = layerPip(layered, components.tooltipComponent.view(model.tooltip), 48, 7, model, 'center', 70, 'tooltip');
  if (model.modal.open) layered = layerPip(layered, components.modalComponent.view(model.modal), 54, 10, model, 'center', 80, 'modal');
  if (model.confirm.open) layered = layerPip(layered, components.confirmComponent.view(model.confirm), 48, 10, model, 'center', 85, 'confirm');
  if (model.palette.palette.open) {
    layered = layerPip(
      layered,
      components.paletteComponent.view(model.palette),
      Math.min(70, Math.max(46, model.cols - 8)),
      12,
      model,
      'center',
      90,
      'palette',
    );
  }

  const layers: VNode[] = [layered];
  if (model.helpOpen) {
    const helpWidth = Math.min(model.cols, Math.max(30, Math.min(46, Math.floor(model.cols * 0.62))));
    layers.push(components.helpDrawers[model.activeLab].view({ open: true, width: helpWidth, height: Math.max(12, model.rows - 2), focusTrapActive: true }));
  }
  if (model.drawer.open) {
    const drawerWidth = Math.min(model.cols, Math.max(28, Math.min(42, Math.floor(model.cols * 0.58))));
    layers.push(components.drawerComponent.view({ ...model.drawer, width: drawerWidth, height: Math.max(12, model.rows - 2), focusTrapActive: true }));
  }
  const composed = runtime.stackedLayers(...layers);
  if (!model.contextMenu.open) return composed;

  const menu = contextMenuView({
    state: model.contextMenu,
    tokens: contextMenuTokens,
    viewport: { cols: model.cols, rows: model.rows },
    zIndex: 120,
  });
  if (!menu || menu.kind !== 'overlay') return composed;

  const shielded = event(
    'showcase-context-menu-backdrop',
    composed,
    {
      onClickCapture: 'showcase-context-menu:dismiss',
      onRightClickCapture: 'showcase-context-menu:dismiss',
    },
    { label: 'Dismiss context menu', intent: 'dismiss', affordances: ['click'], cursor: 'default' },
  );
  const interactiveMenu = event(
    'showcase-context-menu-surface',
    menu.child,
    {
      onClick: 'showcase-context-menu:activate',
      onRightClick: 'showcase-context-menu:activate',
      onMouseMove: 'showcase-context-menu:hover',
      onScroll: 'showcase-context-menu:scroll',
    },
    { label: 'Flight Deck context menu', intent: 'select', affordances: ['hover', 'click', 'scroll'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(interactiveMenu, { a11y: { role: 'menu', label: 'Flight Deck context menu' } });
  return runtime.layerStack(shielded, { ...menu, child: interactiveMenu });
}

function renderActiveLab(components: ShowcaseComponents, model: CelestialShowcaseModel, caps: ReturnType<typeof getCapabilities>): VNode {
  switch (model.activeLab) {
    case 'core':
      return renderCoreLab(model, caps);
    case 'components':
      return column(
        row(
          actionNode(model, 'gallery-prev', 'Previous', '['),
          text(`  page ${model.componentPage + 1}/${GALLERY_PAGE_COUNT}  `, mutedStyle),
          actionNode(model, 'gallery-next', 'Next', ']'),
          text('  '),
          badge({ label: `${UI_BUILDER_COUNT} public builders`, variant: 'success', size: 'sm' }).view({ visible: true }),
        ),
        renderComponentGallery(components, model),
      );
    case 'workflows':
      return renderWorkflowsLab(components, model);
    case 'visuals':
      return renderVisualsLab(model, caps);
    case 'mouse':
      return renderMouseLab(model);
    case 'layers':
      return renderLayersLab(model);
    case 'windows':
      return renderWindowsLab(model);
    case 'smoke':
      return renderSmokeLab(model);
  }
}

function dynamicWindows(model: CelestialShowcaseModel, themeCtx: ReturnType<typeof runtime.createThemeContext>): WindowManager {
  return {
    ...model.windows,
    windows: model.windows.windows.map((window) => ({
      ...window,
      chrome: { ...window.chrome, themeCtx },
      content: event(
        `showcase-context-window-${window.id}`,
        renderWindowContent(model, window.id),
        { onRightClick: `showcase-context:window:${window.id}` },
        { label: `${window.title} context menu`, intent: 'menu', affordances: ['click'], cursor: 'context-menu' },
      ),
    })),
  };
}

function topSurface(
  model: CelestialShowcaseModel,
): 'context-menu' | 'palette' | 'confirm' | 'modal' | 'drawer' | 'help' | 'tooltip' | 'gallery-context-menu' | 'toast' | null {
  if (model.contextMenu.open) return 'context-menu';
  if (model.palette.palette.open) return 'palette';
  if (model.confirm.open) return 'confirm';
  if (model.modal.open) return 'modal';
  if (model.drawer.open) return 'drawer';
  if (model.helpOpen) return 'help';
  if (model.tooltip.visible) return 'tooltip';
  if (model.activeLab === 'components' && model.componentPage === GALLERY_PAGE_COUNT - 1 && model.galleryContextMenu.open) return 'gallery-context-menu';
  if (model.toast.toasts.length > 0) return 'toast';
  return null;
}

export function createCelestialShowcaseApp(options: CelestialShowcaseOptions = {}): AppConfig<CelestialShowcaseModel, CelestialShowcaseMsg> {
  const size = options.initialSize ?? getTerminalSize();
  const fast = options.fast ?? process.env['CELESTIAL_DEMO_FAST'] === '1';
  const caps = getCapabilities();
  const components = createShowcaseComponents();
  const themeCtx = runtime.createThemeContext({ unicodeLevel: caps.unicodeLevel, motion: { reduceMotion: caps.reducedMotion } });

  const freshModel = (nextSize = size): CelestialShowcaseModel => {
    const workspaces = createWorkspaceModel(workspaceDefinitions);
    const evidence = { ...EMPTY_EVIDENCE, coreVisits: 1 };
    return {
      cols: nextSize.cols,
      rows: nextSize.rows,
      tick: 0,
      activeLab: 'core',
      previousTier: viewportTier(nextSize.cols),
      evidence,
      completed: completedFromEvidence(evidence),
      lastAction: 'Flight Deck initialized through @celestial/core.',
      componentPage: 0,
      componentFocus: 'none',
      helpOpen: false,
      contextMenu: createContextMenuState<ShowcaseContextAction>(),
      contextMenuSource: null,
      hoveredRegion: null,
      shelfHoveredWindowId: null,
      pointer: { x: 0, y: 0, type: 'idle', target: 'none', clicks: 0, hovering: false },
      dragDemo: createDragState<MouseDragPayload>(),
      droppedReceipts: 0,
      lastDroppedReceipt: null,
      windowDrag: null,
      workspaces,
      windows: initialWindows(nextSize, workspaceDefinitions[workspaces.activeIndex]!.id),
      ...initialComponentModels(components),
    };
  };

  return {
    init: () => [freshModel(), Cmd.none()],

    update(message, model) {
      switch (message.type) {
        case 'switch-lab': {
          const closed = cancelActiveInteractions(model, true);
          const next = {
            ...closed,
            activeLab: message.lab,
            lastAction: `Opened ${message.lab} lab.`,
          };
          return [message.lab === 'core' ? mark(next, 'core') : message.lab === 'visuals' ? mark(next, 'visual') : next, Cmd.none()];
        }
        case 'next-lab': {
          const index = activeLabIndex(model.activeLab);
          const next = LABS[(index + message.delta + LABS.length) % LABS.length]!.id;
          return this.update({ type: 'switch-lab', lab: next }, model);
        }
        case 'resize': {
          const tier = viewportTier(message.cols);
          const cancelled = cancelActiveInteractions(model);
          const windows = syncWindowBounds(cancelled.windows, { cols: message.cols, rows: message.rows });
          const resized = { ...cancelled, cols: message.cols, rows: message.rows, previousTier: tier, windows };
          return [tier !== model.previousTier ? mark(resized, 'adaptive', `Crossed into ${tier} layout at ${message.cols} columns.`) : resized, Cmd.none()];
        }
        case 'tick': {
          const tick = model.tick + 1;
          setReactiveTick(tick);
          return [{ ...model, tick }, Cmd.none()];
        }
        case 'context-menu': {
          const contextMenu = contextMenuUpdate(message.msg, model.contextMenu);
          return [
            {
              ...model,
              contextMenu,
              contextMenuSource: contextMenu.open ? model.contextMenuSource : null,
              lastAction: message.msg.type === 'ctx-close' ? 'Closed context menu.' : model.lastAction,
            },
            Cmd.none(),
          ];
        }
        case 'context-menu-activate': {
          const selected = getSelectedItem(model.contextMenu);
          if (!selected || selected.disabled || selected.separator) return [model, Cmd.none()];
          if (selected.submenu?.length) return this.update({ type: 'context-menu', msg: { type: 'ctx-enter-submenu' } }, model);
          if (!selected.msg) return [model, Cmd.none()];

          const closed = {
            ...model,
            contextMenu: createContextMenuState<ShowcaseContextAction>(),
            contextMenuSource: null,
          };
          switch (selected.msg.type) {
            case 'run-action':
              return this.update({ type: 'run-action', action: selected.msg.action }, closed);
            case 'switch-lab':
              return this.update({ type: 'switch-lab', lab: selected.msg.lab }, closed);
            case 'open-help': {
              if (selected.msg.lab === closed.activeLab) return this.update({ type: 'open-help' }, closed);
              const [switched, switchCommand] = this.update({ type: 'switch-lab', lab: selected.msg.lab }, closed);
              const [withHelp, helpCommand] = this.update({ type: 'open-help' }, switched);
              return [withHelp, Cmd.batch(switchCommand, helpCommand)];
            }
            case 'next-receipt': {
              const next = SMOKE_STEPS.find((step) => !closed.completed.has(step.id));
              return next ? this.update({ type: 'switch-lab', lab: next.lab }, closed) : [closed, Cmd.none()];
            }
            case 'window-action':
              return this.update({ type: 'window-action', id: selected.msg.id, action: selected.msg.action }, closed);
            case 'reset':
              return this.update({ type: 'reset' }, closed);
            case 'close':
              return [{ ...closed, lastAction: 'Closed context menu.' }, Cmd.none()];
          }
        }
        case 'open-context-menu-keyboard': {
          const x = Math.min(Math.max(model.pointer.x || 2, 1), Math.max(1, model.cols - 2));
          const y = Math.min(Math.max(model.pointer.y || 4, 1), Math.max(1, model.rows - 2));
          return [openContextMenu(model, `lab:${model.activeLab}`, x, y, 'keyboard'), Cmd.none()];
        }
        case 'run-action': {
          const action = message.action;
          if (['modal', 'confirm', 'drawer', 'tooltip', 'palette', 'toast'].includes(action))
            return this.update({ type: 'open-surface', surface: action as SurfaceId }, model);
          if (action === 'help') return this.update({ type: 'open-help' }, model);
          if (action === 'gallery-prev') return this.update({ type: 'component-page', page: model.componentPage - 1 }, model);
          if (action === 'gallery-next') return this.update({ type: 'component-page', page: model.componentPage + 1 }, model);
          if (action === 'gallery-context-menu') return this.update({ type: 'gallery-context-menu', open: true }, model);
          if (action === 'workflow-toggle-motion') {
            const current = model.schemaForm.values['reducedMotion'] === true;
            return this.update({ type: 'schema-form', msg: { type: 'schema-form:set-field', field: 'reducedMotion', value: !current } }, model);
          }
          if (action === 'workflow-prev') return this.update({ type: 'wizard', msg: { type: 'wizard:prev' } }, model);
          if (action === 'workflow-next') {
            return this.update({ type: 'wizard', msg: { type: model.wizard.finished ? 'wizard:reset' : 'wizard:next' } }, model);
          }
          if (action === 'reopen-telemetry') return this.update({ type: 'window-action', id: 'telemetry', action: 'reopen' }, model);
          if (action === 'reopen-events') return this.update({ type: 'window-action', id: 'events', action: 'reopen' }, model);
          return [model, Cmd.none()];
        }
        case 'component-page': {
          const page = Math.max(0, Math.min(GALLERY_PAGE_COUNT - 1, message.page));
          const cancelled = cancelActiveInteractions(model, true);
          const galleryContextMenu =
            page === GALLERY_PAGE_COUNT - 1 && page !== model.componentPage ? sampleGalleryContextMenu(true, cancelled) : cancelled.galleryContextMenu;
          return [
            withAction({ ...cancelled, componentPage: page, galleryContextMenu }, `Opened curated UI page ${page + 1}/${GALLERY_PAGE_COUNT}.`),
            Cmd.none(),
          ];
        }
        case 'component-focus':
          return [withAction(withComponentFocus(model, message.focus), `Focused ${message.focus} component.`), Cmd.none()];
        case 'gallery-context-menu':
          return [
            withAction(
              { ...model, galleryContextMenu: sampleGalleryContextMenu(message.open, model) },
              message.open ? 'Opened the gallery context-menu sample.' : 'Closed the gallery context-menu sample.',
            ),
            Cmd.none(),
          ];
        case 'text-input': {
          const [textInput, command] = mapDescriptor(components.textInputComponent, message.msg, model.textInput, (msg) => ({ type: 'text-input', msg }));
          return [markChanged({ ...model, textInput }, model.textInput, textInput, 'component', 'Edited textInput().'), command];
        }
        case 'textarea': {
          const [textarea, command] = mapDescriptor(components.textareaComponent, message.msg, model.textarea, (msg) => ({ type: 'textarea', msg }));
          return [markChanged({ ...model, textarea }, model.textarea, textarea, 'component', 'Edited textarea().'), command];
        }
        case 'checkbox': {
          const [checkbox, command] = mapDescriptor(components.checkboxComponent, message.msg, model.checkbox, (msg) => ({ type: 'checkbox', msg }));
          return [markChanged({ ...model, checkbox }, model.checkbox, checkbox, 'component', 'Toggled checkbox().'), command];
        }
        case 'radio': {
          const [radio, command] = mapDescriptor(components.radioComponent, message.msg, model.radio, (msg) => ({ type: 'radio', msg }));
          return [markChanged({ ...model, radio }, model.radio, radio, 'component', 'Changed radioGroup().'), command];
        }
        case 'select': {
          const [select, command] = mapDescriptor(components.selectComponent, message.msg, model.select, (msg) => ({ type: 'select', msg }));
          return [markChanged({ ...model, select }, model.select, select, 'component', 'Changed select().'), command];
        }
        case 'toggle': {
          const [toggle, command] = mapDescriptor(components.toggleComponent, message.msg, model.toggle, (msg) => ({ type: 'toggle', msg }));
          return [markChanged({ ...model, toggle }, model.toggle, toggle, 'component', 'Toggled toggle().'), command];
        }
        case 'slider': {
          const [slider, command] = mapDescriptor(components.sliderComponent, message.msg, model.slider, (msg) => ({ type: 'slider', msg }));
          return [markChanged({ ...model, slider }, model.slider, slider, 'component', 'Changed slider().'), command];
        }
        case 'tabs': {
          const [tabs, command] = mapDescriptor(components.tabsComponent, message.msg, model.tabs, (msg) => ({ type: 'tabs', msg }));
          return [markChanged({ ...model, tabs }, model.tabs, tabs, 'component', 'Changed tabs().'), command];
        }
        case 'breadcrumb': {
          const [breadcrumb, command] = mapDescriptor(components.breadcrumbComponent, message.msg, model.breadcrumb, (msg) => ({ type: 'breadcrumb', msg }));
          return [markChanged({ ...model, breadcrumb }, model.breadcrumb, breadcrumb, 'component', 'Navigated breadcrumb().'), command];
        }
        case 'pagination': {
          const [pagination, command] = mapDescriptor(components.paginationComponent, message.msg, model.pagination, (msg) => ({ type: 'pagination', msg }));
          return [markChanged({ ...model, pagination }, model.pagination, pagination, 'component', 'Changed pagination().'), command];
        }
        case 'table': {
          const [table, command] = mapDescriptor(components.tableComponent, message.msg, model.table, (msg) => ({ type: 'table', msg }));
          return [markChanged({ ...model, table }, model.table, table, 'component', 'Interacted with dataTable().'), command];
        }
        case 'tree': {
          const [tree, command] = mapDescriptor(components.treeComponent, message.msg, model.tree, (msg) => ({ type: 'tree', msg }));
          return [markChanged({ ...model, tree }, model.tree, tree, 'component', 'Interacted with tree().'), command];
        }
        case 'schema-form': {
          const [schemaForm, command] = mapDescriptor(components.schemaFormComponent, message.msg, model.schemaForm, (msg) => ({ type: 'schema-form', msg }));
          const next = stateChanged(model.schemaForm, schemaForm) ? withAction({ ...model, schemaForm }, 'Updated schemaForm().') : { ...model, schemaForm };
          themeCtx.patch({ motion: { reduceMotion: effectiveCapabilities(next, caps).reducedMotion } });
          return [next, command];
        }
        case 'wizard': {
          const [wizard, command] = mapDescriptor(components.wizardComponent, message.msg, model.wizard, (msg) => ({ type: 'wizard', msg }));
          const next = { ...model, wizard };
          if (!stateChanged(model.wizard, wizard)) return [next, command];
          const action =
            message.msg.type === 'wizard:reset' ? 'Restarted wizard().' : message.msg.type === 'wizard:next' ? 'Advanced wizard().' : 'Updated wizard.';
          return [message.msg.type === 'wizard:next' ? mark(next, 'workflow', action) : withAction(next, action), command];
        }
        case 'tooltip': {
          const [tooltip, command] = mapDescriptor(components.tooltipComponent, message.msg, model.tooltip, (msg) => ({ type: 'tooltip', msg }));
          return [stateChanged(model.tooltip, tooltip) ? withAction({ ...model, tooltip }, 'Tooltip layer updated.') : { ...model, tooltip }, command];
        }
        case 'toast': {
          const [toast, command] = components.toastManager.update(message.msg, model.toast);
          return [
            stateChanged(model.toast, toast) ? withAction({ ...model, toast }, 'Toast layer updated.') : { ...model, toast },
            Cmd.map(command, (msg) => ({ type: 'toast', msg })),
          ];
        }
        case 'modal': {
          const [modal, command] = mapDescriptor(components.modalComponent, message.msg, model.modal, (msg) => ({ type: 'modal', msg }));
          return [stateChanged(model.modal, modal) ? withAction({ ...model, modal }, 'Modal layer updated.') : { ...model, modal }, command];
        }
        case 'confirm': {
          const [confirm, command] = mapDescriptor(components.confirmComponent, message.msg, model.confirm, (msg) => ({ type: 'confirm', msg }));
          return [
            stateChanged(model.confirm, confirm)
              ? withAction({ ...model, confirm }, message.msg.type === 'confirm' ? 'Confirmation recorded.' : 'Confirmation layer updated.')
              : { ...model, confirm },
            command,
          ];
        }
        case 'drawer': {
          const [drawer, command] = mapDescriptor(components.drawerComponent, message.msg, model.drawer, (msg) => ({ type: 'drawer', msg }));
          return [stateChanged(model.drawer, drawer) ? withAction({ ...model, drawer }, 'Drawer layer updated.') : { ...model, drawer }, command];
        }
        case 'palette': {
          const selectedIndex =
            message.msg.type === 'cp-select-at' ? message.msg.index : message.msg.type === 'cp-select' ? model.palette.palette.selectedIndex : undefined;
          const selectedId = selectedIndex === undefined ? undefined : model.palette.palette.filteredIds[selectedIndex];
          const command = selectedId
            ? [
                { id: 'core', msg: { type: 'switch-lab', lab: 'core' } as CelestialShowcaseMsg },
                { id: 'components', msg: { type: 'switch-lab', lab: 'components' } as CelestialShowcaseMsg },
                { id: 'workflows', msg: { type: 'switch-lab', lab: 'workflows' } as CelestialShowcaseMsg },
                { id: 'visuals', msg: { type: 'switch-lab', lab: 'visuals' } as CelestialShowcaseMsg },
                { id: 'mouse', msg: { type: 'switch-lab', lab: 'mouse' } as CelestialShowcaseMsg },
                { id: 'layers', msg: { type: 'switch-lab', lab: 'layers' } as CelestialShowcaseMsg },
                { id: 'windows', msg: { type: 'switch-lab', lab: 'windows' } as CelestialShowcaseMsg },
                { id: 'smoke', msg: { type: 'switch-lab', lab: 'smoke' } as CelestialShowcaseMsg },
                { id: 'help', msg: { type: 'open-help' } as CelestialShowcaseMsg },
                { id: 'reset', msg: { type: 'reset' } as CelestialShowcaseMsg },
              ].find((entry) => entry.id === selectedId)?.msg
            : undefined;
          const [palette, inner] = components.paletteComponent.update(message.msg, model.palette);
          const mapped = Cmd.map(inner, (msg) => ({ type: 'palette', msg }) as CelestialShowcaseMsg);
          return [{ ...model, palette }, command ? Cmd.batch(mapped, Cmd.msg(command)) : mapped];
        }
        case 'help-surface':
          return message.msg.type === 'close' || message.msg.type === 'panic'
            ? [{ ...model, helpOpen: false, lastAction: 'Closed contextual help.' }, Cmd.none()]
            : [model, Cmd.none()];
        case 'open-help': {
          if (model.helpOpen) return [model, Cmd.none()];
          const cancelled = cancelActiveInteractions(model);
          return [mark({ ...cancelled, helpOpen: true, lastAction: `Opened contextual help for ${model.activeLab}.` }, 'help'), Cmd.none()];
        }
        case 'open-surface': {
          const base = cancelActiveInteractions(model);
          const markOpened = ([next, command]: [CelestialShowcaseModel, CmdEffect<CelestialShowcaseMsg>], opened: boolean, action: string) =>
            [opened ? mark(next, 'layer', action) : next, command] as [CelestialShowcaseModel, CmdEffect<CelestialShowcaseMsg>];
          switch (message.surface) {
            case 'modal':
              return markOpened(this.update({ type: 'modal', msg: { type: 'open' } }, base), !base.modal.open, 'Opened modal layer.');
            case 'confirm':
              return markOpened(this.update({ type: 'confirm', msg: { type: 'open' } }, base), !base.confirm.open, 'Opened confirmation layer.');
            case 'drawer':
              return markOpened(this.update({ type: 'drawer', msg: { type: 'open' } }, base), !base.drawer.open, 'Opened drawer layer.');
            case 'tooltip':
              return markOpened(this.update({ type: 'tooltip', msg: { type: 'show' } }, base), !base.tooltip.visible, 'Opened tooltip layer.');
            case 'palette':
              return markOpened(this.update({ type: 'palette', msg: { type: 'cp-open' } }, base), !base.palette.palette.open, 'Opened palette layer.');
            case 'toast': {
              const result = this.update(
                {
                  type: 'toast',
                  msg: { type: 'push', toast: { message: 'Layer receipt captured without hiding the base.', level: 'success', duration: 8000 } },
                },
                base,
              );
              return markOpened(result, result[0].toast.toasts.length > base.toast.toasts.length, 'Opened toast layer.');
            }
          }
        }
        case 'switch-workspace': {
          const workspace = workspaceDefinitions[message.index];
          if (!workspace) return [withAction(model, `Ignored invalid workspace index ${message.index}.`), Cmd.none()];
          const cancelled = cancelActiveInteractions(model, true);
          const workspaces = workspaceUpdate({ type: 'ws-switch', index: message.index }, cancelled.workspaces, (_msg, entry) => entry);
          const outcome = windowManagerUpdateResult({ type: 'set-active-workspace', id: workspace.id }, cancelled.windows);
          const windows = syncWindowBounds(outcome.model, { cols: model.cols, rows: model.rows });
          return [{ ...cancelled, workspaces, windows, lastAction: `Switched to ${workspace.name}.` }, Cmd.none()];
        }
        case 'window-action': {
          const cancelled = cancelActiveInteractions(model);
          let windows = cancelled.windows;
          let accepted = false;
          let changed = false;
          let diagnostic: string | undefined;
          const apply = (managerMessage: Parameters<typeof windowManagerUpdateResult>[0]) => {
            const outcome = windowManagerUpdateResult(managerMessage, windows);
            windows = outcome.model;
            accepted = accepted || outcome.accepted;
            changed = changed || (outcome.accepted && outcome.changed);
            diagnostic ??= outcome.diagnostics[0]?.code;
            return outcome.accepted;
          };
          if (message.action === 'reopen') {
            const existing = windows.windows.find((window) => window.id === message.id);
            if (existing) {
              apply({ type: 'activate-window', id: message.id });
            } else if (message.id === 'telemetry' || message.id === 'events') {
              if (apply({ type: 'create-window', window: instrumentWindow(message.id, { cols: model.cols, rows: model.rows }) })) {
                apply({ type: 'activate-window', id: message.id });
              }
            } else {
              diagnostic = 'window-not-found';
            }
          } else if (message.action === 'focus') {
            apply({ type: 'activate-window', id: message.id });
          } else {
            const type = `${message.action}-window` as 'close-window' | 'minimize-window' | 'maximize-window' | 'fullscreen-window' | 'restore-window';
            apply(message.action === 'close' ? { type, id: message.id, reason: 'showcase-chrome', policy: 'remove' } : { type, id: message.id });
          }
          const boundsOutcome = windowManagerUpdateResult(
            { type: 'set-bounds', bounds: windowBounds(windows, { cols: model.cols, rows: model.rows }) },
            windows,
          );
          windows = boundsOutcome.model;
          changed = changed || (accepted && boundsOutcome.changed);
          const next = {
            ...cancelled,
            windows,
            workspaces: workspaceModelForManager(cancelled, windows),
            lastAction: accepted ? `${message.action} window ${message.id}.` : `Window ${message.id} rejected: ${diagnostic ?? 'invalid-window'}.`,
          };
          return [accepted && changed ? mark(next, 'window') : next, Cmd.none()];
        }
        case 'raw-mouse': {
          const eventData = message.event;
          let next: CelestialShowcaseModel = {
            ...model,
            pointer: {
              ...model.pointer,
              x: eventData.x,
              y: eventData.y,
              type: eventData.type,
              target: model.windowDrag ? `window:${model.windowDrag.id}` : model.pointer.target,
            },
          };
          if (model.contextMenu.open) return [next, Cmd.none()];
          if (model.activeLab === 'mouse' && model.dragDemo.phase === 'dragging') {
            if (eventData.type === 'move') {
              const dragDemo = dragUpdate({ type: 'drag-move', x: eventData.x, y: eventData.y }, model.dragDemo, dragTargets);
              return [{ ...next, dragDemo, pointer: { ...next.pointer, target: 'drag:verification-receipt' } }, Cmd.none()];
            }
            if (eventData.type === 'release') {
              const dragDemo = model.dragDemo.hoveredTargetId
                ? dragUpdate({ type: 'drop', targetId: model.dragDemo.hoveredTargetId }, model.dragDemo, dragTargets)
                : dragUpdate({ type: 'drag-cancel' }, model.dragDemo, dragTargets);
              next = {
                ...next,
                dragDemo,
                lastAction: dragDemo.phase === 'dropped' ? next.lastAction : 'Cancelled receipt drag outside the drop bay.',
              };
              return [dragDemo.phase === 'dropped' ? recordDemoDrop(next) : next, Cmd.none()];
            }
          }
          if (model.activeLab !== 'windows' || viewportTier(model.cols) !== 'wide') return [next, Cmd.none()];

          if (eventData.type === 'move' && !model.windowDrag) {
            next = { ...next, windows: windowManagerHoverAt(next.windows, eventData.x, eventData.y) };
          }

          if (model.windowDrag) {
            if (eventData.type === 'move') {
              const window = model.windows.windows.find((entry) => entry.id === model.windowDrag?.id);
              if (!window) return [{ ...next, windowDrag: null }, Cmd.none()];
              const viewport = windowBounds(model.windows, { cols: model.cols, rows: model.rows });
              if (model.windowDrag.kind === 'resize') {
                const frame = resizeFloatingWindowFrame(model.windowDrag.state, eventData.x, eventData.y, viewport, {
                  minWidth: window.minWidth ?? 24,
                  minHeight: window.minHeight ?? 8,
                  maxWidth: window.maxWidth ?? model.cols,
                  maxHeight: window.maxHeight ?? model.rows - 5,
                });
                const outcome = windowManagerUpdateResult({ type: 'set-window-frame', id: window.id, frame }, model.windows);
                const resized = { ...next, windows: outcome.model };
                return [
                  outcome.accepted && outcome.changed ? mark(resized, 'window', `Resized ${window.title} to ${frame.width}x${frame.height}.`) : resized,
                  Cmd.none(),
                ];
              }
              const translated = translateFloatingWindowFromDragState(
                model.windowDrag.state,
                { width: window.width, height: window.height },
                eventData.x,
                eventData.y,
                viewport,
              );
              const outcome = windowManagerUpdateResult({ type: 'move-window', id: window.id, x: translated.frame.x, y: translated.frame.y }, model.windows);
              next = { ...next, windows: outcome.model };
              return [translated.dragging && outcome.accepted && outcome.changed ? mark(next, 'window', `Dragged ${window.title}.`) : next, Cmd.none()];
            }
            if (eventData.type === 'release') return [{ ...next, windowDrag: null, lastAction: `Released ${model.windowDrag.id} window.` }, Cmd.none()];
            return [next, Cmd.none()];
          }

          if (eventData.type === 'press' && eventData.button === 0) {
            const window = getVisibleWindows(model.windows).find(
              (entry) => eventData.x >= entry.x && eventData.x < entry.x + entry.width && eventData.y >= entry.y && eventData.y < entry.y + entry.height,
            );
            if (!window) return [next, Cmd.none()];
            const outcome = windowManagerUpdateResult({ type: 'focus-window', id: window.id }, model.windows);
            next = { ...next, windows: outcome.model, pointer: { ...next.pointer, target: `window:${window.id}` } };
            if (outcome.accepted && outcome.changed) next = mark(next, 'window', `Focused ${window.title}.`);
            const frame = { x: window.x, y: window.y, width: window.width, height: window.height };
            const resizeEdge = window.resizable !== false && window.mode === 'normal' ? hitTestFloatingWindowResizeEdge(frame, eventData.x, eventData.y) : null;
            if (resizeEdge) {
              next = {
                ...next,
                windowDrag: {
                  id: window.id,
                  kind: 'resize',
                  state: beginFloatingWindowResize(resizeEdge, frame, eventData.x, eventData.y),
                },
                lastAction: `Resizing ${window.title} from ${resizeEdge}.`,
              };
              return [next, Cmd.none()];
            }
            if (
              window.draggable !== false &&
              window.mode === 'normal' &&
              hitTestWindowChromeTitleBar({ ...window, mode: 'normal' }, eventData.x, eventData.y)
            ) {
              next = {
                ...next,
                windowDrag: {
                  id: window.id,
                  kind: 'drag',
                  state: { startMouseX: eventData.x, startMouseY: eventData.y, startX: window.x, startY: window.y },
                },
              };
            }
            return [next, Cmd.none()];
          }
          return [next, Cmd.none()];
        }
        case 'element-mouse': {
          const { handlerTag, x, y, type } = message.event;
          if (handlerTag.startsWith('showcase-context-menu:')) {
            message.event.stopPropagation();
            const phase = handlerTag.slice('showcase-context-menu:'.length);
            if (phase === 'dismiss') return this.update({ type: 'context-menu', msg: { type: 'ctx-close' } }, model);
            if (phase === 'scroll') {
              return this.update({ type: 'context-menu', msg: { type: (message.event.deltaY ?? 0) > 0 ? 'ctx-down' : 'ctx-up' } }, model);
            }
            const index = contextMenuRowAt(model, x, y);
            if (index === null) return [model, Cmd.none()];
            const hovered = model.contextMenu.items[index];
            const contextMenu = hovered?.separator ? model.contextMenu : { ...model.contextMenu, selectedIndex: index };
            const next = { ...model, contextMenu };
            return phase === 'activate' ? this.update({ type: 'context-menu-activate' }, next) : [next, Cmd.none()];
          }
          if (handlerTag.startsWith('showcase-context:')) {
            message.event.stopPropagation();
            const target = handlerTag.slice('showcase-context:'.length);
            return [openContextMenu(model, target, x, y), Cmd.none()];
          }
          const shelfAction = windowShelfActionFromEvent({ handlerTag });
          if (shelfAction) {
            message.event.stopPropagation();
            if (shelfAction.type === 'activate') return this.update({ type: 'window-action', id: shelfAction.id, action: 'focus' }, model);
            if (shelfAction.type === 'context') return [openContextMenu(model, `window:${shelfAction.id}`, x, y), Cmd.none()];
            if (shelfAction.type === 'hover') return [{ ...model, shelfHoveredWindowId: shelfAction.id }, Cmd.none()];
            if (shelfAction.type === 'leave') {
              return [model.shelfHoveredWindowId === shelfAction.id ? { ...model, shelfHoveredWindowId: null } : model, Cmd.none()];
            }
            return [openContextMenu(model, 'window-shelf-overflow', x, y), Cmd.none()];
          }
          const windowEvent = windowManagerMsgFromWindowEvent({ handlerTag });
          if (windowEvent) {
            if (windowEvent.type === 'hover-window-chrome' || windowEvent.type === 'leave-window-chrome') {
              return [{ ...model, windows: windowManagerUpdate(windowEvent, model.windows) }, Cmd.none()];
            }
            switch (windowEvent.type) {
              case 'focus-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'focus' }, model);
              case 'close-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'close' }, model);
              case 'minimize-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'minimize' }, model);
              case 'maximize-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'maximize' }, model);
              case 'fullscreen-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'fullscreen' }, model);
              case 'restore-window':
                return this.update({ type: 'window-action', id: windowEvent.id, action: 'restore' }, model);
              default:
                return [model, Cmd.none()];
            }
          }
          if (handlerTag.startsWith('showcase-hover:')) {
            return [{ ...model, hoveredRegion: handlerTag.slice('showcase-hover:'.length) }, Cmd.none()];
          }
          if (handlerTag.startsWith('showcase-leave:')) {
            const region = handlerTag.slice('showcase-leave:'.length);
            return [model.hoveredRegion === region ? { ...model, hoveredRegion: null } : model, Cmd.none()];
          }
          if (handlerTag.startsWith('showcase-click-away:')) {
            return this.update({ type: 'dismiss-top' }, model);
          }
          if (handlerTag.startsWith('showcase-lab:')) return this.update({ type: 'switch-lab', lab: handlerTag.slice('showcase-lab:'.length) as LabId }, model);
          if (handlerTag.startsWith('showcase-workspace:')) {
            const id = handlerTag.slice('showcase-workspace:'.length);
            return this.update({ type: 'switch-workspace', index: workspaceDefinitions.findIndex((workspace) => workspace.id === id) }, model);
          }
          if (handlerTag.startsWith('showcase-focus:'))
            return this.update({ type: 'component-focus', focus: handlerTag.slice('showcase-focus:'.length) as ComponentFocus }, model);
          if (handlerTag.startsWith('showcase-control:')) {
            const control = handlerTag.slice('showcase-control:'.length);
            const focused = withComponentFocus(model, control as ComponentFocus);
            if (control === 'tooltip') return this.update({ type: 'open-surface', surface: 'tooltip' }, focused);
            return [focused, Cmd.none()];
          }
          if (handlerTag.startsWith('showcase-smoke:')) {
            const id = handlerTag.slice('showcase-smoke:'.length) as SmokeId;
            return this.update({ type: 'switch-lab', lab: labForSmoke(id) }, model);
          }
          if (handlerTag.startsWith('showcase-drag:')) {
            const phase = handlerTag.slice('showcase-drag:'.length);
            if (phase === 'source-enter') return [{ ...model, hoveredRegion: 'drag-source' }, Cmd.none()];
            if (phase === 'source-leave') {
              return [model.hoveredRegion === 'drag-source' ? { ...model, hoveredRegion: null } : model, Cmd.none()];
            }
            if (phase === 'start') {
              const idle = model.dragDemo.phase === 'idle' ? model.dragDemo : dragUpdate({ type: 'drag-reset' }, model.dragDemo, dragTargets);
              const dragDemo = dragUpdate(
                {
                  type: 'drag-start',
                  sourceId: 'verification-receipt',
                  data: { id: 'verification-receipt', label: 'verification receipt' },
                  x,
                  y,
                },
                idle,
                dragTargets,
              );
              return [
                {
                  ...model,
                  dragDemo,
                  hoveredRegion: 'drag-source',
                  pointer: { ...model.pointer, x, y, target: 'drag:verification-receipt' },
                  lastAction: 'Picked up the verification receipt.',
                },
                Cmd.none(),
              ];
            }
            if (phase === 'over') {
              const dragDemo = dragUpdate({ type: 'drag-over', targetId: 'verification-bay' }, model.dragDemo, dragTargets);
              return [{ ...model, dragDemo, hoveredRegion: 'drag-target', pointer: { ...model.pointer, x, y, target: 'drop:verification-bay' } }, Cmd.none()];
            }
            if (phase === 'leave') {
              const dragDemo = dragUpdate({ type: 'drag-leave' }, model.dragDemo, dragTargets);
              return [{ ...model, dragDemo, hoveredRegion: model.hoveredRegion === 'drag-target' ? null : model.hoveredRegion }, Cmd.none()];
            }
            if (phase === 'drop') {
              const wasDragging = model.dragDemo.phase === 'dragging';
              const dragDemo = dragUpdate({ type: 'drop', targetId: 'verification-bay' }, model.dragDemo, dragTargets);
              const next = { ...model, dragDemo, hoveredRegion: 'drag-target', pointer: { ...model.pointer, x, y, target: 'drop:verification-bay' } };
              return [wasDragging && dragDemo.phase === 'dropped' ? recordDemoDrop(next) : next, Cmd.none()];
            }
          }
          if (handlerTag.startsWith('showcase-mouse:')) {
            const phase = handlerTag.slice('showcase-mouse:'.length);
            const pointer = {
              ...model.pointer,
              x,
              y,
              type: type ?? model.pointer.type,
              target: phase,
              hovering: phase !== 'leave',
              clicks: phase === 'click' ? model.pointer.clicks + 1 : model.pointer.clicks,
            };
            const next = { ...model, pointer, lastAction: `Mouse ${phase} at ${x},${y}.` };
            return phase === 'click' ? [mark(next, 'mouse-click'), Cmd.none()] : [next, Cmd.none()];
          }
          if (handlerTag.startsWith('showcase-action:')) {
            const action = handlerTag.slice('showcase-action:'.length);
            return this.update({ type: 'run-action', action }, model);
          }
          return [model, Cmd.none()];
        }
        case 'dismiss-top': {
          if (model.contextMenu.open) return this.update({ type: 'context-menu', msg: { type: 'ctx-close' } }, model);
          if (model.dragDemo.phase === 'dragging') {
            return [
              {
                ...model,
                dragDemo: dragUpdate({ type: 'drag-cancel' }, model.dragDemo, dragTargets),
                hoveredRegion: null,
                lastAction: 'Cancelled receipt drag.',
              },
              Cmd.none(),
            ];
          }
          if (model.windowDrag) return [{ ...model, windowDrag: null, hoveredRegion: null, lastAction: 'Cancelled window interaction.' }, Cmd.none()];
          if (model.palette.palette.open) return this.update({ type: 'palette', msg: { type: 'cp-close' } }, model);
          if (model.confirm.open) return this.update({ type: 'confirm', msg: { type: 'cancel' } }, model);
          if (model.modal.open) return this.update({ type: 'modal', msg: { type: 'close' } }, model);
          if (model.drawer.open) return this.update({ type: 'drawer', msg: { type: 'close' } }, model);
          if (model.helpOpen) return [{ ...model, helpOpen: false, lastAction: 'Closed contextual help.' }, Cmd.none()];
          if (model.tooltip.visible) return this.update({ type: 'tooltip', msg: { type: 'hide' } }, model);
          if (model.activeLab === 'components' && model.componentPage === GALLERY_PAGE_COUNT - 1 && model.galleryContextMenu.open) {
            return this.update({ type: 'gallery-context-menu', open: false }, model);
          }
          if (model.toast.toasts.length) return this.update({ type: 'toast', msg: { type: 'dismiss-latest' } }, model);
          return [withComponentFocus(model, 'none'), Cmd.none()];
        }
        case 'reset':
          themeCtx.patch({ unicodeLevel: caps.unicodeLevel, motion: { reduceMotion: caps.reducedMotion } });
          return [{ ...freshModel({ cols: model.cols, rows: model.rows }), lastAction: 'Reset the Flight Deck and smoke receipts.' }, Cmd.none()];
        case 'quit':
          return [model, Cmd.quit()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model) {
      const tier = viewportTier(model.cols);
      const active = LABS[activeLabIndex(model.activeLab)]!;
      const currentCaps = effectiveCapabilities(model, caps);
      if (model.cols < SHOWCASE_MIN_COLS || model.rows < SHOWCASE_MIN_ROWS) {
        return composeSurfaces(minimumViewport(model), components, model);
      }
      const tierLabel = tier === 'wide' ? 'WIDE / floating' : tier === 'medium' ? 'MEDIUM / split' : 'COMPACT / single';
      const title =
        tier === 'compact'
          ? row(
              text('CELESTIAL FLIGHT DECK', headingStyle),
              text('  '),
              badge({ label: 'OSS preview', variant: 'success', size: 'sm' }).view({ visible: true }),
              text('  COMPACT / single', mutedStyle),
            )
          : row(
              text('CELESTIAL FLIGHT DECK', headingStyle),
              text('  '),
              badge({ label: 'OSS preview', variant: 'success', size: 'sm' }).view({ visible: true }),
              text(' '),
              badge({ label: 'Horizon beta', variant: 'warning', size: 'sm' }).view({ visible: true }),
              text(`  ${tierLabel}`, tier === 'wide' ? successStyle : warningStyle),
            );
      const labStrip = row(...LABS.flatMap((lab) => [labTab(model, lab, model.activeLab === lab.id), text(' ')]));
      const labContent = event(
        `showcase-context-lab-${active.id}`,
        panel({ title: `${active.label} lab`, content: renderActiveLab(components, model, currentCaps), focused: true, fill: true }),
        { onRightClick: `showcase-context:lab:${active.id}` },
        { label: `${active.label} lab context menu`, intent: 'menu', affordances: ['click'], cursor: 'context-menu' },
      );
      const content =
        tier === 'medium' ? splitPane({ direction: 'horizontal', ratio: 0.75, first: labContent, second: adaptiveContext(model), minSize: 22 }) : labContent;
      const status = row(
        actionNode(model, 'help', 'Help', '?'),
        text(' '),
        actionNode(model, 'palette', 'Commands', 'Ctrl+P'),
        text(`  ${model.cols}x${model.rows} | ${model.completed.size}/${SMOKE_STEPS.length} receipts | `, mutedStyle),
        runtime.flex(text(model.lastAction, mutedStyle, { wrap: true }), { flex: 1, minWidth: 1 }),
      );
      const minimized = getMinimizedWindows(model.windows, { allWorkspaces: true });
      const statusBar =
        minimized.length > 0
          ? column(
              windowShelf({
                manager: model.windows,
                width: model.cols,
                allWorkspaces: true,
                hoveredWindowId: model.shelfHoveredWindowId ?? undefined,
                themeCtx,
              }),
              status,
            )
          : status;
      let base: VNode = shellLayout({
        header: column(title, labStrip),
        sidebar: tier === 'wide' ? panel({ title: 'Mission', content: missionRail(model), fill: true }) : undefined,
        content,
        statusBar,
        sidebarRatio: 0.23,
      });

      if (tier === 'wide' && model.activeLab === 'windows') base = withFloatingWindows(base, dynamicWindows(model, themeCtx));

      base = event(
        'showcase-context-deck',
        base,
        { onRightClick: 'showcase-context:deck' },
        { label: 'Flight Deck context menu', intent: 'menu', affordances: ['click'], cursor: 'context-menu' },
      );

      return composeSurfaces(base, components, model);
    },

    subscriptions(model) {
      const persistent = [
        Sub.resize<CelestialShowcaseMsg>((cols, rows) => ({ type: 'resize', cols, rows })),
        Sub.mouse<CelestialShowcaseMsg>((eventData) => ({ type: 'raw-mouse', event: eventData })),
        Sub.elementMouse<CelestialShowcaseMsg>((mouse) => ({ type: 'element-mouse', event: mouse })),
        ...(shouldAnimate(effectiveCapabilities(model, caps)) ? [Sub.timer<CelestialShowcaseMsg>(fast ? 50 : 180, { type: 'tick' })] : []),
        ...(model.toast.toasts.length
          ? [Sub.map(components.toastManager.subscriptions(model.toast), (msg) => ({ type: 'toast', msg }) as CelestialShowcaseMsg)]
          : []),
      ];

      const surface = topSurface(model);
      if (surface === 'context-menu') {
        return Sub.batch(
          ...persistent,
          Sub.key('escape', { type: 'context-menu', msg: { type: 'ctx-close' } }),
          Sub.key('up', { type: 'context-menu', msg: { type: 'ctx-up' } }),
          Sub.key('down', { type: 'context-menu', msg: { type: 'ctx-down' } }),
          Sub.key('left', { type: 'context-menu', msg: { type: 'ctx-exit-submenu' } }),
          Sub.key('right', { type: 'context-menu', msg: { type: 'ctx-enter-submenu' } }),
          Sub.key('enter', { type: 'context-menu-activate' }),
        );
      }
      if (surface === 'palette') {
        return Sub.batch(
          ...persistent,
          Sub.map(components.paletteComponent.subscriptions?.(model.palette) ?? Sub.none(), (msg) => ({ type: 'palette', msg }) as CelestialShowcaseMsg),
        );
      }
      if (surface === 'confirm') {
        return Sub.batch(
          ...persistent,
          Sub.map(components.confirmComponent.subscriptions?.(model.confirm) ?? Sub.none(), (msg) => ({ type: 'confirm', msg }) as CelestialShowcaseMsg),
        );
      }
      if (surface === 'modal') {
        return Sub.batch(
          ...persistent,
          Sub.map(components.modalComponent.subscriptions?.(model.modal) ?? Sub.none(), (msg) => ({ type: 'modal', msg }) as CelestialShowcaseMsg),
        );
      }
      if (surface === 'drawer') {
        return Sub.batch(
          ...persistent,
          Sub.map(components.drawerComponent.subscriptions?.(model.drawer) ?? Sub.none(), (msg) => ({ type: 'drawer', msg }) as CelestialShowcaseMsg),
        );
      }
      if (surface === 'help') {
        const helpModel = { open: true, width: Math.min(46, model.cols), height: Math.max(12, model.rows - 2), focusTrapActive: true };
        return Sub.batch(
          ...persistent,
          Sub.map(
            components.helpDrawers[model.activeLab].subscriptions?.(helpModel) ?? Sub.none(),
            (msg) => ({ type: 'help-surface', msg }) as CelestialShowcaseMsg,
          ),
        );
      }
      if (surface === 'tooltip') {
        return Sub.batch(
          ...persistent,
          Sub.map(components.tooltipComponent.subscriptions?.(model.tooltip) ?? Sub.none(), (msg) => ({ type: 'tooltip', msg }) as CelestialShowcaseMsg),
        );
      }
      if (surface === 'gallery-context-menu') {
        return Sub.batch(...persistent, Sub.key('escape', { type: 'gallery-context-menu', open: false }));
      }

      const base: Subscription<CelestialShowcaseMsg>[] = [
        Sub.keyWithModifiers('p', { ctrl: true }, { type: 'open-surface', surface: 'palette' }),
        Sub.keyWithModifiers('f10', { shift: true }, { type: 'open-context-menu-keyboard' }),
        Sub.key('f10', { type: 'open-context-menu-keyboard' }),
        Sub.key('?', { type: 'open-help' }),
        Sub.key('f1', { type: 'open-help' }),
        Sub.key('h', { type: 'open-help' }),
        Sub.key('escape', { type: 'dismiss-top' }),
        Sub.key('r', { type: 'reset' }),
        ...LABS.map((lab) => Sub.key(lab.key, { type: 'switch-lab', lab: lab.id } as CelestialShowcaseMsg)),
      ];

      if (model.activeLab === 'components') {
        base.push(
          Sub.key('[', { type: 'component-page', page: model.componentPage - 1 }),
          Sub.key(']', { type: 'component-page', page: model.componentPage + 1 }),
        );
        if (model.componentPage === 0) {
          base.push(
            mapSubscriptions(components.textInputComponent, model.textInput, (msg) => ({ type: 'text-input', msg })),
            mapSubscriptions(components.textareaComponent, model.textarea, (msg) => ({ type: 'textarea', msg })),
            mapSubscriptions(components.checkboxComponent, model.checkbox, (msg) => ({ type: 'checkbox', msg })),
            mapSubscriptions(components.radioComponent, model.radio, (msg) => ({ type: 'radio', msg })),
            mapSubscriptions(components.selectComponent, model.select, (msg) => ({ type: 'select', msg })),
            mapSubscriptions(components.toggleComponent, model.toggle, (msg) => ({ type: 'toggle', msg })),
            mapSubscriptions(components.sliderComponent, model.slider, (msg) => ({ type: 'slider', msg })),
          );
        } else if (model.componentPage === 3) {
          base.push(
            mapSubscriptions(components.tabsComponent, model.tabs, (msg) => ({ type: 'tabs', msg })),
            mapSubscriptions(components.breadcrumbComponent, model.breadcrumb, (msg) => ({ type: 'breadcrumb', msg })),
            mapSubscriptions(components.paginationComponent, model.pagination, (msg) => ({ type: 'pagination', msg })),
          );
        } else if (model.componentPage === 4) {
          base.push(
            mapSubscriptions(components.tableComponent, model.table, (msg) => ({ type: 'table', msg })),
            mapSubscriptions(components.treeComponent, model.tree, (msg) => ({ type: 'tree', msg })),
          );
        }
      }

      if (model.activeLab === 'workflows') {
        base.push(
          mapSubscriptions(components.schemaFormComponent, model.schemaForm, (msg) => ({ type: 'schema-form', msg })),
          Sub.key('n', { type: 'wizard', msg: { type: model.wizard.finished ? 'wizard:reset' : 'wizard:next' } }),
          Sub.key('b', { type: 'wizard', msg: { type: 'wizard:prev' } }),
        );
      }

      if (model.componentFocus !== 'text' && model.componentFocus !== 'textarea') base.push(Sub.key('q', { type: 'quit' }));
      base.push(Sub.keyWithModifiers('c', { ctrl: true }, { type: 'quit' }));
      return Sub.batch(...persistent, ...base);
    },
  };
}
