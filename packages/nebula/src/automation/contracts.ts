import type { Color } from '@celestial/corona';
import type { AriaAttrs, AriaRole } from '../a11y.js';
import type { CellGrid, LayoutPlan, StyleAttrs, VNode } from '../vdom.js';

export type AutomationInteractionRuleName =
  | 'mouse-regions-have-valid-ids'
  | 'mouse-regions-have-valid-handlers'
  | 'mouse-regions-have-labels'
  | 'mouse-regions-have-hit-areas'
  | 'mouse-regions-have-affordances'
  | 'mouse-regions-have-cursors'
  | 'mouse-actions-have-hover-feedback'
  | 'disabled-mouse-regions-are-inert'
  | 'mouse-region-color-contrast';

export type AutomationA11yRuleName =
  | 'interactive-elements-have-labels'
  | 'focus-visible'
  | 'live-regions-have-politeness'
  | 'heading-levels-sequential'
  | 'color-contrast'
  | AutomationInteractionRuleName;

export interface AutomationA11yViolation {
  rule: AutomationA11yRuleName;
  message: string;
  element: string;
  severity: 'error' | 'warning';
}

export interface AutomationA11yAuditResult {
  violations: AutomationA11yViolation[];
  passes: AutomationA11yRuleName[];
}

export interface AutomationInteractionAuditOptions {
  /** Terminal width used when no precomputed layout plan is supplied. */
  width: number;
  /** Terminal height used when no precomputed layout plan is supplied. */
  height: number;
  /** Reuse the exact runtime layout plan when available. */
  layoutPlan?: LayoutPlan;
  /** Reuse the exact painted runtime grid when available. */
  grid?: CellGrid;
  /** Fallback foreground for terminal-default cells. Defaults to white. */
  defaultForeground?: Color;
  /** Fallback background for terminal-default cells. Defaults to black. */
  defaultBackground?: Color;
  /** WCAG threshold for cells containing letters or numbers. Defaults to 4.5. */
  minimumTextContrast?: number;
  /** WCAG non-text threshold for graphical control glyphs. Defaults to 3. */
  minimumGraphicalContrast?: number;
}

export interface AutomationTextRun {
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  style?: StyleAttrs;
}

export interface AutomationElementSnapshot {
  id: string;
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  role?: AriaRole;
  a11y?: AriaAttrs;
  testId?: string;
  focused: boolean;
  focusId?: string;
  hidden?: boolean;
  disabled?: boolean;
  selected?: boolean;
  expanded?: boolean;
}

export interface AutomationActionSnapshot {
  id: string;
  label: string;
  text: string;
  row: number;
  col: number;
  width: number;
  height: number;
  role?: AriaRole;
  a11y?: AriaAttrs;
  testId?: string;
  focusId?: string;
  focused: boolean;
  disabled?: boolean;
  selected?: boolean;
  expanded?: boolean;
  source: 'focus' | 'role';
}

export interface AutomationSnapshot {
  text: string;
  size: {
    cols: number;
    rows: number;
  };
  elements: AutomationElementSnapshot[];
  actions: AutomationActionSnapshot[];
  focusedActionId: string | null;
  audit: AutomationA11yAuditResult;
}

export interface CollectedNode {
  node: VNode;
  testId?: string;
  a11y?: AriaAttrs;
  focused?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  textContent: string;
}

export interface CollectedElement {
  node: VNode;
  a11y?: AriaAttrs;
  style?: StyleAttrs;
  textContent: string;
  focused?: boolean;
  hidden?: boolean;
}

export interface FocusCandidate {
  focusId: string;
  text: string;
  focused: boolean;
  role?: AriaRole;
  a11y?: AriaAttrs;
  testId?: string;
}

export const INTERACTIVE_ROLES: readonly AriaRole[] = [
  'menuitem',
  'tab',
  'treeitem',
  'button',
  'checkbox',
  'radio',
  'listbox',
  'textbox',
  'listitem',
  'slider',
  'switch',
];
