import { column, defaultTheme, event, row, runtime, style, text, type VNode } from '@celestial/core';
import {
  alert,
  badge,
  breadcrumb,
  button,
  card,
  checkbox,
  commandPalette,
  confirmDialog,
  createToastManager,
  dataTable,
  divider,
  drawer,
  emptyState,
  list,
  modal,
  pagination,
  progressBar,
  radioGroup,
  select,
  slider,
  spinner,
  tabs,
  textarea,
  textInput,
  toggle,
  tooltip,
  tree,
} from '@celestial/ui';
import type { CelestialShowcaseModel, CelestialShowcaseMsg, LabId } from './types.js';

interface CapabilityRow {
  id: string;
  capability: string;
  package: string;
  state: string;
}

const capabilityRows: CapabilityRow[] = [
  { id: 'runtime', capability: 'Elm runtime', package: '@celestial/core', state: 'ready' },
  { id: 'components', capability: 'Curated UI', package: '@celestial/ui', state: '27 builders' },
  { id: 'windows', capability: 'Window manager', package: '@celestial/horizon', state: 'beta' },
  { id: 'testing', capability: 'Headless + PTY', package: '@celestial/test', state: 'ready' },
];

const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const labelStyle = style({ color: defaultTheme.colors.textSoft, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted });

export const UI_BUILDER_NAMES = [
  'button',
  'textInput',
  'textarea',
  'checkbox',
  'radioGroup',
  'select',
  'toggle',
  'slider',
  'tabs',
  'breadcrumb',
  'pagination',
  'commandPalette',
  'dataTable',
  'tree',
  'list',
  'progressBar',
  'spinner',
  'card',
  'divider',
  'emptyState',
  'badge',
  'alert',
  'tooltip',
  'createToastManager',
  'modal',
  'confirmDialog',
  'drawer',
] as const;

const helpCopy: Record<LabId, { purpose: string; mouse: string; verify: string }> = {
  core: {
    purpose: 'Inspect the six packages behind the single @celestial/core entry point.',
    mouse: 'Click another lab in the mission rail or the top lab strip.',
    verify: 'Confirm capability detection, theme contrast, motion, reactivity, layout tier, and mouse status are visible.',
  },
  components: {
    purpose: 'Tour every curated @celestial/ui builder across five compact pages.',
    mouse: 'Click controls to focus, toggle, advance, or open their real layered surface.',
    verify: 'Advance through pages 1-5 and confirm the counter reaches 27/27 builders.',
  },
  mouse: {
    purpose: 'Exercise terminal pointer tracking and event-scoped hit regions.',
    mouse: 'Move over the target, click it, use the wheel, then drag the verification receipt into the drop bay.',
    verify: 'Watch coordinates, event phase, target, click count, drag offset, and the drop receipt update.',
  },
  layers: {
    purpose: 'Compose transient UI over a preserved base application.',
    mouse: 'Open each surface with its button and dismiss it with visible chrome or outside click.',
    verify: 'Use Escape on every surface and confirm the flight deck remains visible beneath drawers.',
  },
  windows: {
    purpose: 'Exercise Horizon beta workspaces and managed floating windows.',
    mouse: 'At 120+ columns, drag anywhere on a titlebar outside its controls; resize from edges and use window chrome.',
    verify: 'Resize below 120 and 80 columns to see the same state represented as split and compact layouts.',
  },
  smoke: {
    purpose: 'Turn the interaction history into a repeatable acceptance check.',
    mouse: 'Click any incomplete receipt to jump to its relevant lab.',
    verify: 'Complete all eight receipts, then run the README headless and PTY commands.',
  },
};

function helpContent(lab: LabId): VNode {
  const copy = helpCopy[lab];
  return column(
    text(`${lab.toUpperCase()} LAB`, headingStyle),
    text(''),
    text('Purpose', labelStyle),
    text(copy.purpose, undefined, { wrap: true }),
    text(''),
    text('Mouse path', labelStyle),
    text(copy.mouse, undefined, { wrap: true }),
    text(''),
    text('Smoke receipt', labelStyle),
    text(copy.verify, undefined, { wrap: true }),
    text(''),
    text('Global: 1-6 labs | ?/F1 help | Esc dismiss | Ctrl+P commands | Q quit', mutedStyle, { wrap: true }),
  );
}

export function createShowcaseComponents() {
  const textInputComponent = textInput({ value: 'celestial-flight-deck', placeholder: 'Mission name' });
  const textareaComponent = textarea({ value: 'Mouse-first\nAdaptive by default', rows: 2, maxLines: 4, showLineNumbers: true });
  const checkboxComponent = checkbox({ label: 'Run headless checks', checked: true });
  const radioComponent = radioGroup({
    options: [
      { label: 'Compact', value: 'compact' },
      { label: 'Balanced', value: 'balanced' },
      { label: 'Dense', value: 'dense' },
    ],
    selected: 1,
  });
  const selectComponent = select({
    options: [
      { label: 'Terminal', value: 'terminal' },
      { label: 'Headless test', value: 'test' },
      { label: 'PTY harness', value: 'pty' },
    ],
    selected: 0,
    placeholder: 'Render target',
  });
  const toggleComponent = toggle({ label: 'Live motion', checked: true, variant: 'success' });
  const sliderComponent = slider({ min: 0, max: 100, step: 10, value: 70, width: 16, label: 'Density' });
  const tabsComponent = tabs({
    tabs: [
      { key: 'runtime', label: 'Runtime' },
      { key: 'view', label: 'View' },
      { key: 'test', label: 'Test', badge: '3' },
    ],
  });
  const breadcrumbComponent = breadcrumb({
    id: 'showcase-breadcrumb',
    items: [
      { label: 'Celestial', key: 'celestial' },
      { label: 'Preview', key: 'preview' },
      { label: 'Flight Deck', key: 'flight-deck' },
    ],
  });
  const paginationComponent = pagination({ total: 50, pageSize: 10, current: 1 });
  const tableComponent = dataTable<CapabilityRow>({
    columns: [
      { key: 'capability', header: 'Capability', width: 18, sortable: true },
      { key: 'package', header: 'Package', width: 20, sortable: true },
      { key: 'state', header: 'State', width: 12 },
    ],
    data: capabilityRows,
    getKey: (entry) => entry.id,
    visibleRows: 4,
    selectable: true,
    multiSelect: true,
    rowNumbers: true,
    title: 'Preview contract',
  });
  const treeComponent = tree({
    nodes: [
      {
        key: 'core',
        label: '@celestial/core',
        children: [
          { key: 'runtime', label: 'runtime' },
          { key: 'layout', label: 'layout' },
          { key: 'interaction', label: 'interaction' },
        ],
      },
      { key: 'ui', label: '@celestial/ui' },
      { key: 'horizon', label: '@celestial/horizon (beta)' },
    ],
  });
  const spinnerComponent = spinner({ style: 'arc', speed: 120 });
  const tooltipComponent = tooltip({
    content: 'Tooltip content is tokenized, capability-aware, animated, and Escape-dismissible.',
    position: 'bottom',
    variant: 'info',
    caret: false,
    children: text('[ Tooltip target ]', labelStyle),
  });
  const toastManager = createToastManager({ id: 'celestial-showcase-toasts' });
  const modalComponent = modal({
    title: 'Layer telemetry',
    content: column(
      text('Nebula stackedLayers preserved the flight deck.', undefined, { wrap: true }),
      text('Click the close hint or press Escape.', mutedStyle, { wrap: true }),
    ),
    width: 52,
    open: false,
  });
  const confirmComponent = confirmDialog({
    title: 'Confirm launch receipt',
    message: 'Record this layered interaction as verified?',
    confirmLabel: 'Record',
    cancelLabel: 'Not yet',
    open: false,
  });
  const drawerComponent = drawer({
    title: 'Layer stack',
    content: column(text('Base application'), text('Transparent backdrop'), text('Anchored right drawer'), text('Escape and click-away dismissal', mutedStyle)),
    position: 'right',
    variant: 'overlay',
    width: 42,
    height: 22,
  });
  const paletteComponent = commandPalette<CelestialShowcaseMsg>({
    placeholder: 'Jump to a lab or run an action...',
    commands: [
      { id: 'core', label: 'Open Core lab', category: 'Labs', shortcut: '1', msg: { type: 'switch-lab', lab: 'core' } },
      { id: 'components', label: 'Open Components lab', category: 'Labs', shortcut: '2', msg: { type: 'switch-lab', lab: 'components' } },
      { id: 'mouse', label: 'Open Mouse lab', category: 'Labs', shortcut: '3', msg: { type: 'switch-lab', lab: 'mouse' } },
      { id: 'layers', label: 'Open Layers lab', category: 'Labs', shortcut: '4', msg: { type: 'switch-lab', lab: 'layers' } },
      { id: 'windows', label: 'Open Windows lab', category: 'Labs', shortcut: '5', msg: { type: 'switch-lab', lab: 'windows' } },
      { id: 'smoke', label: 'Open Smoke lab', category: 'Labs', shortcut: '6', msg: { type: 'switch-lab', lab: 'smoke' } },
      { id: 'help', label: 'Open contextual help', category: 'Actions', shortcut: '?', msg: { type: 'open-help' } },
      { id: 'reset', label: 'Reset all receipts', category: 'Actions', shortcut: 'R', msg: { type: 'reset' } },
    ],
  });
  const helpDrawers = Object.fromEntries(
    (Object.keys(helpCopy) as LabId[]).map((lab) => [
      lab,
      drawer({
        title: `${lab[0]!.toUpperCase()}${lab.slice(1)} help`,
        content: helpContent(lab),
        position: 'right',
        variant: 'overlay',
        width: 46,
        height: 28,
      }),
    ]),
  ) as Record<LabId, ReturnType<typeof drawer>>;

  return {
    textInputComponent,
    textareaComponent,
    checkboxComponent,
    radioComponent,
    selectComponent,
    toggleComponent,
    sliderComponent,
    tabsComponent,
    breadcrumbComponent,
    paginationComponent,
    tableComponent,
    treeComponent,
    spinnerComponent,
    tooltipComponent,
    toastManager,
    modalComponent,
    confirmComponent,
    drawerComponent,
    paletteComponent,
    helpDrawers,
  };
}

export type ShowcaseComponents = ReturnType<typeof createShowcaseComponents>;

export function initialComponentModels(components: ShowcaseComponents) {
  return {
    textInput: components.textInputComponent.init()[0],
    textarea: components.textareaComponent.init()[0],
    checkbox: components.checkboxComponent.init()[0],
    radio: components.radioComponent.init()[0],
    select: components.selectComponent.init()[0],
    toggle: components.toggleComponent.init()[0],
    slider: components.sliderComponent.init()[0],
    tabs: components.tabsComponent.init()[0],
    breadcrumb: components.breadcrumbComponent.init()[0],
    pagination: components.paginationComponent.init()[0],
    table: components.tableComponent.init()[0],
    tree: components.treeComponent.init()[0],
    tooltip: components.tooltipComponent.init()[0],
    toast: components.toastManager.init()[0],
    modal: components.modalComponent.init()[0],
    confirm: components.confirmComponent.init()[0],
    drawer: { ...components.drawerComponent.init()[0], open: false, focusTrapActive: false },
    palette: components.paletteComponent.init()[0],
  };
}

function action(
  model: CelestialShowcaseModel,
  id: string,
  label: string,
  tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' = 'accent',
): VNode {
  const visual = button({ label, onClick: id, x: 0, y: 0, buttonVariant: 'outline', tone, hovered: model.hoveredRegion === `action:${id}` }).view();
  const node = event(
    `showcase-action:${id}`,
    visual,
    { onClick: `showcase-action:${id}`, onMouseEnter: `showcase-hover:action:${id}`, onMouseLeave: `showcase-leave:action:${id}` },
    { label, intent: id, affordances: ['hover', 'click'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function focusable(id: string, label: string, child: VNode, direct = false): VNode {
  const tag = direct ? `showcase-control:${id}` : `showcase-focus:${id}`;
  return event(
    `showcase-component:${id}`,
    child,
    { onClick: tag },
    { label, intent: direct ? 'toggle' : 'select', affordances: ['click'], cursor: 'pointer', keyboardHint: direct ? 'Click or Space' : 'Click then type' },
  );
}

function named(name: string, child: VNode): VNode {
  return column(text(name, labelStyle), child);
}

function galleryHeader(page: number, subtitle: string): VNode {
  return row(text(`CURATED UI  ${page + 1}/5`, headingStyle), text(`  ${subtitle}`, mutedStyle));
}

export function renderComponentGallery(components: ShowcaseComponents, model: CelestialShowcaseModel): VNode {
  switch (model.componentPage) {
    case 0:
      return column(
        galleryHeader(0, 'Inputs - 8 builders'),
        row(action(model, 'modal', 'button()', 'accent'), text('  '), text('Click opens a real modal', mutedStyle)),
        named('textInput()', focusable('text', 'Mission name input', components.textInputComponent.view(model.textInput))),
        named('textarea()', focusable('textarea', 'Mission notes input', components.textareaComponent.view(model.textarea))),
        row(
          named('checkbox()', focusable('checkbox', 'Headless checks checkbox', components.checkboxComponent.view(model.checkbox))),
          text('    '),
          named('toggle()', focusable('toggle', 'Live motion toggle', components.toggleComponent.view(model.toggle))),
        ),
        row(
          named('radioGroup()', focusable('radio', 'Density radio group', components.radioComponent.view(model.radio))),
          text('    '),
          named('select()', focusable('select', 'Render target select', components.selectComponent.view(model.select))),
        ),
        named('slider()', focusable('slider', 'Density slider', components.sliderComponent.view(model.slider))),
      );
    case 1:
      return column(
        galleryHeader(1, 'Navigation - 4 builders'),
        named('tabs()', focusable('tabs', 'Navigation tabs', components.tabsComponent.view(model.tabs))),
        named('breadcrumb()', components.breadcrumbComponent.view(model.breadcrumb)),
        named('pagination()', focusable('pagination', 'Pagination control', components.paginationComponent.view(model.pagination))),
        named('commandPalette()', action(model, 'palette', 'Open command palette', 'info')),
        text('Mouse selects tabs/pages. Arrow keys operate the focused control.', mutedStyle, { wrap: true }),
      );
    case 2:
      return column(
        galleryHeader(2, 'Data structures - 3 builders'),
        named('dataTable()', focusable('table', 'Preview contract table', components.tableComponent.view(model.table))),
        row(
          named('tree()', focusable('tree', 'Package tree', components.treeComponent.view(model.tree))),
          text('      '),
          named('list()', list({ items: ['deterministic runtime', 'semantic components', 'headless receipts'], ordered: true, maxRenderedItems: 3 })),
        ),
      );
    case 3:
      return column(
        galleryHeader(3, 'Display - 5 builders'),
        named('progressBar()', progressBar({ label: 'Preview', value: model.completed.size / 8, width: 24, showPercentage: true })),
        named('spinner()', row(components.spinnerComponent.view({ frame: model.tick }), text(' capability probe', mutedStyle))),
        named(
          'card()',
          card({
            title: 'Core facade',
            subtitle: 'One understandable entry point',
            content: text('Six foundations, one import.'),
            variant: 'outlined',
            size: 'sm',
          }).view({
            hovered: false,
          }),
        ),
        named('divider()', divider({ label: 'Preview boundary', width: 42, tone: 'accent' })),
        named('emptyState()', emptyState({ title: 'No private dependencies', description: 'The supported demo stays inside the reduced preview.', width: 42 })),
      );
    default:
      return column(
        galleryHeader(4, 'Feedback and layers - 7 builders'),
        row(
          named('badge()', badge({ label: '27/27 curated', variant: 'success', size: 'sm' }).view({ visible: true })),
          text('    '),
          named(
            'alert()',
            alert({ title: 'Boundary intact', message: 'Only supported preview imports.', variant: 'info', size: 'sm' }).view({ visible: true }),
          ),
        ),
        row(
          named('tooltip()', focusable('tooltip', 'Tooltip target', components.tooltipComponent.view({ ...model.tooltip, visible: false }), true)),
          text('  '),
          action(model, 'toast', 'createToastManager()', 'success'),
        ),
        row(
          action(model, 'modal', 'modal()', 'accent'),
          text('  '),
          action(model, 'confirm', 'confirmDialog()', 'warning'),
          text('  '),
          action(model, 'drawer', 'drawer()', 'info'),
        ),
        text('Each layered builder opens as a real stacked surface; Escape always dismisses.', mutedStyle, { wrap: true }),
      );
  }
}
