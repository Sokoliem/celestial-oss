import type { ComponentNode, LayoutPlan, LayoutPlanStats, LayoutRect, LayoutTraceEntry, VNode } from '@celestial/nebula';

// Re-export for convenience within gravity
export type { ComponentNode, VNode };

export interface FlexItemOptions {
  grow?: number; // default 0
  shrink?: number; // default 1
  basis?: number | 'auto'; // default 'auto'
  minSize?: number;
  maxSize?: number;
  minMainSize?: number;
  maxMainSize?: number;
  minCrossSize?: number;
  maxCrossSize?: number;
  alignSelf?: AlignItems;
  margin?: Margin;
  order?: number;
  hide?: boolean | AnyWhenCondition;
}

export interface Gap {
  row?: number;
  col?: number;
}

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';
export type AlignContent = 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'stretch';
export type JustifyContent = 'start' | 'center' | 'end' | 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
export type AlignItems = 'start' | 'center' | 'end' | 'flex-start' | 'flex-end' | 'stretch' | 'baseline';

export type Margin = number | Partial<SafeAreaInsets>;

export interface FlexProps {
  direction: FlexDirection | WhenConditional<FlexDirection>;
  gap?: number | Gap;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  /** Enable wrapping. Default: 'nowrap'. */
  wrap?: FlexWrap;
  /** Align wrapped lines along the cross axis (only applies when wrap is enabled). */
  alignContent?: AlignContent;
  overflow?: 'visible' | 'hidden' | 'scroll';
  scrollOffset?: number;
  children: FlexChild[];
}

export interface FlexChild {
  node: VNode;
  options: FlexItemOptions;
}

export interface GridItemOptions {
  col?: number;
  row?: number | GridPlacement;
  colSpan?: number; // default 1
  rowSpan?: number;
  area?: string;
  column?: GridPlacement;
}

export type GridAutoFlow = 'row' | 'column' | 'dense' | 'row-dense' | 'column-dense';

export interface GridProps {
  cols?: number;
  columns?: string | number;
  rows?: string | number;
  autoRows?: string | number;
  autoColumns?: string | number;
  gap?: number | Gap | [number, number]; // [rowGap, colGap]
  areas?: string[] | string[][];
  /** Auto-placement flow direction for items without explicit positions. Default: 'row'. */
  autoFlow?: GridAutoFlow;
  overflow?: 'visible' | 'hidden' | 'scroll';
  scrollOffset?: number;
  children: GridChild[];
}

export interface GridChild {
  node: VNode;
  options: GridItemOptions;
}

export interface BreakpointDef {
  min?: number;
  max?: number;
}

export type BreakpointMap = Record<string, number>;
export type CanonicalBreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LegacyBreakpointName = 'compact' | 'narrow' | 'standard' | 'wide';
export type BreakpointName = CanonicalBreakpointName | LegacyBreakpointName | string;

/**
 * Author-supplied input for a named breakpoint scale. Each tier maps to its
 * minimum column count (inclusive). The lowest tier is the implicit fallback
 * (typically `0`).
 */
export type NamedScaleInput = Readonly<Record<string, number>>;

/**
 * Resolved tier metadata for a registered named scale, sorted ascending by
 * `min`.
 */
export interface NamedScaleTier {
  readonly name: string;
  readonly min: number;
}

export interface NamedScaleDef {
  readonly scale: string;
  readonly tiers: readonly NamedScaleTier[];
}

export type NamedBreakpointScale = NamedScaleDef;

export type NamedScaleComparator = `>= ${string}` | `> ${string}` | `<= ${string}` | `< ${string}` | `== ${string}` | `!= ${string}` | string;

export interface BreakpointThresholds {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface MeasurementSpace {
  cols: number;
  rows: number;
}

export interface MeasurementContext {
  terminal: MeasurementSpace;
  available: MeasurementSpace;
  container: MeasurementSpace;
}

export type ResponsiveOrientation = 'portrait' | 'landscape' | 'square';
export type ResponsiveDensity = 'compact' | 'comfortable' | 'spacious';
export type PointerCapability = 'none' | 'coarse' | 'fine';
export type KeyboardCapability = 'none' | 'text' | 'full';
export type PortalTier = 'terminal' | 'browser' | 'hybrid';

export interface ResponsiveEnvironment {
  terminal: MeasurementSpace;
  available: MeasurementSpace;
  container: MeasurementSpace;
  safeArea: SafeAreaInsets;
  workArea: SafeAreaInsets;
  orientation: ResponsiveOrientation;
  density: ResponsiveDensity;
  pointer: PointerCapability;
  keyboard: KeyboardCapability;
  portalTier?: PortalTier;
}

export interface PredicateCondition {
  _tag: 'when-predicate';
  test: (width: number) => boolean;
}

export interface ResponsiveEnvironmentCondition {
  _tag: 'when-env';
  test: (environment: ResponsiveEnvironment) => boolean;
}

export interface WhenCondition {
  _tag: 'when';
  min?: number;
  max?: number;
}

export interface AxisCondition {
  _tag: 'when-axis';
  /** Media-contract name (e.g. 'pane'). */
  axis: string;
  /** Comparator string, e.g. '>= comfortable' or '< compact'. */
  comparator: string;
}

export type AnyWhenCondition = WhenCondition | PredicateCondition | AxisCondition | ResponsiveEnvironmentCondition;

export interface WhenConditional<T> {
  _tag: 'when-conditional';
  condition: AnyWhenCondition;
  ifTrue: T;
  ifFalse: T;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

export type SafeAreaEdge = 'top' | 'bottom' | 'left' | 'right';

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface SafeAreaReservation {
  /** Edge of the layout this reservation pins against. */
  readonly edge: SafeAreaEdge;
  /** Cell count to reserve. Sums across reservations on the same edge. */
  readonly size: number;
  /** Stable identifier so repeated calls from the same source dedupe. */
  readonly source: string;
  /** Optional scope name; defaults to `"global"`. */
  readonly zone?: string;
}

export interface WorkAreaReservation {
  /** Edge of the layout this reservation pins against. */
  readonly edge: SafeAreaEdge;
  /** Cell count to reserve. Sums across reservations on the same edge. */
  readonly size: number;
  /** Stable identifier so repeated calls from the same source dedupe. */
  readonly source: string;
  /** Optional scope name; defaults to `"global"`. */
  readonly zone?: string;
}

export interface WorkAreaScope {
  readonly zone: string;
  readonly insets: SafeAreaInsets;
  readonly reservations: readonly WorkAreaReservation[];
}

export interface SafeAreaScope {
  readonly zone: string;
  readonly insets: SafeAreaInsets;
  readonly reservations: readonly SafeAreaReservation[];
}

export interface AbsolutePositionOptions {
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  transparent?: boolean;
}

export interface ContainerQueryRule {
  when: AnyWhenCondition;
  node: VNode;
}

export type GridLineRef = number | string;
export type GridPlacement = GridLineRef | [GridLineRef, GridLineRef];

export interface SerializedLayoutEntry {
  id: string;
  kind: VNode['kind'];
  rect: LayoutRect;
  available?: MeasurementSpace;
  reused?: boolean;
  layoutId?: string;
  children: SerializedLayoutEntry[];
}

export interface SerializedOverlayEntry {
  zIndex: number;
  transparent: boolean;
  entry: SerializedLayoutEntry;
}

export interface TraceLayoutOptions {
  width?: number;
  height?: number;
  previousPlan?: LayoutPlan;
}

export interface LayoutTraceResult {
  size: TerminalSize;
  root: SerializedLayoutEntry;
  overlays: SerializedOverlayEntry[];
  trace: readonly LayoutTraceEntry[];
  stats?: LayoutPlanStats;
}
