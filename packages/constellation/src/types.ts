import type { Cmd, Sub, VNode } from '@celestial/core/nebula';

// ─── Slot Normalization ─────────────────────────────────────────────────────

/** Normalize a VNode slot value to a VNode array. */
export function normalizeContent(value: VNode | VNode[] | undefined): VNode[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export interface ComponentDescriptor<Model, Msg> {
  init(): [Model, Cmd<Msg>];
  update(msg: Msg, model: Model): [Model, Cmd<Msg>];
  view(model: Model): VNode;
  subscriptions?(model: Model): Sub<Msg>;
}

export interface FocusState {
  focused: boolean;
  id: string;
}

// ─── Common Primitives ───────────────────────────────────────────────────────

export type Orientation = 'horizontal' | 'vertical';

export type Alignment = 'start' | 'center' | 'end';

export type MenuVariant = 'bar' | 'dropdown' | 'context';

export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type SeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type RatingStyle = 'star' | 'heart' | 'block' | 'diamond';

export interface TreeNodeBase {
  label: string;
  key: string;
  children?: TreeNodeBase[];
}

export interface PropertyGridRow {
  key: string;
  value: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  category?: string;
  editable?: boolean;
}

export interface LogEntry {
  timestamp: Date;
  level: SeverityLevel;
  message: string;
  source?: string;
}

export interface QueryClause {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';
  value: string;
}

export interface QueryGroup {
  logic: 'AND' | 'OR';
  clauses: (QueryClause | QueryGroup)[];
}

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: Date;
  selected?: boolean;
}

export interface ColorStop {
  at: number;
  color: string;
}

export interface CalendarEvent {
  date: SimpleDate;
  title: string;
  color?: string;
}

export interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

export interface WizardStep {
  title: string;
  description?: string;
  completed?: boolean;
  error?: string;
}
