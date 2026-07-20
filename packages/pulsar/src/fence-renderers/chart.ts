/** Render validated JSON chart fences through the public Stellar package. */

import { chart } from '@celestial/stellar';
import type { FenceRenderContext } from '../types.js';
import { wrapFenceBlock } from './layout.js';

type CodeBlockToken = Extract<import('../types.js').Token, { type: 'code-block' }>;
const MAX_CHART_POINTS = 100_000;
const MAX_CHART_DIMENSION = 10_000;

function finiteNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= MAX_CHART_POINTS && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function chartWidth(spec: Record<string, unknown>, available: number): number {
  const maxWidth = Number.isFinite(available) ? Math.max(1, Math.min(MAX_CHART_DIMENSION, Math.floor(available))) : 80;
  const requested = typeof spec.width === 'number' && Number.isFinite(spec.width) ? Math.floor(spec.width) : maxWidth;
  return Math.max(1, Math.min(maxWidth, requested));
}

export function chartFenceRenderer(token: CodeBlockToken, ctx: FenceRenderContext): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(token.content);
  } catch {
    return renderError(ctx, 'Invalid chart JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return renderError(ctx, 'Chart spec must be an object');
  const spec = parsed as Record<string, unknown>;
  const type = spec.type;
  const width = chartWidth(spec, ctx.width);
  const height = typeof spec.height === 'number' && Number.isFinite(spec.height) ? Math.max(2, Math.min(MAX_CHART_DIMENSION, Math.floor(spec.height))) : undefined;

  try {
    if (type === 'line' && finiteNumbers(spec.data)) return chart.line({ data: spec.data, width, height }).toString();
    if (type === 'bar' && Array.isArray(spec.data) && spec.data.length <= MAX_CHART_POINTS) {
      const valid = spec.data.every(
        (item) =>
          (typeof item === 'number' && Number.isFinite(item)) ||
          (!!item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).label === 'string' &&
            ((item as Record<string, unknown>).label as string).length <= 10_000 &&
            typeof (item as Record<string, unknown>).value === 'number' &&
            Number.isFinite((item as Record<string, unknown>).value)),
      );
      if (valid) return chart.bar({ data: spec.data as number[] | { label: string; value: number }[], width, height }).toString();
    }
    if (type === 'scatter' && Array.isArray(spec.data) && spec.data.length <= MAX_CHART_POINTS) {
      const valid = spec.data.every(
        (point) => Array.isArray(point) && point.length === 2 && point.every((value) => typeof value === 'number' && Number.isFinite(value)),
      );
      if (valid) return chart.scatter({ data: spec.data as [number, number][], width, height }).toString();
    }
    if ((type === 'stacked-bar' || type === 'stackedBar') && Array.isArray(spec.series) && spec.series.length <= MAX_CHART_POINTS) {
      let pointCount = 0;
      const valid = spec.series.every(
        (series) => {
          if (!series || typeof series !== 'object') return false;
          const record = series as Record<string, unknown>;
          const label = record.label;
          if (label !== undefined && (typeof label !== 'string' || label.length > 10_000)) return false;
          if (!finiteNumbers(record.data)) return false;
          pointCount += record.data.length;
          return pointCount <= MAX_CHART_POINTS;
        },
      );
      if (valid) {
        return chart.stackedBar({ series: spec.series as { label?: string; data: number[] }[], width, height }).toString();
      }
    }
  } catch {
    return renderError(ctx, 'Chart render error');
  }

  return renderError(ctx, 'Unsupported or invalid chart spec');
}

(chartFenceRenderer as unknown as Record<string, unknown>).mode = 'block-only';

function renderError(ctx: FenceRenderContext, message: string): string {
  const border = ctx.theme.admonitionBorder('warning');
  const title = ctx.theme.admonitionTitle('warning', 'Chart');
  return wrapFenceBlock(`${border} ${title}\n${border}  ${message}\n${border}  (falling back to source)`, ctx.width, '').join('\n');
}
