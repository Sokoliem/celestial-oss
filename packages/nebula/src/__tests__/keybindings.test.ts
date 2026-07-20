import { describe, expect, it } from 'vitest';
import {
  createKeybindingState,
  findConflicts,
  getActiveBindings,
  getPendingMatches,
  type Keybinding,
  type KeybindingLayer,
  type KeyChord,
  parseKeyString,
  popLayer,
  processKey,
  pushLayer,
  resetChord,
  setMode,
  toKeyChord,
} from '../keybindings.js';

// ─── Test types ──────────────────────────────────────────────────────────────

type TestAction = string;

function binding(id: string, keys: KeyChord[], action: TestAction, opts?: { mode?: string; description?: string; priority?: number }): Keybinding<TestAction> {
  return { id, keys, action, ...opts };
}

function layer(id: string, bindings: Keybinding<TestAction>[]): KeybindingLayer<TestAction> {
  return { id, bindings };
}

function chord(key: string, mods?: { ctrl?: boolean; alt?: boolean; shift?: boolean }): KeyChord {
  return { key, ...mods };
}

// ─── Tests: Single key matching ─────────────────────────────────────────────

describe('single key matching', () => {
  it('single key binding matches on exact key', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'action-a')]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('a'), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.actions).toEqual(['action-a']);
    }
  });

  it('single key with modifiers matches Ctrl+S', () => {
    const base = layer('base', [binding('b1', [chord('s', { ctrl: true })], 'save')]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('s', { ctrl: true }), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.actions).toEqual(['save']);
    }
  });

  it('unbound key returns matched: false, pending: false', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'action-a')]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('z'), 1000);
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.pending).toBe(false);
    }
  });
});

// ─── Tests: Chord sequences ────────────────────────────────────────────────

describe('chord sequences', () => {
  it('two-chord sequence: first key returns pending: true', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment')]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('k', { ctrl: true }), 1000);
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.pending).toBe(true);
    }
  });

  it('two-chord sequence: second key returns matched: true with action', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment')]);
    const state = createKeybindingState<TestAction>([base]);
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    const r2 = processKey(r1.state, chord('c', { ctrl: true }), 1001);
    expect(r2.matched).toBe(true);
    if (r2.matched) {
      expect(r2.actions).toEqual(['comment']);
    }
  });

  it('partial chord + wrong second key returns matched: false, resets pending', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment')]);
    const state = createKeybindingState<TestAction>([base]);
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    expect(r1.matched).toBe(false);
    if (!r1.matched) expect(r1.pending).toBe(true);

    const r2 = processKey(r1.state, chord('x'), 1001);
    expect(r2.matched).toBe(false);
    if (!r2.matched) {
      expect(r2.pending).toBe(false);
    }
    // pendingChord should be cleared
    expect(r2.state.pendingChord).toEqual([]);
  });

  it('chord timeout resets pending state', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment')]);
    const state = createKeybindingState<TestAction>([base], { chordTimeoutMs: 500 });
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    expect(r1.matched).toBe(false);
    if (!r1.matched) expect(r1.pending).toBe(true);

    // Press second key after timeout (1000 + 600 > 500ms timeout)
    const r2 = processKey(r1.state, chord('c', { ctrl: true }), 1600);
    expect(r2.matched).toBe(false);
    if (!r2.matched) {
      // After timeout reset, Ctrl+C alone is not bound, so not pending either
      expect(r2.pending).toBe(false);
    }
  });

  it('three-chord sequence works', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true, shift: true }), chord('Enter')], 'three-chord-action')]);
    const state = createKeybindingState<TestAction>([base]);
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    expect(r1.matched).toBe(false);
    if (!r1.matched) expect(r1.pending).toBe(true);

    const r2 = processKey(r1.state, chord('c', { ctrl: true, shift: true }), 1001);
    expect(r2.matched).toBe(false);
    if (!r2.matched) expect(r2.pending).toBe(true);

    const r3 = processKey(r2.state, chord('Enter'), 1002);
    expect(r3.matched).toBe(true);
    if (r3.matched) {
      expect(r3.actions).toEqual(['three-chord-action']);
    }
  });
});

// ─── Tests: Modes ──────────────────────────────────────────────────────────

describe('modes', () => {
  it('binding with mode="normal" only matches in normal mode', () => {
    const base = layer('base', [binding('b1', [chord('s', { ctrl: true })], 'save', { mode: 'normal' })]);
    const state = setMode(createKeybindingState<TestAction>([base]), 'insert');
    const result = processKey(state, chord('s', { ctrl: true }), 1000);
    expect(result.matched).toBe(false);
  });

  it('binding with mode=undefined matches in all modes', () => {
    const base = layer('base', [binding('b1', [chord('s', { ctrl: true })], 'save')]);
    // Works in normal mode
    const state1 = createKeybindingState<TestAction>([base]);
    const r1 = processKey(state1, chord('s', { ctrl: true }), 1000);
    expect(r1.matched).toBe(true);

    // Works in insert mode
    const state2 = setMode(createKeybindingState<TestAction>([base]), 'insert');
    const r2 = processKey(state2, chord('s', { ctrl: true }), 1000);
    expect(r2.matched).toBe(true);
  });

  it('setMode changes active mode', () => {
    const state = createKeybindingState<TestAction>([]);
    expect(state.mode).toBe('normal');
    const updated = setMode(state, 'insert');
    expect(updated.mode).toBe('insert');
  });

  it('mode-specific binding does not shadow global binding', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'global-a'), binding('b2', [chord('b')], 'normal-b', { mode: 'normal' })]);
    const state = createKeybindingState<TestAction>([base]);

    // 'a' matches (global) and 'b' matches (normal-specific) both in normal mode
    const r1 = processKey(state, chord('a'), 1000);
    expect(r1.matched).toBe(true);
    const r2 = processKey(state, chord('b'), 1000);
    expect(r2.matched).toBe(true);
  });
});

// ─── Tests: Layers ─────────────────────────────────────────────────────────

describe('layers', () => {
  it('pushLayer adds bindings on top', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'base-a')]);
    const state = createKeybindingState<TestAction>([base]);
    const extra = layer('extra', [binding('b2', [chord('x')], 'extra-x')]);
    const state2 = pushLayer(state, extra);

    const result = processKey(state2, chord('x'), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.actions).toEqual(['extra-x']);
    }
  });

  it('popLayer removes a layer by id', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'base-a')]);
    const extra = layer('extra', [binding('b2', [chord('x')], 'extra-x')]);
    const state = pushLayer(createKeybindingState<TestAction>([base]), extra);
    const state2 = popLayer(state, 'extra');

    const result = processKey(state2, chord('x'), 1000);
    expect(result.matched).toBe(false);
  });

  it('higher layer binding shadows lower layer for same key', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'base-a')]);
    const overlay = layer('overlay', [binding('b2', [chord('a')], 'overlay-a', { priority: 10 })]);
    const state = pushLayer(createKeybindingState<TestAction>([base]), overlay);

    const result = processKey(state, chord('a'), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      // Higher priority overlay action should come first
      expect(result.actions[0]).toBe('overlay-a');
    }
  });

  it('popping layer restores lower layer bindings', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'base-a')]);
    const overlay = layer('overlay', [binding('b2', [chord('a')], 'overlay-a')]);
    const state = pushLayer(createKeybindingState<TestAction>([base]), overlay);
    const state2 = popLayer(state, 'overlay');

    const result = processKey(state2, chord('a'), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.actions).toEqual(['base-a']);
    }
  });
});

// ─── Tests: Which-key & introspection ──────────────────────────────────────

describe('which-key & introspection', () => {
  it('getActiveBindings returns all bindings for current mode', () => {
    const base = layer('base', [
      binding('b1', [chord('a')], 'global-a'),
      binding('b2', [chord('b')], 'normal-b', { mode: 'normal' }),
      binding('b3', [chord('c')], 'insert-c', { mode: 'insert' }),
    ]);
    const state = createKeybindingState<TestAction>([base]);
    const active = getActiveBindings(state);

    // In normal mode: global-a + normal-b, not insert-c
    expect(active).toHaveLength(2);
    expect(active.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('getPendingMatches returns bindings matching current chord prefix', () => {
    const base = layer('base', [
      binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment'),
      binding('b2', [chord('k', { ctrl: true }), chord('u', { ctrl: true })], 'uncomment'),
      binding('b3', [chord('s', { ctrl: true })], 'save'),
    ]);
    const state = createKeybindingState<TestAction>([base]);
    // Press Ctrl+K to start chord
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    const pending = getPendingMatches(r1.state);

    // Should include b1 and b2 (both start with Ctrl+K), not b3
    expect(pending).toHaveLength(2);
    expect(pending.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });

  it('findConflicts detects two bindings with same key sequence in same mode', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'action-1'), binding('b2', [chord('a')], 'action-2'), binding('b3', [chord('b')], 'action-3')]);
    const state = createKeybindingState<TestAction>([base]);
    const conflicts = findConflicts(state);

    expect(conflicts.length).toBe(1);
    const pair = conflicts[0]!;
    expect(pair.map((b) => b.id).sort()).toEqual(['b1', 'b2']);
  });
});

// ─── Tests: Edge cases ─────────────────────────────────────────────────────

describe('edge cases', () => {
  it('resetChord clears pending state', () => {
    const base = layer('base', [binding('b1', [chord('k', { ctrl: true }), chord('c', { ctrl: true })], 'comment')]);
    const state = createKeybindingState<TestAction>([base]);
    const r1 = processKey(state, chord('k', { ctrl: true }), 1000);
    expect(r1.state.pendingChord.length).toBeGreaterThan(0);

    const cleared = resetChord(r1.state);
    expect(cleared.pendingChord).toEqual([]);
    expect(cleared.chordStartTime).toBe(0);
  });

  it('toKeyChord converts key + modifiers', () => {
    const kc = toKeyChord('s', { ctrl: true });
    expect(kc.key).toBe('s');
    expect(kc.ctrl).toBe(true);
    expect(kc.alt).toBeUndefined();
    expect(kc.shift).toBeUndefined();
  });

  it('parseKeyString parses "Ctrl+Shift+K"', () => {
    const kc = parseKeyString('Ctrl+Shift+K');
    expect(kc.key).toBe('k');
    expect(kc.ctrl).toBe(true);
    expect(kc.shift).toBe(true);
    expect(kc.alt).toBeUndefined();
  });

  it('case-insensitive key matching', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'action-a')]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('A'), 1000);
    expect(result.matched).toBe(true);
  });

  it('priority field breaks ties', () => {
    const base = layer('base', [binding('b1', [chord('a')], 'low-priority', { priority: 1 }), binding('b2', [chord('a')], 'high-priority', { priority: 10 })]);
    const state = createKeybindingState<TestAction>([base]);
    const result = processKey(state, chord('a'), 1000);
    expect(result.matched).toBe(true);
    if (result.matched) {
      // Higher priority action should come first
      expect(result.actions[0]).toBe('high-priority');
    }
  });
});
