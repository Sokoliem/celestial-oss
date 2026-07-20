import type { SpringConfig } from '@celestial/aurora';
import { flex, flexItem } from './flex.js';
import type { ComponentNode, MeasurementSpace, VNode } from './types.js';

/**
 * Shared spring configuration for gravity layout animations
 * (carousel slides, collapsible expand/collapse). Extracted per the
 * design-system review (finding C1) so the spring tuning lives in one place.
 */
export const DEFAULT_SPRING_CONFIG: SpringConfig<number> = {
  stiffness: 220,
  damping: 26,
  precision: 0.001,
};

function component(render: () => VNode): ComponentNode {
  return { kind: 'component', render };
}

export function spacer(width: number = 0, height: number = 0): VNode {
  return { kind: 'empty', width, height };
}

export function inset(child: VNode, padding: number | [number, number] | [number, number, number, number]): VNode {
  return {
    kind: 'box',
    style: { padding },
    children: [child],
  };
}

export function inline(children: readonly VNode[], gap: number = 0): ComponentNode {
  return component(() => ({ kind: 'row', gap, children: [...children] }));
}

export function stack(children: readonly VNode[], gap: number = 0): ComponentNode {
  return component(() => ({ kind: 'column', gap, children: [...children] }));
}

export function fill(child: VNode, size: Partial<MeasurementSpace>): VNode {
  return {
    kind: 'box',
    width: size.cols,
    height: size.rows,
    children: [child],
  };
}

export function center(child: VNode | ComponentNode, opts?: { width?: number; height?: number }): ComponentNode {
  const inner: VNode = opts?.width != null || opts?.height != null ? { kind: 'box', width: opts.width, height: opts.height, children: [child] } : child;

  const growSpacer = (): VNode => ({ kind: 'empty', width: 0, height: 0 });

  const row = flex({
    direction: 'row',
    children: [
      flexItem(growSpacer(), { grow: 1, shrink: 0, basis: 0 }),
      flexItem(inner, { grow: 0, shrink: 0, basis: 'auto' }),
      flexItem(growSpacer(), { grow: 1, shrink: 0, basis: 0 }),
    ],
  });

  return flex({
    direction: 'column',
    children: [
      flexItem(growSpacer(), { grow: 1, shrink: 0, basis: 0 }),
      flexItem({ kind: 'component', render: row.render }, { grow: 0, shrink: 0, basis: 'auto' }),
      flexItem(growSpacer(), { grow: 1, shrink: 0, basis: 0 }),
    ],
  });
}
