import { color } from '@celestial/corona';
import { collectHitRegions } from '../hit-regions.js';
import { parseAnsiToRgb } from '../shader.js';
import {
  type EventHandlers,
  type LayoutEntry,
  planLayout,
  rasterize,
  type RegionMetadata,
  type ResolvedStyleAttrs,
  type VNode,
} from '../vdom.js';
import type {
  AutomationA11yAuditResult,
  AutomationA11yRuleName,
  AutomationA11yViolation,
  AutomationInteractionAuditOptions,
  AutomationInteractionRuleName,
} from './contracts.js';
import { getVNodeMeta } from './metadata.js';
import { extractNodeText } from './text.js';

const DEFAULT_FOREGROUND = color.rgb(255, 255, 255);
const DEFAULT_BACKGROUND = color.rgb(0, 0, 0);
const UNSAFE_IDENTIFIER = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const INTERACTION_RULES: readonly AutomationInteractionRuleName[] = [
  'mouse-regions-have-valid-ids',
  'mouse-regions-have-valid-handlers',
  'mouse-regions-have-labels',
  'mouse-regions-have-hit-areas',
  'mouse-regions-have-affordances',
  'mouse-regions-have-cursors',
  'disabled-mouse-regions-are-inert',
  'mouse-region-color-contrast',
];

interface PlannedEventRegion {
  readonly id: string;
  readonly node: Extract<VNode, { kind: 'event' }>;
  readonly hidden: boolean;
  readonly disabled: boolean;
  readonly text: string;
  readonly width: number;
  readonly height: number;
}

function collectPlannedEvents(
  entry: LayoutEntry,
  inherited: { hidden: boolean; disabled: boolean },
  result: PlannedEventRegion[],
): void {
  const meta = getVNodeMeta(entry.node);
  const hidden = inherited.hidden || meta?.a11y?.hidden === true;
  const disabled = inherited.disabled || meta?.a11y?.disabled === true;

  if (entry.node.kind === 'event') {
    result.push({
      id: entry.node.id,
      node: entry.node,
      hidden,
      disabled,
      text: extractNodeText(entry.node.child).replace(/\s+/g, ' ').trim(),
      width: entry.rect.width,
      height: entry.rect.height,
    });
  }

  for (const child of entry.children) {
    collectPlannedEvents(child, { hidden, disabled }, result);
  }
}

function hasAnyHandler(handlers: EventHandlers): boolean {
  return Object.values(handlers).some((handler) => handler !== undefined);
}

function hasHandler(handlers: EventHandlers, names: readonly (keyof EventHandlers)[]): boolean {
  return names.some((name) => handlers[name] !== undefined);
}

function handlerTags(handler: EventHandlers[keyof EventHandlers]): readonly string[] {
  if (handler === undefined) return [];
  if (typeof handler === 'string') return [handler];
  return Object.values(handler).filter((value): value is string => typeof value === 'string');
}

function interactionContractSignature(handlers: EventHandlers, metadata: RegionMetadata | undefined): string {
  const normalizedHandlers = Object.entries(handlers)
    .filter(([, handler]) => handler !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, handler]) => [name, [...handlerTags(handler)].sort()]);
  return JSON.stringify({
    handlers: normalizedHandlers,
    label: metadata?.label,
    intent: metadata?.intent,
    affordances: metadata?.affordances ? [...metadata.affordances].sort() : undefined,
    cursor: metadata?.cursor,
    keyboardHint: metadata?.keyboardHint,
    presentation: metadata?.presentation,
  });
}

function isSafeIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 512 && !UNSAFE_IDENTIFIER.test(value);
}

function expectedAffordances(handlers: EventHandlers): {
  readonly exact: readonly NonNullable<RegionMetadata['affordances']>[number][];
  readonly requiresPointerAction: boolean;
} {
  const exact: NonNullable<RegionMetadata['affordances']>[number][] = [];
  const hasHover = hasHandler(handlers, ['onMouseEnter', 'onMouseLeave']);
  const hasClick = hasHandler(handlers, ['onClick', 'onClickCapture', 'onRightClick', 'onRightClickCapture']);
  const hasPointerGesture = hasHandler(handlers, [
    'onMouseDown',
    'onMouseDownCapture',
    'onMouseUp',
    'onMouseUpCapture',
    'onMouseMove',
    'onMouseMoveCapture',
  ]);
  const hasScroll = hasHandler(handlers, ['onScroll', 'onScrollCapture']);
  if (hasHover) exact.push('hover');
  if (hasClick) exact.push('click');
  if (hasScroll) exact.push('scroll');
  return { exact, requiresPointerAction: hasPointerGesture && !hasClick };
}

function hasLabel(region: PlannedEventRegion): boolean {
  const metadata = region.node.metadata;
  const a11y = getVNodeMeta(region.node)?.a11y;
  return Boolean(metadata?.label || metadata?.summary || metadata?.detail || metadata?.intent || a11y?.label || region.text);
}

function resolvedRgb(
  rgb: ResolvedStyleAttrs['fgRgb'] | ResolvedStyleAttrs['bgRgb'],
  ansi: string | undefined,
  fallback: readonly [number, number, number],
): readonly [number, number, number] {
  return rgb ?? parseAnsiToRgb(ansi) ?? fallback;
}

function interactionDescription(region: PlannedEventRegion): string {
  const label = region.node.metadata?.label ?? getVNodeMeta(region.node)?.a11y?.label ?? region.text;
  return label ? `region='${region.id}', label='${label.slice(0, 60)}'` : `region='${region.id}'`;
}

function pushViolation(
  violations: AutomationA11yViolation[],
  rule: AutomationInteractionRuleName,
  region: PlannedEventRegion,
  message: string,
  severity: AutomationA11yViolation['severity'] = 'error',
): void {
  violations.push({ rule, message, element: interactionDescription(region), severity });
}

/**
 * Deterministically audit the currently rendered mouse interaction surface.
 *
 * The audit operates on the same layout plan and painted grid used by the
 * runtime. It therefore checks clipped hit geometry and post-style contrast,
 * not a parallel approximation. Hosts may pass the runtime plan/grid to avoid
 * extra work; standalone callers need only provide terminal dimensions.
 */
export function auditInteractionTree(root: VNode, options: AutomationInteractionAuditOptions): AutomationA11yAuditResult {
  const width = Math.max(0, Math.trunc(Number.isFinite(options.width) ? options.width : 0));
  const height = Math.max(0, Math.trunc(Number.isFinite(options.height) ? options.height : 0));
  const plan = options.layoutPlan ?? planLayout(root, width, height);
  const grid = options.grid ?? rasterize(plan);
  const foreground = (options.defaultForeground ?? DEFAULT_FOREGROUND).rgb ?? DEFAULT_FOREGROUND.rgb!;
  const background = (options.defaultBackground ?? DEFAULT_BACKGROUND).rgb ?? DEFAULT_BACKGROUND.rgb!;
  const minimumTextContrast =
    Number.isFinite(options.minimumTextContrast) && (options.minimumTextContrast ?? 0) > 0 ? options.minimumTextContrast! : 4.5;
  const minimumGraphicalContrast =
    Number.isFinite(options.minimumGraphicalContrast) && (options.minimumGraphicalContrast ?? 0) > 0
      ? options.minimumGraphicalContrast!
      : 3;

  const plannedEvents: PlannedEventRegion[] = [];
  collectPlannedEvents(plan.root, { hidden: false, disabled: false }, plannedEvents);
  for (const overlay of plan.overlays) {
    collectPlannedEvents(overlay.entry, { hidden: false, disabled: false }, plannedEvents);
  }

  const byId = new Map<string, PlannedEventRegion[]>();
  for (const eventRegion of plannedEvents) {
    const entries = byId.get(eventRegion.id) ?? [];
    entries.push(eventRegion);
    byId.set(eventRegion.id, entries);
  }

  const violations: AutomationA11yViolation[] = [];
  const failed = new Set<AutomationA11yRuleName>();
  const activeIdSignatures = new Map<string, Set<string>>();
  const regionOccurrence = new Map<string, number>();

  for (const eventRegion of plannedEvents) {
    if (eventRegion.hidden || eventRegion.disabled || !hasAnyHandler(eventRegion.node.handlers)) continue;
    if (eventRegion.width > 0 && eventRegion.height > 0) continue;
    pushViolation(
      violations,
      'mouse-regions-have-hit-areas',
      eventRegion,
      `Active mouse regions must have positive layout geometry; received ${eventRegion.width}x${eventRegion.height}.`,
    );
    failed.add('mouse-regions-have-hit-areas');
  }

  for (const hitRegion of collectHitRegions(plan)) {
    if (hitRegion.isHover) continue;
    const occurrence = regionOccurrence.get(hitRegion.id) ?? 0;
    regionOccurrence.set(hitRegion.id, occurrence + 1);
    const eventRegion = byId.get(hitRegion.id)?.[occurrence];
    if (!eventRegion || eventRegion.hidden || !hasAnyHandler(hitRegion.handlers)) continue;

    const signatures = activeIdSignatures.get(hitRegion.id) ?? new Set<string>();
    signatures.add(interactionContractSignature(hitRegion.handlers, hitRegion.metadata));
    activeIdSignatures.set(hitRegion.id, signatures);

    if (!isSafeIdentifier(hitRegion.id)) {
      pushViolation(violations, 'mouse-regions-have-valid-ids', eventRegion, 'Mouse region IDs must be safe, non-empty, single-line identifiers.');
      failed.add('mouse-regions-have-valid-ids');
    }

    for (const [handlerName, handler] of Object.entries(hitRegion.handlers)) {
      if (handler === undefined) continue;
      const tags = handlerTags(handler);
      if (tags.length === 0 || tags.some((tag) => !isSafeIdentifier(tag))) {
        pushViolation(
          violations,
          'mouse-regions-have-valid-handlers',
          eventRegion,
          `Mouse handler '${handlerName}' must contain at least one safe, non-empty tag.`,
        );
        failed.add('mouse-regions-have-valid-handlers');
      }
    }

    if (!hasLabel(eventRegion)) {
      pushViolation(
        violations,
        'mouse-regions-have-labels',
        eventRegion,
        'Mouse regions must expose visible text or label, summary, detail, intent, or accessibility metadata.',
      );
      failed.add('mouse-regions-have-labels');
    }

    const expected = expectedAffordances(hitRegion.handlers);
    const declared = hitRegion.metadata?.affordances ?? [];
    const missing = expected.exact.filter((affordance) => !declared.includes(affordance));
    const hasPointerAffordance = declared.some((affordance) => ['click', 'drag', 'resize', 'edit'].includes(affordance));
    if (missing.length > 0 || (expected.requiresPointerAction && !hasPointerAffordance)) {
      pushViolation(
        violations,
        'mouse-regions-have-affordances',
        eventRegion,
        `Mouse handlers and affordances disagree${missing.length > 0 ? `; missing ${missing.join(', ')}` : '; pointer gesture has no action affordance'}.`,
      );
      failed.add('mouse-regions-have-affordances');
    }

    const requiresCursor =
      hasHandler(hitRegion.handlers, [
        'onClick',
        'onClickCapture',
        'onRightClick',
        'onRightClickCapture',
        'onMouseDown',
        'onMouseDownCapture',
        'onMouseUp',
        'onMouseUpCapture',
        'onMouseMove',
        'onMouseMoveCapture',
      ]) || declared.some((affordance) => ['click', 'drag', 'resize', 'edit'].includes(affordance));
    if (requiresCursor && hitRegion.metadata?.cursor === undefined) {
      pushViolation(
        violations,
        'mouse-regions-have-cursors',
        eventRegion,
        'Actionable mouse regions must declare a deterministic pointer cursor.',
      );
      failed.add('mouse-regions-have-cursors');
    }

    if (eventRegion.disabled) {
      const hasActivationHandler = hasHandler(hitRegion.handlers, [
        'onClick',
        'onClickCapture',
        'onRightClick',
        'onRightClickCapture',
        'onMouseDown',
        'onMouseDownCapture',
        'onMouseUp',
        'onMouseUpCapture',
        'onMouseMove',
        'onMouseMoveCapture',
      ]);
      if (hasActivationHandler) {
        pushViolation(
          violations,
          'disabled-mouse-regions-are-inert',
          eventRegion,
          'Accessibility-disabled mouse regions must remove activation and pointer-gesture handlers.',
        );
        failed.add('disabled-mouse-regions-are-inert');
      }
      continue;
    }

    // Spatial catch-alls (for example a right-click region around an entire
    // workspace) do not have a dedicated painted face. Their descendants own
    // visual contrast; the spatial region still receives all structural checks.
    if (hitRegion.metadata?.presentation === 'spatial') continue;

    const paintedCells: Array<{
      readonly char: string;
      readonly col: number;
      readonly row: number;
      readonly foreground: readonly [number, number, number];
      readonly background: readonly [number, number, number];
      readonly ratio: number;
      readonly textual: boolean;
    }> = [];
    for (let row = hitRegion.rect.y; row < hitRegion.rect.y + hitRegion.rect.height; row++) {
      for (let col = hitRegion.rect.x; col < hitRegion.rect.x + hitRegion.rect.width; col++) {
        const cell = grid.cells[row]?.[col];
        if (!cell || cell.char.trim().length === 0 || cell.opaqueId) continue;
        const cellForeground = resolvedRgb(cell.style.fgRgb, cell.style.fg, foreground);
        const cellBackground = resolvedRgb(cell.style.bgRgb, cell.style.bg, background);
        paintedCells.push({
          char: cell.char,
          col,
          row,
          foreground: cellForeground,
          background: cellBackground,
          ratio: color.contrastRatio(color.rgb(...cellForeground), color.rgb(...cellBackground)),
          textual: /[\p{L}\p{N}]/u.test(cell.char),
        });
      }
    }
    // Text-labeled controls are identified by that label, so decorative borders
    // and punctuation do not become false non-text failures. Glyph-only controls
    // (scrollbars, resize handles, icon buttons) use the graphical threshold.
    const textualCells = paintedCells.filter((cell) => cell.textual);
    const contrastCells = textualCells.length > 0 ? textualCells : paintedCells;
    const requiredContrast = textualCells.length > 0 ? minimumTextContrast : minimumGraphicalContrast;
    const weakestCell = contrastCells.reduce<(typeof contrastCells)[number] | undefined>(
      (weakest, cell) => (!weakest || cell.ratio < weakest.ratio ? cell : weakest),
      undefined,
    );
    if (weakestCell && weakestCell.ratio < requiredContrast) {
      pushViolation(
        violations,
        'mouse-region-color-contrast',
        eventRegion,
        `Mouse-region contrast ratio ${weakestCell.ratio.toFixed(2)} is below the required ${requiredContrast.toFixed(1)}:1 at ` +
          `(${weakestCell.col}, ${weakestCell.row}) for ${JSON.stringify(weakestCell.char)} ` +
          `(foreground rgb(${weakestCell.foreground.join(', ')}), background rgb(${weakestCell.background.join(', ')})).`,
        'warning',
      );
      failed.add('mouse-region-color-contrast');
    }
  }

  for (const [id, signatures] of activeIdSignatures) {
    if (signatures.size <= 1) continue;
    const eventRegion = byId.get(id)?.[0];
    if (!eventRegion) continue;
    pushViolation(
      violations,
      'mouse-regions-have-valid-ids',
      eventRegion,
      `Mouse region ID '${id}' has ${signatures.size} conflicting handler or metadata contracts in one rendered tree.`,
    );
    failed.add('mouse-regions-have-valid-ids');
  }

  return {
    violations,
    passes: INTERACTION_RULES.filter((rule) => !failed.has(rule)),
  };
}
