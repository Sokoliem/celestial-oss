/**
 * Nebula Keybinding System
 *
 * A pure state machine for modal keybindings with chord sequences,
 * pushable layers, and which-key introspection.
 *
 * Integration: users include KeybindingState in their Elm model,
 * call processKey() in their update function, and dispatch matched actions.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface KeyChord {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
}

export interface Keybinding<M> {
  readonly id: string;
  readonly keys: readonly KeyChord[];
  readonly action: M;
  readonly mode?: string;
  readonly description?: string;
  readonly priority?: number;
}

export interface KeybindingLayer<M> {
  readonly id: string;
  readonly bindings: readonly Keybinding<M>[];
}

export interface KeybindingState<M> {
  readonly mode: string;
  readonly layers: readonly KeybindingLayer<M>[];
  readonly pendingChord: readonly KeyChord[];
  readonly chordTimeoutMs: number;
  readonly chordStartTime: number;
}

export type KeyResult<M> =
  | { readonly matched: true; readonly actions: M[]; readonly state: KeybindingState<M> }
  | { readonly matched: false; readonly pending: boolean; readonly state: KeybindingState<M> };

// ─── Helpers ────────────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function boolFlag(v: boolean | undefined): boolean {
  return v === true;
}

/** Compare two key chords for equality (case-insensitive for single-char keys). */
function chordsEqual(a: KeyChord, b: KeyChord): boolean {
  return (
    normalizeKey(a.key) === normalizeKey(b.key) &&
    boolFlag(a.ctrl) === boolFlag(b.ctrl) &&
    boolFlag(a.alt) === boolFlag(b.alt) &&
    boolFlag(a.shift) === boolFlag(b.shift)
  );
}

function sequencesEqual(a: readonly KeyChord[], b: readonly KeyChord[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!chordsEqual(a[i]!, b[i]!)) return false;
  }
  return true;
}

function bindingMatchesMode<M>(binding: Keybinding<M>, mode: string): boolean {
  return binding.mode === undefined || binding.mode === mode;
}

// ─── State creation ─────────────────────────────────────────────

export function createKeybindingState<M>(layers: KeybindingLayer<M>[], opts?: { chordTimeoutMs?: number }): KeybindingState<M> {
  return {
    mode: 'normal',
    layers,
    pendingChord: [],
    chordTimeoutMs: opts?.chordTimeoutMs ?? 1000,
    chordStartTime: 0,
  };
}

// ─── Core: processKey ───────────────────────────────────────────

export function processKey<M>(state: KeybindingState<M>, chord: KeyChord, now?: number): KeyResult<M> {
  const currentTime = now ?? Date.now();
  let pending = state.pendingChord;

  // 1. Check timeout: if pending and timed out, reset
  if (pending.length > 0 && state.chordStartTime > 0 && currentTime - state.chordStartTime > state.chordTimeoutMs) {
    pending = [];
  }

  // 2. Build candidate sequence
  const candidate = [...pending, chord];

  // 3. Collect active bindings (all layers, filtered by mode)
  const active = flattenActiveBindings(state);

  // 4. Find exact matches
  const exactMatches = active.filter((b) => b.keys.length === candidate.length && candidate.every((c, i) => chordsEqual(c, b.keys[i]!)));

  // 5. Find prefix matches (bindings longer than candidate that start with candidate)
  const prefixMatches = active.filter((b) => b.keys.length > candidate.length && candidate.every((c, i) => chordsEqual(c, b.keys[i]!)));

  // 6. Exact matches found: return matched
  if (exactMatches.length > 0) {
    // Sort by priority descending (higher first), default priority = 0
    const sorted = [...exactMatches].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return {
      matched: true,
      actions: sorted.map((m) => m.action),
      state: { ...state, pendingChord: [], chordStartTime: 0 },
    };
  }

  // 7. Prefix matches only: return pending
  if (prefixMatches.length > 0) {
    const startTime = pending.length === 0 ? currentTime : state.chordStartTime;
    return {
      matched: false,
      pending: true,
      state: { ...state, pendingChord: candidate, chordStartTime: startTime || currentTime },
    };
  }

  // 8. No matches at all
  return {
    matched: false,
    pending: false,
    state: { ...state, pendingChord: [], chordStartTime: 0 },
  };
}

// ─── Mode management ────────────────────────────────────────────

export function setMode<M>(state: KeybindingState<M>, mode: string): KeybindingState<M> {
  return { ...state, mode, pendingChord: [], chordStartTime: 0 };
}

// ─── Layer management ───────────────────────────────────────────

export function pushLayer<M>(state: KeybindingState<M>, layer: KeybindingLayer<M>): KeybindingState<M> {
  return { ...state, layers: [...state.layers, layer] };
}

export function popLayer<M>(state: KeybindingState<M>, layerId: string): KeybindingState<M> {
  return { ...state, layers: state.layers.filter((l) => l.id !== layerId) };
}

// ─── Introspection ──────────────────────────────────────────────

function flattenActiveBindings<M>(state: KeybindingState<M>): Keybinding<M>[] {
  const result: Keybinding<M>[] = [];
  for (const layer of state.layers) {
    for (const b of layer.bindings) {
      if (bindingMatchesMode(b, state.mode)) {
        result.push(b);
      }
    }
  }
  return result;
}

export function getActiveBindings<M>(state: KeybindingState<M>): Keybinding<M>[] {
  return flattenActiveBindings(state);
}

export function getPendingMatches<M>(state: KeybindingState<M>): Keybinding<M>[] {
  if (state.pendingChord.length === 0) return [];
  const active = flattenActiveBindings(state);
  return active.filter((b) => b.keys.length > state.pendingChord.length && state.pendingChord.every((c, i) => chordsEqual(c, b.keys[i]!)));
}

export function findConflicts<M>(state: KeybindingState<M>): [Keybinding<M>, Keybinding<M>][] {
  const active = flattenActiveBindings(state);
  const conflicts: [Keybinding<M>, Keybinding<M>][] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (sequencesEqual(active[i]!.keys, active[j]!.keys)) {
        conflicts.push([active[i]!, active[j]!]);
      }
    }
  }
  return conflicts;
}

// ─── Chord utilities ────────────────────────────────────────────

export function resetChord<M>(state: KeybindingState<M>): KeybindingState<M> {
  return { ...state, pendingChord: [], chordStartTime: 0 };
}

export function toKeyChord(key: string, modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean }): KeyChord {
  return { key, ctrl: modifiers?.ctrl, alt: modifiers?.alt, shift: modifiers?.shift };
}

export function parseKeyString(str: string): KeyChord {
  const parts = str.split('+');
  const key = normalizeKey(parts[parts.length - 1]!);
  let ctrl: boolean | undefined;
  let alt: boolean | undefined;
  let shift: boolean | undefined;

  for (let i = 0; i < parts.length - 1; i++) {
    const mod = parts[i]!.toLowerCase();
    if (mod === 'ctrl') ctrl = true;
    else if (mod === 'alt') alt = true;
    else if (mod === 'shift') shift = true;
  }

  return { key, ctrl, alt, shift };
}
