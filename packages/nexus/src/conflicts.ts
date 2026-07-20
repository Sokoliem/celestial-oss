import type { Keybinding, KeybindingLayer, KeybindingState, KeyChord } from '@celestial/nebula';

export interface BindingGroup<M = unknown> {
  module: string;
  id: string;
  bindings: readonly BindingEntry<M>[];
}

export interface BindingEntry<M = unknown> extends Omit<Keybinding<M>, 'keys'> {
  keys: readonly KeyChord[];
}

export interface ConflictRef<M = unknown> {
  module: string;
  groupId: string;
  bindingId: string;
  binding: BindingEntry<M>;
  index: number;
}

export interface ConflictEntry<M = unknown> {
  kind: 'duplicate' | 'prefix';
  left: ConflictRef<M>;
  right: ConflictRef<M>;
}

export interface ConflictReport<M = unknown> {
  groups: number;
  bindings: number;
  conflicts: ConflictEntry<M>[];
}

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

function boolFlag(v: boolean | undefined): boolean {
  return v === true;
}

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

function sequenceStartsWith(sequence: readonly KeyChord[], prefix: readonly KeyChord[]): boolean {
  if (prefix.length >= sequence.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (!chordsEqual(sequence[i]!, prefix[i]!)) return false;
  }
  return true;
}

function modesCompatible(left: BindingEntry, right: BindingEntry): boolean {
  return left.mode === undefined || right.mode === undefined || left.mode === right.mode;
}

function createRef<M>(group: BindingGroup<M>, binding: BindingEntry<M>, index: number): ConflictRef<M> {
  return {
    module: group.module,
    groupId: group.id,
    bindingId: binding.id,
    binding,
    index,
  };
}

export function createBindingGroup<M>(module: string, id: string, bindings: readonly BindingEntry<M>[]): BindingGroup<M> {
  return { module, id, bindings };
}

export function fromNebulaKeybindingLayer<M>(module: string, layer: KeybindingLayer<M>): BindingGroup<M> {
  return createBindingGroup(
    module,
    layer.id,
    layer.bindings.map((binding) => ({
      ...binding,
      keys: [...binding.keys],
    })),
  );
}

export function fromNebulaKeybindingLayers<M>(module: string, layers: readonly KeybindingLayer<M>[]): BindingGroup<M>[] {
  return layers.map((layer) => fromNebulaKeybindingLayer(module, layer));
}

export function fromNebulaKeybindingState<M>(module: string, state: KeybindingState<M>): BindingGroup<M>[] {
  return fromNebulaKeybindingLayers(module, state.layers);
}

export function detectConflicts<M>(groups: readonly BindingGroup<M>[]): ConflictReport<M> {
  const activeBindings: Array<{ group: BindingGroup<M>; binding: BindingEntry<M>; index: number }> = [];
  for (const group of groups) {
    for (let index = 0; index < group.bindings.length; index++) {
      const binding = group.bindings[index];
      if (!binding) continue;
      activeBindings.push({ group, binding, index });
    }
  }

  const conflicts: ConflictEntry<M>[] = [];

  for (let i = 0; i < activeBindings.length; i++) {
    const left = activeBindings[i]!;
    for (let j = i + 1; j < activeBindings.length; j++) {
      const right = activeBindings[j]!;
      if (!modesCompatible(left.binding, right.binding)) {
        continue;
      }

      if (sequencesEqual(left.binding.keys, right.binding.keys)) {
        conflicts.push({
          kind: 'duplicate',
          left: createRef(left.group, left.binding, left.index),
          right: createRef(right.group, right.binding, right.index),
        });
        continue;
      }

      if (sequenceStartsWith(left.binding.keys, right.binding.keys) || sequenceStartsWith(right.binding.keys, left.binding.keys)) {
        const shorterFirst = left.binding.keys.length <= right.binding.keys.length ? [left, right] : [right, left];
        conflicts.push({
          kind: 'prefix',
          left: createRef(shorterFirst[0]!.group, shorterFirst[0]!.binding, shorterFirst[0]!.index),
          right: createRef(shorterFirst[1]!.group, shorterFirst[1]!.binding, shorterFirst[1]!.index),
        });
      }
    }
  }

  return {
    groups: groups.length,
    bindings: activeBindings.length,
    conflicts,
  };
}
