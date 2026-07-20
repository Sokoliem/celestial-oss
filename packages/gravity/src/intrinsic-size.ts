import { measureNodeWithContext } from './measure.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { MeasurementContext, VNode } from './types.js';

export interface IntrinsicSize {
  width: number;
  height: number;
}

export function measureIntrinsicSize(node: VNode, context?: MeasurementContext): IntrinsicSize {
  return measureNodeWithContext(node, context ?? resolveRuntimeMeasurementContext());
}
