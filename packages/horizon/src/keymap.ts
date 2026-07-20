export type KeymapPlatform = 'macos' | 'windows' | 'linux' | 'any';

export type KeymapScope = 'global' | 'workspace' | 'window' | 'pane' | 'tab' | 'modal';

export interface KeyCommand {
  id: string;
  scope: KeymapScope;
  description?: string;
}

export interface KeyBinding {
  commandId: string;
  accelerator: string;
  platform?: KeymapPlatform;
  scope?: KeymapScope;
  disabled?: boolean;
}

export interface KeymapConflict {
  accelerator: string;
  scope: KeymapScope;
  commandIds: string[];
}

export interface KeymapModel {
  platform: KeymapPlatform;
  commands: readonly KeyCommand[];
  bindings: readonly KeyBinding[];
}

export interface CreateKeymapOptions {
  platform?: KeymapPlatform;
  commands?: readonly KeyCommand[];
  bindings?: readonly KeyBinding[];
}

const MODIFIER_ALIASES: Record<string, string> = {
  cmd: 'meta',
  command: 'meta',
  option: 'alt',
  opt: 'alt',
  control: 'ctrl',
  ctl: 'ctrl',
};

const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'];

export function createKeymap(options: CreateKeymapOptions = {}): KeymapModel {
  return {
    platform: options.platform ?? 'any',
    commands: [...(options.commands ?? [])],
    bindings: [...(options.bindings ?? [])],
  };
}

export function normalizeAccelerator(accelerator: string, platform: KeymapPlatform = 'any'): string {
  const parts = accelerator
    .trim()
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === 'mod') {
        return platform === 'macos' ? 'meta' : 'ctrl';
      }
      return MODIFIER_ALIASES[part] ?? part;
    });

  const modifiers = parts.filter((part) => MODIFIER_ORDER.includes(part)).sort((left, right) => MODIFIER_ORDER.indexOf(left) - MODIFIER_ORDER.indexOf(right));
  const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part));
  return [...new Set(modifiers), ...keys].join('+');
}

function scopeRank(scope: KeymapScope): number {
  switch (scope) {
    case 'modal':
      return 0;
    case 'tab':
      return 1;
    case 'pane':
      return 2;
    case 'window':
      return 3;
    case 'workspace':
      return 4;
    case 'global':
      return 5;
  }
}

export function resolvePlatformKeyAction(key: string, model: KeymapModel, options: { scope?: KeymapScope; platform?: KeymapPlatform } = {}): KeyCommand | null {
  const platform = options.platform ?? model.platform;
  const normalized = normalizeAccelerator(key, platform);
  const requestedScope = options.scope;
  const candidates = model.bindings
    .filter((binding) => !binding.disabled)
    .filter((binding) => binding.platform === undefined || binding.platform === 'any' || binding.platform === platform)
    .filter((binding) => normalizeAccelerator(binding.accelerator, platform) === normalized)
    .filter((binding) => requestedScope === undefined || binding.scope === undefined || binding.scope === requestedScope || binding.scope === 'global')
    .sort((left, right) => scopeRank(left.scope ?? 'global') - scopeRank(right.scope ?? 'global'));

  const binding = candidates[0];
  if (!binding) return null;
  return model.commands.find((command) => command.id === binding.commandId) ?? { id: binding.commandId, scope: binding.scope ?? 'global' };
}

export function findKeymapConflicts(model: KeymapModel, options: { platform?: KeymapPlatform } = {}): KeymapConflict[] {
  const platform = options.platform ?? model.platform;
  const buckets = new Map<string, Set<string>>();

  for (const binding of model.bindings) {
    if (binding.disabled) continue;
    if (binding.platform !== undefined && binding.platform !== 'any' && binding.platform !== platform) continue;
    const scope = binding.scope ?? 'global';
    const accelerator = normalizeAccelerator(binding.accelerator, platform);
    const key = `${scope}:${accelerator}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new Set<string>();
      buckets.set(key, bucket);
    }
    bucket.add(binding.commandId);
  }

  return [...buckets.entries()]
    .filter(([, commandIds]) => commandIds.size > 1)
    .map(([key, commandIds]) => {
      const separator = key.indexOf(':');
      return {
        scope: key.slice(0, separator) as KeymapScope,
        accelerator: key.slice(separator + 1),
        commandIds: [...commandIds],
      };
    });
}
