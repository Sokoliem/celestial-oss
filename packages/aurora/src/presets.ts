import type { PhysicalAnimatable, SpringConfig, SpringPreset } from './types.js';

export const springPresets = {
  snappy: { stiffness: 400, damping: 25 } as SpringPreset,
  gentle: { stiffness: 120, damping: 14 } as SpringPreset,
  bouncy: { stiffness: 300, damping: 10 } as SpringPreset,
  stiff: { stiffness: 500, damping: 30 } as SpringPreset,
  slow: { stiffness: 100, damping: 20 } as SpringPreset,
  molasses: { stiffness: 50, damping: 15 } as SpringPreset,
  wobbly: { stiffness: 180, damping: 8 } as SpringPreset,
  rubber: { stiffness: 200, damping: 12 } as SpringPreset,
  noMotion: { stiffness: 1000, damping: 100 } as SpringPreset,
} as const;

export type SpringPresetName = keyof typeof springPresets;

export function springWith<T extends PhysicalAnimatable = number>(
  preset: SpringPresetName,
  overrides: Partial<Omit<SpringConfig<T>, 'stiffness' | 'damping'>> = {},
): SpringConfig<T> {
  const { stiffness, damping, mass, precision } = springPresets[preset];
  const safeOverrides = { ...(overrides as Partial<SpringConfig<T>>) };
  delete safeOverrides.stiffness;
  delete safeOverrides.damping;

  return {
    stiffness,
    damping,
    ...(mass !== undefined && { mass }),
    ...(precision !== undefined && { precision }),
    ...safeOverrides,
  } as SpringConfig<T>;
}

export function createSpringConfig<T extends PhysicalAnimatable = number>(preset: SpringPresetName, overrides: Partial<SpringConfig<T>> = {}): SpringConfig<T> {
  return {
    ...springPresets[preset],
    ...overrides,
  } as SpringConfig<T>;
}
