import { type CellGrid, type LayoutPlan, planLayout, rasterize, type VNode } from '@celestial/core/nebula';

const DEFAULT_RENDER_WIDTH = 80;
const DEFAULT_RENDER_HEIGHT = 24;
const MAX_RENDER_DIMENSION = 1_000_000;
const MAX_RENDER_CELLS = 10_000_000;

export interface GridRenderOptions {
  width?: number;
  height?: number;
}

export interface GridRenderResult {
  grid: CellGrid;
  plan: LayoutPlan;
}

function normalizeDimension(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number.`);
  const normalized = Math.floor(value);
  if (normalized > MAX_RENDER_DIMENSION) throw new RangeError(`${label} exceeds the ${MAX_RENDER_DIMENSION}-cell safety limit.`);
  return normalized;
}

export function renderGrid(vnode: VNode, options?: GridRenderOptions): GridRenderResult | null {
  const explicitWidth = options?.width === undefined ? undefined : normalizeDimension(options.width, 'Render width');
  const explicitHeight = options?.height === undefined ? undefined : normalizeDimension(options.height, 'Render height');
  if (explicitWidth === 0 || explicitHeight === 0) return null;

  // A static render still needs a stable terminal context. Measuring first and
  // then feeding the measured content size back into planLayout makes
  // responsive components switch branches between measurement and paint.
  // Use the framework's conventional 80x24 viewport unless the caller gives
  // explicit dimensions; the text conversion trims unused rows and columns.
  const width = explicitWidth ?? DEFAULT_RENDER_WIDTH;
  const height = explicitHeight ?? DEFAULT_RENDER_HEIGHT;
  if (width === 0 || height === 0) return null;
  if (width * height > MAX_RENDER_CELLS) throw new RangeError(`Render surface exceeds the ${MAX_RENDER_CELLS}-cell safety limit.`);

  const plan = planLayout(vnode, width, height);
  return { plan, grid: rasterize(plan) };
}
