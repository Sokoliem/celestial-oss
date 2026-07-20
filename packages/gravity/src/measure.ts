import { measure as nebulaMeasure } from '@celestial/nebula';
import type { MeasurementContext, MeasurementSpace, VNode } from './types.js';

const DEFAULT_SPACE: MeasurementSpace = { cols: 80, rows: 24 };

function normalizeSpace(space: Partial<MeasurementSpace> | undefined, fallback: MeasurementSpace): MeasurementSpace {
  const normalize = (value: number | undefined, fallbackValue: number): number => {
    const resolved = value === undefined || !Number.isFinite(value) ? fallbackValue : value;
    return Math.max(0, Math.floor(resolved));
  };
  return {
    cols: normalize(space?.cols, fallback.cols),
    rows: normalize(space?.rows, fallback.rows),
  };
}

export function createMeasurementContext(partial?: Partial<MeasurementContext>): MeasurementContext {
  const terminal = normalizeSpace(partial?.terminal, DEFAULT_SPACE);
  const available = normalizeSpace(partial?.available, terminal);
  const container = normalizeSpace(partial?.container, available);

  return {
    terminal,
    available,
    container,
  };
}

export function resolveMeasurementSpace(context?: Partial<MeasurementContext>): MeasurementContext {
  return createMeasurementContext(context);
}

function measureWithNebula(node: VNode, context: MeasurementContext): { width: number; height: number } {
  if (node.kind === 'empty' && node.width === undefined && node.height === undefined) {
    return { width: 0, height: 0 };
  }

  return nebulaMeasure(node, context.container.cols, context);
}

export function measureNodeWithContext(node: VNode, context?: Partial<MeasurementContext>): { width: number; height: number } {
  return measureWithNebula(node, resolveMeasurementSpace(context));
}

export function measureNode(node: VNode, context?: Partial<MeasurementContext>): { width: number; height: number } {
  return measureNodeWithContext(node, context);
}
