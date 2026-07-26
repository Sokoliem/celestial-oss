/**
 * Keyboard navigation framework.
 *
 * Declarative key-binding definitions with conditional activation, batched
 * subscription generation, and help-screen rendering. Bindings are plain data,
 * so the same list drives both what the app listens for and what it advertises
 * — a help screen cannot drift from the bindings it documents.
 */

import type { KeyEvent, KeyModifiers, VNode } from '@celestial/core/nebula';
import { column, setVNodeMeta, Sub, text } from '@celestial/core/nebula';
import { measureTextWidth, segmentGraphemes, truncateText, wrapCellText } from '@celestial/rosetta';
import { positiveInteger } from './internal.js';

/** Upper bound on the key column so one pathological label cannot blow up the layout. */
const MAX_KEY_COLUMN_CELLS = 32;
const DEFAULT_HELP_WIDTH = 80;
const TERMINAL_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const TERMINAL_CONTROL_EXCEPT_LINE_FEED = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

const NAMED_KEYS = new Set([
  'enter',
  'tab',
  'backspace',
  'escape',
  'space',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'insert',
  'delete',
  'pageup',
  'pagedown',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
]);

const KEY_ALIASES = new Map([
  ['del', 'delete'],
  ['esc', 'escape'],
  ['ins', 'insert'],
  ['pgdn', 'pagedown'],
  ['pgup', 'pageup'],
  ['plus', '+'],
  ['return', 'enter'],
  ['spacebar', 'space'],
]);

export interface KeyBinding<M> {
  /** The key to match (e.g. 'c', 'enter', 'up'). */
  key: string;
  /** Modifier requirements. Omit for no modifiers. */
  modifiers?: KeyModifiers;
  /** Message to dispatch when this binding fires. */
  msg: M;
  /** Contextual guard — active only when this returns true, or when omitted. */
  when?: () => boolean;
  /** Human-readable description, used for help-screen generation. */
  description: string;
  /** Optional grouping used by the generated keyboard guide. */
  category?: string;
  /** Hide this binding from generated help while keeping it executable. */
  discoverable?: boolean;
}

type KeyProbe = Pick<KeyEvent, 'key' | 'ctrl' | 'alt' | 'shift'>;

function requiredModifiers(modifiers?: KeyModifiers): Required<KeyModifiers> {
  return {
    ctrl: modifiers?.ctrl ?? false,
    alt: modifiers?.alt ?? false,
    shift: modifiers?.shift ?? false,
  };
}

/**
 * Normalize a declarative key to the exact value emitted by Nebula's decoder.
 *
 * Named keys are case-insensitive and a small set of common aliases is
 * accepted. Printable keys must be exactly one Unicode scalar because the
 * decoder emits one scalar per key event; accepting a multi-scalar grapheme
 * would create a binding that can never fire.
 *
 * @internal Shared with the action-shortcut projection.
 */
export function normalizeKeyBindingKey(key: string, modifiers?: KeyModifiers): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Key bindings require a non-empty key.');
  }

  if (key === ' ') return 'space';

  const lower = key.toLowerCase();
  const named = KEY_ALIASES.get(lower) ?? lower;
  if (NAMED_KEYS.has(named) || named === '+') {
    return named;
  }

  const scalars = Array.from(key);
  if (scalars.length !== 1) {
    throw new TypeError(`Key binding ${JSON.stringify(key)} must be one named key or a single Unicode scalar.`);
  }

  const scalar = scalars[0]!;
  const codePoint = scalar.codePointAt(0)!;
  if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f) || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    throw new TypeError(`Key binding ${JSON.stringify(key)} must be a printable Unicode scalar; use a named key for controls.`);
  }
  if (/^[a-z]$/i.test(scalar)) {
    return modifiers?.shift === true ? scalar.toUpperCase() : scalar.toLowerCase();
  }
  return scalar;
}

/**
 * Return whether the legacy terminal decoder can preserve a key and its exact
 * modifier flags.
 *
 * @internal Shared with the action-shortcut projection.
 */
export function isKeyBindingRepresentable(key: string, modifiers?: KeyModifiers): boolean {
  let normalized: string;
  try {
    normalized = normalizeKeyBindingKey(key, modifiers);
  } catch {
    return false;
  }

  const required = requiredModifiers(modifiers);
  const { ctrl, alt, shift } = required;
  const xtermModifierKey =
    /^(?:f(?:[1-9]|1[0-2])|up|down|left|right|home|end|insert|delete|pageup|pagedown)$/.test(normalized);
  if (xtermModifierKey) return true;

  if (normalized === 'tab') return !ctrl && !alt;
  if (normalized === 'enter' || normalized === 'backspace' || normalized === 'escape') return !ctrl && !alt && !shift;
  if (normalized === 'space') return !ctrl && !shift;

  const asciiLetter = /^[a-z]$/i.test(normalized);
  if (asciiLetter) {
    if (ctrl) return !alt && !shift && !/^[hijm]$/i.test(normalized);
    // ESC O is the prefix of an SS3 sequence, so Alt+Shift+O is decoded as
    // Escape followed by O rather than one Alt-modified key event.
    if (alt && shift && normalized === 'O') return false;
    return true;
  }

  if (ctrl || shift) return false;
  // ESC [ and ESC ] are reserved as CSI/OSC protocol prefixes before a key
  // event reaches subscribers, so they cannot represent Alt+[ or Alt+].
  if (alt && (normalized === '[' || normalized === ']')) return false;
  return true;
}

interface NormalizedKeyBinding<M> {
  readonly binding: KeyBinding<M>;
  readonly key: string;
  readonly modifiers: Required<KeyModifiers>;
}

function normalizeBinding<M>(binding: KeyBinding<M>): NormalizedKeyBinding<M> {
  const modifiers = requiredModifiers(binding.modifiers);
  const key = normalizeKeyBindingKey(binding.key, modifiers);
  if (!isKeyBindingRepresentable(key, modifiers)) {
    throw new TypeError(`Key binding ${formatKeyBinding(key, modifiers)} cannot be represented exactly by the terminal decoder.`);
  }
  return { binding, key, modifiers };
}

function normalizedChordId(binding: Pick<NormalizedKeyBinding<unknown>, 'key' | 'modifiers'>): string {
  const { key, modifiers } = binding;
  return `${modifiers.ctrl ? '1' : '0'}${modifiers.alt ? '1' : '0'}${modifiers.shift ? '1' : '0'}:${key}`;
}

function bindingMatchesEvent<M>(binding: KeyBinding<M>, event: KeyProbe, evaluateGuard: boolean): boolean {
  if (evaluateGuard && binding.when && !binding.when()) return false;

  const normalized = normalizeBinding(binding);
  const eventModifiers = requiredModifiers(event);
  return (
    normalized.key === normalizeKeyBindingKey(event.key, eventModifiers) &&
    normalized.modifiers.ctrl === eventModifiers.ctrl &&
    normalized.modifiers.alt === eventModifiers.alt &&
    normalized.modifiers.shift === eventModifiers.shift
  );
}

export function matchesKeyBinding<M>(binding: KeyBinding<M>, event: KeyProbe): boolean {
  return bindingMatchesEvent(binding, event, true);
}

export function getMatchingKeyBinding<M>(bindings: readonly KeyBinding<M>[], event: KeyProbe): KeyBinding<M> | null {
  return bindings.find((binding) => matchesKeyBinding(binding, event)) ?? null;
}

/**
 * Convert a list of key bindings into exact, ordered key subscriptions.
 *
 * Duplicate active chords are reduced to the first declaration before the
 * subscriptions reach Nebula, preserving first-active-binding precedence.
 * Nebula matches these subscriptions after raw key-event handlers reconcile
 * the model and before built-in Tab focus traversal. A Tab binding observes
 * the key but does not consume or suppress the subsequent focus movement.
 */
export function keyMap<M>(bindings: readonly KeyBinding<M>[]): Sub<M> {
  const normalized = bindings.map(normalizeBinding);
  const active = normalized.filter(({ binding }) => binding.when === undefined || binding.when());
  if (active.length === 0) return Sub.none();

  const seen = new Set<string>();
  const unique = active.filter((entry) => {
    const id = normalizedChordId(entry);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return Sub.batch(...unique.map(({ binding, key, modifiers }) => Sub.keyWithModifiers(key, modifiers, binding.msg)));
}

/**
 * Format a single key name for display: `c` becomes `C`, `enter` becomes
 * `Enter`.
 *
 * Counts *graphemes* rather than code units, so an emoji or combining sequence
 * is treated as one character and never split mid-cluster. Shared with the
 * action-to-command projection so a shortcut renders identically wherever it
 * appears — help screen, palette entry, or status hint.
 */
export function formatDisplayKey(key: string): string {
  const graphemes = segmentGraphemes(key);
  const first = graphemes[0];
  if (first === undefined) return key;
  const displayFirst = /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
  if (graphemes.length === 1) return displayFirst;
  return displayFirst + graphemes.slice(1).join('');
}

/**
 * Format a key plus modifiers for display, e.g. `Ctrl+C`, `Shift+Tab`, `Enter`.
 *
 * ASCII letters are upper-cased while non-ASCII printable keys retain the
 * exact scalar used by the executable binding. Counting graphemes rather than
 * code units keeps an emoji or combining sequence from being treated as
 * several characters.
 */
export function formatKeyBinding(key: string, modifiers?: KeyModifiers): string {
  const parts: string[] = [];
  if (modifiers?.ctrl) parts.push('Ctrl');
  if (modifiers?.alt) parts.push('Alt');
  if (modifiers?.shift) parts.push('Shift');

  parts.push(formatDisplayKey(key));

  return parts.join('+');
}

/**
 * Render a help screen from a list of key bindings.
 *
 * The key column is aligned on *display width* rather than string length: a
 * two-cell emoji occupies five UTF-16 code units, so padding by `.length`
 * over-pads and visibly breaks the column.
 */
export interface HelpViewOptions {
  /** Include bindings whose `when` guard is currently false. */
  readonly includeInactive?: boolean;
  /** Include bindings explicitly hidden from generated help. */
  readonly includeUndiscoverable?: boolean;
  /** Maximum terminal-cell width of every rendered line. */
  readonly width?: number;
  /** Heading text. Use an empty string when a host surface already renders one. */
  readonly title?: string;
  /** Group bindings under their category labels. Defaults to true when any binding has a category. */
  readonly groupByCategory?: boolean;
}

export function helpView<M>(bindings: readonly KeyBinding<M>[], options: HelpViewOptions = {}): VNode {
  const width = positiveInteger(options.width, DEFAULT_HELP_WIDTH);
  const title = options.title ?? 'Key Bindings:';
  if (typeof title !== 'string' || TERMINAL_CONTROL.test(title)) {
    throw new TypeError('Key binding help titles must be single-line printable text.');
  }
  const evaluated = bindings.map((binding) => {
    const normalized = normalizeBinding(binding);
    return { ...normalized, active: binding.when === undefined || binding.when() };
  });
  const activeOwners = new Map<string, (typeof evaluated)[number]>();
  for (const entry of evaluated) {
    const id = normalizedChordId(entry);
    if (entry.active && !activeOwners.has(id)) activeOwners.set(id, entry);
  }
  const inactiveSeen = new Set<string>();
  const visible = evaluated.filter((entry) => {
    if (options.includeUndiscoverable !== true && entry.binding.discoverable === false) return false;
    const id = normalizedChordId(entry);
    const activeOwner = activeOwners.get(id);
    if (entry.active) return activeOwner === entry;
    if (options.includeInactive !== true || activeOwner !== undefined || inactiveSeen.has(id)) return false;
    inactiveSeen.add(id);
    return true;
  });

  if (visible.length === 0) {
    const empty = text(truncateText('No key bindings defined.', width));
    setVNodeMeta(empty, { a11y: { role: 'region', label: 'Key bindings, none defined' } });
    return empty;
  }

  const formatted = visible.map(({ binding, key, modifiers }) => {
    if (binding.category !== undefined && (typeof binding.category !== 'string' || TERMINAL_CONTROL.test(binding.category))) {
      throw new TypeError(`Key binding category ${JSON.stringify(binding.category)} must be single-line printable text.`);
    }
    if (typeof binding.description !== 'string' || TERMINAL_CONTROL_EXCEPT_LINE_FEED.test(binding.description)) {
      throw new TypeError(`Key binding descriptions must contain printable text and optional line feeds.`);
    }
    const category = binding.category?.trim() || 'General';
    return { label: formatKeyBinding(key, modifiers), description: binding.description, category };
  });

  const columnWidth = Math.min(
    MAX_KEY_COLUMN_CELLS,
    Math.max(...formatted.map((entry) => measureTextWidth(entry.label))),
    Math.max(1, width - 4),
  );
  const shouldGroup = options.groupByCategory ?? formatted.some((entry) => entry.category !== 'General');
  const groups = new Map<string, typeof formatted>();
  for (const entry of formatted) {
    const group = groups.get(entry.category);
    if (group) group.push(entry);
    else groups.set(entry.category, [entry]);
  }

  const rows: VNode[] = [];
  const renderEntry = (entry: (typeof formatted)[number]) => {
    const label = truncateText(entry.label, columnWidth);
    const labelWidth = measureTextWidth(label);
    const inlineDescriptionWidth = width - 2 - columnWidth - 2;
    if (inlineDescriptionWidth < 1) {
      rows.push(text(truncateText(`  ${label}`, width)));
      const descriptionIndent = width > 2 ? '  ' : '';
      const descriptionWidth = Math.max(1, width - measureTextWidth(descriptionIndent));
      for (const line of wrapCellText(entry.description, descriptionWidth)) {
        rows.push(text(`${descriptionIndent}${line}`));
      }
      return;
    }

    const descriptionLines = wrapCellText(entry.description, inlineDescriptionWidth);
    const firstDescription = descriptionLines[0] ?? '';
    rows.push(text(`  ${label}${' '.repeat(columnWidth - labelWidth + 2)}${firstDescription}`));
    const continuationPrefix = ' '.repeat(2 + columnWidth + 2);
    for (const line of descriptionLines.slice(1)) {
      rows.push(text(`${continuationPrefix}${line}`));
    }
  };

  if (shouldGroup) {
    let groupIndex = 0;
    for (const [category, entries] of groups) {
      if (groupIndex > 0) rows.push(text(''));
      rows.push(text(truncateText(`${category}:`, width)));
      entries.forEach(renderEntry);
      groupIndex += 1;
    }
  } else {
    formatted.forEach(renderEntry);
  }

  const heading = title.length > 0 ? [text(truncateText(title, width)), text('')] : [];
  const view = column(...heading, ...rows);
  setVNodeMeta(view, { a11y: { role: 'region', label: `Key bindings, ${visible.length} entries` } });
  return view;
}
