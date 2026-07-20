import type { ComponentRenderContext } from '@celestial/nebula';
import { getTerminalSize } from './context.js';
import { useSafeAreaInsets } from './safe-area.js';
import type {
  KeyboardCapability,
  MeasurementContext,
  PointerCapability,
  PortalTier,
  ResponsiveDensity,
  ResponsiveEnvironment,
  ResponsiveOrientation,
  SafeAreaInsets,
} from './types.js';
import { useWorkAreaInsets } from './work-area.js';

export interface ResponsiveEnvironmentOptions {
  safeAreaZone?: string;
  workAreaZone?: string;
  pointer?: PointerCapability;
  keyboard?: KeyboardCapability;
  portalTier?: PortalTier;
  density?: ResponsiveDensity;
}

function clampSpace(cols: number, rows: number): { cols: number; rows: number } {
  return { cols: Math.max(0, Math.floor(cols)), rows: Math.max(0, Math.floor(rows)) };
}

function addInsets(left: SafeAreaInsets, right: SafeAreaInsets): SafeAreaInsets {
  return {
    top: left.top + right.top,
    right: left.right + right.right,
    bottom: left.bottom + right.bottom,
    left: left.left + right.left,
  };
}

function subtractInsets(space: { cols: number; rows: number }, insets: SafeAreaInsets): { cols: number; rows: number } {
  return clampSpace(space.cols - insets.left - insets.right, space.rows - insets.top - insets.bottom);
}

function resolveOrientation(cols: number, rows: number): ResponsiveOrientation {
  if (cols === rows) return 'square';
  return cols > rows ? 'landscape' : 'portrait';
}

function resolveDensity(cols: number, override?: ResponsiveDensity): ResponsiveDensity {
  if (override) return override;
  if (cols < 80) return 'compact';
  if (cols < 140) return 'comfortable';
  return 'spacious';
}

export function resolveResponsiveEnvironment(
  renderContext?: Partial<ComponentRenderContext>,
  options: ResponsiveEnvironmentOptions = {},
): ResponsiveEnvironment {
  const terminal = renderContext?.terminal ?? getTerminalSize();
  const available = renderContext?.available ?? terminal;
  const container = renderContext?.container ?? available;
  const safeArea = useSafeAreaInsets(options.safeAreaZone);
  const workArea = useWorkAreaInsets(options.workAreaZone);
  const combinedInsets = addInsets(safeArea, workArea);
  const availableSpace = subtractInsets(available, combinedInsets);
  const containerSpace = subtractInsets(container, combinedInsets);

  return {
    terminal: clampSpace(terminal.cols, terminal.rows),
    available: availableSpace,
    container: containerSpace,
    safeArea,
    workArea,
    orientation: resolveOrientation(containerSpace.cols, containerSpace.rows),
    density: resolveDensity(containerSpace.cols, options.density),
    pointer: options.pointer ?? 'none',
    keyboard: options.keyboard ?? 'full',
    portalTier: options.portalTier,
  };
}

export function responsiveEnvironmentToMeasurementContext(environment: ResponsiveEnvironment): MeasurementContext {
  return {
    terminal: environment.terminal,
    available: environment.available,
    container: environment.container,
  };
}
