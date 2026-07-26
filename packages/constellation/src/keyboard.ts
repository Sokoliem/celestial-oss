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
import { measureTextWidth, segmentGraphemes } from '@celestial/rosetta';

/** Upper bound on the key column so one pathological label cannot blow up the layout. */
const MAX_KEY_COLUMN_CELLS = 32;

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
}

type KeyProbe = Pick<KeyEvent, 'key' | 'ctrl' | 'alt' | 'shift'>;

export function matchesKeyBinding<M>(binding: KeyBinding<M>, event: KeyProbe): boolean {
  if (binding.when && !binding.when()) return false;

  return (
    binding.key === event.key &&
    (binding.modifiers?.ctrl ?? false) === (event.ctrl ?? false) &&
    (binding.modifiers?.alt ?? false) === (event.alt ?? false) &&
    (binding.modifiers?.shift ?? false) === (event.shift ?? false)
  );
}

export function getMatchingKeyBinding<M>(bindings: readonly KeyBinding<M>[], event: KeyProbe): KeyBinding<M> | null {
  return bindings.find((binding) => matchesKeyBinding(binding, event)) ?? null;
}

/**
 * Convert a list of key bindings into a single batched subscription.
 *
 * Bindings whose `when` guard returns false are omitted, so the subscription
 * set reflects the current context rather than filtering at dispatch time.
 * Returns `Sub.none()` when nothing is active.
 */
export function keyMap<M>(bindings: readonly KeyBinding<M>[]): Sub<M> {
  const active = bindings.filter((binding) => binding.when === undefined || binding.when());
  if (active.length === 0) return Sub.none();

  const subs = active.map((binding) => {
    const modifiers = binding.modifiers;
    const hasModifiers = modifiers !== undefined && (modifiers.ctrl === true || modifiers.alt === true || modifiers.shift === true);
    return hasModifiers ? Sub.keyWithModifiers(binding.key, modifiers, binding.msg) : Sub.key(binding.key, binding.msg);
  });

  return subs.length === 1 ? subs[0]! : Sub.batch(...subs);
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
  if (graphemes.length === 1) return key.toUpperCase();
  return first.toUpperCase() + graphemes.slice(1).join('');
}

/**
 * Format a key plus modifiers for display, e.g. `Ctrl+C`, `Shift+Tab`, `Enter`.
 *
 * Single-grapheme keys are upper-cased whole; longer names are capitalized.
 * Counting graphemes rather than code units keeps an emoji or combining
 * sequence from being treated as several characters.
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
export function helpView<M>(bindings: readonly KeyBinding<M>[]): VNode {
  if (bindings.length === 0) {
    const empty = text('No key bindings defined.');
    setVNodeMeta(empty, { a11y: { role: 'region', label: 'Key bindings, none defined' } });
    return empty;
  }

  const formatted = bindings.map((binding) => {
    const label = formatKeyBinding(binding.key, binding.modifiers);
    return { label, width: measureTextWidth(label), description: binding.description };
  });

  const columnWidth = Math.min(MAX_KEY_COLUMN_CELLS, Math.max(...formatted.map((entry) => entry.width)));

  const rows = formatted.map((entry) => {
    const padding = ' '.repeat(Math.max(0, columnWidth - entry.width) + 2);
    return text(`  ${entry.label}${padding}${entry.description}`);
  });

  const view = column(text('Key Bindings:'), text(''), ...rows);
  setVNodeMeta(view, { a11y: { role: 'region', label: `Key bindings, ${bindings.length} entries` } });
  return view;
}
