/**
 * Shared types for the Telescope testing framework.
 *
 * Query results, screen wrapper, and assertion types
 * used across the queries, assertions, and screen modules.
 */

import type { Announcement, AriaAttrs, AriaRole, StyleAttrs, VNode } from '@celestial/core/nebula';

// ── Query Result ────────────────────────────────────────────────────────

/** The result of a query — a matched element with position and metadata */
export interface QueryResult {
  /** The matched visible text */
  text: string;
  /** Row position in the terminal grid (0-based) */
  row: number;
  /** Column position in the terminal grid (0-based) */
  col: number;
  /** Width in terminal cells */
  width: number;
  /** Height in terminal rows */
  height: number;
  /** ARIA role if present on the source VNode */
  role?: AriaRole;
  /** ARIA attributes if present */
  a11y?: AriaAttrs;
  /** Test ID if present */
  testId?: string;
  /** Metadata id if present */
  id?: string;
  /** Metadata classes if present */
  classes?: readonly string[];
  /** Metadata state flags if present */
  states?: readonly string[];
  /** Metadata label if present */
  label?: string;
  /** Style attributes of the first cell */
  style?: StyleAttrs;
  /** Whether this element currently has focus */
  focused?: boolean;
  /** The source VNode that produced this result */
  node?: VNode;
}

// ── Text Match ──────────────────────────────────────────────────────────

/** A text matcher — either an exact string or a regex pattern */
export type TextMatch = string | RegExp;

// ── Wait Options ────────────────────────────────────────────────────────

export interface WaitOptions {
  /** Maximum time to wait in milliseconds (default: 1000) */
  timeout?: number;
  /** Polling interval in milliseconds (default: 50) */
  interval?: number;
  /** Abort a pending wait without leaving a timer behind. */
  signal?: AbortSignal;
}

export interface KeyModifiers {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

// ── Mouse Event ─────────────────────────────────────────────────────────

export interface MouseEventOptions {
  type: 'click' | 'scroll' | 'move' | 'down' | 'up';
  row: number;
  col: number;
  /** Button for click events (default: 'left') */
  button?: 'left' | 'right' | 'middle';
  /** Scroll direction for scroll events */
  direction?: 'up' | 'down';
  /** Modifier keys held during the event */
  modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean };
}

// ── Terminal Preset ─────────────────────────────────────────────────────

export interface TerminalPreset {
  cols: number;
  rows: number;
}

// ── A11y Audit ──────────────────────────────────────────────────────────

export type A11yRuleName =
  | 'interactive-elements-have-labels'
  | 'focus-visible'
  | 'live-regions-have-politeness'
  | 'heading-levels-sequential'
  | 'color-contrast'
  | 'mouse-regions-have-valid-ids'
  | 'mouse-regions-have-valid-handlers'
  | 'mouse-regions-have-labels'
  | 'mouse-regions-have-hit-areas'
  | 'mouse-regions-have-affordances'
  | 'mouse-regions-have-cursors'
  | 'disabled-mouse-regions-are-inert'
  | 'mouse-region-color-contrast';

export interface A11yViolation {
  rule: A11yRuleName;
  message: string;
  /** Description of the element that violated the rule */
  element: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

export interface A11yAuditResult {
  violations: A11yViolation[];
  passes: A11yRuleName[];
}

// ── VNode Metadata ──────────────────────────────────────────────────────

/**
 * Metadata that can be attached to VNodes for testing purposes.
 * This is stored in a WeakMap keyed by VNode reference.
 */
export interface NodeMetadata {
  id?: string;
  classes?: readonly string[];
  states?: readonly string[];
  label?: string;
  testId?: string;
  a11y?: AriaAttrs;
}

export type AccessibilityAnnouncement = Announcement;

export interface FocusEventRecord {
  description: string;
  focusedId: string | null;
}

export interface MessageCoverage {
  totalDispatched: number;
  unknownMessages: number;
  byType: Record<string, number>;
}

export interface RecordedKeyEvent {
  kind: 'key';
  key: string;
  modifiers?: KeyModifiers;
}

export interface RecordedDispatchEvent<M> {
  kind: 'dispatch';
  msg: M;
}

export type RecordedInteractionEvent<M> = RecordedKeyEvent | RecordedDispatchEvent<M>;

export type InteractionStep<Model, M> = RecordedInteractionEvent<M> & {
  index: number;
  modelSnapshot: Model;
  frameSnapshot: string;
};

export interface InteractionRecording<Model, M> {
  initialModel: Model;
  finalModel: Model;
  steps: InteractionStep<Model, M>[];
}
