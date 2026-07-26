/**
 * Project a Nebula action registry onto UI surfaces.
 *
 * An app registers each action once with `createActionRegistry`; this module
 * derives command-palette entries and key bindings from that single source.
 * The projection is a snapshot of the supplied model, so applications should
 * recompute it whenever action availability or active scope changes.
 */

import type { ActionRegistry, ActionScope, KeyModifiers, ResolvedAction } from '@celestial/core/nebula';
import { getAvailableActions, isActionRegistry } from '@celestial/core/nebula';
import { formatKeyBinding, isKeyBindingRepresentable, type KeyBinding, normalizeKeyBindingKey } from './keyboard.js';
import type { Command } from './palette.js';

interface ActionSurfaceOptions<Model, Msg> {
  readonly includeDisabled?: boolean;
  /**
   * Optional nominal availability snapshot shared across several derived
   * surfaces. Create it with `createActionResolutionSnapshot`; forged arrays
   * and snapshots from another registry are rejected.
   */
  readonly resolution?: ActionResolutionSnapshot<Model, Msg>;
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
  | { readonly ok: false; readonly reason: Exclude<UnbindableShortcutReason, 'multi-chord-sequence' | 'empty' | 'conflicting-shortcut'>;
      readonly detail: string;
    };

const MODIFIER_NAMES = new Set(['ctrl', 'alt', 'shift']);
const UNSAFE_SINGLE_LINE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const MAX_ACTION_SURFACE_SUFFIX_LENGTH = 256;
const MAX_FORMATTED_SHORTCUT_LENGTH = 4_096;
const ACTION_RESOLUTION_SNAPSHOTS = new WeakMap<object, ActionRegistry<unknown, unknown>>();

export interface ActionResolutionSnapshot<Model, Msg> {
  readonly actions: readonly ResolvedAction<Model, Msg>[];
}

function ownOptionData(value: object, field: string, label: string, required = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (descriptor === undefined) {
    if (required) {
      throw new TypeError(`${label} requires own data property ${field}.`);
    }
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw new TypeError(`${label} ${field} must be an own data property.`);
  }
  return descriptor.value;
}

function requireOptionsRecord(value: unknown, label: string): object {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function snapshotSurfaceOptions<Model, Msg>(value: ActionSurfaceOptions<Model, Msg> | undefined, label: string): ActionSurfaceOptions<Model, Msg> {
  if (value === undefined) return Object.freeze({});
  const record = requireOptionsRecord(value, label);
  const includeDisabled = ownOptionData(record, 'includeDisabled', label);
  const resolution = ownOptionData(record, 'resolution', label);
  const isScopeActive = ownOptionData(record, 'isScopeActive', label);
  if (includeDisabled !== undefined && typeof includeDisabled !== 'boolean') {
    throw new TypeError(`${label} includeDisabled must be boolean when supplied.`);
  }
  if (resolution !== undefined && (resolution === null || typeof resolution !== 'object' || Array.isArray(resolution))) {
    throw new TypeError(`${label} resolution must be a nominal action resolution snapshot.`);
  }
  if (isScopeActive !== undefined && typeof isScopeActive !== 'function') {
    throw new TypeError(`${label} isScopeActive must be a function when supplied.`);
  }
  return Object.freeze({
    ...(includeDisabled === undefined ? {} : { includeDisabled: includeDisabled as boolean }),
    ...(resolution === undefined
      ? {}
      : {
          resolution: resolution as ActionResolutionSnapshot<Model, Msg>,
        }),
    ...(isScopeActive === undefined
      ? {}
      : {
          isScopeActive: isScopeActive as (scope: ActionScope, action: ResolvedAction<Model, Msg>) => boolean,
        }),
  });
}

function validateSuffix(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_ACTION_SURFACE_SUFFIX_LENGTH || UNSAFE_SINGLE_LINE_TEXT.test(value)) {
    throw new TypeError(`${label} must be at most ${String(MAX_ACTION_SURFACE_SUFFIX_LENGTH)} characters of single-line printable text.`);
  }
  return value;
}

function snapshotCommandOptions<Model, Msg, M>(value: ActionCommandOptions<Model, Msg, M>): ActionCommandOptions<Model, Msg, M> {
  const label = 'Action command options';
  const record = requireOptionsRecord(value, label);
  const surface = snapshotSurfaceOptions(value, label);
  const toMsg = ownOptionData(record, 'toMsg', label, true);
  const disabledLabelSuffix = validateSuffix(ownOptionData(record, 'disabledLabelSuffix', label), `${label} disabledLabelSuffix`);
  const includeUndiscoverable = ownOptionData(record, 'includeUndiscoverable', label);
  if (typeof toMsg !== 'function') {
    throw new TypeError(`${label} toMsg must be a function.`);
  }
  if (includeUndiscoverable !== undefined && typeof includeUndiscoverable !== 'boolean') {
    throw new TypeError(`${label} includeUndiscoverable must be boolean when supplied.`);
  }
  return Object.freeze({
    ...surface,
    toMsg: toMsg as (actionId: string, action: ResolvedAction<Model, Msg>) => M,
    ...(disabledLabelSuffix === undefined ? {} : { disabledLabelSuffix }),
    ...(includeUndiscoverable === undefined ? {} : { includeUndiscoverable: includeUndiscoverable as boolean }),
  });
}

function snapshotKeyBindingOptions<Model, Msg, M>(value: ActionKeyBindingOptions<Model, Msg, M>): ActionKeyBindingOptions<Model, Msg, M> {
  const label = 'Action key-binding options';
  const record = requireOptionsRecord(value, label);
  const surface = snapshotSurfaceOptions(value, label);
  const toMsg = ownOptionData(record, 'toMsg', label, true);
  const disabledDescriptionSuffix = validateSuffix(ownOptionData(record, 'disabledDescriptionSuffix', label), `${label} disabledDescriptionSuffix`);
  if (typeof toMsg !== 'function') {
    throw new TypeError(`${label} toMsg must be a function.`);
  }
  return Object.freeze({
    ...surface,
    toMsg: toMsg as (actionId: string, action: ResolvedAction<Model, Msg>) => M,
    ...(disabledDescriptionSuffix === undefined ? {} : { disabledDescriptionSuffix }),
  });
}

function assertActionRegistry<Model, Msg>(registry: ActionRegistry<Model, Msg>): void {
  if (!isActionRegistry(registry)) {
    throw new TypeError('Action surfaces require a canonical registry created by createActionRegistry.');
  }
}

/**
 * Evaluate each registry action exactly once for a coordinated surface
 * projection. The nominal snapshot cannot be forged or reused with another
 * registry.
 */
export function createActionResolutionSnapshot<Model, Msg>(registry: ActionRegistry<Model, Msg>, model: Model): ActionResolutionSnapshot<Model, Msg> {
  assertActionRegistry(registry);
  const snapshot = Object.freeze({
    actions: Object.freeze(
      getAvailableActions(registry, model).map((action) =>
        Object.freeze({
          descriptor: action.descriptor,
          availability: action.availability,
        }),
      ),
    ),
  });
  ACTION_RESOLUTION_SNAPSHOTS.set(snapshot, registry as ActionRegistry<unknown, unknown>);
  return snapshot;
}

function isDiscoverable<Model, Msg>(action: ResolvedAction<Model, Msg>): boolean {
  return action.descriptor.discoverable !== false;
}

type ScopeResolver<Model, Msg> = (action: ResolvedAction<Model, Msg>) => boolean;

function createScopeResolver<Model, Msg>(options?: ActionSurfaceOptions<Model, Msg>): ScopeResolver<Model, Msg> {
  const decisions = new Map<string, boolean>();
  return (action) => {
    const scope = action.descriptor.scope ?? 'app';
    if (scope === 'app') return true;
    const cached = decisions.get(action.descriptor.id);
    if (cached !== undefined) return cached;
    if (options?.isScopeActive === undefined) {
      decisions.set(action.descriptor.id, false);
      return false;
    }
    const active = options.isScopeActive(scope, action);
    if (typeof active !== 'boolean') {
      throw new TypeError(`Action scope resolver for ${JSON.stringify(action.descriptor.id)} must return boolean.`);
    }
    decisions.set(action.descriptor.id, active);
    return active;
  };
}

function getSurfaceActions<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options?: ActionSurfaceOptions<Model, Msg> & { readonly includeUndiscoverable?: boolean },
  resolveScope: ScopeResolver<Model, Msg> = createScopeResolver(options),
): readonly ResolvedAction<Model, Msg>[] {
  assertActionRegistry(registry);
  let resolved: readonly ResolvedAction<Model, Msg>[];
  if (options?.resolution === undefined) {
    resolved = getAvailableActions(registry, model);
  } else {
    const owner = ACTION_RESOLUTION_SNAPSHOTS.get(options.resolution);
    if (owner !== registry) {
      throw new TypeError('Action resolution snapshot must be created from the exact registry being projected.');
    }
    resolved = options.resolution.actions;
  }
  return resolved.filter((action) => {
    if (!resolveScope(action)) return false;
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
  if (typeof shortcut !== 'string' || shortcut.length > MAX_FORMATTED_SHORTCUT_LENGTH || UNSAFE_SINGLE_LINE_TEXT.test(shortcut)) {
    throw new TypeError(`Action shortcuts must be at most ${String(MAX_FORMATTED_SHORTCUT_LENGTH)} characters of single-line printable text.`);
  }
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
  model: Model, options: ActionCommandOptions<Model, Msg, M>): Command<M>[] {
  options = snapshotCommandOptions(options);
  const disabledLabelSuffix = options.disabledLabelSuffix ?? '(disabled)';
  const resolution = options.resolution ?? createActionResolutionSnapshot(registry, model);
  const projectionOptions = Object.freeze({ ...options, resolution });
  const resolveScope = createScopeResolver(projectionOptions);
  const activeChordOwners = new Map<string, string>();
  for (
    const action of getSurfaceActions(
      registry,
      model,
      {
        ...projectionOptions,
        includeDisabled: false,
        includeUndiscoverable: true,
      },
      resolveScope,
    )
  ) {
    for (const shortcut of action.descriptor.shortcuts ?? []) {
      const chord = toKeyBindingShortcut(shortcut);
      if (chord) {
        const id = chordId(chord);
        if (!activeChordOwners.has(id)) activeChordOwners.set(id, action.descriptor.id);
      }
    }
  }

  return getSurfaceActions(registry, model, projectionOptions, resolveScope).map((action) => {
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
  assertActionRegistry(registry);
  options = snapshotSurfaceOptions(options, 'Unbindable shortcut options');
  const resolveScope = createScopeResolver(options);
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
    getSurfaceActions(registry, model,
      {
        ...options,
        includeDisabled: false,
        includeUndiscoverable: true,
      },
      resolveScope,
    ).map((action) => action.descriptor.id),
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
  options = snapshotKeyBindingOptions(options);
  const disabledDescriptionSuffix = options.disabledDescriptionSuffix ?? '(disabled)';
  const bindings: KeyBinding<M>[] = [];
  const resolveScope = createScopeResolver(options);

  // Keyboard execution is independent of command/help discoverability.
  const actions = getSurfaceActions(
    registry,
    model,
    {
      ...options,
    includeDisabled: options.includeDisabled ?? true,
      includeUndiscoverable: true,
    },
    resolveScope,
  );

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
