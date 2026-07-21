import type { ComponentRenderContext } from '@celestial/nebula';
import { getTerminalSize } from './context.js';
import { type ResponsiveEnvironmentOptions, resolveResponsiveEnvironment, responsiveEnvironmentToMeasurementContext } from './responsive-env.js';
import { useSafeAreaInsets } from './safe-area.js';
import type { MeasurementContext } from './types.js';
import { useWorkAreaInsets } from './work-area.js';

function normalizeDimension(value: number, fallback: number): number {
  const resolved = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.floor(resolved));
}

function normalizeSpace(space: { cols: number; rows: number }, fallback: { cols: number; rows: number }): { cols: number; rows: number } {
  return {
    cols: normalizeDimension(space.cols, fallback.cols),
    rows: normalizeDimension(space.rows, fallback.rows),
  };
}

export function resolveRuntimeMeasurementContext(renderContext?: Partial<ComponentRenderContext>): MeasurementContext {
  const fallbackTerminal = getTerminalSize();
  const terminal = normalizeSpace(renderContext?.terminal ?? fallbackTerminal, fallbackTerminal);
  const available = normalizeSpace(renderContext?.available ?? terminal, terminal);
  const container = normalizeSpace(renderContext?.container ?? available, available);

  return {
    terminal,
    available,
    container,
  };
}

/**
 * Sibling of {@link resolveRuntimeMeasurementContext} that subtracts active
 * safe-area insets from `available` and `container`. Opt-in so existing
 * flex/grid callers don't get silently rebudgeted.
 */
export function resolveRuntimeMeasurementContextWithSafeArea(renderContext?: Partial<ComponentRenderContext>, zone: string = 'global'): MeasurementContext {
  const base = resolveRuntimeMeasurementContext(renderContext);
  const insets = useSafeAreaInsets(zone);
  const horizontal = insets.left + insets.right;
  const vertical = insets.top + insets.bottom;

  if (horizontal === 0 && vertical === 0) {
    return base;
  }

  return {
    terminal: base.terminal,
    available: {
      cols: Math.max(0, base.available.cols - horizontal),
      rows: Math.max(0, base.available.rows - vertical),
    },
    container: {
      cols: Math.max(0, base.container.cols - horizontal),
      rows: Math.max(0, base.container.rows - vertical),
    },
  };
}

export function resolveDesktopMeasurementContext(
  renderContext?: Partial<ComponentRenderContext>,
  options: ResponsiveEnvironmentOptions = {},
): MeasurementContext {
  return responsiveEnvironmentToMeasurementContext(resolveResponsiveEnvironment(renderContext, options));
}

export function resolveRuntimeMeasurementContextWithWorkArea(renderContext?: Partial<ComponentRenderContext>, zone: string = 'global'): MeasurementContext {
  const base = resolveRuntimeMeasurementContext(renderContext);
  const insets = useWorkAreaInsets(zone);
  const horizontal = insets.left + insets.right;
  const vertical = insets.top + insets.bottom;

  if (horizontal === 0 && vertical === 0) {
    return base;
  }

  return {
    terminal: base.terminal,
    available: {
      cols: Math.max(0, base.available.cols - horizontal),
      rows: Math.max(0, base.available.rows - vertical),
    },
    container: {
      cols: Math.max(0, base.container.cols - horizontal),
      rows: Math.max(0, base.container.rows - vertical),
    },
  };
}
