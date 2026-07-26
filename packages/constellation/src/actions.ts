/**
 * Project a Nebula action registry onto UI surfaces.
 *
 * An app registers each action once with `createActionRegistry`; this module
 * derives the command-palette entries and the key bindings from that single
 * source. Nothing here owns state — a palette entry and its shortcut cannot
 * disagree, because both are computed from the same `ResolvedAction`.
 */

import type { ActionRegistry, ResolvedAction } from '@celestial/core/nebula';
import { getAvailableActions, parseKeyString } from '@celestial/core/nebula';
import { formatDisplayKey, type KeyBinding } from './keyboard.js';
import type { Command } from './palette.js';

interface ActionSurfaceOptions {
  readonly includeDisabled?: boolean;
  readonly includeUndiscoverable?: boolean;
}

export interface ActionCommandOptions<Model, Msg, M> extends ActionSurfaceOptions {
  readonly toMsg: (actionId: string, action: ResolvedAction<Model, Msg>) => M;
  readonly disabledLabelSuffix?: string;
}

export interface ActionKeyBindingOptions<Model, Msg, M> extends ActionSurfaceOptions {
  readonly toMsg: (actionId: string, action: ResolvedAction<Model, Msg>) => M;
  readonly disabledDescriptionSuffix?: string;
}

/** A shortcut that could not be turned into a key binding, and why. */
export interface UnbindableShortcut {
  readonly actionId: string;
  readonly shortcut: string;
  readonly reason: 'multi-chord-sequence' | 'empty';
}

function isDiscoverable<Model, Msg>(action: ResolvedAction<Model, Msg>): boolean {
  return action.descriptor.discoverable !== false;
}

function getSurfaceActions<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options?: ActionSurfaceOptions,
): readonly ResolvedAction<Model, Msg>[] {
  return getAvailableActions(registry, model).filter((action) => {
    if (!options?.includeUndiscoverable && !isDiscoverable(action)) return false;
    if (!options?.includeDisabled && action.availability === 'disabled') return false;
    return true;
  });
}

function shortcutSegments(shortcut: string): string[] {
  const trimmed = shortcut.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

/** Render a shortcut string for display, e.g. `ctrl+k s` becomes `Ctrl+K S`. */
export function formatActionShortcut(shortcut: string): string {
  return shortcutSegments(shortcut)
    .map((segment) => {
      const chord = parseKeyString(segment);
      const parts: string[] = [];
      if (chord.ctrl) parts.push('Ctrl');
      if (chord.alt) parts.push('Alt');
      if (chord.shift) parts.push('Shift');
      parts.push(formatDisplayKey(chord.key));
      return parts.join('+');
    })
    .join(' ');
}

function toCommandKeywords<Model, Msg>(action: ResolvedAction<Model, Msg>): string[] {
  const keywords = [action.descriptor.id];
  if (action.descriptor.description) keywords.push(action.descriptor.description);
  if (action.descriptor.shortcuts) keywords.push(...action.descriptor.shortcuts);
  return keywords;
}

export function actionCommands<Model, Msg, M>(registry: ActionRegistry<Model, Msg>, model: Model, options: ActionCommandOptions<Model, Msg, M>): Command<M>[] {
  const disabledLabelSuffix = options.disabledLabelSuffix ?? '(disabled)';

  return getSurfaceActions(registry, model, options).map((action) => ({
    id: action.descriptor.id,
    label: action.availability === 'disabled' ? `${action.descriptor.title} ${disabledLabelSuffix}` : action.descriptor.title,
    category: action.descriptor.category,
    shortcut: action.descriptor.shortcuts?.map((shortcut) => formatActionShortcut(shortcut)).join(', '),
    keywords: toCommandKeywords(action),
    msg: options.toMsg(action.descriptor.id, action),
  }));
}

function toKeyBindingShortcut(shortcut: string): { key: string; modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean } } | null {
  const segments = shortcutSegments(shortcut);
  // A multi-chord sequence such as `ctrl+k ctrl+s` needs a chord-state machine;
  // a single KeyBinding cannot express it. See unbindableActionShortcuts().
  if (segments.length !== 1) return null;

  const chord = parseKeyString(segments[0]!);
  if (!chord.ctrl && !chord.alt && !chord.shift) return { key: chord.key };
  return { key: chord.key, modifiers: { ctrl: chord.ctrl, alt: chord.alt, shift: chord.shift } };
}

/**
 * Report shortcuts that {@link actionKeyBindings} cannot bind.
 *
 * Those shortcuts are skipped silently — an action declaring only a multi-chord
 * sequence ends up with no binding at all and nothing says so. Callers can
 * assert this is empty in a test, or surface it during development, rather than
 * discovering the shortcut simply does nothing.
 */
export function unbindableActionShortcuts<Model, Msg>(
  registry: ActionRegistry<Model, Msg>,
  model: Model,
  options?: ActionSurfaceOptions,
): UnbindableShortcut[] {
  const unbindable: UnbindableShortcut[] = [];

  for (const action of getSurfaceActions(registry, model, { ...options, includeDisabled: options?.includeDisabled ?? true })) {
    for (const shortcut of action.descriptor.shortcuts ?? []) {
      const segments = shortcutSegments(shortcut);
      if (segments.length === 0) {
        unbindable.push({ actionId: action.descriptor.id, shortcut, reason: 'empty' });
      } else if (segments.length > 1) {
        unbindable.push({ actionId: action.descriptor.id, shortcut, reason: 'multi-chord-sequence' });
      }
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

  for (const action of getSurfaceActions(registry, model, { ...options, includeDisabled: options.includeDisabled ?? true })) {
    for (const shortcut of action.descriptor.shortcuts ?? []) {
      const binding = toKeyBindingShortcut(shortcut);
      if (!binding) continue;

      const disabled = action.availability === 'disabled';
      bindings.push({
        key: binding.key,
        ...(binding.modifiers === undefined ? {} : { modifiers: binding.modifiers }),
        msg: options.toMsg(action.descriptor.id, action),
        // A disabled action keeps its binding registered but inert, so the help
        // screen can still list the shortcut and explain why it does nothing.
        ...(disabled ? { when: () => false } : {}),
        description: disabled ? `${action.descriptor.title} ${disabledDescriptionSuffix}` : action.descriptor.title,
      });
    }
  }

  return bindings;
}
