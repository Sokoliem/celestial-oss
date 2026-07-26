import {
  type AtlasCapabilities,
  border,
  box,
  column,
  computed,
  defaultTheme,
  easing,
  event,
  getDragOffset,
  interaction,
  layout,
  row,
  runtime,
  signal,
  spring,
  style,
  styling,
  text,
  tween,
  type VNode,
  validateThemeContrast,
} from '@celestial/core';
import {
  applySnapZone,
  computeSnapZones,
  createSessionStore,
  createTabBar,
  getActiveWorkspace,
  getVisibleWindows,
  listSessions,
  loadSession,
  panel,
  type SessionStore,
  saveSession,
  splitPane,
  tile,
  columns as tileColumns,
  rows as tileRows,
  type WorkspaceSession,
} from '@celestial/horizon';
import { glow, gradient, shimmer, underlineWave } from '@celestial/mirage';
import { fadeTransition, morphTransition, slideTransition } from '@celestial/nova';
import {
  confirmPrompt,
  email,
  form,
  inputPrompt,
  minLength,
  multiSelectPrompt,
  parseArgSchema,
  runRules,
  selectPrompt,
  validateArgSchema,
} from '@celestial/orbit';
import { createMarkdownStream, extractFrontmatter, extractToc, findMatches, parseMarkdown, renderMarkdown } from '@celestial/pulsar';
import { createLocaleContext, detectDirection, formatList, formatRelativeTime, measureTextWidth, segmentGraphemes } from '@celestial/rosetta';
import { detectLanguage, highlightCode, tokenizeCode } from '@celestial/spectrum';
import { areaChart, chart, heatmap, sparkline } from '@celestial/stellar';
import { badge, button, progressBar } from '@celestial/ui';
import { type ShowcaseComponents, UI_BUILDER_COUNT } from './components.js';
import { SHOWCASE_PACKAGE_COVERAGE } from './coverage.js';
import type { CelestialShowcaseModel, LabId, SmokeId, SurfaceId, ViewportTier } from './types.js';

export const LABS: Array<{ id: LabId; label: string; key: string; summary: string }> = [
  { id: 'core', label: 'Core', key: '1', summary: 'Foundations, locale, ledger' },
  { id: 'components', label: 'Components', key: '2', summary: `${UI_BUILDER_COUNT} curated builders` },
  { id: 'workflows', label: 'Workflows', key: '3', summary: 'Forms, validation, prompts' },
  { id: 'visuals', label: 'Visuals', key: '4', summary: 'Code, motion, charts, Markdown' },
  { id: 'mouse', label: 'Mouse', key: '5', summary: 'Pointer and hit regions' },
  { id: 'layers', label: 'Layers', key: '6', summary: 'Stacked transient surfaces' },
  { id: 'windows', label: 'Windows', key: '7', summary: 'Horizon beta management' },
  { id: 'smoke', label: 'Smoke', key: '8', summary: 'Live verification receipts' },
  { id: 'app-shell', label: 'App shell', key: '9', summary: 'Compass + coordinated surfaces' },
];

export const SMOKE_STEPS: Array<{ id: SmokeId; label: string; lab: LabId; instruction: string }> = [
  { id: 'core', label: 'Core inspected', lab: 'core', instruction: 'Visit the Core lab.' },
  { id: 'component', label: 'Component changed', lab: 'components', instruction: 'Toggle or edit a curated control.' },
  { id: 'workflow', label: 'Workflow advanced', lab: 'workflows', instruction: 'Advance the Orbit release wizard.' },
  { id: 'visual', label: 'Visual stack inspected', lab: 'visuals', instruction: 'Visit the Visuals lab.' },
  { id: 'locale', label: 'Locale changed', lab: 'core', instruction: 'Open Core / Locale and change the Rosetta locale.' },
  { id: 'mouse-click', label: 'Mouse target clicked', lab: 'mouse', instruction: 'Click inside the pointer target.' },
  { id: 'mouse-drag', label: 'Payload dropped', lab: 'mouse', instruction: 'Drag the receipt into the drop bay.' },
  { id: 'context-menu', label: 'Context menu opened', lab: 'mouse', instruction: 'Right-click a lab, control, window, or blank panel area.' },
  { id: 'layer', label: 'Layer composed', lab: 'layers', instruction: 'Open and dismiss any transient surface.' },
  { id: 'adaptive', label: 'Breakpoint crossed', lab: 'windows', instruction: 'Resize across 120 or 80 columns.' },
  { id: 'window', label: 'Window managed', lab: 'windows', instruction: 'Focus, minimize, maximize, restore, or close a window.' },
  {
    id: 'app-shell',
    label: 'App shell coordinated',
    lab: 'app-shell',
    instruction: 'Run a Compass route or a coordinated app-shell action.',
  },
  { id: 'help', label: 'Context help opened', lab: 'smoke', instruction: 'Open help with ? or the Help button.' },
];

const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const titleStyle = style({ color: defaultTheme.colors.text, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted });
const successStyle = style({ color: defaultTheme.colors.tones.success });
const warningStyle = style({ color: defaultTheme.colors.tones.warning });
const actionStyle = style({ color: defaultTheme.colors.interactive, bold: true });

const [reactiveTick, setReactiveTickValue] = signal(0);
const reactiveChecksum = computed(() => (reactiveTick() * 17 + 11) % 97);

export function setReactiveTick(value: number): void {
  setReactiveTickValue(value);
}

export function viewportTier(cols: number): ViewportTier {
  return cols < 80 ? 'compact' : cols < 120 ? 'medium' : 'wide';
}

function action(
  model: CelestialShowcaseModel,
  id: string,
  label: string,
  tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' = 'accent',
): VNode {
  const region = `action:${id}`;
  const visual = button({ label, onClick: id, x: 0, y: 0, buttonVariant: 'outline', tone, hovered: model.hoveredRegion === region }).view();
  const node = event(
    `showcase-action:${id}`,
    visual,
    {
      onClick: `showcase-action:${id}`,
      onRightClick: `showcase-context:action:${id}`,
      onMouseEnter: `showcase-hover:${region}`,
      onMouseLeave: `showcase-leave:${region}`,
    },
    { label, intent: id, affordances: ['hover', 'click'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

/**
 * A receipt that asserts something passed or failed. `good` is required: defaulting it
 * to true let roughly twenty receipts render fallback and empty values in success green,
 * which is what made broken instruments look verified.
 */
function capabilityStatus(label: string, value: string, good: boolean): VNode {
  return row(text(`${label.padEnd(18)} `, mutedStyle), text(value, good ? successStyle : warningStyle));
}

/**
 * A readout that reports a value without claiming it passed anything — terminal name,
 * pointer coordinates, viewport size. These are context, not evidence, so they must not
 * borrow the success tone that the receipts above use to mean "verified".
 */
function capabilityInfo(label: string, value: string): VNode {
  return row(text(`${label.padEnd(18)} `, mutedStyle), text(value, actionStyle));
}

function coreCard(title: string, content: VNode, width = 34, height = 14): VNode {
  return box(column(text(title, titleStyle), content), style({ border: border.rounded, color: defaultTheme.colors.border, padding: 1, width }), {
    width,
    height,
  });
}

function renderFoundationsLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const contrast = validateThemeContrast(defaultTheme);
  const motionProgress = caps.reducedMotion ? 1 : (model.tick % 20) / 19;
  const animation = tween({ from: 0, to: 1, duration: 1000, easing: easing.easeInOut });
  animation.seek(motionProgress);
  const animated = animation.value();
  const springAnimation = spring(1, { from: 0, stiffness: 170, damping: 26 });
  springAnimation.seek(motionProgress);
  const springValue = springAnimation.value();
  const layoutTier = viewportTier(model.cols);
  const glyph = styling.resolveGlyph(styling.DEFAULT_GLYPH_TOKENS.checked, caps.unicodeLevel);
  const hitmap = new interaction.HitMap<string>();
  hitmap.register({ x: 0, y: 0, width: 12, height: 1, onClick: 'nexus-ready' });
  const nexusProbe = hitmap.hitTest(2, 0)?.onClick ?? 'miss';

  if (model.cols < 120) {
    const width = Math.max(32, Math.min(64, model.cols - 8));
    return column(
      text('CORE FACADE', headingStyle),
      text('One import, six focused namespaces.', mutedStyle),
      coreCard(
        'Atlas + Corona',
        column(
          capabilityInfo('terminal', caps.terminalName),
          capabilityInfo('color / unicode', `${caps.colorLevel} / ${caps.unicodeLevel}`),
          capabilityStatus('mouse tracking', caps.mouseTracking ? 'available' : 'fallback', caps.mouseTracking),
          capabilityStatus('WCAG AA pairs', `${contrast.pairsChecked - contrast.violations.length}/${contrast.pairsChecked}`, contrast.pass),
          capabilityStatus('semantic glyph', glyph ? `${glyph} resolved` : 'unresolved', glyph.length > 0),
        ),
        width,
        8,
      ),
      coreCard(
        'Aurora + Nebula',
        column(
          progressBar({ label: 'tween', value: animated, width: 18 }),
          capabilityInfo('Elm update tick', String(model.tick)),
          capabilityInfo('signal checksum', String(reactiveChecksum())),
          capabilityInfo('motion', caps.reducedMotion ? 'static' : `spring ${springValue.toFixed(2)}`),
          text('Cmd + Sub + VDOM + signals', mutedStyle),
        ),
        width,
        8,
      ),
      coreCard(
        'Gravity + Nexus',
        column(
          capabilityInfo('viewport tier', layoutTier),
          capabilityInfo('terminal', `${model.cols} x ${model.rows}`),
          capabilityInfo('flex layout', 'responsive'),
          capabilityStatus('HitMap probe', nexusProbe, nexusProbe !== 'miss'),
          capabilityInfo('last pointer', `${model.pointer.x},${model.pointer.y}`),
        ),
        width,
        8,
      ),
    );
  }

  const coreCards = [
    coreCard(
      'Atlas + Corona',
      column(
        capabilityInfo('terminal', caps.terminalName),
        capabilityInfo('color', caps.colorLevel),
        capabilityInfo('unicode', caps.unicodeLevel),
        capabilityStatus('mouse tracking', caps.mouseTracking ? 'available' : 'fallback', caps.mouseTracking),
        text(''),
        capabilityStatus('WCAG AA pairs', `${contrast.pairsChecked - contrast.violations.length}/${contrast.pairsChecked}`, contrast.pass),
        capabilityStatus('semantic glyph', glyph ? `${glyph} resolved` : 'unresolved', glyph.length > 0),
        capabilityInfo('reduced motion', defaultTheme.motion.reduceMotion ? 'enabled' : 'disabled'),
      ),
    ),
    coreCard(
      'Aurora + Nebula',
      column(
        progressBar({ label: 'tween', value: animated, width: 18 }),
        progressBar({ label: 'spring', value: springValue, width: 18 }),
        text(caps.reducedMotion ? 'Atlas requests static motion.' : 'Deterministic eased tween.', mutedStyle),
        text(''),
        capabilityInfo('Elm update tick', String(model.tick)),
        capabilityInfo('signal checksum', String(reactiveChecksum())),
        text('Cmd + Sub + VDOM + signals', mutedStyle),
      ),
    ),
    coreCard(
      'Gravity + Nexus',
      column(
        capabilityInfo('viewport tier', layoutTier),
        capabilityInfo('terminal', `${model.cols} x ${model.rows}`),
        text('Responsive flex layout', mutedStyle),
        text(''),
        capabilityStatus('HitMap probe', nexusProbe, nexusProbe !== 'miss'),
        capabilityInfo('last pointer', `${model.pointer.x},${model.pointer.y}`),
        text('Hit regions + raw mouse', mutedStyle),
      ),
    ),
  ];

  return column(
    row(text('CORE FACADE', headingStyle), text('  @celestial/core', mutedStyle)),
    text('One understandable entry point; namespaces stay available when precision matters.', mutedStyle, { wrap: true }),
    layout.flex({ direction: 'row', gap: 1, alignItems: 'stretch' }, ...coreCards.map((node) => layout.flexItem(node, { grow: 1, basis: 34, minSize: 30 }))),
  );
}

// Page counts are shared with the update path in app.ts. Keeping them in one place
// stops a new page or locale sample from becoming silently unreachable because only
// one of the two modulo bounds was updated.
export const WORKFLOW_PAGE_LABELS = ['Schema + wizard', 'Typed validation', 'Prompt descriptors'] as const;
export const VISUAL_PAGE_LABELS = ['Overview', 'Text + motion', 'Charts', 'Markdown'] as const;
export const WINDOW_PAGE_LABELS = ['Manager', 'Layout systems'] as const;

const localeSamples = [
  { id: 'en-US', label: 'English', currency: 'USD', text: 'Release 18 Celestial packages' },
  { id: 'de-DE', label: 'Deutsch', currency: 'EUR', text: '18 Celestial-Pakete veröffentlichen' },
  { id: 'ar-EG', label: 'العربية', currency: 'EGP', text: 'إطلاق ١٨ حزمة Celestial' },
  { id: 'ja-JP', label: '日本語', currency: 'JPY', text: 'Celestial 18 パッケージを公開' },
] as const;

export const LOCALE_SAMPLE_COUNT = localeSamples.length;

/**
 * Report whether this runtime actually carries data for a locale.
 *
 * A Node build without full ICU does not throw on `de-DE` or `ja-JP`; it silently
 * resolves them to the default locale and formats English. Without this check the
 * locale instrument renders English receipts in success green under a `ja-JP` heading,
 * which reads as "Rosetta is broken" rather than "this runtime has no locale data".
 */
export function describeLocaleSupport(localeId: string): { supported: boolean; detail: string } {
  const formatters: Array<[string, boolean]> = [
    ['Intl.NumberFormat', typeof Intl.NumberFormat === 'function'],
    ['Intl.DateTimeFormat', typeof Intl.DateTimeFormat === 'function'],
    ['Intl.RelativeTimeFormat', typeof Intl.RelativeTimeFormat === 'function'],
    ['Intl.ListFormat', typeof Intl.ListFormat === 'function'],
  ];
  const missing = formatters.filter(([, present]) => !present).map(([name]) => name);
  if (missing.length > 0) return { supported: false, detail: `${missing.join(', ')} unavailable` };

  try {
    const hasNumbers = Intl.NumberFormat.supportedLocalesOf(localeId).length > 0;
    const hasDates = Intl.DateTimeFormat.supportedLocalesOf(localeId).length > 0;
    if (hasNumbers && hasDates) return { supported: true, detail: 'full ICU data' };
    return { supported: false, detail: `no ICU data, formatting as ${new Intl.NumberFormat(localeId).resolvedOptions().locale}` };
  } catch {
    // supportedLocalesOf throws RangeError on a malformed tag, which is a genuine
    // failure to report rather than a reason to fall back to a green receipt.
    return { supported: false, detail: 'malformed locale tag' };
  }
}

/**
 * Restore a session through an actual serialization round trip.
 *
 * Saving and loading against the same in-memory store cannot fail, so it proves nothing
 * about persistence. Serializing first exercises the property that matters for a real
 * session file: that the saved workspace survives leaving the process.
 */
export function roundTripSession(store: SessionStore, name: string): WorkspaceSession | null {
  return loadSession(JSON.parse(JSON.stringify(store)) as SessionStore, name);
}

function renderLocaleLab(model: CelestialShowcaseModel): VNode {
  const sample = localeSamples[((model.localeIndex % localeSamples.length) + localeSamples.length) % localeSamples.length]!;
  const locale = createLocaleContext({ lang: sample.id, dir: 'auto' });
  const graphemeSample = '👩‍🚀 e\u0301 العربية 日本語';
  const graphemes = segmentGraphemes(graphemeSample);
  const visual = locale.reorderBidi(sample.text);
  const width = Math.max(24, Math.min(54, model.cols - 18));
  const support = describeLocaleSupport(sample.id);
  const formatPanel = panel({
    title: `Locale scope | ${sample.id}`,
    content: column(
      capabilityStatus('locale data', support.detail, support.supported),
      capabilityInfo('language', sample.label),
      capabilityInfo('direction', locale.dir),
      // These receipts pass only when the runtime really has data for the locale.
      // Otherwise Intl formats English and the values below are the default locale's.
      capabilityStatus('number', locale.formatNumber(1234567.89), support.supported),
      capabilityStatus('currency', locale.formatCurrency(12345.67, sample.currency), support.supported),
      capabilityStatus('date', locale.formatDate(Date.UTC(2026, 6, 21), { dateStyle: 'long', timeZone: 'UTC' }), support.supported),
      capabilityStatus('relative', formatRelativeTime(-2, 'day', sample.id), support.supported),
      capabilityStatus('list', formatList(['Atlas', 'Nebula', 'Horizon'], sample.id), support.supported),
    ),
    fill: true,
  });
  const textPanel = panel({
    title: 'Bidi + grapheme terminal lane',
    content: column(
      text(`logical  ${sample.text}`, mutedStyle, { wrap: true }),
      text(`visual   ${visual}`, successStyle, { wrap: true }),
      text(`detected ${detectDirection(sample.text)} | ${measureTextWidth(sample.text)} cells`, actionStyle),
      text(''),
      text(graphemeSample),
      text(`${graphemes.length} graphemes | ${measureTextWidth(graphemeSample)} cells`, mutedStyle),
      text(locale.wrapBidi(sample.text, width).join(' / '), mutedStyle, { wrap: true }),
    ),
    fill: true,
  });

  return column(
    row(text('ROSETTA LOCALE LAB', headingStyle), text('  locale, bidi, and terminal cells', mutedStyle)),
    row(action(model, 'locale-prev', 'Previous locale', 'neutral'), text('  '), action(model, 'locale-next', 'Next locale', 'success')),
    text('Change locale to recompute every receipt through the public Rosetta API.', mutedStyle, { wrap: true }),
    text(''),
    model.cols >= 100 ? splitPane({ direction: 'horizontal', ratio: 0.5, first: formatPanel, second: textPanel, minSize: 30 }) : column(formatPanel, textPanel),
  );
}

function renderCapabilityLedger(model: CelestialShowcaseModel): VNode {
  const pageSize = 6;
  const pageCount = Math.ceil(SHOWCASE_PACKAGE_COVERAGE.length / pageSize);
  const page = ((model.ledgerPage % pageCount) + pageCount) % pageCount;
  const entries = SHOWCASE_PACKAGE_COVERAGE.slice(page * pageSize, (page + 1) * pageSize);
  const liveCount = SHOWCASE_PACKAGE_COVERAGE.filter((entry) => entry.evidence === 'live').length;

  return column(
    row(
      text('CAPABILITY LEDGER', headingStyle),
      text(`  ${SHOWCASE_PACKAGE_COVERAGE.length} packages | ${liveCount} live + ${SHOWCASE_PACKAGE_COVERAGE.length - liveCount} test`, successStyle),
    ),
    text('The ledger is imported by the demo and its tests. Every entry names the instrument that produces its evidence.', mutedStyle, { wrap: true }),
    row(
      action(model, 'ledger-prev', 'Previous ledger', 'neutral'),
      text(`  page ${page + 1}/${pageCount}  `, mutedStyle),
      action(model, 'ledger-next', 'Next ledger', 'success'),
    ),
    text(''),
    ...entries.map((entry) =>
      panel({
        title: `${entry.evidence.toUpperCase()}  ${entry.packageName}`,
        content: row(
          text(`${entry.lab.padEnd(18)} `, mutedStyle),
          runtime.flex(text(entry.capabilities.join(' | '), undefined, { wrap: true }), { flex: 1, minWidth: 1 }),
        ),
      }),
    ),
  );
}

export function renderCoreLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const navigation = row(
    action(
      model,
      'core-foundations',
      model.corePage === 'foundations' ? 'Foundations [active]' : 'Foundations',
      model.corePage === 'foundations' ? 'success' : 'neutral',
    ),
    text('  '),
    action(model, 'core-locale', model.corePage === 'locale' ? 'Locale [active]' : 'Locale', model.corePage === 'locale' ? 'success' : 'neutral'),
    text('  '),
    action(model, 'core-ledger', model.corePage === 'ledger' ? 'Ledger [active]' : 'Ledger', model.corePage === 'ledger' ? 'success' : 'neutral'),
  );
  const content =
    model.corePage === 'locale' ? renderLocaleLab(model) : model.corePage === 'ledger' ? renderCapabilityLedger(model) : renderFoundationsLab(model, caps);
  return column(navigation, text(''), content);
}

function ansiBlock(content: string): VNode {
  return column(...content.split('\n').map((line) => text(line || ' ')));
}

function renderWorkflowOverview(components: ShowcaseComponents, model: CelestialShowcaseModel): VNode {
  const graph = components.wizardComponent.getGraph();
  const density = model.schemaForm.values['density'] === 'compact' ? 'compact' : 'balanced';
  const compact = density === 'compact';
  const comfortableRows = !compact && model.rows >= 44;
  const panelPadding: number | [number, number] = compact ? 0 : comfortableRows ? [1, 2] : [0, 2];
  const splitThreshold = compact ? 84 : 100;
  const schemaPanel = panel({
    title: `Schema form | ${compact ? 'compact' : 'balanced'}`,
    content: compact
      ? column(components.schemaFormComponent.view(model.schemaForm), action(model, 'workflow-toggle-motion', 'Toggle reduced motion', 'info'))
      : column(
          components.schemaFormComponent.view(model.schemaForm),
          ...(comfortableRows ? [text('')] : []),
          action(model, 'workflow-toggle-motion', 'Toggle reduced motion', 'info'),
          ...(comfortableRows ? [text('')] : []),
          text(
            comfortableRows ? 'Balanced density adds breathing room around workflow controls.' : 'Balanced density keeps horizontal panel padding.',
            mutedStyle,
            {
              wrap: true,
            },
          ),
        ),
    padding: panelPadding,
    fill: true,
  });
  const wizardPanel = panel({
    title: `Release wizard | ${compact ? 'compact' : 'balanced'}`,
    content: column(
      components.wizardComponent.view(model.wizard),
      ...(comfortableRows ? [text('')] : []),
      row(
        action(model, 'workflow-prev', 'Back', 'neutral'),
        text(compact ? ' ' : '  '),
        action(model, 'workflow-next', model.wizard.finished ? 'Restart workflow' : 'Advance step', 'success'),
      ),
      ...(comfortableRows ? [text('')] : []),
      text(`Graph ${graph.stepOrder.join(' -> ')} | visited ${model.wizard.visited.length}`, mutedStyle, { wrap: true }),
    ),
    padding: panelPadding,
    fill: true,
  });

  return column(
    row(
      text('ORBIT WORKFLOWS', headingStyle),
      text('  '),
      badge({ label: compact ? 'Compact density' : 'Balanced density', variant: compact ? 'info' : 'success', size: 'sm' }).view({ visible: true }),
      text('  schema-driven and Elm-native', mutedStyle),
    ),
    text(
      compact
        ? 'Compact density removes spacer rows and lowers the split breakpoint; fields and focus remain explicit in the application model.'
        : 'Balanced density adds panel padding and workflow context while fields and focus remain explicit in the application model.',
      compact ? warningStyle : successStyle,
      { wrap: true },
    ),
    ...(comfortableRows ? [text('')] : []),
    model.cols >= splitThreshold
      ? splitPane({ direction: 'horizontal', ratio: 0.56, first: schemaPanel, second: wizardPanel, minSize: 28 })
      : column(schemaPanel, wizardPanel),
    ...(comfortableRows ? [text('')] : []),
    text(
      `Active density: ${compact ? 'compact' : 'balanced'} | Mouse controls are primary; Tab and wizard navigation remain available as keyboard backup.`,
      mutedStyle,
      { wrap: true },
    ),
  );
}

function renderValidationLab(model: CelestialShowcaseModel): VNode {
  const samples = ['release@celestial.dev', 'broken-address', 'ops@example.org'];
  const sample = samples[((model.workflowVariant % samples.length) + samples.length) % samples.length]!;
  const rules = [minLength(8), email()];
  const ruleErrors = runRules(rules, sample);
  const accountForm = form({
    fields: {
      email: { label: 'Release contact', defaultValue: '', validate: rules, validateOn: 'change' },
      retries: { label: 'Retry budget', type: 'number', defaultValue: 3 },
    },
  });
  let [formModel] = accountForm.init();
  formModel = accountForm.setValue(formModel, 'email', sample);
  formModel = accountForm.validate(formModel);
  const values = accountForm.getValues(formModel);
  const schema = {
    fields: [
      { kind: 'text', name: 'channel', label: 'Channel', required: true },
      { kind: 'toggle', name: 'signed', label: 'Signed', default: false },
    ],
  };
  const schemaResult = validateArgSchema(schema);
  // parseArgSchema() throws on an invalid schema, so it may only be called inside the
  // success branch; calling it unconditionally made the 'invalid' receipt unreachable.
  const schemaReceipt = schemaResult.success
    ? `${parseArgSchema(schema).fields.length} fields`
    : schemaResult.issues.map((issue) => `${issue.path || 'schema'}: ${issue.message}`).join(' | ');

  return column(
    row(text('ORBIT FORM ENGINE', headingStyle), text('  typed values + validation + schema parsing', mutedStyle)),
    action(model, 'workflow-cycle', 'Cycle validation sample', ruleErrors.length ? 'warning' : 'success'),
    text(''),
    panel({
      title: ruleErrors.length ? 'Validation rejected' : 'Validation accepted',
      content: column(
        capabilityInfo('email', values.email),
        capabilityStatus('valid', String(formModel.valid), formModel.valid),
        capabilityInfo('dirty fields', accountForm.getDirtyFields(formModel).join(', ') || 'none'),
        capabilityStatus('errors', ruleErrors.join(' | ') || 'none', ruleErrors.length === 0),
        capabilityStatus('schema', schemaReceipt, schemaResult.success),
      ),
    }),
    panel({ title: 'Live typed form view', content: accountForm.view(formModel), fill: true }),
  );
}

function renderPromptLab(model: CelestialShowcaseModel): VNode {
  const variant = ((model.workflowVariant % 3) + 3) % 3;
  const input = inputPrompt({ message: 'Release name', defaultValue: variant === 0 ? 'preview' : variant === 1 ? 'candidate' : 'stable' });
  let [inputModel] = input.init();
  [inputModel] = input.update({ type: 'prompt:submit' }, inputModel);
  const confirm = confirmPrompt({ message: 'Publish this channel?', defaultValue: false });
  let [confirmModel] = confirm.init();
  [confirmModel] = confirm.update({ type: variant === 2 ? 'confirm:yes' : 'confirm:no' }, confirmModel);
  const select = selectPrompt({ message: 'Channel', options: ['preview', 'next', 'latest'] });
  let [selectModel] = select.init();
  [selectModel] = select.update({ type: 'select:choose-at', index: variant }, selectModel);
  const multi = multiSelectPrompt({ message: 'Checks', options: ['types', 'unit', 'pty'], minSelect: 1 });
  let [multiModel] = multi.init();
  [multiModel] = multi.update({ type: 'multi:toggle-at', index: variant }, multiModel);

  return column(
    row(text('ORBIT PROMPT CONSOLE', headingStyle), text('  deterministic descriptors, host-owned IO', mutedStyle)),
    action(model, 'workflow-cycle', 'Cycle prompt outcome', 'success'),
    text(''),
    panel({ title: 'Input + confirmation', content: column(input.view(inputModel), confirm.view(confirmModel)), fill: true }),
    panel({ title: 'Single + multi select', content: column(select.view(selectModel), multi.view(multiModel)), fill: true }),
    text(
      `Receipts: name=${input.getValue(inputModel)} | publish=${confirm.getValue(confirmModel)} | channel=${select.getValue(selectModel)} | checks=${multi.getValue(multiModel).join(',')}`,
      mutedStyle,
      {
        wrap: true,
      },
    ),
  );
}

export function renderWorkflowsLab(components: ShowcaseComponents, model: CelestialShowcaseModel): VNode {
  const pageCount = WORKFLOW_PAGE_LABELS.length;
  const page = ((model.workflowPage % pageCount) + pageCount) % pageCount;
  const labels = WORKFLOW_PAGE_LABELS;
  const content = page === 1 ? renderValidationLab(model) : page === 2 ? renderPromptLab(model) : renderWorkflowOverview(components, model);
  return column(
    row(
      action(model, 'workflow-page-prev', 'Previous workflow', 'neutral'),
      text(`  ${page + 1}/${pageCount} ${labels[page]}  `, mutedStyle),
      action(model, 'workflow-page-next', 'Next workflow', 'success'),
    ),
    text(''),
    content,
  );
}

function renderVisualOverview(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const width = Math.max(12, Math.min(46, model.cols - 18));
  const motionTick = caps.reducedMotion ? 0 : model.tick;
  const highlighted = highlightCode('const release = validate({ unicode: true });', { language: 'typescript', theme: 'dracula' });
  const gradientText = gradient('Mirage preserves grapheme clusters: 👩‍🚀 e\u0301', {
    colors: [defaultTheme.colors.tones.accent, defaultTheme.colors.tones.success],
  });
  const shimmerText = shimmer('Motion follows terminal preference', {
    tick: motionTick,
    color: defaultTheme.colors.tones.accent,
    baseColor: defaultTheme.colors.muted,
    reduceMotion: caps.reducedMotion,
  });
  const transition = fadeTransition({ duration: 20, reduceMotion: caps.reducedMotion });
  const transitionState = transition.tick(transition.start(0), caps.reducedMotion ? 20 : model.tick % 21);
  const transitioned = transition.render('private research', 'focused public preview', transitionState);
  const lineChart = chart.line({ data: [3, 5, 4, 8, 7, 11, 10], width, height: 5, filled: false }).toString();
  const markdown = renderMarkdown('**Pulsar** renders safely\n\n- CRLF normalized\n- Unicode width aware\n- Spectrum highlighted', {
    width,
    reduceMotion: caps.reducedMotion,
  });
  const textPanel = panel({
    title: 'Spectrum + Mirage + Nova',
    content: column(
      text('Spectrum / TypeScript', titleStyle),
      text(highlighted),
      text(''),
      text(gradientText),
      text(shimmerText),
      text(`Nova ${Math.round(transitionState.progress * 100)}%  ${transitioned}`, mutedStyle),
      text(caps.reducedMotion ? 'Reduced motion: static end states' : 'Motion enabled: deterministic ticks', caps.reducedMotion ? warningStyle : successStyle),
    ),
    fill: true,
  });
  const renderPanel = panel({
    title: 'Stellar + Pulsar',
    content: column(text('Stellar line chart', titleStyle), ansiBlock(lineChart), text(''), ansiBlock(markdown)),
    fill: true,
  });

  return column(
    row(text('RICH TERMINAL RENDERING', headingStyle), text('  public-safe adapters', mutedStyle)),
    text('Stateful highlighting, opt-out motion, braille charts, and Markdown share one Unicode-aware render lane.', mutedStyle, { wrap: true }),
    text(''),
    model.cols >= 100 ? splitPane({ direction: 'horizontal', ratio: 0.5, first: textPanel, second: renderPanel, minSize: 30 }) : column(textPanel, renderPanel),
  );
}

function renderTextMotionLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const source = 'const deck = release({ packages: 18, safe: true });';
  const language = detectLanguage('flight-deck.ts') ?? 'plaintext';
  const tokens = tokenizeCode(source, language) ?? [];
  const highlighted = highlightCode(source, { language, theme: 'dracula' });
  const controllers = [fadeTransition, slideTransition, morphTransition] as const;
  const names = ['fade', 'slide', 'morph'] as const;
  const variant = ((model.visualVariant % controllers.length) + controllers.length) % controllers.length;
  const controller = controllers[variant]!({ duration: 20, reduceMotion: caps.reducedMotion });
  const state = controller.tick(controller.start(0), caps.reducedMotion ? 20 : model.tick % 21);
  const transitioned = controller.render('private surface', 'public flight deck', state);
  const wave = underlineWave('Width-safe motion instrument', {
    color: defaultTheme.colors.tones.accent,
    tick: caps.reducedMotion ? 0 : model.tick,
    reduceMotion: caps.reducedMotion,
  });
  const glowText = glow('semantic terminal light', { color: defaultTheme.colors.tones.success, intensity: 1 });

  return column(
    row(text('TEXT + MOTION INSTRUMENT', headingStyle), text(`  ${names[variant]} transition`, successStyle)),
    action(model, 'visual-cycle', 'Cycle transition and effects', 'success'),
    text(''),
    panel({
      title: `Spectrum detected ${language} | ${tokens.length} tokens`,
      content: column(text(highlighted), text(`categories ${[...new Set(tokens.map((token) => token.category))].join(' | ')}`, mutedStyle, { wrap: true })),
    }),
    panel({
      title: 'Mirage + Nova',
      content: column(
        text(`${names[variant]} ${Math.round(state.progress * 100)}%  ${transitioned}`),
        ansiBlock(wave),
        ansiBlock(glowText),
        text(caps.reducedMotion ? 'Reduced motion resolves to deterministic end states.' : 'Cycle changes the live transition strategy.', mutedStyle, {
          wrap: true,
        }),
      ),
    }),
  );
}

function renderChartLab(model: CelestialShowcaseModel): VNode {
  const shift = model.visualVariant % 4;
  const data = [3, 5, 4, 8, 7, 11, 10].map((value, index) => value + ((index + shift) % 3));
  const width = Math.max(18, Math.min(42, model.cols - 20));
  const line = chart.line({ data, width, height: 4, filled: false }).toString();
  const area = areaChart({ series: [{ label: 'receipts', data }], width, height: 4 }).toString();
  const heat = heatmap({ data: [data.slice(0, 4), data.slice(3, 7)], rowLabels: ['A', 'B'], cellWidth: 2 }).toString();
  const spark = sparkline({ data, width: Math.min(24, width), height: 2, showRange: true }).toString();
  const primary = panel({ title: 'Line + area', content: column(ansiBlock(line), text(''), ansiBlock(area)), fill: true });
  const secondary = panel({ title: 'Heatmap + sparkline', content: column(ansiBlock(heat), text(''), ansiBlock(spark)), fill: true });

  return column(
    row(text('STELLAR CHART DECK', headingStyle), text('  four renderers, shared data', mutedStyle)),
    action(model, 'visual-cycle', 'Shift live dataset', 'success'),
    text(''),
    model.cols >= 100 ? splitPane({ direction: 'horizontal', ratio: 0.55, first: primary, second: secondary, minSize: 28 }) : column(primary, secondary),
  );
}

function renderMarkdownLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const width = Math.max(20, Math.min(54, model.cols - 18));
  const source = `---\ntitle: Flight Deck\nchannel: preview\n---\n# Release ledger\n\nThe **release** keeps terminal cells safe.\n\n## Checks\n\n- Build\n- PTY\n- Packed install\n\n\`\`\`ts\nconst release = validate(18);\n\`\`\``;
  const frontmatter = extractFrontmatter(source);
  const toc = extractToc(frontmatter.body);
  const tokens = parseMarkdown(frontmatter.body);
  const matches = findMatches(tokens, 'release');
  const stream = createMarkdownStream({ width, reduceMotion: caps.reducedMotion });
  stream.append('# Streaming receipt\n\n');
  const pending = stream.append('A partial **release');
  const committed = stream.append('** update.\n\n- deterministic\n');
  const rendered = renderMarkdown(frontmatter.body, { width, reduceMotion: caps.reducedMotion });

  return column(
    row(text('PULSAR DOCUMENT INSTRUMENT', headingStyle), text('  parser, search, TOC, stream', mutedStyle)),
    panel({
      title: 'Document receipts',
      content: column(
        // Pulsar's parsers return empty results rather than throwing, so an empty value
        // here means the parse gave up. Without these predicates that rendered as green.
        capabilityStatus('frontmatter', Object.keys(frontmatter.data).join(', ') || 'not parsed', Object.keys(frontmatter.data).length > 0),
        capabilityStatus('headings', toc.map((entry) => entry.text).join(' > ') || 'none extracted', toc.length > 0),
        capabilityStatus('search matches', String(matches.length), matches.length > 0),
        capabilityStatus('stream pending', String(pending.pendingSource.length), pending.pendingSource.length > 0),
        capabilityStatus('stream tokens', String(committed.tokens.length), committed.tokens.length > 0),
      ),
    }),
    panel({ title: 'Rendered Markdown', content: ansiBlock(rendered), fill: true }),
  );
}

export function renderVisualsLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const pageCount = VISUAL_PAGE_LABELS.length;
  const page = ((model.visualPage % pageCount) + pageCount) % pageCount;
  const labels = VISUAL_PAGE_LABELS;
  const content =
    page === 1
      ? renderTextMotionLab(model, caps)
      : page === 2
        ? renderChartLab(model)
        : page === 3
          ? renderMarkdownLab(model, caps)
          : renderVisualOverview(model, caps);
  return column(
    row(
      action(model, 'visual-prev', 'Previous visual', 'neutral'),
      text(`  ${page + 1}/${pageCount} ${labels[page]}  `, mutedStyle),
      action(model, 'visual-next', 'Next visual', 'success'),
    ),
    text(''),
    content,
  );
}

export function renderMouseLab(model: CelestialShowcaseModel): VNode {
  const target = event(
    'showcase-mouse-target',
    box(
      column(
        text('MOUSE TARGET', headingStyle),
        text('Move, click, wheel, or press here.'),
        text(`pointer ${String(model.pointer.x).padStart(3)},${String(model.pointer.y).padStart(3)}  event ${model.pointer.type}`, actionStyle),
        text(`target ${model.pointer.target}  clicks ${model.pointer.clicks}`, mutedStyle),
        text(model.pointer.hovering ? 'hover region active' : 'move the pointer into this region', model.pointer.hovering ? successStyle : mutedStyle),
      ),
      style({ border: border.rounded, color: model.pointer.hovering ? defaultTheme.colors.borderActive : defaultTheme.colors.border, padding: 1, width: 48 }),
      { width: 48, height: 7 },
    ),
    {
      onClick: 'showcase-mouse:click',
      onMouseEnter: 'showcase-mouse:enter',
      onMouseLeave: 'showcase-mouse:leave',
      onMouseDown: 'showcase-mouse:down',
      onMouseUp: 'showcase-mouse:up',
      onMouseMove: 'showcase-mouse:move',
      onScroll: 'showcase-mouse:scroll',
    },
    { label: 'Mouse event target', intent: 'select', affordances: ['click', 'hover', 'drag', 'scroll'], cursor: 'crosshair' },
  );
  runtime.setVNodeMeta(target, { a11y: { role: 'button', label: 'Mouse event target' } });

  const telemetry = panel({
    title: 'Pointer receipts',
    content: column(
      capabilityInfo('coordinates', `${model.pointer.x}, ${model.pointer.y}`),
      capabilityInfo('event type', model.pointer.type),
      capabilityInfo('element target', model.pointer.target),
      capabilityInfo('click count', String(model.pointer.clicks)),
      capabilityInfo('tracking', model.pointer.hovering ? 'inside target' : 'global'),
    ),
  });

  const dragOffset = getDragOffset(model.dragDemo);
  const dragging = model.dragDemo.phase === 'dragging';
  const overDropBay = model.dragDemo.phase === 'dragging' && model.dragDemo.hoveredTargetId === 'verification-bay';
  const sourceHovered = model.hoveredRegion === 'drag-source';
  const targetHovered = model.hoveredRegion === 'drag-target';
  const source = event(
    'showcase-drag-source',
    box(
      column(
        text('DRAG SOURCE', headingStyle),
        text('verification receipt', dragging ? successStyle : titleStyle),
        text(dragOffset ? `offset ${dragOffset.dx}, ${dragOffset.dy}` : 'hold and drag the full card', mutedStyle),
      ),
      style({
        border: border.rounded,
        color: dragging || sourceHovered ? defaultTheme.colors.borderActive : defaultTheme.colors.border,
        background: dragging ? defaultTheme.states.active.bg : defaultTheme.elevation.raised.surface,
        padding: 1,
      }),
      { height: 7 },
    ),
    {
      onMouseDown: 'showcase-drag:start',
      onMouseEnter: 'showcase-drag:source-enter',
      onMouseLeave: 'showcase-drag:source-leave',
    },
    { label: 'Verification receipt drag source', intent: 'drag', affordances: ['hover', 'drag'], cursor: 'grab' },
  );
  runtime.setVNodeMeta(source, { a11y: { role: 'button', label: 'Verification receipt drag source' } });

  const dropBay = event(
    'showcase-drag-target',
    box(
      column(
        text(overDropBay ? 'DROP BAY - RELEASE' : 'DROP BAY', headingStyle),
        text(model.lastDroppedReceipt ?? 'Drag the receipt here.'),
        text(`${model.droppedReceipts} payload${model.droppedReceipts === 1 ? '' : 's'} accepted`, model.droppedReceipts > 0 ? successStyle : mutedStyle),
      ),
      style({
        border: border.rounded,
        color: overDropBay || targetHovered ? defaultTheme.colors.borderActive : defaultTheme.colors.border,
        background: overDropBay ? defaultTheme.states.active.bg : targetHovered ? defaultTheme.states.hover.bg : defaultTheme.elevation.raised.surface,
        padding: 1,
      }),
      { height: 7 },
    ),
    {
      onMouseEnter: 'showcase-drag:over',
      onMouseLeave: 'showcase-drag:leave',
      onMouseUp: 'showcase-drag:drop',
    },
    { label: 'Verification receipt drop bay', intent: 'drag', affordances: ['hover', 'drag'], cursor: 'copy' },
  );
  runtime.setVNodeMeta(dropBay, { a11y: { role: 'button', label: 'Verification receipt drop bay' } });

  const dragBoard =
    model.cols >= 80 ? splitPane({ direction: 'horizontal', ratio: 0.46, first: source, second: dropBay, minSize: 22 }) : column(source, dropBay);

  return column(
    row(text('MOUSE + NEXUS', headingStyle), text('  mouse-first, keyboard-backed', mutedStyle)),
    text('Sub.mouse supplies terminal coordinates; event-scoped regions supply semantic targets and propagation.', mutedStyle, { wrap: true }),
    text('Right-click labs, controls, windows, or blank panel space for a target-specific menu; arrows and Escape provide keyboard backup.', actionStyle, {
      wrap: true,
    }),
    text(''),
    model.cols >= 100 ? splitPane({ direction: 'horizontal', ratio: 0.58, first: target, second: telemetry, minSize: 30 }) : target,
    text(''),
    row(text('NEXUS DRAG/DROP', headingStyle), text('  semantic source + target', mutedStyle)),
    dragBoard,
    text('Hold the receipt, move into the bay, and release. Escape cancels an active drag.', mutedStyle, { wrap: true }),
  );
}

export function renderLayersLab(model: CelestialShowcaseModel): VNode {
  const layerNames: SurfaceId[] = ['modal', 'confirm', 'drawer', 'tooltip', 'palette', 'toast'];
  return column(
    row(text('LAYER COMPOSITION', headingStyle), text('  Nebula + curated surfaces', mutedStyle)),
    text('Every action adds a real transparent layer over this base. The deck must remain visible outside the surface.', mutedStyle, { wrap: true }),
    text(''),
    panel({
      title: 'Base application - should never disappear',
      content: column(
        text(`Frame ${model.tick} is still updating beneath transient UI.`),
        progressBar({ label: 'mission receipts', value: model.completed.size / SMOKE_STEPS.length, width: 28 }),
        text(`Last action: ${model.lastAction}`, mutedStyle, { wrap: true }),
      ),
      fill: true,
    }),
    text(''),
    ...layerNames.map((_, index) =>
      index % 3 === 0
        ? row(
            action(model, layerNames[index]!, layerNames[index]!, 'accent'),
            text('  '),
            layerNames[index + 1] ? action(model, layerNames[index + 1]!, layerNames[index + 1]!, 'warning') : text(''),
            text('  '),
            layerNames[index + 2] ? action(model, layerNames[index + 2]!, layerNames[index + 2]!, 'info') : text(''),
          )
        : text(''),
    ),
    text('Escape, visible close controls, and click-away dismissal are mandatory.', mutedStyle, { wrap: true }),
  );
}

export function renderWindowContent(model: CelestialShowcaseModel, id: string): VNode {
  const active = getActiveWorkspace(model.workspaces);
  if (id === 'telemetry') {
    return column(
      text('Live instrument bus', titleStyle),
      // A missing active workspace is a real desync, not a value worth painting green.
      capabilityStatus('workspace', active?.name ?? 'none', active !== undefined),
      capabilityInfo('viewport', `${model.cols} x ${model.rows}`),
      capabilityInfo('pointer', `${model.pointer.x},${model.pointer.y}`),
      capabilityInfo('receipts', `${model.completed.size}/${SMOKE_STEPS.length}`),
      text('Drag anywhere on the titlebar outside its controls.', mutedStyle),
    );
  }
  return column(
    text('Deterministic event ledger', titleStyle),
    text(`frame ${model.tick}: view reconciled`),
    text(`frame ${Math.max(0, model.tick - 1)}: subscriptions stable`),
    text(`frame ${Math.max(0, model.tick - 2)}: layout committed`),
    text(`last: ${model.lastAction}`, mutedStyle, { wrap: true }),
  );
}

function renderWindowManagerLab(model: CelestialShowcaseModel): VNode {
  const active = getActiveWorkspace(model.workspaces);
  const front = getVisibleWindows(model.windows)[0];
  const workspaceBar = createTabBar({
    tabs: model.workspaces.workspaces.map((workspace, index) => ({ id: workspace.id, label: workspace.name, content: text(`Workspace ${index + 1}`) })),
    active: active?.id ?? 'flight',
    onSelect: (id) => `showcase-workspace:${id}`,
  });
  const managerRows = model.windows.windows.length
    ? model.windows.windows.map((window) =>
        row(
          text(`${window.title ?? window.id}`.padEnd(20), window.focused ? actionStyle : undefined),
          badge({ label: window.mode ?? 'normal', variant: window.mode === 'maximized' ? 'warning' : 'info', size: 'sm' }).view({ visible: true }),
          text(`  ${window.workspaceId ?? 'global'}  ${window.x},${window.y} ${window.width}x${window.height}`, mutedStyle),
        ),
      )
    : [text('All instruments are closed.', mutedStyle)];
  const openLabel = (id: 'telemetry' | 'events', label: string): string => {
    const window = model.windows.windows.find((entry) => entry.id === id);
    if (!window) return `Open ${label} here`;
    if (window.workspaceId !== model.windows.activeWorkspaceId) return `Bring ${label} here`;
    if (window.minimized || window.mode === 'minimized' || window.hidden || window.mode === 'hidden') return `Restore ${label}`;
    return `Focus ${label}`;
  };
  const controls = row(
    action(model, 'reopen-telemetry', openLabel('telemetry', 'telemetry'), 'success'),
    text('  '),
    action(model, 'reopen-events', openLabel('events', 'events'), 'success'),
  );
  const tier = viewportTier(model.cols);

  return column(
    row(text('HORIZON WINDOW DECK', headingStyle), text('  beta', warningStyle), text(`  ${tier} representation`, mutedStyle)),
    workspaceBar,
    text(active?.summary ?? '', mutedStyle, { wrap: true }),
    text(''),
    panel({
      title: 'Window manager state',
      content: column(controls, text('Open/Bring places the instrument in this workspace.', mutedStyle), text(''), ...managerRows),
      focused: true,
    }),
    text(''),
    ...(tier === 'compact'
      ? [
          front
            ? panel({ title: `Live instrument - ${front.title ?? front.id}`, content: renderWindowContent(model, front.id), focused: front.focused })
            : text('No visible instrument in this workspace. Restore one from the shelf or use an Open action.', mutedStyle, { wrap: true }),
          text(''),
        ]
      : []),
    tier === 'wide'
      ? text(
          'Floating instruments are live above this workspace. Drag any open titlebar space; use chrome to minimize, maximize, restore, or close.',
          successStyle,
          { wrap: true },
        )
      : tier === 'medium'
        ? text('Medium mode keeps the front instrument live in the Context split. Resize to 120+ columns for draggable floating windows.', warningStyle, {
            wrap: true,
          })
        : text('Compact mode keeps the front instrument live inline. Resize to 120+ columns for floating windows.', warningStyle, { wrap: true }),
  );
}

function renderWindowLayoutLab(model: CelestialShowcaseModel): VNode {
  const bounds = {
    cols: Math.max(24, model.cols - (model.cols >= 120 ? 32 : 8)),
    rows: Math.max(10, model.rows - 16),
  };
  const snapZones = computeSnapZones(bounds);
  const zoneIndex = ((model.windowVariant % snapZones.length) + snapZones.length) % snapZones.length;
  const selectedZone = snapZones[zoneIndex]!;
  const snappedFrame = applySnapZone({ x: 3, y: 2, width: Math.min(30, bounds.cols), height: Math.min(10, bounds.rows) }, selectedZone);
  const activeWorkspace = getActiveWorkspace(model.workspaces);
  const sessionStore = saveSession(createSessionStore(), {
    name: 'flight-deck',
    workspace: {
      layout: {
        snapZone: selectedZone.id,
        tileAxis: model.windowVariant % 2 === 0 ? 'columns' : 'rows',
        windows: model.windows.windows.map((window) => window.id),
      },
      activeIndex: model.workspaces.activeIndex,
    },
    preview: { title: 'Flight Deck instruments', panes: model.windows.windows.length },
    savedAt: 1,
  });
  const savedPanes = model.windows.windows.length;
  const restoredSession = roundTripSession(sessionStore, 'flight-deck');
  const restoredPanes = restoredSession?.preview.panes ?? 0;
  // A same-tick save/load could not fail, so it proved nothing. Comparing the restored
  // pane count against what was saved makes this an assertion the demo can actually lose.
  const sessionRestored = restoredSession !== null && restoredPanes === savedPanes;
  const panes = [
    panel({ title: 'Telemetry tile', content: column(text('Live instrument bus'), text(`${model.cols} x ${model.rows}`, mutedStyle)), fill: true }),
    panel({ title: 'Events tile', content: column(text('Deterministic ledger'), text(`frame ${model.tick}`, mutedStyle)), fill: true }),
    panel({ title: 'Session tile', content: column(text(activeWorkspace?.name ?? 'No workspace'), text('restorable', successStyle)), fill: true }),
  ];
  const tileAxis = model.windowVariant % 2 === 0 ? 'columns' : 'rows';
  const tiled = tile(tileAxis === 'columns' ? tileColumns(...panes) : tileRows(...panes));
  const snapPanel = panel({
    title: `Snap zone ${zoneIndex + 1}/${snapZones.length}`,
    content: column(
      capabilityInfo('zone', selectedZone.label ?? selectedZone.id),
      capabilityInfo('kind', selectedZone.kind),
      capabilityInfo('target frame', `${snappedFrame.x},${snappedFrame.y} ${snappedFrame.width}x${snappedFrame.height}`),
      capabilityInfo('tile layout', tileAxis),
      capabilityStatus('saved sessions', listSessions(sessionStore).join(', ') || 'none', listSessions(sessionStore).length > 0),
      capabilityStatus('session round trip', sessionRestored ? `restored via JSON` : 'lost in transport', sessionRestored),
      capabilityStatus('restored panes', `${restoredPanes}/${savedPanes}`, sessionRestored),
    ),
  });

  return column(
    row(text('HORIZON LAYOUT SYSTEMS', headingStyle), text('  snap, tile, persist, restore', mutedStyle)),
    action(model, 'window-cycle', 'Cycle snap zone and tile axis', 'success'),
    text('Every cycle recomputes a bounded snap frame, a recursive tile tree, and a serializable workspace session.', mutedStyle, { wrap: true }),
    text(''),
    snapPanel,
    panel({ title: `Tiled workspace | ${tileAxis}`, content: tiled, fill: true }),
  );
}

export function renderWindowsLab(model: CelestialShowcaseModel): VNode {
  const pageCount = WINDOW_PAGE_LABELS.length;
  const page = ((model.windowPage % pageCount) + pageCount) % pageCount;
  return column(
    row(
      action(model, 'window-page-prev', 'Previous window system', 'neutral'),
      text(`  ${page + 1}/${pageCount} ${WINDOW_PAGE_LABELS[page]}  `, mutedStyle),
      action(model, 'window-page-next', 'Next window system', 'success'),
    ),
    text(''),
    page === 0 ? renderWindowManagerLab(model) : renderWindowLayoutLab(model),
  );
}

function smokeNode(model: CelestialShowcaseModel, step: (typeof SMOKE_STEPS)[number], complete: boolean): VNode {
  const region = `smoke:${step.id}`;
  const hovered = model.hoveredRegion === region;
  const checkStyle = hovered
    ? style({ color: defaultTheme.colors.tones.success, background: defaultTheme.states.hover.bg, bold: true })
    : complete
      ? successStyle
      : mutedStyle;
  const labelStyle = hovered
    ? style({ color: defaultTheme.colors.text, background: defaultTheme.states.hover.bg, bold: true })
    : complete
      ? successStyle
      : titleStyle;
  const detailStyle = hovered ? style({ color: defaultTheme.colors.textSoft, background: defaultTheme.states.hover.bg }) : complete ? successStyle : mutedStyle;
  const detail = complete ? 'verified' : step.instruction;
  const labelWidth = model.cols < 120 ? 21 : 24;
  const content = row(
    text(complete ? '[x] ' : '[ ] ', checkStyle),
    text(step.label.padEnd(labelWidth), labelStyle),
    runtime.flex(text(detail, detailStyle, { wrap: true }), { flex: 1, minWidth: 1 }),
  );
  const node = event(
    `showcase-smoke:${step.id}`,
    content,
    { onClick: `showcase-smoke:${step.id}`, onMouseEnter: `showcase-hover:${region}`, onMouseLeave: `showcase-leave:${region}` },
    { label: `${step.label}: ${complete ? 'verified' : step.instruction}`, intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label: step.label, checked: complete } });
  return node;
}

export function renderSmokeLab(model: CelestialShowcaseModel): VNode {
  const completeCount = SMOKE_STEPS.filter((step) => model.completed.has(step.id)).length;
  return column(
    row(
      text('MISSION CONSTELLATION', headingStyle),
      text(`  ${completeCount}/${SMOKE_STEPS.length} receipts`, completeCount === SMOKE_STEPS.length ? successStyle : warningStyle),
    ),
    progressBar({ label: 'interactive smoke', value: completeCount / SMOKE_STEPS.length, width: Math.min(36, Math.max(16, model.cols - 32)) }),
    text('The checklist records behaviors exercised in this session. Click an incomplete row to jump to its lab.', mutedStyle, { wrap: true }),
    text(''),
    ...SMOKE_STEPS.map((step) => smokeNode(model, step, model.completed.has(step.id))),
    text(''),
    completeCount === SMOKE_STEPS.length
      ? text('Interactive smoke complete. Run pnpm --filter @celestial/demo-showcase test and test:pty for automated receipts.', successStyle, { wrap: true })
      : text('Manual and automated smoke instructions live in examples/celestial-showcase/README.md.', mutedStyle, { wrap: true }),
  );
}

export function labForSmoke(id: SmokeId): LabId {
  return SMOKE_STEPS.find((step) => step.id === id)?.lab ?? 'smoke';
}
