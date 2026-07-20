import type { InterruptibleAnimation, InterruptState } from './interruptible.js';
import { spring } from './spring.js';
import type { Animation, PhysicalAnimatable, SpringConfig } from './types.js';

export type LayoutHandoffPresetName = 'snappyPanel' | 'gentleOverlay' | 'preciseCollapse';

export const layoutHandoffPresets: Readonly<Record<LayoutHandoffPresetName, SpringConfig<number>>> = Object.freeze({
  snappyPanel: { stiffness: 320, damping: 30, precision: 0.005, velocityPrecision: 0.005 },
  gentleOverlay: { stiffness: 170, damping: 28, precision: 0.005, velocityPrecision: 0.005 },
  preciseCollapse: { stiffness: 420, damping: 42, precision: 0.002, velocityPrecision: 0.002 },
});

function resolveHandoffConfig<T extends PhysicalAnimatable>(
  presetOrConfig: LayoutHandoffPresetName | SpringConfig<T> = 'snappyPanel',
  overrides: Partial<SpringConfig<T>> = {},
): SpringConfig<T> {
  const base = typeof presetOrConfig === 'string' ? (layoutHandoffPresets[presetOrConfig] as unknown as SpringConfig<T>) : presetOrConfig;
  return { ...base, ...overrides } as SpringConfig<T>;
}

/**
 * Create an interruptible handoff factory that preserves the sampled value
 * and velocity when retargeting a layout or opacity spring.
 */
export function createSpringHandoff<T extends PhysicalAnimatable>(
  target: T,
  presetOrConfig?: LayoutHandoffPresetName | SpringConfig<T>,
  overrides?: Partial<SpringConfig<T>>,
): (state: InterruptState<T>) => Animation<T> {
  return (state) =>
    spring(target, {
      ...resolveHandoffConfig(presetOrConfig, overrides),
      from: state.value,
      initialVelocity: state.velocity,
    });
}

export function handoffToSpring<T extends PhysicalAnimatable>(
  animation: InterruptibleAnimation<T>,
  target: T,
  presetOrConfig?: LayoutHandoffPresetName | SpringConfig<T>,
  overrides?: Partial<SpringConfig<T>>,
): void {
  animation.handoff(createSpringHandoff(target, presetOrConfig, overrides));
}
