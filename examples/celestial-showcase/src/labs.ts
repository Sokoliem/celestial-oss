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
  style,
  styling,
  text,
  tween,
  type VNode,
  validateThemeContrast,
} from '@celestial/core';
import { createTabBar, getActiveWorkspace, panel, splitPane } from '@celestial/horizon';
import { badge, button, progressBar } from '@celestial/ui';
import type { CelestialShowcaseModel, LabId, SmokeId, SurfaceId, ViewportTier } from './types.js';

export const LABS: Array<{ id: LabId; label: string; key: string; summary: string }> = [
  { id: 'core', label: 'Core', key: '1', summary: 'Six foundations, one facade' },
  { id: 'components', label: 'Components', key: '2', summary: '27 curated builders' },
  { id: 'mouse', label: 'Mouse', key: '3', summary: 'Pointer and hit regions' },
  { id: 'layers', label: 'Layers', key: '4', summary: 'Stacked transient surfaces' },
  { id: 'windows', label: 'Windows', key: '5', summary: 'Horizon beta management' },
  { id: 'smoke', label: 'Smoke', key: '6', summary: 'Live verification receipts' },
];

export const SMOKE_STEPS: Array<{ id: SmokeId; label: string; lab: LabId; instruction: string }> = [
  { id: 'core', label: 'Core inspected', lab: 'core', instruction: 'Visit the Core lab.' },
  { id: 'component', label: 'Component changed', lab: 'components', instruction: 'Toggle or edit a curated control.' },
  { id: 'mouse-click', label: 'Mouse target clicked', lab: 'mouse', instruction: 'Click inside the pointer target.' },
  { id: 'mouse-drag', label: 'Payload dropped', lab: 'mouse', instruction: 'Drag the receipt into the drop bay.' },
  { id: 'layer', label: 'Layer composed', lab: 'layers', instruction: 'Open and dismiss any transient surface.' },
  { id: 'adaptive', label: 'Breakpoint crossed', lab: 'windows', instruction: 'Resize across 120 or 80 columns.' },
  { id: 'window', label: 'Window managed', lab: 'windows', instruction: 'Focus, minimize, maximize, restore, or close a window.' },
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
    { onClick: `showcase-action:${id}`, onMouseEnter: `showcase-hover:${region}`, onMouseLeave: `showcase-leave:${region}` },
    { label, intent: id, affordances: ['hover', 'click'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function capabilityStatus(label: string, value: string, good = true): VNode {
  return row(text(`${label.padEnd(18)} `, mutedStyle), text(value, good ? successStyle : warningStyle));
}

function coreCard(title: string, content: VNode, width = 34, height = 14): VNode {
  return box(column(text(title, titleStyle), content), style({ border: border.rounded, color: defaultTheme.colors.border, padding: 1, width }), {
    width,
    height,
  });
}

function atlasGlyphLevel(level: AtlasCapabilities['unicodeLevel']): 'none' | 'basic' | 'wide' | 'full' {
  if (level === 'unicode16') return 'full';
  return level;
}

export function renderCoreLab(model: CelestialShowcaseModel, caps: AtlasCapabilities): VNode {
  const contrast = validateThemeContrast(defaultTheme);
  const animation = tween({ from: 0, to: 1, duration: 1000, easing: easing.easeInOut });
  animation.seek((model.tick % 20) / 19);
  const animated = animation.value();
  const layoutTier = viewportTier(model.cols);
  const glyph = styling.resolveGlyph(styling.DEFAULT_GLYPH_TOKENS.checked, atlasGlyphLevel(caps.unicodeLevel));
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
          capabilityStatus('terminal', caps.terminalName),
          capabilityStatus('color / unicode', `${caps.colorLevel} / ${caps.unicodeLevel}`),
          capabilityStatus('mouse tracking', caps.mouseTracking ? 'available' : 'fallback', caps.mouseTracking),
          capabilityStatus('WCAG AA pairs', `${contrast.pairsChecked - contrast.violations.length}/${contrast.pairsChecked}`, contrast.pass),
          capabilityStatus('semantic glyph', `${glyph} resolved`),
        ),
        width,
        8,
      ),
      coreCard(
        'Aurora + Nebula',
        column(
          progressBar({ label: 'tween', value: animated, width: 18 }),
          capabilityStatus('Elm update tick', String(model.tick)),
          capabilityStatus('signal checksum', String(reactiveChecksum())),
          capabilityStatus('motion', caps.reducedMotion ? 'static' : 'eased tween'),
          text('Cmd + Sub + VDOM + signals', mutedStyle),
        ),
        width,
        8,
      ),
      coreCard(
        'Gravity + Nexus',
        column(
          capabilityStatus('viewport tier', layoutTier),
          capabilityStatus('terminal', `${model.cols} x ${model.rows}`),
          capabilityStatus('flex layout', 'responsive'),
          capabilityStatus('HitMap probe', nexusProbe),
          capabilityStatus('last pointer', `${model.pointer.x},${model.pointer.y}`),
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
        capabilityStatus('terminal', caps.terminalName),
        capabilityStatus('color', caps.colorLevel),
        capabilityStatus('unicode', caps.unicodeLevel),
        capabilityStatus('mouse tracking', caps.mouseTracking ? 'available' : 'fallback', caps.mouseTracking),
        text(''),
        capabilityStatus('WCAG AA pairs', `${contrast.pairsChecked - contrast.violations.length}/${contrast.pairsChecked}`, contrast.pass),
        capabilityStatus('semantic glyph', `${glyph} resolved`),
        capabilityStatus('reduced motion', defaultTheme.motion.reduceMotion ? 'enabled' : 'disabled'),
      ),
    ),
    coreCard(
      'Aurora + Nebula',
      column(
        progressBar({ label: 'tween', value: animated, width: 18 }),
        text(caps.reducedMotion ? 'Atlas requests static motion.' : 'Deterministic eased tween.', mutedStyle),
        text(''),
        capabilityStatus('Elm update tick', String(model.tick)),
        capabilityStatus('signal checksum', String(reactiveChecksum())),
        text('Cmd + Sub + VDOM + signals', mutedStyle),
      ),
    ),
    coreCard(
      'Gravity + Nexus',
      column(
        capabilityStatus('viewport tier', layoutTier),
        capabilityStatus('terminal', `${model.cols} x ${model.rows}`),
        text('Responsive flex layout', mutedStyle),
        text(''),
        capabilityStatus('HitMap probe', nexusProbe),
        capabilityStatus('last pointer', `${model.pointer.x},${model.pointer.y}`),
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
      capabilityStatus('coordinates', `${model.pointer.x}, ${model.pointer.y}`),
      capabilityStatus('event type', model.pointer.type),
      capabilityStatus('element target', model.pointer.target),
      capabilityStatus('click count', String(model.pointer.clicks)),
      capabilityStatus('tracking', model.pointer.hovering ? 'inside target' : 'global'),
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
      capabilityStatus('workspace', active?.name ?? 'none'),
      capabilityStatus('viewport', `${model.cols} x ${model.rows}`),
      capabilityStatus('pointer', `${model.pointer.x},${model.pointer.y}`),
      capabilityStatus('receipts', `${model.completed.size}/${SMOKE_STEPS.length}`),
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

export function renderWindowsLab(model: CelestialShowcaseModel): VNode {
  const active = getActiveWorkspace(model.workspaces);
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
          text(`  ${window.x},${window.y} ${window.width}x${window.height}`, mutedStyle),
        ),
      )
    : [text('All instruments are closed.', mutedStyle)];
  const controls = row(action(model, 'reopen-telemetry', 'Open telemetry', 'success'), text('  '), action(model, 'reopen-events', 'Open events', 'success'));
  const tier = viewportTier(model.cols);

  return column(
    row(text('HORIZON WINDOW DECK', headingStyle), text('  beta', warningStyle), text(`  ${tier} representation`, mutedStyle)),
    workspaceBar,
    text(active?.summary ?? '', mutedStyle, { wrap: true }),
    text(''),
    panel({ title: 'Window manager state', content: column(...managerRows, text(''), controls), focused: true }),
    text(''),
    tier === 'wide'
      ? text(
          'Floating instruments are live above this workspace. Drag any open titlebar space; use chrome to minimize, maximize, restore, or close.',
          successStyle,
          { wrap: true },
        )
      : tier === 'medium'
        ? text('Medium mode preserves manager state in an inline split. Resize to 120+ columns for draggable floating windows.', warningStyle, { wrap: true })
        : text('Compact mode collapses the active instrument into one panel. Resize to 120+ columns for floating windows.', warningStyle, { wrap: true }),
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
