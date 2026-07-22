import { Cmd, type Cmd as Command, column, defaultTheme, event, row, runtime, style, text, type VNode } from '@celestial/core';
import { schemaForm, wizard } from '@celestial/orbit';
import {
  alert,
  autocomplete,
  badge,
  breadcrumb,
  button,
  card,
  cardGrid,
  checkbox,
  checkboxGroup,
  colorPicker,
  combobox,
  commandPalette,
  confirmDialog,
  contextMenuUpdate,
  contextMenuView,
  createContextMenuState,
  createToastManager,
  dataTable,
  datePicker,
  divider,
  drawer,
  emptyState,
  formField,
  hovercard,
  indeterminateProgress,
  list,
  modal,
  multiSelect,
  numberInput,
  optionListView,
  pagination,
  popover,
  popoverGroup,
  progressBar,
  radioGroup,
  rangeSlider,
  rating,
  segmentedControl,
  select,
  slider,
  spinner,
  tabs,
  tagInput,
  textarea,
  textInput,
  toggle,
  toggleGroup,
  tooltip,
  tree,
} from '@celestial/ui';
import { UI_BUILDER_COUNT } from './coverage.js';
import type { CelestialShowcaseModel, CelestialShowcaseMsg, LabId, ShowcaseGalleryModels } from './types.js';

export { UI_BUILDER_COUNT, UI_BUILDER_NAMES } from './coverage.js';

interface CapabilityRow {
  id: string;
  capability: string;
  package: string;
  state: string;
}

const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const labelStyle = style({ color: defaultTheme.colors.textSoft, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted });

export const GALLERY_PAGE_COUNT = 8;

const capabilityRows: CapabilityRow[] = [
  { id: 'runtime', capability: 'Elm runtime', package: '@celestial/core', state: 'ready' },
  { id: 'components', capability: 'Curated UI', package: '@celestial/ui', state: `${UI_BUILDER_COUNT} builders` },
  { id: 'windows', capability: 'Window manager', package: '@celestial/horizon', state: 'beta' },
  { id: 'testing', capability: 'Headless + PTY', package: '@celestial/test', state: 'ready' },
];

const helpCopy: Record<LabId, { purpose: string; mouse: string; verify: string }> = {
  core: {
    purpose: 'Inspect the core facade, the Rosetta locale lane, and the machine-checked public capability ledger.',
    mouse: 'Switch among Foundations, Locale, and Ledger; change locale or page the ledger.',
    verify: 'Confirm capability detection, theme contrast, motion, bidi formatting, and all public package receipts are visible.',
  },
  components: {
    purpose: 'Tour every curated @celestial/ui builder across eight compact pages.',
    mouse: 'Click controls to focus, toggle, advance, or open their real layered surface.',
    verify: `Advance through pages 1-8 and confirm the counter reaches ${UI_BUILDER_COUNT}/${UI_BUILDER_COUNT} builders.`,
  },
  workflows: {
    purpose: 'Exercise Orbit schema forms, validation rules, prompt descriptors, and branch-aware wizard state using the same Elm update loop.',
    mouse: 'Page among workflow instruments, change a field, cycle validation samples, or use the visible wizard controls.',
    verify: 'Confirm schema, rule, prompt, and wizard receipts all change through public Orbit APIs.',
  },
  visuals: {
    purpose: 'Inspect Spectrum highlighting, Mirage effects, Nova transitions, Stellar charts, and Pulsar Markdown.',
    mouse: 'Page through text motion, charts, and Markdown; cycle the live sample while resizing the terminal.',
    verify: 'Confirm each renderer stays width-safe and reduced-motion mode resolves to static end states.',
  },
  mouse: {
    purpose: 'Exercise terminal pointer tracking and event-scoped hit regions.',
    mouse: 'Move over the target, click it, use the wheel, drag the receipt, then right-click a lab, control, window, or blank panel area.',
    verify: 'Watch coordinates, event phase, target, click count, drag offset, drop receipt, and target-specific context actions update.',
  },
  layers: {
    purpose: 'Compose transient UI over a preserved base application.',
    mouse: 'Open each surface with its button and dismiss it with visible chrome or outside click.',
    verify: 'Use Escape on every surface and confirm the flight deck remains visible beneath drawers.',
  },
  windows: {
    purpose: 'Exercise Horizon workspaces, managed windows, snap zones, recursive tiling, and session persistence.',
    mouse: 'Manage floating windows, then page to Layout systems and cycle snap zones and tile axes.',
    verify: 'Resize across tiers and confirm manager state, bounded snap frames, tiles, and restored sessions stay coherent.',
  },
  smoke: {
    purpose: 'Turn the interaction history into a repeatable acceptance check.',
    mouse: 'Click any incomplete receipt to jump to its relevant lab.',
    verify: 'Complete all twelve receipts, then run the README headless and PTY commands.',
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
    text('Global: 1-8 labs | ?/F1 help | Esc dismiss | Ctrl+P commands | Q quit', mutedStyle, { wrap: true }),
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
  const checkboxGroupComponent = checkboxGroup({
    options: [
      { label: 'Unit', value: 'unit', checked: true },
      { label: 'PTY', value: 'pty' },
    ],
  });
  const toggleGroupComponent = toggleGroup({
    options: [
      { label: 'Mouse', value: 'mouse', checked: true },
      { label: 'Keys', value: 'keys', checked: true },
    ],
    layout: 'row',
  });
  const autocompleteComponent = autocomplete({
    source: (query) => ['release', 'resize', 'render'].filter((value) => value.startsWith(query)),
    placeholder: 'Search APIs',
  });
  const comboboxComponent = combobox({
    options: [
      { label: 'Pulsar', value: 'pulsar' },
      { label: 'Stellar', value: 'stellar' },
      { label: 'Spectrum', value: 'spectrum' },
    ],
    value: 'Stellar',
  });
  const datePickerComponent = datePicker({ selected: { year: 2026, month: 7, day: 19 } });
  const multiSelectComponent = multiSelect({
    options: [
      { label: 'Unicode', value: 'unicode' },
      { label: 'Mouse', value: 'mouse' },
      { label: 'Motion', value: 'motion' },
    ],
    selected: [0, 1],
  });
  const numberInputComponent = numberInput({ value: UI_BUILDER_COUNT, min: 1, max: 99, label: 'Builders' });
  const rangeSliderComponent = rangeSlider({ min: 40, max: 160, low: 70, high: 120, width: 18 });
  const ratingComponent = rating({ value: 4, max: 5, interactive: true });
  const segmentedControlComponent = segmentedControl({ options: ['Compact', 'Wide'], selected: 1 });
  const tagInputComponent = tagInput({ tags: ['unicode', 'mouse'], placeholder: 'Add capability' });
  const colorPickerComponent = colorPicker({ value: '#5FD7FF' });
  const schemaFormComponent = schemaForm({
    schema: {
      fields: [
        {
          kind: 'segmented',
          name: 'density',
          label: 'Layout density',
          default: 'balanced',
          options: [
            { label: 'Compact', value: 'compact' },
            { label: 'Balanced', value: 'balanced' },
          ],
        },
        { kind: 'toggle', name: 'reducedMotion', label: 'Reduced motion', default: false },
        { kind: 'range', name: 'viewport', label: 'Target width', min: 70, max: 160, step: 10, default: [80, 120] },
      ],
      layout: {
        sections: [
          {
            title: 'Release preferences',
            description: 'Schema-driven fields reuse curated UI adapters.',
            fields: ['density', 'reducedMotion', 'viewport'],
          },
        ],
      },
    },
    value: {},
    onChange: () => undefined,
  });
  const workflowStep = (summary: string) => ({
    init: (): [string, Command<unknown>] => [summary, Cmd.none<unknown>()],
    update: (_msg: unknown, model: string): [string, Command<unknown>] => [model, Cmd.none<unknown>()],
    view: (model: string) => text(model, mutedStyle, { wrap: true }),
  });
  const wizardComponent = wizard({
    steps: [
      { name: 'scope', title: 'Scope', description: 'Choose the public package boundary.', component: workflowStep('17 packages pass the allowlist gate.') },
      {
        name: 'verify',
        title: 'Verify',
        description: 'Run deterministic release checks.',
        component: workflowStep('Build, typecheck, tests, PTY, and packed installs.'),
      },
      {
        name: 'publish',
        title: 'Publish',
        description: 'Require explicit release approval.',
        component: workflowStep('Changesets produce the preview package set.'),
      },
    ],
    focusGroup: 'showcase-release-wizard',
  });
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
  const optionListComponent = optionListView({
    items: [
      { id: 'preview', label: 'Preview', value: 'preview' },
      { id: 'beta', label: 'Beta', value: 'beta' },
      { id: 'private', label: 'Private', value: 'private', disabled: true },
    ],
    maxVisible: 3,
  });
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
  const indeterminateProgressComponent = indeterminateProgress({ width: 16, speed: 120 });
  const cardGridComponent = cardGrid({
    cards: [
      { title: 'Runtime', content: text('Elm loop', mutedStyle), variant: 'outlined', size: 'sm', width: 15, onClick: () => undefined },
      { title: 'Render', content: text('Cell safe', mutedStyle), variant: 'outlined', size: 'sm', width: 15, onClick: () => undefined },
    ],
    columns: 2,
    gap: 1,
  });
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
      text('Responsive modal copy reflows by terminal cells around e\u0301 and long words without clipping the final boundary.'),
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
    content: column(
      text('Current stack', labelStyle),
      text(`${defaultTheme.glyphs.bullet} Base application remains mounted.`),
      text(`${defaultTheme.glyphs.bullet} Transparent backdrop shields click-through.`),
      text(`${defaultTheme.glyphs.bullet} Right edge anchors this drawer.`),
      text(`${defaultTheme.glyphs.bullet} Escape, [x], and click-away dismissal remain active.`, mutedStyle, { wrap: true }),
      text(''),
      text('Interactive layer actions', labelStyle),
      text('Each control below updates the same Elm model used by the underlying lab.', mutedStyle, { wrap: true }),
    ),
    actions: [
      { id: 'modal', label: 'Stack modal above drawer', tone: 'info' },
      { id: 'confirm', label: 'Stack confirmation above', tone: 'success' },
      { id: 'toast', label: 'Push toast', tone: 'info' },
      { id: 'workflow-toggle-motion', label: 'Toggle reduced motion', tone: 'neutral' },
    ],
    position: 'right',
    variant: 'overlay',
    width: 42,
    height: 22,
  });
  const popoverComponent = popover({
    trigger: text('[ Inspect release ]', labelStyle),
    title: 'Public boundary',
    content: text('Only allowlisted packages ship.', undefined, { wrap: true }),
    position: 'bottom',
    width: 34,
  });
  const popoverGroupComponent = popoverGroup({
    popovers: [
      { trigger: '[ Runtime ]', content: 'Elm state remains explicit.', variant: 'info', position: 'bottom' },
      { trigger: '[ Render ]', content: 'Terminal cells remain width-safe.', variant: 'success', position: 'bottom' },
    ],
  });
  const hovercardComponent = hovercard({
    id: 'showcase-package-card',
    trigger: text('[ Hover package ]', labelStyle),
    content: column(text('@celestial/pulsar', labelStyle), text('Markdown + Spectrum + Stellar', mutedStyle)),
    width: 36,
  });
  const paletteComponent = commandPalette<CelestialShowcaseMsg>({
    placeholder: 'Jump to a lab or run an action...',
    commands: [
      { id: 'core', label: 'Open Core lab', category: 'Labs', shortcut: '1', msg: { type: 'switch-lab', lab: 'core' } },
      { id: 'components', label: 'Open Components lab', category: 'Labs', shortcut: '2', msg: { type: 'switch-lab', lab: 'components' } },
      { id: 'workflows', label: 'Open Workflows lab', category: 'Labs', shortcut: '3', msg: { type: 'switch-lab', lab: 'workflows' } },
      { id: 'visuals', label: 'Open Visuals lab', category: 'Labs', shortcut: '4', msg: { type: 'switch-lab', lab: 'visuals' } },
      { id: 'mouse', label: 'Open Mouse lab', category: 'Labs', shortcut: '5', msg: { type: 'switch-lab', lab: 'mouse' } },
      { id: 'layers', label: 'Open Layers lab', category: 'Labs', shortcut: '6', msg: { type: 'switch-lab', lab: 'layers' } },
      { id: 'windows', label: 'Open Windows lab', category: 'Labs', shortcut: '7', msg: { type: 'switch-lab', lab: 'windows' } },
      { id: 'smoke', label: 'Open Smoke lab', category: 'Labs', shortcut: '8', msg: { type: 'switch-lab', lab: 'smoke' } },
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
    checkboxGroupComponent,
    toggleGroupComponent,
    autocompleteComponent,
    comboboxComponent,
    datePickerComponent,
    multiSelectComponent,
    numberInputComponent,
    rangeSliderComponent,
    ratingComponent,
    segmentedControlComponent,
    tagInputComponent,
    colorPickerComponent,
    schemaFormComponent,
    wizardComponent,
    tabsComponent,
    breadcrumbComponent,
    paginationComponent,
    optionListComponent,
    tableComponent,
    treeComponent,
    spinnerComponent,
    indeterminateProgressComponent,
    cardGridComponent,
    tooltipComponent,
    toastManager,
    modalComponent,
    confirmComponent,
    drawerComponent,
    popoverComponent,
    popoverGroupComponent,
    hovercardComponent,
    paletteComponent,
    helpDrawers,
  };
}

export type ShowcaseComponents = ReturnType<typeof createShowcaseComponents>;

export function initialComponentModels(components: ShowcaseComponents) {
  const autocompleteModel = components.autocompleteComponent.init()[0];
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
    schemaForm: components.schemaFormComponent.init()[0],
    wizard: components.wizardComponent.init()[0],
    tooltip: components.tooltipComponent.init()[0],
    toast: components.toastManager.init()[0],
    modal: components.modalComponent.init()[0],
    confirm: components.confirmComponent.init()[0],
    drawer: { ...components.drawerComponent.init()[0], open: false, focusTrapActive: false },
    palette: components.paletteComponent.init()[0],
    galleryModels: {
      checkboxGroup: components.checkboxGroupComponent.init()[0],
      toggleGroup: components.toggleGroupComponent.init()[0],
      autocomplete: {
        ...autocompleteModel,
        query: 're',
        suggestions: ['release', 'resize', 'render'],
        highlighted: 0,
        open: true,
      },
      combobox: components.comboboxComponent.init()[0],
      datePicker: components.datePickerComponent.init()[0],
      multiSelect: components.multiSelectComponent.init()[0],
      numberInput: components.numberInputComponent.init()[0],
      rangeSlider: components.rangeSliderComponent.init()[0],
      rating: components.ratingComponent.init()[0],
      segmentedControl: components.segmentedControlComponent.init()[0],
      tagInput: components.tagInputComponent.init()[0],
      colorPicker: components.colorPickerComponent.init()[0],
      optionList: components.optionListComponent.init()[0],
      cardGrid: components.cardGridComponent.init()[0],
      popover: components.popoverComponent.init()[0],
      popoverGroup: components.popoverGroupComponent.init()[0],
      hovercard: components.hovercardComponent.init()[0],
    },
    galleryContextMenu: contextMenuUpdate(
      {
        type: 'ctx-open',
        x: 0,
        y: 0,
        items: [
          { label: 'Open', shortcut: 'Enter', msg: 'open' },
          { label: 'Inspect', shortcut: 'I', msg: 'inspect' },
        ],
      },
      createContextMenuState<string>(),
    ),
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
    {
      onClick: `showcase-action:${id}`,
      onRightClick: `showcase-context:action:${id}`,
      onMouseEnter: `showcase-hover:action:${id}`,
      onMouseLeave: `showcase-leave:action:${id}`,
    },
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
  return row(text(`CURATED UI  ${page + 1}/${GALLERY_PAGE_COUNT}`, headingStyle), text(`  ${subtitle}`, mutedStyle));
}

function galleryView<Key extends keyof ShowcaseGalleryModels>(
  model: CelestialShowcaseModel,
  id: Key,
  descriptor: { view(state: ShowcaseGalleryModels[Key]): VNode },
  overrides?: Partial<ShowcaseGalleryModels[Key]>,
): VNode {
  const state = model.galleryModels[id];
  if (!state) return text(`${id} state unavailable`, mutedStyle);
  return descriptor.view(overrides ? { ...state, ...overrides } : state);
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
        galleryHeader(1, 'Grouped and assisted inputs - 7 builders'),
        row(
          named('checkboxGroup()', galleryView(model, 'checkboxGroup', components.checkboxGroupComponent)),
          text('    '),
          named('toggleGroup()', galleryView(model, 'toggleGroup', components.toggleGroupComponent)),
        ),
        named('autocomplete()', galleryView(model, 'autocomplete', components.autocompleteComponent)),
        named('combobox()', galleryView(model, 'combobox', components.comboboxComponent)),
        named('datePicker()', galleryView(model, 'datePicker', components.datePickerComponent)),
        row(
          named('multiSelect()', galleryView(model, 'multiSelect', components.multiSelectComponent)),
          text('    '),
          named('numberInput()', galleryView(model, 'numberInput', components.numberInputComponent)),
        ),
      );
    case 2:
      return column(
        galleryHeader(2, 'Specialized form controls - 6 builders'),
        named('rangeSlider()', galleryView(model, 'rangeSlider', components.rangeSliderComponent)),
        row(
          named('rating()', galleryView(model, 'rating', components.ratingComponent)),
          text('    '),
          named('segmentedControl()', galleryView(model, 'segmentedControl', components.segmentedControlComponent)),
        ),
        named('tagInput()', galleryView(model, 'tagInput', components.tagInputComponent)),
        named('colorPicker()', galleryView(model, 'colorPicker', components.colorPickerComponent)),
        named(
          'formField()',
          formField({
            label: 'Release channel',
            required: true,
            child: text('[ preview ]'),
            success: 'Validated against the public boundary',
            validationState: 'valid',
          }),
        ),
      );
    case 3:
      return column(
        galleryHeader(3, 'Navigation - 5 builders'),
        named('tabs()', focusable('tabs', 'Navigation tabs', components.tabsComponent.view(model.tabs))),
        named('breadcrumb()', components.breadcrumbComponent.view(model.breadcrumb)),
        named('pagination()', focusable('pagination', 'Pagination control', components.paginationComponent.view(model.pagination))),
        named('commandPalette()', action(model, 'palette', 'Open command palette', 'info')),
        named('optionListView()', galleryView(model, 'optionList', components.optionListComponent)),
        text('Mouse selects tabs/pages. Arrow keys operate the focused control.', mutedStyle, { wrap: true }),
      );
    case 4:
      return column(
        galleryHeader(4, 'Data structures - 3 builders'),
        named('dataTable()', focusable('table', 'Preview contract table', components.tableComponent.view(model.table))),
        row(
          named('tree()', focusable('tree', 'Package tree', components.treeComponent.view(model.tree))),
          text('      '),
          named('list()', list({ items: ['deterministic runtime', 'semantic components', 'headless receipts'], ordered: true, maxRenderedItems: 3 })),
        ),
      );
    case 5: {
      const determinateProgress = named(
        'progressBar()',
        progressBar({ label: 'Preview', value: model.completed.size / Object.keys(model.evidence).length, width: 20, showPercentage: true }),
      );
      const indeterminate = named('indeterminateProgress()', components.indeterminateProgressComponent.view({ position: model.tick }));
      const activitySpinner = named('spinner()', row(components.spinnerComponent.view({ frame: model.tick }), text(' probe', mutedStyle)));
      return column(
        galleryHeader(5, 'Display - 7 builders'),
        model.cols >= 100
          ? row(determinateProgress, text('  '), indeterminate, text('  '), activitySpinner)
          : column(row(determinateProgress, text('  '), indeterminate), activitySpinner),
        row(
          named(
            'card()',
            card({
              title: 'Core facade',
              subtitle: 'One entry point',
              content: text('Six foundations.'),
              variant: 'outlined',
              size: 'sm',
              width: 24,
            }).view({ hovered: false }),
          ),
          text('  '),
          named('cardGrid()', galleryView(model, 'cardGrid', components.cardGridComponent)),
        ),
        named('divider()', divider({ label: 'Preview boundary', width: 42, tone: 'accent' })),
        named('emptyState()', emptyState({ title: 'No private dependencies', description: 'The supported demo stays inside the focused preview.', width: 42 })),
      );
    }
    case 6:
      return column(
        galleryHeader(6, 'Feedback and layers - 7 builders'),
        row(
          named('badge()', badge({ label: `${UI_BUILDER_COUNT}/${UI_BUILDER_COUNT} curated`, variant: 'success', size: 'sm' }).view({ visible: true })),
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
    default: {
      const contextNode = contextMenuView({
        state: model.galleryContextMenu,
        width: 22,
        viewport: { cols: Math.max(24, model.cols - 8), rows: Math.max(8, model.rows - 8) },
        tokens: {
          background: defaultTheme.colors.surface,
          border: defaultTheme.colors.border,
          text: defaultTheme.colors.text,
          textMuted: defaultTheme.colors.muted,
          selectedBackground: defaultTheme.states.active.bg ?? defaultTheme.colors.interactive,
          selectedText: defaultTheme.colors.text,
          separator: defaultTheme.colors.border,
          shortcut: defaultTheme.colors.textSoft,
        },
      });
      const popoverNode = named('popover()', galleryView(model, 'popover', components.popoverComponent, { viewportCols: Math.max(36, model.cols - 8) }));
      const hovercardNode = named(
        'hovercard()',
        galleryView(model, 'hovercard', components.hovercardComponent, { viewportCols: Math.max(36, model.cols - 8) }),
      );
      return column(
        galleryHeader(7, 'Contextual surfaces - 3 builders + menu helper'),
        named(
          'contextMenuView() helper',
          contextNode ?? row(text('Context menu dismissed.  ', mutedStyle), action(model, 'gallery-context-menu', 'Open sample menu', 'info')),
        ),
        model.cols >= 100 ? row(popoverNode, text('  '), hovercardNode) : column(popoverNode, hovercardNode),
        named('popoverGroup()', galleryView(model, 'popoverGroup', components.popoverGroupComponent)),
        text('Click popovers, hover the package card, and use their visible close controls or Escape.', mutedStyle, { wrap: true }),
      );
    }
  }
}
