import '@celestial/nebula';

declare module '@celestial/nebula' {
  export interface LayoutSpace {
    readonly cols: number;
    readonly rows: number;
  }

  export interface ComponentRenderContext {
    readonly terminal: LayoutSpace;
    readonly available: LayoutSpace;
    readonly container: LayoutSpace;
  }

  export interface ComponentNode {
    readonly render: (context?: ComponentRenderContext) => VNode;
  }

  export interface BoxNode {
    readonly overflow?: 'visible' | 'hidden' | 'scroll';
    readonly scrollOffset?: number;
  }

  export interface LayoutEntry {
    readonly available?: LayoutSpace;
    readonly fingerprint?: string;
    readonly reused?: boolean;
  }

  export interface LayoutTraceEntry {
    readonly phase: 'plan' | 'reuse';
    readonly nodeKind: VNode['kind'];
    readonly id: string;
    readonly layoutId?: string;
    readonly rect: LayoutRect;
    readonly available: LayoutSpace;
    readonly details?: Record<string, number | string | boolean | null | readonly string[]>;
  }

  export interface LayoutPlanStats {
    readonly plannedEntries: number;
    readonly reusedEntries: number;
  }

  export interface LayoutPlan {
    readonly trace?: readonly LayoutTraceEntry[];
    readonly stats?: LayoutPlanStats;
  }

  export function measure(node: VNode, containerWidth?: number, context?: Partial<ComponentRenderContext>): { width: number; height: number };

  export function planLayout(
    node: VNode,
    width: number,
    height: number,
    options?: {
      previousPlan?: LayoutPlan;
      trace?: boolean;
    },
  ): LayoutPlan;
}
