import { type Compositor, createCompositor, type LayoutTransitionConfig } from '@celestial/nebula';

let activeCompositor: Compositor | null = null;
let activeOverrides: Map<string, LayoutTransitionConfig> | null = null;

/**
 * Set the active compositor used by gravity layout-transition primitives.
 * Pass `null` to clear. Hosts typically call this once at app boot with a
 * compositor configured for the host's preferred default transition.
 */
export function setActiveLayoutCompositor(compositor: Compositor | null, overrides?: Map<string, LayoutTransitionConfig> | null): void {
  activeCompositor = compositor;
  activeOverrides = overrides ?? null;
}

export function getActiveLayoutCompositor(): Compositor | null {
  return activeCompositor;
}

export function getActiveLayoutOverrides(): Map<string, LayoutTransitionConfig> | null {
  return activeOverrides;
}

/**
 * Convenience: install a fresh compositor and return it. Stores the same
 * overrides map gravity primitives populate via `registerLayoutTransitions`.
 */
export function installDefaultLayoutCompositor(defaultTransition?: LayoutTransitionConfig): Compositor {
  const overrides = new Map<string, LayoutTransitionConfig>();
  const compositor = createCompositor({
    defaultTransition,
    overrides,
  });
  setActiveLayoutCompositor(compositor, overrides);
  return compositor;
}
