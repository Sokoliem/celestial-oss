# @celestial/gravity

Responsive layout engine for the Celestial TUI ecosystem. Gravity provides terminal-aware flexbox sizing, CSS-style grid placement, breakpoint switching, layout atoms, a measurement system, and semantic zoom (level-of-detail) helpers.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Features

- **Flex Layout** - Row/column sizing with grow, shrink, basis, min/max constraints, alignment, justification, margins, and conditional hide
- **Grid Layout** - Explicit placement, row/column spans, named areas, fractional track templates, and dense auto-placement
- **Responsive Breakpoints** - Width-based conditional rendering with named breakpoints, conditionals, and full responsive environment queries
- **Atoms** - Composable layout primitives: `spacer`, `inset`, `inline`, `stack`, `fill`, `center`
- **Measurement** - Node measurement with terminal/available/container space context
- **Desktop Work Areas** - Safe-area and work-area reservations for terminal desktop shells
- **Level of Detail** - Semantic zoom with compact/summary/detail levels driven by width thresholds
- **Terminal Context** - Explicit test/runtime terminal size overrides
- **Breakpoint Internals** - Canonical names, legacy aliases, threshold maps, diagnostic tracing
- **Diagnostics** - Grid validation (overlap, out-of-bounds, invalid areas) and breakpoint tracing

## Flex Layout

```typescript
import { flex, flexItem, when } from '@celestial/gravity';
import { text } from '@celestial/nebula';

const header = flex(
  {
    direction: 'row',
    gap: { col: 1 },
  },
  flexItem({ basis: 16 }, text('Left')),
  flexItem({ grow: 1, basis: 12 }, text('Main')),
  flexItem({ basis: 16 }, text('Right')),
);

const sidebar = flex(
  { direction: 'column', gap: { row: 1 } },
  flexItem(text('Home')),
  flexItem(text('About')),
  flexItem(text('Settings')),
);

const reverseOrder = flex(
  { direction: 'row-reverse', gap: 1 },
  flexItem(text('A')),
  flexItem(text('B')),
);

const conditionalDir = flex(
  { direction: when({ min: 60 }, 'row', 'column') },
  flexItem(text('Adapts')),
);
```

### FlexProps

```typescript
interface FlexProps {
  direction: FlexDirection | WhenConditional<FlexDirection>;
  gap?: number | Gap;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  children: FlexChild[];
}

type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
type JustifyContent = 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
type AlignItems = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

interface Gap {
  row?: number;
  col?: number;
}
```

### FlexItemOptions

```typescript
interface FlexItemOptions {
  grow?: number;
  shrink?: number;
  basis?: number | 'auto';
  minSize?: number;
  maxSize?: number;
  minMainSize?: number;
  maxMainSize?: number;
  minCrossSize?: number;
  maxCrossSize?: number;
  alignSelf?: AlignItems;
  margin?: number | Partial<SafeAreaInsets>;
  hide?: boolean | AnyWhenCondition;
}
```

Defaults: `grow: 0`, `shrink: 1`, `basis: 'auto'`. When `basis` is `'auto'`, the node's natural measured size is used. Surplus space distributes by `grow` (respects `maxSize` / `maxMainSize`). Deficit distributes by `shrink * basis` (respects `minSize` / `minMainSize`). `justifyContent`, `alignItems`, `alignSelf`, and `margin` provide desktop-style alignment without app-local spacer math.

### flexItem()

```typescript
flexItem(node: VNode, options?: Partial<FlexItemOptions>): FlexChild
flexItem(options: Partial<FlexItemOptions>, node: VNode): FlexChild
```

### flex()

```typescript
flex(props: FlexProps): ComponentNode
flex(props: Omit<FlexProps, 'children'>, ...children: FlexChild[]): ComponentNode
```

### FlexChild

```typescript
interface FlexChild {
  node: VNode;
  options: FlexItemOptions;
}
```

## Grid Layout

```typescript
import { grid, gridItem, analyzeGrid } from '@celestial/gravity';
import { text } from '@celestial/nebula';

const dashboard = grid(
  {
    columns: '1fr 2fr 1fr',
    gap: { row: 1, col: 2 },
    areas: [
      'header header header',
      'sidebar main aside',
      'footer footer footer',
    ],
  },
  gridItem({ area: 'header' }, text('Header')),
  gridItem({ area: 'sidebar' }, text('Sidebar')),
  gridItem({ area: 'main' }, text('Main Content')),
  gridItem({ area: 'aside' }, text('Aside')),
  gridItem({ area: 'footer' }, text('Footer')),
);

const manual = grid(
  {
    cols: 3,
    columns: '1fr 1fr 1fr',
    gap: [1, 2],
  },
  gridItem({ col: 0, row: 0, colSpan: 2 }, text('Wide')),
  gridItem({ col: 2, row: 0, rowSpan: 2 }, text('Tall')),
  gridItem({ col: 0, row: 1, column: [1, 3] }, text('Col 1-2')),
);

const diagnostics = analyzeGrid({
  cols: 2,
  rows: 2,
  areas: ['hero side', 'hero side'],
  children: [],
});
```

### GridProps

```typescript
interface GridProps {
  cols?: number;
  columns?: string | number;
  rows?: string | number;
  autoRows?: string | number;
  autoColumns?: string | number;
  gap?: number | Gap | [number, number];
  areas?: string[] | string[][];
  autoFlow?: 'row' | 'column' | 'dense' | 'row-dense' | 'column-dense';
  children: GridChild[];
}
```

`gap` accepts `number` (uniform), `Gap` (row/col object), or `[rowGap, colGap]`. Track templates accept fractional values like `'1fr 2fr'`, `'auto'`, or numeric weights. Dense auto-flow backfills earlier gaps while preserving source child order.

### GridItemOptions

```typescript
interface GridItemOptions {
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  area?: string;
  column?: number | [number, number];
}
```

Defaults: `colSpan: 1`, `rowSpan: 1`. `column` is 1-indexed shorthand: a number sets the start column, `[start, end]` sets both column and span. Areas defined in `GridProps.areas` resolve to `col`, `row`, `colSpan`, `rowSpan` automatically.

### gridItem()

```typescript
gridItem(node: VNode, options: GridItemOptions): GridChild
gridItem(options: Partial<GridItemOptions>, node: VNode): GridChild
```

### grid()

```typescript
grid(props: GridProps): ComponentNode
grid(props: Omit<GridProps, 'children'>, ...children: GridChild[]): ComponentNode
```

### analyzeGrid()

```typescript
function analyzeGrid(props: GridProps): GridDiagnostics
```

Reports `overlap`, `out-of-bounds`, `invalid-area`, and `unknown-area` issues.

### GridDiagnostics

```typescript
interface GridDiagnostics {
  issues: GridDiagnosticIssue[];
}

interface GridDiagnosticIssue {
  code: 'overlap' | 'out-of-bounds' | 'invalid-area' | 'unknown-area';
  message: string;
}
```

## Atoms

Composable layout primitives built on top of flex:

```typescript
import { spacer, inset, inline, stack, fill, center } from '@celestial/gravity';
import { text } from '@celestial/nebula';

spacer(4, 1)
spacer(10)

inset(text('Padded'), 1)
inset(text('Asymmetric'), [1, 2])
inset(text('All sides'), [1, 2, 1, 2])

inline([text('A'), text('B'), text('C')], 1)
inline([text('No gap')])

stack([text('Row 1'), text('Row 2')], 1)

fill(text('Content'), { cols: 40, rows: 10 })
fill(text('Width only'), { cols: 40 })

center(text('Centered'))
center(text('Boxed'), { width: 40, height: 10 })
```

### spacer()

```typescript
function spacer(width?: number, height?: number): VNode
```

Defaults: `width: 0`, `height: 0`. Returns an empty VNode with explicit dimensions.

### inset()

```typescript
function inset(
  child: VNode,
  padding: number | [number, number] | [number, number, number, number],
): VNode
```

Wraps a child in a box with padding. Accepts uniform, `[vertical, horizontal]`, or `[top, right, bottom, left]`.

### inline()

```typescript
function inline(children: readonly VNode[], gap?: number): ComponentNode
```

Arranges children in a horizontal row. Default gap: `0`.

### stack()

```typescript
function stack(children: readonly VNode[], gap?: number): ComponentNode
```

Arranges children in a vertical column. Default gap: `0`.

### fill()

```typescript
function fill(child: VNode, size: Partial<MeasurementSpace>): VNode
```

Wraps a child in a box with explicit width/height.

### center()

```typescript
function center(
  child: VNode | ComponentNode,
  opts?: { width?: number; height?: number },
): ComponentNode
```

Centers content both horizontally and vertically using flex with grow spacers. When `width` or `height` are provided, the child is first constrained to that size.

## Responsive Breakpoints

```typescript
import { responsive, when, breakpoint } from '@celestial/gravity';
import { column, empty, row, text } from '@celestial/nebula';

const layout = responsive(
  { sm: 40, md: 80, lg: 120, xl: 160 },
  (bp) => {
    if (bp === 'sm') return column(text('Compact'));
    if (bp === 'md') return row(text('Standard'));
    return text('Wide');
  },
);

const sidebar = when(
  (width) => width >= 80,
  text('Sidebar'),
  empty(),
);

const nav = breakpoint({
  compact: text('[Menu]'),
  standard: row(text('Home'), text('About')),
  wide: row(text('Home'), text('About'), text('Docs')),
  default: text('Menu'),
});

breakpoint.compact = { min: 0, max: 39 };
breakpoint.wide = { min: 120 };
delete breakpoint.obsolete;
```

### responsive()

```typescript
responsive(layouts: Record<string, VNode>): ComponentNode
responsive(breakpoints: BreakpointMap, render: (name: string) => VNode): ComponentNode
```

The first form matches entries by `BreakpointDef` (most specific wins). Falls back to `layouts.default` or the last entry. The second form picks the highest threshold the current width meets and calls `render(name)`.

Breakpoint definitions, `setTerminalSize()`, and `setBreakpointContext()` are process-global. Use `setBreakpointContext()` when you want responsive resolution to follow a Nebula breakpoint signal instead of the ambient terminal size.

### when()

```typescript
when(condition: BreakpointDef): WhenCondition
when(condition: (width: number) => boolean): PredicateCondition
when<T>(condition: BreakpointDef, ifTrue: T, ifFalse: T): WhenConditional<T>
when<T>(condition: (width: number) => boolean, ifTrue: T, ifFalse: T): WhenConditional<T>
```

With one argument returns a condition descriptor. With three arguments returns a conditional that resolves at render time.

### breakpoint

A Proxy that is both a function and an object:
- **As a function**: `breakpoint(layouts)` resolves to the matching VNode
- **As an object**: read/write/delete named breakpoint definitions (`breakpoint.compact`, `breakpoint.wide = { min: 100 }`, etc.)

### resolveWhen()

```typescript
function resolveWhen(condition: AnyWhenCondition): boolean
```

Resolves a `WhenCondition` or `PredicateCondition` against the current terminal width.

### resolveConditional()

```typescript
function resolveConditional<T>(cond: WhenConditional<T>): T
```

Returns `cond.ifTrue` or `cond.ifFalse` based on the resolved condition.

### setBreakpointContext() / getBreakpointContext()

```typescript
function setBreakpointContext(ctx: BreakpointContext | null): void
function getBreakpointContext(): BreakpointContext | null
```

Integrate with Nebula's `BreakpointContext` signal. When set, breakpoint resolution uses the context's size signal instead of `getTerminalSize()`.

### traceResponsive()

```typescript
function traceResponsive(size: { cols: number; rows: number }, layouts: Record<string, VNode>): ResponsiveTrace
```

Explains which breakpoint matched (or fell back) for a given size.

### normalizeResponsiveBreakpointName()

```typescript
function normalizeResponsiveBreakpointName(name: BreakpointName): CanonicalBreakpointName | null
```

Maps legacy names to canonical names: `compact -> xs`, `narrow -> sm`, `standard -> md`, `wide -> lg`. Returns `null` for unknown names.

### Responsive Environment And Work Areas

```typescript
import {
  reserveSafeArea,
  reserveWorkArea,
  resolveDesktopMeasurementContext,
  resolveResponsiveEnvironment,
  containerQueryEnv,
} from '@celestial/gravity';

reserveSafeArea({ edge: 'top', size: 1, source: 'menu' });
reserveWorkArea({ edge: 'left', size: 24, source: 'navigator' });

const env = resolveResponsiveEnvironment();
const desktopContext = resolveDesktopMeasurementContext();

const adaptive = containerQueryEnv(defaultView, [
  { when: (environment) => environment.orientation === 'landscape', node: wideView },
  { when: { _tag: 'when-env', test: (environment) => environment.pointer === 'fine' }, node: mouseOptimizedView },
]);
```

`resolveResponsiveEnvironment()` returns terminal, available, container, safe-area, work-area, orientation, density, pointer, keyboard, and optional portal-tier fields. `resolveDesktopMeasurementContext()` converts that environment into the measurement context Horizon-style desktop shells should use for windows, splitters, snap zones, and overlays.

## WhenCondition / WhenConditional

```typescript
interface WhenCondition {
  _tag: 'when';
  min?: number;
  max?: number;
}

interface PredicateCondition {
  _tag: 'when-predicate';
  test: (width: number) => boolean;
}

interface ResponsiveEnvironmentCondition {
  _tag: 'when-env';
  test: (environment: ResponsiveEnvironment) => boolean;
}

type AnyWhenCondition = WhenCondition | PredicateCondition | ResponsiveEnvironmentCondition;

interface WhenConditional<T> {
  _tag: 'when-conditional';
  condition: AnyWhenCondition;
  ifTrue: T;
  ifFalse: T;
}
```

## Breakpoint Internals

```typescript
import {
  DEFAULT_BREAKPOINT_THRESHOLDS,
  BREAKPOINT_ALIASES,
  LEGACY_BREAKPOINT_ALIASES,
  getBreakpointDefinition,
  getCanonicalBreakpointMap,
  getBreakpointOrder,
  isCanonicalBreakpointName,
  normalizeBreakpointName,
  resolveBreakpointName,
} from '@celestial/gravity';
```

### DEFAULT_BREAKPOINT_THRESHOLDS

```typescript
const DEFAULT_BREAKPOINT_THRESHOLDS: BreakpointThresholds = {
  sm: 40,
  md: 80,
  lg: 120,
  xl: 160,
};
```

### BREAKPOINT_ALIASES / LEGACY_BREAKPOINT_ALIASES

```typescript
const LEGACY_BREAKPOINT_ALIASES: Readonly<Record<LegacyBreakpointName, CanonicalBreakpointName>> = {
  compact: 'xs',
  narrow: 'sm',
  standard: 'md',
  wide: 'lg',
};

const BREAKPOINT_ALIASES: Readonly<Record<string, CanonicalBreakpointName>>
```

`BREAKPOINT_ALIASES` includes all legacy aliases.

### Breakpoint Types

```typescript
type CanonicalBreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type LegacyBreakpointName = 'compact' | 'narrow' | 'standard' | 'wide';
type BreakpointName = CanonicalBreakpointName | LegacyBreakpointName | string;

interface BreakpointThresholds {
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

interface BreakpointDef {
  min?: number;
  max?: number;
}

type BreakpointMap = Record<string, number>;
```

### getBreakpointDefinition()

```typescript
function getBreakpointDefinition(
  name: BreakpointName,
  thresholds?: BreakpointThresholds,
): BreakpointDef | null
```

Returns the `BreakpointDef` for a canonical or aliased name. `xs` is `{ max: sm - 1 }`, `xl` is `{ min: xl }`, intermediate names are `{ min, max }` ranges.

### getCanonicalBreakpointMap()

```typescript
function getCanonicalBreakpointMap(
  thresholds?: BreakpointThresholds,
): Record<CanonicalBreakpointName, BreakpointDef>
```

Returns all five canonical breakpoint definitions.

### resolveBreakpointName()

```typescript
function resolveBreakpointName(
  cols: number,
  thresholds?: BreakpointThresholds,
): CanonicalBreakpointName
```

Maps a column count to the narrowest canonical name whose threshold is met.

### getBreakpointOrder()

```typescript
function getBreakpointOrder(): readonly CanonicalBreakpointName[]
```

Returns `['xs', 'sm', 'md', 'lg', 'xl']`.

### isCanonicalBreakpointName()

```typescript
function isCanonicalBreakpointName(name: string): name is CanonicalBreakpointName
```

### normalizeBreakpointName()

```typescript
function normalizeBreakpointName(name: BreakpointName): CanonicalBreakpointName | null
```

## Terminal Context

```typescript
import { setTerminalSize, getTerminalSize } from '@celestial/gravity';

setTerminalSize(120, 40);
setTerminalSize({ cols: 120, rows: 40 });
setTerminalSize(null);

const { cols, rows } = getTerminalSize();
```

### setTerminalSize()

```typescript
setTerminalSize(size: TerminalSize | null): void
setTerminalSize(cols: number, rows: number): void
```

Overrides the terminal size used by all layout calculations. Pass `null` to reset to `process.stdout` defaults (80x24).

### getTerminalSize()

```typescript
function getTerminalSize(): TerminalSize
```

Returns the current terminal size (override or `process.stdout`).

### TerminalSize

```typescript
interface TerminalSize {
  cols: number;
  rows: number;
}
```

## Measurement

```typescript
import {
  createMeasurementContext,
  resolveMeasurementSpace,
  measureNode,
  measureNodeWithContext,
} from '@celestial/gravity';
```

### createMeasurementContext()

```typescript
function createMeasurementContext(partial?: Partial<MeasurementContext>): MeasurementContext
```

Creates a measurement context with cascading defaults: `container` defaults to `available`, `available` defaults to `terminal`, `terminal` defaults to `{ cols: 80, rows: 24 }`.

### resolveMeasurementSpace()

```typescript
function resolveMeasurementSpace(context?: Partial<MeasurementContext>): MeasurementContext
```

Alias for `createMeasurementContext()`.

### measureNode() / measureNodeWithContext()

```typescript
function measureNode(node: VNode, context?: Partial<MeasurementContext>): { width: number; height: number }
function measureNodeWithContext(node: VNode, context?: Partial<MeasurementContext>): { width: number; height: number }
```

Measure a VNode's natural size using Nebula's measure function. Both are equivalent.

### MeasurementContext

```typescript
interface MeasurementContext {
  terminal: MeasurementSpace;
  available: MeasurementSpace;
  container: MeasurementSpace;
}

interface MeasurementSpace {
  cols: number;
  rows: number;
}
```

## Level of Detail (LOD)

Semantic zoom adapts the *content* shown rather than just dimensions. LOD nodes resolve to different views at different abstraction levels.

```typescript
import { lod, zoom, autoZoom, zoomGrid } from '@celestial/gravity';
import { text, column } from '@celestial/nebula';

const card = lod({
  data: { label: 'CPU' },
  levels: [
    { minWidth: 0, render: ({ label }) => text(label) },
    { minWidth: 20, render: ({ label }) => text(`${label}: 45%`) },
    { minWidth: 40, render: ({ label }) => text(`${label}: ██████░░ 45%`) },
  ],
});

const classic = lod('card', {
  compact: () => text('CPU'),
  summary: () => text('CPU: 45%'),
  detail: () => text('CPU: ██████░░ 45%'),
});

const atDetail = card.at(2);
const atWidth = card.atWidth(60);

const scaled = zoom({ content: card, scale: 0.5 });
const fitted = autoZoom({ content: card, targetWidth: 80, targetHeight: 24 });
const gallery = zoomGrid(1, [card, card, card], 2);
```

### lod()

```typescript
lod<T>(config: LodConfig<T>): WidthAwareLodNode
lod(id: string, levels: LodLevels): LodNode
```

The config form creates a data-driven LOD node with `minWidth` rules. The classic form uses three named levels: `compact`, `summary`, `detail`.

### LodNode

```typescript
interface LodNode {
  readonly kind: 'lod';
  readonly id: string;
  readonly levels: LodLevels;
  at(level: number): VNode;
}

interface WidthAwareLodNode extends LodNode {
  atWidth(width: number): VNode;
}
```

Config-based nodes return a `WidthAwareLodNode`, which also exposes `atWidth(width: number): VNode`. Level is clamped and rounded: <=0 is compact (0), >=2 is detail (2), 1 is summary.

### LodConfig / LodRule / LodLevels

```typescript
interface LodConfig<T = unknown> {
  data: T;
  levels: LodRule<T>[];
  id?: string;
}

interface LodRule<T = unknown> {
  minWidth: number;
  render: (data: T) => VNode;
}

interface LodLevels {
  compact: () => VNode;
  summary: () => VNode;
  detail: () => VNode;
}
```

### zoom()

```typescript
zoom(level: number, nodes: LodNode[]): VNode
zoom(config: ZoomConfig): VNode
```

`zoom(level, nodes)` resolves all nodes at a level and stacks them vertically. `zoom({ content, scale })` returns the resolved node directly when `content` is a single node, or a vertical stack when `content` is an array. Scale thresholds: >=0.75 is detail, >=0.25 is summary, otherwise compact.

### ZoomConfig

```typescript
interface ZoomConfig {
  content: LodNode | LodNode[];
  scale: number;
}
```

### autoZoom()

```typescript
autoZoom(width: number, nodes: LodNode[], thresholds?: { summary: number; detail: number }): VNode
autoZoom(config: AutoZoomConfig): VNode
```

Default thresholds: `summary: 40`, `detail: 80`.

For classic `LodNode`s, `autoZoom()` uses those thresholds to choose compact/summary/detail. For width-aware config nodes in object form, it uses each node's `minWidth` rules directly.

### AutoZoomConfig

```typescript
interface AutoZoomConfig {
  content: LodNode | LodNode[];
  targetWidth: number;
  targetHeight?: number;
}
```

`targetHeight` is currently reserved for future heuristics and does not affect the selected level yet.

### zoomGrid()

```typescript
function zoomGrid(level: number, nodes: LodNode[], cols?: number): VNode
```

Renders LOD nodes in a grid. Default columns per level: compact=4, summary=2, detail=1.

## API Reference

### Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `flex` | `(props, ...children?)` | Create flex container |
| `flexItem` | `(node, opts?)` / `(opts, node)` | Create flex child with sizing options |
| `grid` | `(props, ...children?)` | Create grid container |
| `gridItem` | `(node, opts)` / `(opts, node)` | Create positioned grid child |
| `responsive` | `(layouts)` / `(breakpoints, render)` | Choose layout by terminal width |
| `when` | `(condition)` / `(condition, ifTrue, ifFalse)` | Width-based conditional |
| `breakpoint` | Proxy (call + property access) | Named breakpoint resolution and registry |
| `resolveWhen` | `(condition)` | Resolve condition against current width |
| `resolveConditional` | `(cond)` | Resolve a WhenConditional to its value |
| `setBreakpointContext` | `(ctx)` | Inject Nebula BreakpointContext |
| `getBreakpointContext` | `()` | Get active breakpoint context |
| `traceResponsive` | `(size, layouts)` | Diagnose which breakpoint matched |
| `normalizeResponsiveBreakpointName` | `(name)` | Map name to canonical breakpoint |
| `setTerminalSize` | `(cols, rows)` / `(size)` / `(null)` | Override terminal dimensions |
| `getTerminalSize` | `()` | Get current terminal size |
| `createMeasurementContext` | `(partial?)` | Create cascading measurement context |
| `resolveMeasurementSpace` | `(partial?)` | Alias for createMeasurementContext |
| `measureNode` | `(node, context?)` | Measure VNode natural size |
| `measureNodeWithContext` | `(node, context?)` | Measure VNode with context |
| `spacer` | `(width?, height?)` | Empty VNode with dimensions |
| `inset` | `(child, padding)` | Padded box wrapper |
| `inline` | `(children, gap?)` | Horizontal row of children |
| `stack` | `(children, gap?)` | Vertical column of children |
| `fill` | `(child, size)` | Fixed-size box wrapper |
| `center` | `(child, opts?)` | Center content in both axes |
| `lod` | `(config)` / `(id, levels)` | Create semantic zoom node |
| `zoom` | `(level, nodes)` / `(config)` | Resolve LOD nodes at a level |
| `autoZoom` | `(width, nodes, thresholds?)` / `(config)` | Auto-select LOD by width |
| `zoomGrid` | `(level, nodes, cols?)` | LOD nodes in adaptive grid |
| `analyzeGrid` | `(props)` | Validate grid placement |
| `getBreakpointDefinition` | `(name, thresholds?)` | Get BreakpointDef for a name |
| `getCanonicalBreakpointMap` | `(thresholds?)` | All five canonical definitions |
| `getBreakpointOrder` | `()` | Ordered canonical names |
| `isCanonicalBreakpointName` | `(name)` | Type guard for canonical names |
| `normalizeBreakpointName` | `(name)` | Map to canonical or null |
| `resolveBreakpointName` | `(cols, thresholds?)` | Cols to canonical breakpoint |

### Behavior Notes

- `responsive(layouts)` falls back to `layouts.default` first, then to the last entry if no breakpoint matches.
- Config-style `lod()` nodes are width-aware and expose `atWidth(width)`; classic `lod(id, levels)` nodes only expose `at(level)`.
- `zoom({ content })` returns a single resolved node when `content` is one node, and a `column(...)` when `content` is an array.
- `zoomGrid()` requires `cols` to be a positive integer when you override the default column count.
- `autoZoom({ content })` resolves each config-style node by `minWidth`; classic nodes use the default thresholds in object form.
- `targetHeight` in `autoZoom({ ... })` is accepted for forward compatibility but is not used yet.

### Constants

| Constant | Type | Description |
|----------|------|-------------|
| `DEFAULT_BREAKPOINT_THRESHOLDS` | `BreakpointThresholds` | `{ sm: 40, md: 80, lg: 120, xl: 160 }` |
| `BREAKPOINT_ALIASES` | `Record<string, CanonicalBreakpointName>` | Legacy name mappings |
| `LEGACY_BREAKPOINT_ALIASES` | `Record<LegacyBreakpointName, CanonicalBreakpointName>` | `{ compact, narrow, standard, wide }` |

## Related Packages

- **@celestial/nebula** - Core runtime (Elm Architecture, vdom, signals, elements)
- **@celestial/corona** - Styling, colors, borders, themes
- **@celestial/aurora** - Animation (tweens, springs, easing)
- **@celestial/constellation** - UI components
- **@celestial/horizon** - Splits, tabs, floating windows

## License

MIT
