import { color } from '@celestial/corona';
import { isInteractive } from '../a11y.js';
import { parseAnsiToRgb } from '../shader.js';
import { parseAnsiLine } from '../vdom/paint.js';
import type { StyleAttrs, VNode } from '../vdom.js';
import type {
  AutomationA11yAuditResult,
  AutomationA11yRuleName,
  AutomationA11yViolation,
  AutomationInteractionAuditOptions,
  CollectedElement,
} from './contracts.js';
import { auditInteractionTree } from './interaction-audit.js';
import { getVNodeMeta } from './metadata.js';
import { extractNodeText } from './text.js';

export function auditA11yTree(tree: VNode, interaction?: AutomationInteractionAuditOptions): AutomationA11yAuditResult {
  const elements = collectAuditElements(tree);
  const violations: AutomationA11yViolation[] = [];
  const passedRules = new Set<AutomationA11yRuleName>();

  checkInteractiveLabels(elements, violations, passedRules);
  checkFocusVisible(elements, violations, passedRules);
  checkHeadingLevels(elements, violations, passedRules);
  checkLiveRegions(elements, violations, passedRules);
  checkColorContrast(elements, violations, passedRules);
  if (interaction) {
    const interactionResult = auditInteractionTree(tree, interaction);
    violations.push(...interactionResult.violations);
    for (const rule of interactionResult.passes) passedRules.add(rule);
  }

  return {
    violations,
    passes: [...passedRules],
  };
}

function collectAuditElements(node: VNode, inherited?: { focused?: boolean; style?: StyleAttrs; hidden?: boolean }): CollectedElement[] {
  const meta = getVNodeMeta(node);
  const style = mergeStyleAttrs(inherited?.style, extractStyle(node));
  const hidden = inherited?.hidden === true || meta?.a11y?.hidden === true;
  const element: CollectedElement = {
    node,
    a11y: meta?.a11y,
    style,
    textContent: extractNodeText(node),
    focused: inherited?.focused,
    hidden,
  };
  const results: CollectedElement[] = [element];

  switch (node.kind) {
    case 'text':
    case 'empty':
    case 'image':
      return results;
    case 'row':
    case 'column':
      for (const child of node.children) {
        results.push(...collectAuditElements(child, { ...inherited, style, hidden }));
      }
      return results;
    case 'box': {
      // Box foreground attributes paint the box itself (notably its border).
      // Rasterization only carries the box background into child cells, so the
      // audit tree must follow the same inheritance rule.
      const contentStyle = inheritedBoxContentStyle(style);
      for (const child of node.children) {
        results.push(...collectAuditElements(child, { ...inherited, style: contentStyle, hidden }));
      }
      return results;
    }
    case 'focus':
      element.focused = node.focused;
      results.push(...collectAuditElements(node.child, { focused: node.focused, style, hidden }));
      return results;
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      results.push(...collectAuditElements(node.child, { ...inherited, style, hidden }));
      return results;
    case 'component':
    case 'memo':
      results.push(...collectAuditElements(node.render(), { ...inherited, style, hidden }));
      return results;
    case 'suspense':
      results.push(...collectAuditElements(node.resolved ? node.child : node.fallback, { ...inherited, style, hidden }));
      return results;
    case 'localState':
    case 'lazy':
      return results;
    case 'tabGroup':
      for (const child of node.children) {
        results.push(...collectAuditElements(child, { ...inherited, style, hidden }));
      }
      return results;
  }
}

function extractStyle(node: VNode): StyleAttrs | undefined {
  switch (node.kind) {
    case 'text':
    case 'box':
      return node.style;
    default:
      return undefined;
  }
}

function mergeStyleAttrs(base?: StyleAttrs, override?: StyleAttrs): StyleAttrs | undefined {
  if (!base) return override;
  if (!override) return base;
  return { ...base, ...override };
}

function inheritedBoxContentStyle(style?: StyleAttrs): StyleAttrs | undefined {
  if (!style || (style.bg === undefined && style.bgRgb === undefined)) return undefined;
  return {
    ...(style.bg !== undefined ? { bg: style.bg } : {}),
    ...(style.bgRgb !== undefined ? { bgRgb: style.bgRgb } : {}),
  };
}

function checkInteractiveLabels(elements: readonly CollectedElement[], violations: AutomationA11yViolation[], passed: Set<AutomationA11yRuleName>): void {
  const rule: AutomationA11yRuleName = 'interactive-elements-have-labels';
  let hasViolation = false;

  for (const element of elements) {
    if (element.hidden || !element.a11y || !isInteractive(element.a11y)) continue;

    const hasLabel = !!element.a11y.label;
    const hasVisibleText = element.textContent.trim().length > 0;

    if (hasLabel || hasVisibleText) continue;

    violations.push({
      rule,
      message: `Interactive element with role '${element.a11y.role}' has no label or visible text content.`,
      element: describeAuditElement(element),
      severity: 'error',
    });
    hasViolation = true;
  }

  if (!hasViolation) {
    passed.add(rule);
  }
}

function checkFocusVisible(elements: readonly CollectedElement[], violations: AutomationA11yViolation[], passed: Set<AutomationA11yRuleName>): void {
  const rule: AutomationA11yRuleName = 'focus-visible';
  let hasViolation = false;

  for (const element of elements) {
    if (element.hidden || element.node.kind !== 'focus' || !element.focused) continue;

    if (element.textContent.trim().length === 0) {
      violations.push({
        rule,
        message: 'Focused element has no visible content.',
        element: describeAuditElement(element),
        severity: 'warning',
      });
      hasViolation = true;
      continue;
    }

    if (hasVisibleFocusCue(element)) continue;

    violations.push({
      rule,
      message: 'Focused element does not expose a visible focus cue in its text or styling.',
      element: describeAuditElement(element),
      severity: 'warning',
    });
    hasViolation = true;
  }

  if (!hasViolation) {
    passed.add(rule);
  }
}

function checkHeadingLevels(elements: readonly CollectedElement[], violations: AutomationA11yViolation[], passed: Set<AutomationA11yRuleName>): void {
  const rule: AutomationA11yRuleName = 'heading-levels-sequential';
  const headings = elements.filter((element) => !element.hidden && element.a11y?.role === 'heading' && element.a11y.level !== undefined);

  if (headings.length <= 1) {
    passed.add(rule);
    return;
  }

  let hasViolation = false;

  for (let index = 1; index < headings.length; index++) {
    const previous = headings[index - 1]!;
    const current = headings[index]!;
    const previousLevel = previous.a11y!.level!;
    const currentLevel = current.a11y!.level!;

    if (currentLevel <= previousLevel + 1) continue;

    violations.push({
      rule,
      message: `Heading level skipped from ${previousLevel} to ${currentLevel}. Expected at most ${previousLevel + 1}.`,
      element: describeAuditElement(current),
      severity: 'warning',
    });
    hasViolation = true;
  }

  if (!hasViolation) {
    passed.add(rule);
  }
}

function checkLiveRegions(elements: readonly CollectedElement[], violations: AutomationA11yViolation[], passed: Set<AutomationA11yRuleName>): void {
  const rule: AutomationA11yRuleName = 'live-regions-have-politeness';
  let hasViolation = false;

  for (const element of elements) {
    if (element.hidden || !element.a11y?.live) continue;
    if (element.a11y.live === 'polite' || element.a11y.live === 'assertive') continue;

    violations.push({
      rule,
      message: `Live region has invalid politeness level: '${element.a11y.live}'.`,
      element: describeAuditElement(element),
      severity: 'warning',
    });
    hasViolation = true;
  }

  if (!hasViolation) {
    passed.add(rule);
  }
}

function getBaseString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const responsive = record.xs ?? record.sm ?? record.md ?? record.lg ?? record.xl;
    return typeof responsive === 'string' ? responsive : undefined;
  }
  return undefined;
}

function checkColorContrast(elements: readonly CollectedElement[], violations: AutomationA11yViolation[], passed: Set<AutomationA11yRuleName>): void {
  const rule: AutomationA11yRuleName = 'color-contrast';
  let hasViolation = false;

  for (const element of elements) {
    // Container textContent is aggregated from descendants, but its foreground
    // may describe a border rather than those descendants. Audit rendered text
    // leaves and include inline ANSI runs, matching the cell painter.
    if (element.hidden || element.node.kind !== 'text') continue;
    const text = element.textContent.trim();
    if (!text) continue;

    const baseStyle = {
      ...(getBaseString(element.style?.fg) ? { fg: getBaseString(element.style?.fg) } : {}),
      ...(getBaseString(element.style?.bg) ? { bg: getBaseString(element.style?.bg) } : {}),
    };
    let minimumContrast = Number.POSITIVE_INFINITY;
    for (const line of element.node.content.split('\n')) {
      for (const cell of parseAnsiLine(line, baseStyle)) {
        if (cell.char.trim().length === 0) continue;
        const fg = cell.style.fgRgb ?? parseAnsiToRgb(cell.style.fg);
        const bg = cell.style.bgRgb ?? parseAnsiToRgb(cell.style.bg);
        if (!fg || !bg) continue;
        minimumContrast = Math.min(minimumContrast, color.contrastRatio(color.rgb(...fg), color.rgb(...bg)));
      }
    }
    if (!Number.isFinite(minimumContrast) || minimumContrast >= 4.5) continue;

    violations.push({
      rule,
      message: `Text contrast ratio ${minimumContrast.toFixed(2)} is below the WCAG AA threshold of 4.5:1.`,
      element: describeAuditElement(element),
      severity: 'warning',
    });
    hasViolation = true;
  }

  if (!hasViolation) {
    passed.add(rule);
  }
}

function hasVisibleFocusCue(element: CollectedElement): boolean {
  const text = element.textContent.trim();
  if (
    (text.startsWith('> ') && text.endsWith(' <')) ||
    (text.startsWith('[') && text.endsWith(']')) ||
    (text.startsWith('[ ') && text.endsWith(' ]')) ||
    text.startsWith('▸ ') ||
    text.endsWith(' ◂') ||
    text.startsWith('→ ') ||
    text.endsWith(' ←')
  ) {
    return true;
  }

  return hasFocusStyle(element.node);
}

function hasFocusStyle(node: VNode): boolean {
  const style = extractStyle(node);
  if (style && (style.underline || style.bold || style.bg !== undefined || style.fg !== undefined)) {
    return true;
  }

  switch (node.kind) {
    case 'row':
    case 'column':
    case 'box':
      return node.children.some(hasFocusStyle);
    case 'focus':
    case 'scroll':
    case 'event':
    case 'hover':
    case 'overlay':
    case 'flex':
    case 'portal':
      return hasFocusStyle(node.child);
    case 'component':
    case 'memo':
      return hasFocusStyle(node.render());
    case 'suspense':
      return hasFocusStyle(node.resolved ? node.child : node.fallback);
    case 'tabGroup':
      return node.children.some(hasFocusStyle);
    default:
      return false;
  }
}

function describeAuditElement(element: CollectedElement): string {
  const parts: string[] = [];
  if (element.a11y?.role) parts.push(`role='${element.a11y.role}'`);
  if (element.a11y?.label) parts.push(`label='${element.a11y.label}'`);
  const text = element.textContent.trim();
  if (text) parts.push(`text='${text.slice(0, 40)}'`);
  return parts.length > 0 ? parts.join(', ') : '<unknown>';
}
