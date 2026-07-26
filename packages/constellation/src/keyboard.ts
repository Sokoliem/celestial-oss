/**
 * Keyboard navigation framework.
 *
 * Declarative key-binding definitions with conditional activation, batched
 * subscription generation, and help-screen rendering. Bindings are plain data,
 * so the same list drives both what the app listens for and what it advertises
 * — a help screen cannot drift from the bindings it documents.
 */

import { style, type ThemeInput } from '@celestial/core/corona';
import type { KeyEvent, KeyModifiers, ThemeContext, VNode } from '@celestial/core/nebula';
import { column, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth, segmentGraphemes, truncateText, wrapCellText } from '@celestial/rosetta';
import { positiveInteger } from './internal.js';
import { resolveTheme } from './theme.js';

/** Upper bound on the key column so one pathological label cannot blow up the layout. */
const MAX_KEY_COLUMN_CELLS = 32;
const DEFAULT_HELP_WIDTH = 80;
const UNSAFE_SINGLE_LINE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const UNSAFE_MULTILINE_TEXT = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const MAX_KEY_BINDINGS = 10_000;
const MAX_DIAGNOSTIC_SCALARS = 96;

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

function ownDataValue(value: object, field: string, label: string, required = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label} requires own data property ${field}.`);
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw new TypeError(`${label} ${field} must be an own data property.`);
  }
  return descriptor.value;
}

function snapshotModifiers(value: unknown, label: string): KeyModifiers | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object when supplied.`);
  }
  const ctrl = ownDataValue(value, 'ctrl', label);
  const alt = ownDataValue(value, 'alt', label);
  const shift = ownDataValue(value, 'shift', label);
  for (const [field, flag] of [
    ['ctrl', ctrl],
    ['alt', alt],
    ['shift', shift],
  ] as const) {
    if (flag !== undefined && typeof flag !== 'boolean') {
      throw new TypeError(`${label} ${field} must be boolean when supplied.`);
    }
  }
  return Object.freeze({
    ...(ctrl === undefined ? {} : { ctrl: ctrl as boolean }),
    ...(alt === undefined ? {} : { alt: alt as boolean }),
    ...(shift === undefined ? {} : { shift: shift as boolean }),
  });
}

function snapshotBinding<M>(value: unknown, index: number): KeyBinding<M> {
  const label = `Key binding ${String(index)}`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const key = ownDataValue(value, 'key', label, true);
  const msg = ownDataValue(value, 'msg', label, true) as M;
  const description = ownDataValue(value, 'description', label, true);
  const modifiers = snapshotModifiers(ownDataValue(value, 'modifiers', label), `${label} modifiers`);
  const when = ownDataValue(value, 'when', label);
  const category = ownDataValue(value, 'category', label);
  const discoverable = ownDataValue(value, 'discoverable', label);
  if (typeof key !== 'string') throw new TypeError(`${label} key must be a string.`);
  if (typeof description !== 'string' || UNSAFE_MULTILINE_TEXT.test(description)) {
    throw new TypeError(`${label} description must contain printable text and optional line feeds.`);
  }
  if (category !== undefined && (typeof category !== 'string' || UNSAFE_SINGLE_LINE_TEXT.test(category))) {
    throw new TypeError(`${label} category must be single-line printable text.`);
  }
  if (when !== undefined && typeof when !== 'function') {
    throw new TypeError(`${label} when must be a function when supplied.`);
  }
  if (discoverable !== undefined && typeof discoverable !== 'boolean') {
    throw new TypeError(`${label} discoverable must be boolean when supplied.`);
  }
  return Object.freeze({
    key,
    ...(modifiers === undefined ? {} : { modifiers }),
    msg,
    ...(when === undefined ? {} : { when: when as () => boolean }),
    description,
    ...(category === undefined ? {} : { category }),
    ...(discoverable === undefined ? {} : { discoverable }),
  });
}

function snapshotBindings<M>(value: readonly KeyBinding<M>[]): readonly KeyBinding<M>[] {
  if (!Array.isArray(value)) throw new TypeError('Key bindings must be an array.');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > MAX_KEY_BINDINGS) {
    throw new RangeError(`Key bindings must contain at most ${String(MAX_KEY_BINDINGS)} entries.`);
  }
  const snapshots: KeyBinding<M>[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined) {
      throw new TypeError(`Key bindings must be dense; index ${String(index)} is missing.`);
    }
    if (!('value' in descriptor)) {
      throw new TypeError(`Key binding index ${String(index)} must be an own data property.`);
    }
    snapshots.push(snapshotBinding<M>(descriptor.value, index));
  }
  return Object.freeze(snapshots);
}

function snapshotKeyProbe(value: KeyProbe): KeyProbe {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Key event must be an object.');
  }
  const key = ownDataValue(value, 'key', 'Key event', true);
  if (typeof key !== 'string') throw new TypeError('Key event key must be a string.');
  const modifiers = snapshotModifiers(value, 'Key event') ?? {};
  return Object.freeze({
    key,
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
  });
}

function requiredModifiers(modifiers?: KeyModifiers): Required<KeyModifiers> {
  if (modifiers !== undefined && (modifiers === null || typeof modifiers !== 'object' || Array.isArray(modifiers))) {
    throw new TypeError('Key binding modifiers must be an object when supplied.');
  }
  for (const field of ['ctrl', 'alt', 'shift'] as const) {
    if (modifiers?.[field] !== undefined && typeof modifiers[field] !== 'boolean') {
      throw new TypeError(`Key binding modifier ${field} must be boolean when supplied.`);
    }
  }
  return {
    ctrl: modifiers?.ctrl ?? false,
    alt: modifiers?.alt ?? false,
    shift: modifiers?.shift ?? false,
  };
}

function bindingIsActive<M>(binding: KeyBinding<M>): boolean {
  if (binding.when === undefined) return true;
  const active = binding.when();
  if (typeof active !== 'boolean') {
    throw new TypeError('Key binding when must return boolean.');
  }
  return active;
}

function quoteDiagnosticText(value: string): string {
  let result = '"';
  let count = 0;
  for (const scalar of value) {
    if (count >= MAX_DIAGNOSTIC_SCALARS) {
      result += '…';
      break;
    }
    count += 1;
    const codePoint = scalar.codePointAt(0)!;
    if (scalar === '"') {
      result += '\\"';
    } else if (scalar === '\\') {
      result += '\\\\';
    } else if (
      (codePoint >= 0x00 && codePoint <= 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x2028 && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069) ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      result += `\\u${codePoint.toString(16).padStart(4, '0')}`;
    } else {
      result += scalar;
    }
  }
  return `${result}"`;
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
    throw new TypeError(`Key binding ${quoteDiagnosticText(key)} must be one named key or a single Unicode scalar.`);
  }

  const scalar = scalars[0]!;
  const codePoint = scalar.codePointAt(0)!;
  if ((codePoint >= 0x00 && codePoint <= 0x1f) || (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x061c ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x2028 && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    throw new TypeError(`Key binding ${quoteDiagnosticText(key)} must be a printable Unicode scalar; use a named key for controls.`);
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
  if (binding.discoverable !== undefined && typeof binding.discoverable !== 'boolean') {
    throw new TypeError('Key binding discoverable must be boolean when supplied.');
  }
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
  if (evaluateGuard && !bindingIsActive(binding)) return false;

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
  return bindingMatchesEvent(snapshotBinding(binding, 0), snapshotKeyProbe(event), true);
}

export function getMatchingKeyBinding<M>(bindings: readonly KeyBinding<M>[], event: KeyProbe): KeyBinding<M> | null {
  const eventSnapshot = snapshotKeyProbe(event);
  return snapshotBindings(bindings).find((binding) => bindingMatchesEvent(binding, eventSnapshot, true)) ?? null;
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
  const normalized = snapshotBindings(bindings).map(normalizeBinding);
  const active = normalized.filter(({ binding }) => bindingIsActive(binding));
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
function formatNormalizedDisplayKey(key: string): string {
  const graphemes = segmentGraphemes(key);
  const first = graphemes[0];
  if (first === undefined) return key;
  const displayFirst = /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
  if (graphemes.length === 1) return displayFirst;
  return displayFirst + graphemes.slice(1).join('');
}

export function formatDisplayKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0 || UNSAFE_SINGLE_LINE_TEXT.test(key)) {
    throw new TypeError('Display keys must be non-empty printable single-line text.');
  }
  let displayKey = key;
  try {
    displayKey = normalizeKeyBindingKey(key);
  } catch {
    if (segmentGraphemes(key).length !== 1) {
      throw new TypeError('Display keys must be one named key or one printable grapheme.');
    }
  }
  return formatNormalizedDisplayKey(displayKey);
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
  const modifierSnapshot = snapshotModifiers(modifiers, 'Key binding display modifiers');
  const normalizedKey = normalizeKeyBindingKey(key, modifierSnapshot);
  const parts: string[] = [];
  if (modifierSnapshot?.ctrl === true) parts.push('Ctrl');
  if (modifierSnapshot?.alt === true) parts.push('Alt');
  if (modifierSnapshot?.shift === true) parts.push('Shift');

  parts.push(formatNormalizedDisplayKey(normalizedKey));

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
  /** Static theme input used when no live theme context is supplied. */
  readonly theme?: ThemeInput;
  /** Live theme context for reactive help surfaces. */
  readonly themeCtx?: ThemeContext;
}

function snapshotHelpOptions(value: HelpViewOptions): HelpViewOptions {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Key binding help options must be an object.');
  }
  const includeInactive = ownDataValue(value, 'includeInactive', 'Key binding help options');
  const includeUndiscoverable = ownDataValue(value, 'includeUndiscoverable', 'Key binding help options');
  const width = ownDataValue(value, 'width', 'Key binding help options');
  const title = ownDataValue(value, 'title', 'Key binding help options');
  const groupByCategory = ownDataValue(value, 'groupByCategory', 'Key binding help options');
  const theme = ownDataValue(value, 'theme', 'Key binding help options');
  const themeCtx = ownDataValue(value, 'themeCtx', 'Key binding help options');
  return Object.freeze({
    ...(includeInactive === undefined ? {} : { includeInactive: includeInactive as boolean }),
    ...(includeUndiscoverable === undefined ? {} : { includeUndiscoverable: includeUndiscoverable as boolean }),
    ...(width === undefined ? {} : { width: width as number }),
    ...(title === undefined ? {} : { title: title as string }),
    ...(groupByCategory === undefined ? {} : { groupByCategory: groupByCategory as boolean }),
    ...(theme === undefined ? {} : { theme: theme as ThemeInput }),
    ...(themeCtx === undefined ? {} : { themeCtx: themeCtx as ThemeContext }),
  });
}

export function helpView<M>(bindings: readonly KeyBinding<M>[], options: HelpViewOptions = {}): VNode {
  options = snapshotHelpOptions(options);
  for (const field of ['includeInactive', 'includeUndiscoverable', 'groupByCategory'] as const) {
    if (options[field] !== undefined && typeof options[field] !== 'boolean') {
      throw new TypeError(`Key binding help option ${field} must be boolean when supplied.`);
    }
  }
  const width = positiveInteger(options.width, DEFAULT_HELP_WIDTH);
  const theme = resolveTheme(options);
  const bodyStyle = style({ color: theme.colors.text });
  const mutedStyle = style({ color: theme.colors.muted });
  const keyStyle = style({ color: theme.colors.interactive, bold: true });
  const headingStyle = style({ color: theme.colors.tones.accent, bold: true });
  const categoryStyle = style({ color: theme.colors.textSoft, bold: true });
  const title = options.title ?? 'Key Bindings:';
  if (typeof title !== 'string' || UNSAFE_SINGLE_LINE_TEXT.test(title)) {
    throw new TypeError('Key binding help titles must be single-line printable text.');
  }
  const evaluated = snapshotBindings(bindings).map((binding) => {
    const normalized = normalizeBinding(binding);
    return { ...normalized, active: bindingIsActive(binding) };
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
    const empty = text(truncateText('No key bindings defined.', width), mutedStyle);
    setVNodeMeta(empty, { a11y: { role: 'region', label: 'Key bindings, none defined' } });
    return empty;
  }

  const formatted = visible.map(({ binding, key, modifiers }) => {
    if (binding.category !== undefined && (typeof binding.category !== 'string' || UNSAFE_SINGLE_LINE_TEXT.test(binding.category))) {
      throw new TypeError(`Key binding category ${quoteDiagnosticText(binding.category)} must be single-line printable text.`);
    }
    if (typeof binding.description !== 'string' || UNSAFE_MULTILINE_TEXT.test(binding.description)) {
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
      rows.push(text(truncateText(`  ${label}`, width), keyStyle));
      const descriptionIndent = width > 2 ? '  ' : '';
      const descriptionWidth = Math.max(1, width - measureTextWidth(descriptionIndent));
      for (const line of wrapCellText(entry.description, descriptionWidth)) {
        rows.push(text(`${descriptionIndent}${line}`, bodyStyle));
      }
      return;
    }

    const descriptionLines = wrapCellText(entry.description, inlineDescriptionWidth);
    const firstDescription = descriptionLines[0] ?? '';
    rows.push(text(`  ${label}${' '.repeat(columnWidth - labelWidth + 2)}${firstDescription}`, bodyStyle));
    const continuationPrefix = ' '.repeat(2 + columnWidth + 2);
    for (const line of descriptionLines.slice(1)) {
      rows.push(text(`${continuationPrefix}${line}`, bodyStyle));
    }
  };

  if (shouldGroup) {
    let groupIndex = 0;
    for (const [category, entries] of groups) {
      if (groupIndex > 0) rows.push(text(''));
      rows.push(text(truncateText(`${category}:`, width), categoryStyle));
      entries.forEach(renderEntry);
      groupIndex += 1;
    }
  } else {
    formatted.forEach(renderEntry);
  }

  const heading = title.length > 0 ? [text(truncateText(title, width), headingStyle), text('')] : [];
  const view = column(...heading, ...rows);
  setVNodeMeta(view, { a11y: { role: 'region', label: `Key bindings, ${visible.length} entries` } });
  return view;
}
