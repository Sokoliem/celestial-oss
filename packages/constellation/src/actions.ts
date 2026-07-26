/**
 * Project a Nebula action registry onto UI surfaces.
 *
 * An app registers each action once with `createActionRegistry`; this module
 * derives command-palette entries and key bindings from that single source.
 * The projection is a snapshot of the supplied model, so applications should
 * recompute it whenever action availability or active scope changes.
 */

import type { ActionRegistry, ActionScope, KeyModifiers, ResolvedAction } from '@celestial/core/nebula';
import { getAvailableActions } from '@celestial/core/nebula';
import { formatKeyBinding, isKeyBindingRepresentable, normalizeKeyBindingKey, type KeyBinding } from './keyboard.js';
import type { Command } from './palette.js';

interface ActionSurfaceOptions<Model, Msg> {
  readonly includeDisabled?: boolean;
  /**
   * Resolve non-application scopes for this projection.
   *
   * Scoped actions fail closed when this callback is omitted. Application
   * actions (including actions without an explicit scope) are always active.
   */
  readonly isScopeActive?: (scope: ActionScope, action: ResolvedAction<Model, Msg>) => boolean;
}

export interface ActionCommandOptions<Model, Msg, M> extends ActionSurfaceOptions<Model, Msg> {
  readonly toMsg: (actionId: string, action: ResolvedAction<Model, Msg>) => M;
  readonly disabledLabelSuffix?: string;
  readonly includeUndiscoverable?: boolean;
}

export interface ActionKeyBindingOptions<Model, Msg, M> extends ActionSurfaceOptions<Model, Msg> {
  readonly toMsg: (actionId: string, action: ResolvedAction<Model, Msg>) => M;
  readonly disabledDescriptionSuffix?: string;
}

export type UnbindableShortcutReason =
  | 'multi-chord-sequence'
  | 'empty'
  | 'unknown-modifier'
  | 'duplicate-modifier'
  | 'missing-key'
  | 'unsupported-key'
  | 'unsupported-modifier-combination'
  | 'conflicting-shortcut';

/** A shortcut that could not be turned into a key binding, and why. */
export interface UnbindableShortcut {
  readonly actionId: string;
  readonly shortcut: string;
  readonly reason: UnbindableShortcutReason;
  readonly detail?: string;
  readonly conflictsWithActionId?: string;
}

interface ParsedShortcutChord {
  readonly key: string;
  readonly modifiers: Required<KeyModifiers>;
}

type ShortcutParseResult =
  | { readonly ok: true; readonly chord: ParsedShortcutChord }
  | { readonly ok: false; readonly reason: Exclude<UnbindableShortcutReason, 'multi-chord-sequence' | 'empty' | 'conflicting-shortcut'>; readonly detail: string };

const MODIFIER_NAMES = new Set(['ctrl', 'alt', 'shift']);

function isDiscoverable<Model, Msg>(action: ResolvedAction<Model, Msg>): boolean {
  return action.descriptor.discoverable !== false;
}

function isScopeActive<Model, Msg>(action: ResolvedAction<Model, Msg>, options?: ActionSurfaceOptions<Model, Msg>): boolean {
  const scope = action.descriptor.scope ?? 'app';
  return scope === 'app' || options?.isScopeActive?.(scope, action) === true;
}

function getSurfaceActions<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options?: ActionSurfaceOptions<Model, Msg> & { readonly includeUndiscoverable?: boolean },
): readonly ResolvedAction<Model, Msg>[] {
  return getAvailableActions(registry, model).filter((action) => {
    if (!isScopeActive(action, options)) return false;
    if (!options?.includeUndiscoverable && !isDiscoverable(action)) return false;
    if (!options?.includeDisabled && action.availability === 'disabled') return false;
    return true;
  });
}

function shortcutSegments(shortcut: string): string[] {
  const trimmed = shortcut.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

function parseShortcutChord(segment: string): ShortcutParseResult {
  const parts = segment.split('+');
  const rawKey = parts[parts.length - 1] ?? '';
  if (rawKey.length === 0) {
    return { ok: false, reason: 'missing-key', detail: `Shortcut ${JSON.stringify(segment)} has a missing key after the modifier separator.` };
  }

  const modifiers: Required<KeyModifiers> = { ctrl: false, alt: false, shift: false };
  for (const rawModifier of parts.slice(0, -1)) {
    const modifier = rawModifier.toLowerCase();
    if (!MODIFIER_NAMES.has(modifier)) {
      return {
        ok: false,
        reason: 'unknown-modifier',
        detail: `Shortcut ${JSON.stringify(segment)} contains unknown modifier ${JSON.stringify(rawModifier)}.`,
      };
    }
    const name = modifier as keyof Required<KeyModifiers>;
    if (modifiers[name]) {
      return {
        ok: false,
        reason: 'duplicate-modifier',
        detail: `Shortcut ${JSON.stringify(segment)} repeats modifier ${JSON.stringify(rawModifier)}.`,
      };
    }
    modifiers[name] = true;
  }

  try {
    return { ok: true, chord: { key: normalizeKeyBindingKey(rawKey, modifiers), modifiers } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'unsupported-key', detail: message };
  }
}

function chordId(chord: ParsedShortcutChord): string {
  const { ctrl, alt, shift } = chord.modifiers;
  return `${ctrl ? '1' : '0'}${alt ? '1' : '0'}${shift ? '1' : '0'}:${chord.key}`;
}

/**
 * Render a shortcut declaration for display.
 *
 * Chords use `ctrl`, `alt`, and `shift` modifier names followed by one named
 * key or printable Unicode scalar. Use `plus` for the literal `+` key. Chords
 * in a sequence are separated by whitespace. Invalid syntax throws TypeError
 * rather than silently broadening a shortcut.
 *
 * @example `ctrl+k s` becomes `Ctrl+K S`.
 */
export function formatActionShortcut(shortcut: string): string {
  return shortcutSegments(shortcut)
    .map((segment) => {
      const parsed = parseShortcutChord(segment);
      if (!parsed.ok) throw new TypeError(parsed.detail);
      return formatKeyBinding(parsed.chord.key, parsed.chord.modifiers);
    })
    .join(' ');
}

function formatBindableActionShortcut(shortcut: string): string | null {
  const segments = shortcutSegments(shortcut);
  if (segments.length !== 1) return null;
  const parsed = parseShortcutChord(segments[0]!);
  if (!parsed.ok) return null;
  if (!isKeyBindingRepresentable(parsed.chord.key, parsed.chord.modifiers)) return null;
  return formatKeyBinding(parsed.chord.key, parsed.chord.modifiers);
}

function toCommandKeywords<Model, Msg>(action: ResolvedAction<Model, Msg>): string[] {
  const keywords = [action.descriptor.id];
  if (action.descriptor.description) keywords.push(action.descriptor.description);
  if (action.descriptor.shortcuts) keywords.push(...action.descriptor.shortcuts);
  return keywords;
}

export function actionCommands<Model, Msg, M>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options: ActionCommandOptions<Model, Msg, M>,
): Command<M>[] {
  const disabledLabelSuffix = options.disabledLabelSuffix ?? '(disabled)';
  const activeChordOwners = new Map<string, string>();
  for (const action of getSurfaceActions(registry, model, {
    ...options,
    includeDisabled: false,
    includeUndiscoverable: true,
  })) {
    for (const shortcut of action.descriptor.shortcuts ?? []) {
      const chord = toKeyBindingShortcut(shortcut);
      if (chord) {
        const id = chordId(chord);
        if (!activeChordOwners.has(id)) activeChordOwners.set(id, action.descriptor.id);
      }
    }
  }

  return getSurfaceActions(registry, model, options).map((action) => {
    const disabled = action.availability === 'disabled';
    const shortcuts: string[] = [];
    const seenShortcuts = new Set<string>();
    if (!disabled) {
      for (const shortcut of action.descriptor.shortcuts ?? []) {
        const chord = toKeyBindingShortcut(shortcut);
        if (!chord || activeChordOwners.get(chordId(chord)) !== action.descriptor.id) continue;
        const formatted = formatBindableActionShortcut(shortcut);
        if (formatted && !seenShortcuts.has(formatted)) {
          seenShortcuts.add(formatted);
          shortcuts.push(formatted);
        }
      }
    }
    return {
      id: action.descriptor.id,
      label: disabled ? `${action.descriptor.title} ${disabledLabelSuffix}` : action.descriptor.title,
      category: action.descriptor.category,
      ...(shortcuts.length > 0 ? { shortcut: shortcuts.join(', ') } : {}),
      keywords: toCommandKeywords(action),
      msg: options.toMsg(action.descriptor.id, action),
      ...(disabled ? { disabled: true } : {}),
    };
  });
}

function toKeyBindingShortcut(shortcut: string): ParsedShortcutChord | null {
  const segments = shortcutSegments(shortcut);
  // A multi-chord sequence needs Nebula's stateful keybinding engine; a
  // single KeyBinding cannot express it. See unbindableActionShortcuts().
  if (segments.length !== 1) return null;

  const parsed = parseShortcutChord(segments[0]!);
  return parsed.ok && isKeyBindingRepresentable(parsed.chord.key, parsed.chord.modifiers) ? parsed.chord : null;
}

/**
 * Report every registry shortcut that {@link actionKeyBindings} cannot bind.
 *
 * Syntax and decoder validation deliberately inspect descriptor data rather
 * than the current model projection. Collision validation is contextual: it
 * considers the currently visible, active-scope projection so mutually
 * exclusive screens can safely reuse a chord.
 */
export function unbindableActionShortcuts<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options?: ActionSurfaceOptions<Model, Msg>,
): UnbindableShortcut[] {
  const unbindable: UnbindableShortcut[] = [];
  const bindableByAction = new Map<string, Array<{ readonly shortcut: string; readonly chord: ParsedShortcutChord }>>();

  for (const descriptor of registry.actions) {
    for (const shortcut of descriptor.shortcuts ?? []) {
      const segments = shortcutSegments(shortcut);
      if (segments.length === 0) {
        unbindable.push({ actionId: descriptor.id, shortcut, reason: 'empty' });
        continue;
      }
      if (segments.length > 1) {
        unbindable.push({ actionId: descriptor.id, shortcut, reason: 'multi-chord-sequence' });
        continue;
      }

      const parsed = parseShortcutChord(segments[0]!);
      if (!parsed.ok) {
        unbindable.push({ actionId: descriptor.id, shortcut, reason: parsed.reason, detail: parsed.detail });
        continue;
      }
      if (!isKeyBindingRepresentable(parsed.chord.key, parsed.chord.modifiers)) {
        unbindable.push({
          actionId: descriptor.id,
          shortcut,
          reason: 'unsupported-modifier-combination',
          detail: `Nebula's terminal decoder cannot preserve ${formatKeyBinding(parsed.chord.key, parsed.chord.modifiers)} exactly.`,
        });
        continue;
      }
      const entries = bindableByAction.get(descriptor.id) ?? [];
      entries.push({ shortcut, chord: parsed.chord });
      bindableByAction.set(descriptor.id, entries);
    }
  }

  const activeActionIds = new Set(
    getSurfaceActions(registry, model, { ...options, includeDisabled: false, includeUndiscoverable: true }).map((action) => action.descriptor.id),
  );
  const claimedChords = new Map<string, string>();
  for (const descriptor of registry.actions) {
    if (!activeActionIds.has(descriptor.id)) continue;
    for (const { shortcut, chord } of bindableByAction.get(descriptor.id) ?? []) {
      const id = chordId(chord);
      const existing = claimedChords.get(id);
      if (existing === undefined) {
        claimedChords.set(id, descriptor.id);
        continue;
      }
      unbindable.push({
        actionId: descriptor.id,
        shortcut,
        reason: 'conflicting-shortcut',
        conflictsWithActionId: existing,
        detail: `Shortcut conflicts with action ${JSON.stringify(existing)} in the active scope projection; first active binding wins.`,
      });
    }
  }

  return unbindable;
}

export function actionKeyBindings<Model, Msg, M>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options: ActionKeyBindingOptions<Model, Msg, M>,
): KeyBinding<M>[] {
  const disabledDescriptionSuffix = options.disabledDescriptionSuffix ?? '(disabled)';
  const bindings: KeyBinding<M>[] = [];

  // Keyboard execution is independent of command/help discoverability.
  const actions = getSurfaceActions(registry, model, {
    ...options,
    includeDisabled: options.includeDisabled ?? true,
    includeUndiscoverable: true,
  });

  for (const action of actions) {
    for (const shortcut of action.descriptor.shortcuts ?? []) {
      const chord = toKeyBindingShortcut(shortcut);
      if (!chord) continue;

      const disabled = action.availability === 'disabled';
      const hasModifiers = chord.modifiers.ctrl || chord.modifiers.alt || chord.modifiers.shift;
      bindings.push({
        key: chord.key,
        ...(hasModifiers ? { modifiers: chord.modifiers } : {}),
        msg: options.toMsg(action.descriptor.id, action),
        // Disabled actions remain available to opt-in help views but are inert.
        // Recompute this projection when the model's availability changes.
        ...(disabled ? { when: () => false } : {}),
        description: disabled ? `${action.descriptor.title} ${disabledDescriptionSuffix}` : action.descriptor.title,
        ...(action.descriptor.category === undefined ? {} : { category: action.descriptor.category }),
        discoverable: action.descriptor.discoverable !== false,
      });
    }
  }

  return bindings;
}
