import type { AriaAttrs, AriaRole } from '../a11y.js';
import type { StyleAttrs, VNode } from '../vdom.js';

export type AutomationA11yRuleName =
  | 'interactive-elements-have-labels'
  | 'focus-visible'
  | 'live-regions-have-politeness'
  | 'heading-levels-sequential'
  | 'color-contrast';

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
