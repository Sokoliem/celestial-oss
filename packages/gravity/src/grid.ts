import { resolveRuntimeMeasurementContext } from './runtime.js';
import type {
  ComponentNode,
  Gap,
  GridAutoFlow,
  GridChild,
  GridItemOptions,
  GridLineRef,
  GridPlacement,
  GridProps,
  MeasurementContext,
  VNode,
} from './types.js';

export interface GridDiagnosticIssue {
  code: 'overlap' | 'out-of-bounds' | 'invalid-area' | 'unknown-area' | 'area-unused';
  message: string;
}

export interface GridDiagnostics {
  issues: GridDiagnosticIssue[];
}

interface AreaPlacement {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

interface GridTrack {
  min: number;
  weight: number;
  max?: number;
}

interface ParsedTemplate {
  tracks: GridTrack[];
  lineNames: Map<string, number>;
}

interface NormalizedGridItemOptions extends Omit<GridItemOptions, 'row'> {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  /** True when no explicit position was provided — eligible for auto-placement. */
  _autoPlace?: boolean;
}

interface ResolvedGridChild {
  node: VNode;
  options: NormalizedGridItemOptions;
}

interface NormalizedGridProps {
  props: GridProps & { cols: number };
  children: ResolvedGridChild[];
  diagnostics: GridDiagnostics;
  columns: ParsedTemplate;
  rows: ParsedTemplate;
  autoColumns: ParsedTemplate;
  autoRows: ParsedTemplate;
}

/** Create a GridChild with position options */
export function gridItem(node: VNode, options: GridItemOptions): GridChild;
export function gridItem(options: GridItemOptions, node: VNode): GridChild;
export function gridItem(nodeOrOptions: VNode | GridItemOptions, optionsOrNode: GridItemOptions | VNode): GridChild {
  const node = isVNode(nodeOrOptions) ? nodeOrOptions : (optionsOrNode as VNode);
  const options = isVNode(nodeOrOptions) ? (optionsOrNode as GridItemOptions) : nodeOrOptions;
  return { node, options };
}

function isVNode(value: unknown): value is VNode {
  return value !== null && typeof value === 'object' && 'kind' in (value as Record<string, unknown>);
}

function normalizeGap(gap: number | Gap | [number, number] | undefined): [number, number] {
  const normalize = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  if (Array.isArray(gap)) return [normalize(gap[0]), normalize(gap[1])];
  if (typeof gap === 'number' || gap === undefined) return [normalize(gap ?? 0), normalize(gap ?? 0)];
  return [normalize(gap.row ?? gap.col ?? 0), normalize(gap.col ?? gap.row ?? 0)];
}

function normalizeIndex(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value!) : fallback;
}

function normalizeSpan(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value!)) : 1;
}

function tokenizeTemplate(template: string): string[] {
  return template.match(/\[[^\]]+\]|minmax\([^)]*\)|\S+/g) ?? [];
}

function parseTrackSize(token: string): GridTrack {
  const frMatch = token.match(/^([0-9]+(?:\.[0-9]+)?)fr$/);
  if (frMatch) {
    return { min: 0, weight: Number(frMatch[1]) };
  }
  if (token === 'auto') {
    return { min: 1, weight: 0, max: 1 };
  }

  const numeric = Number(token);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return { min: numeric, weight: 0, max: numeric };
  }

  return { min: 1, weight: 0, max: 1 };
}

function parseTrackToken(token: string): GridTrack {
  const minmaxMatch = token.match(/^minmax\((.+),\s*(.+)\)$/);
  if (minmaxMatch) {
    const minTrack = parseTrackSize(minmaxMatch[1]!.trim());
    const maxTrack = parseTrackSize(minmaxMatch[2]!.trim());
    return {
      min: minTrack.min,
      weight: maxTrack.weight,
      max: maxTrack.weight > 0 ? undefined : maxTrack.min,
    };
  }

  return parseTrackSize(token);
}

function parseTemplate(template: string | number | undefined): ParsedTemplate {
  if (typeof template === 'number') {
    const count = Number.isFinite(template) ? Math.max(0, Math.floor(template)) : 0;
    return {
      tracks: Array.from({ length: count }, () => ({ min: 0, weight: 1 })),
      lineNames: new Map<string, number>(),
    };
  }

  if (typeof template !== 'string') {
    return { tracks: [], lineNames: new Map<string, number>() };
  }

  const tracks: GridTrack[] = [];
  const lineNames = new Map<string, number>();

  for (const token of tokenizeTemplate(template.trim())) {
    if (token.startsWith('[') && token.endsWith(']')) {
      const names = token.slice(1, -1).trim().split(/\s+/).filter(Boolean);
      const lineIndex = tracks.length + 1;
      for (const name of names) {
        lineNames.set(name, lineIndex);
      }
      continue;
    }

    tracks.push(parseTrackToken(token));
  }

  return { tracks, lineNames };
}

function parseAutoTrackTemplate(template: string | number | undefined): ParsedTemplate {
  if (typeof template === 'number') {
    const size = Number.isFinite(template) ? Math.max(0, Math.floor(template)) : 0;
    return {
      tracks: [{ min: size, weight: 0, max: size }],
      lineNames: new Map<string, number>(),
    };
  }

  return parseTemplate(template);
}

function parseAreaRows(areas: string[] | string[][] | undefined): string[][] {
  if (!areas) return [];
  if (areas.length === 0) return [];
  if (areas.every((row) => Array.isArray(row))) {
    return areas as string[][];
  }
  return (areas as string[]).map((row) => row.trim().split(/\s+/));
}

function parseAreas(areas: string[] | string[][] | undefined): { placements: Map<string, AreaPlacement>; issues: GridDiagnosticIssue[] } {
  const rows = parseAreaRows(areas);
  const placements = new Map<string, AreaPlacement>();
  const issues: GridDiagnosticIssue[] = [];

  if (rows.length === 0) {
    return { placements, issues };
  }

  const seen = new Map<string, Array<[number, number]>>();
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row]!.length; col++) {
      const token = rows[row]![col]!;
      if (token === '.') continue;
      const points = seen.get(token) ?? [];
      points.push([row, col]);
      seen.set(token, points);
    }
  }

  for (const [name, points] of seen) {
    const rowValues = points.map(([row]) => row);
    const colValues = points.map(([, col]) => col);
    const minRow = Math.min(...rowValues);
    const maxRow = Math.max(...rowValues);
    const minCol = Math.min(...colValues);
    const maxCol = Math.max(...colValues);
    let valid = true;

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (rows[row]?.[col] !== name) {
          valid = false;
        }
      }
    }

    if (!valid) {
      issues.push({
        code: 'invalid-area',
        message: `Area '${name}' must form a rectangle.`,
      });
      continue;
    }

    placements.set(name, {
      col: minCol,
      row: minRow,
      colSpan: maxCol - minCol + 1,
      rowSpan: maxRow - minRow + 1,
    });
  }

  return { placements, issues };
}

function resolveLine(line: GridLineRef, lineNames: Map<string, number>): number | null {
  if (typeof line === 'number') {
    return line;
  }
  return lineNames.get(line) ?? null;
}

function resolvePlacement(placement: GridPlacement, lineNames: Map<string, number>): { start: number; span: number } | null {
  if (Array.isArray(placement)) {
    const start = resolveLine(placement[0], lineNames);
    const end = resolveLine(placement[1], lineNames);
    if (start === null || end === null) return null;
    return { start, span: Math.max(1, end - start) };
  }

  const start = resolveLine(placement, lineNames);
  if (start === null) return null;
  return { start, span: 1 };
}

function normalizeGridItemOptions(
  options: GridItemOptions,
  areaMap: Map<string, AreaPlacement> | undefined,
  columns: ParsedTemplate,
  rows: ParsedTemplate,
): NormalizedGridItemOptions {
  if (options.area && areaMap?.has(options.area)) {
    const resolved = areaMap.get(options.area)!;
    return { ...resolved, area: options.area };
  }

  let col = normalizeIndex(options.col, 0);
  let row = typeof options.row === 'number' ? normalizeIndex(options.row, 0) : 0;
  let colSpan = normalizeSpan(options.colSpan);
  let rowSpan = normalizeSpan(options.rowSpan);

  if (options.column !== undefined) {
    const placement = resolvePlacement(options.column, columns.lineNames);
    if (placement) {
      col = placement.start - 1;
      colSpan = placement.span;
    }
  }

  if (options.row !== undefined && (typeof options.row === 'string' || Array.isArray(options.row))) {
    const placement = resolvePlacement(options.row, rows.lineNames);
    if (placement) {
      row = placement.start - 1;
      rowSpan = placement.span;
    }
  }

  // Mark as auto-placeable when no explicit position was provided
  const hasExplicitPosition = options.area !== undefined || options.column !== undefined || options.col !== undefined || options.row !== undefined;

  return {
    ...options,
    col,
    row,
    colSpan,
    rowSpan,
    _autoPlace: !hasExplicitPosition,
  };
}

/**
 * Auto-place grid items that don't have explicit row/col positions.
 * Row flow fills left-to-right, top-to-bottom. Column flow fills
 * top-to-bottom, left-to-right. Dense variants restart the search at origin
 * for each item so earlier gaps are backfilled without changing child order.
 */
function autoPlaceItems(children: ResolvedGridChild[], cols: number, autoFlow: GridAutoFlow = 'row'): void {
  // Build occupation grid from explicitly positioned items
  const occupied = new Set<string>();
  for (const child of children) {
    if (!child.options._autoPlace) {
      for (let r = child.options.row; r < child.options.row + child.options.rowSpan; r++) {
        for (let c = child.options.col; c < child.options.col + child.options.colSpan; c++) {
          occupied.add(`${r},${c}`);
        }
      }
    }
  }

  // Place unpositioned items
  let cursor = { row: 0, col: 0 };
  const dense = autoFlow === 'dense' || autoFlow === 'row-dense' || autoFlow === 'column-dense';
  const columnFlow = autoFlow === 'column' || autoFlow === 'column-dense';

  function findNextSlot(colSpan: number, rowSpan: number): { row: number; col: number } {
    const maxCol = Math.max(1, cols);
    // Guard: if the item is wider than the grid, place at col 0 on the next row
    if (colSpan > maxCol) {
      const row = cursor.row;
      cursor = { row: row + rowSpan, col: 0 };
      return { row, col: 0 };
    }
    const maxRow = 1000; // Safety limit to prevent infinite loops
    const start = dense ? { row: 0, col: 0 } : cursor;

    if (columnFlow) {
      for (let col = start.col; col <= maxCol - colSpan; col++) {
        const startRow = col === start.col ? start.row : 0;
        for (let row = startRow; row < maxRow; row++) {
          if (slotFits(row, col, colSpan, rowSpan)) return { row, col };
        }
      }
      return { row: 0, col: 0 };
    }

    for (let row = start.row; row < maxRow; row++) {
      const startCol = row === start.row ? start.col : 0;
      for (let col = startCol; col <= maxCol - colSpan; col++) {
        if (slotFits(row, col, colSpan, rowSpan)) return { row, col };
      }
    }
    // Fallback: place at origin if no slot found within limits
    return { row: 0, col: 0 };
  }

  function slotFits(row: number, col: number, colSpan: number, rowSpan: number): boolean {
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        if (occupied.has(`${r},${c}`)) return false;
      }
    }
    return true;
  }

  for (const child of children) {
    // Only auto-place items that had no explicit position
    if (!child.options._autoPlace) continue;

    const { row, col } = findNextSlot(child.options.colSpan, child.options.rowSpan);
    child.options = { ...child.options, row, col };

    // Mark occupied
    for (let r = row; r < row + child.options.rowSpan; r++) {
      for (let c = col; c < col + child.options.colSpan; c++) {
        occupied.add(`${r},${c}`);
      }
    }

    // Advance cursor
    if (columnFlow) {
      cursor = { row: row + child.options.rowSpan, col };
    } else {
      cursor = { row, col: col + child.options.colSpan };
      if (cursor.col >= cols) {
        cursor = { row: cursor.row + 1, col: 0 };
      }
    }
  }
}

function normalizeGridProps(props: GridProps): NormalizedGridProps {
  const columns = parseTemplate(props.columns ?? (props.autoColumns === undefined ? props.cols : undefined));
  const rows = parseTemplate(props.rows);
  const autoColumns = parseAutoTrackTemplate(props.autoColumns);
  const autoRows = parseAutoTrackTemplate(props.autoRows);
  const { placements, issues } = parseAreas(props.areas);
  const areaRows = parseAreaRows(props.areas);

  const children = props.children.map((child) => ({
    node: child.node,
    options: normalizeGridItemOptions(child.options, placements, columns, rows),
  }));

  const referencedAreas = new Set<string>();
  for (const child of children) {
    const area = child.options.area;
    if (!area) continue;
    referencedAreas.add(area);
    if (!placements.has(area)) {
      issues.push({ code: 'unknown-area', message: `Unknown area '${area}'.` });
    }
  }

  for (const declaredArea of placements.keys()) {
    if (!referencedAreas.has(declaredArea)) {
      issues.push({ code: 'area-unused', message: `Area '${declaredArea}' declared in template but not assigned to any child.` });
    }
  }

  const areaColumnCount = areaRows.reduce((max, row) => Math.max(max, row.length), 0);
  const requestedCols = props.cols ?? (columns.tracks.length || areaColumnCount || 1);
  const cols = Number.isFinite(requestedCols) ? Math.max(1, Math.floor(requestedCols)) : 1;

  // Auto-place items that have no explicit position
  if (props.autoFlow || children.some((c) => c.options._autoPlace)) {
    autoPlaceItems(children, cols, props.autoFlow);
  }

  return {
    props: {
      ...props,
      cols,
    },
    children,
    diagnostics: { issues },
    columns,
    rows,
    autoColumns,
    autoRows,
  };
}

function repeatTracks(tracks: GridTrack[], count: number): GridTrack[] {
  if (tracks.length === 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => tracks[index % tracks.length]!);
}

function computeTrackSizes(total: number, tracks: GridTrack[], gap: number): number[] {
  if (tracks.length === 0) return [];

  const available = Math.max(0, total - gap * (tracks.length - 1));
  const sizes = tracks.map((track) => Math.max(0, Math.floor(track.min)));
  let remaining = Math.max(0, available - sizes.reduce((sum, size) => sum + size, 0));

  while (remaining > 0) {
    const growable = tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track, index }) => track.weight > 0 && (track.max === undefined || sizes[index]! < track.max));

    if (growable.length === 0) {
      break;
    }

    const totalWeight = growable.reduce((sum, item) => sum + item.track.weight, 0);
    const allocations = growable.map(({ track, index }) => {
      const ideal = (remaining * track.weight) / totalWeight;
      const capacity = track.max === undefined ? Number.POSITIVE_INFINITY : Math.max(0, track.max - sizes[index]!);
      const base = Math.min(capacity, Math.floor(ideal));
      return { index, capacity, base, fraction: capacity > base ? ideal - Math.floor(ideal) : -1 };
    });
    let distributed = allocations.reduce((sum, allocation) => sum + allocation.base, 0);
    for (const allocation of allocations) {
      sizes[allocation.index] = sizes[allocation.index]! + allocation.base;
    }

    let remainder = remaining - distributed;
    for (const allocation of allocations.sort((left, right) => right.fraction - left.fraction || left.index - right.index)) {
      if (remainder === 0) break;
      if (allocation.fraction < 0 || allocation.base >= allocation.capacity) continue;
      sizes[allocation.index] = sizes[allocation.index]! + 1;
      distributed += 1;
      remainder -= 1;
    }

    if (distributed === 0) break;

    remaining -= distributed;
  }

  return sizes;
}

function spanSize(tracks: number[], start: number, span: number, gap: number): number {
  return tracks.slice(start, start + span).reduce((sum, width) => sum + width, 0) + gap * Math.max(0, span - 1);
}

export function analyzeGrid(props: GridProps): GridDiagnostics {
  const normalized = normalizeGridProps(props);
  const issues = [...normalized.diagnostics.issues];
  const explicitRows = normalized.rows.tracks.length > 0 ? normalized.rows.tracks.length : undefined;
  const cols = normalized.props.cols;
  const occupied = new Map<string, number>();

  for (const [index, child] of normalized.children.entries()) {
    const { col, row, colSpan, rowSpan } = child.options;
    if (col < 0 || row < 0 || colSpan <= 0 || rowSpan <= 0) {
      issues.push({ code: 'out-of-bounds', message: `Child ${index} has invalid origin or span.` });
      continue;
    }
    if (col + colSpan > cols || (explicitRows !== undefined && row + rowSpan > explicitRows)) {
      issues.push({ code: 'out-of-bounds', message: `Child ${index} exceeds configured grid bounds.` });
    }
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        const key = `${r}:${c}`;
        if (occupied.has(key)) {
          issues.push({ code: 'overlap', message: `Child ${index} overlaps cell ${key}.` });
        } else {
          occupied.set(key, index);
        }
      }
    }
  }

  return { issues };
}

function wrapOverflow(node: VNode, props: GridProps, context: MeasurementContext): VNode {
  if (!props.overflow || props.overflow === 'visible') {
    return node;
  }

  return {
    kind: 'box',
    children: [node],
    width: context.container.cols,
    height: context.container.rows,
    overflow: props.overflow,
    scrollOffset: props.scrollOffset,
  };
}

/** Create a grid layout that returns a ComponentNode */
export function grid(props: GridProps): ComponentNode;
export function grid(props: Omit<GridProps, 'children'>, ...children: GridChild[]): ComponentNode;
export function grid(props: GridProps | Omit<GridProps, 'children'>, ...children: GridChild[]): ComponentNode {
  const normalized = normalizeGridProps({
    ...props,
    children: 'children' in props ? props.children : children,
  });

  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const [rowGap, colGap] = normalizeGap(normalized.props.gap);
      const cols = normalized.props.cols;
      const effectiveRows = Math.max(
        normalized.rows.tracks.length,
        normalized.children.reduce((max, child) => Math.max(max, child.options.row + child.options.rowSpan), 0),
      );

      if (normalized.children.length === 0 && effectiveRows === 0) {
        return { kind: 'empty' };
      }

      const autoColumnTracks = repeatTracks(normalized.autoColumns.tracks, cols);
      const autoRowTracks = repeatTracks(normalized.autoRows.tracks, effectiveRows || 1);
      const resolvedColumnTracks =
        normalized.columns.tracks.length > 0
          ? normalized.columns.tracks
          : autoColumnTracks.length > 0
            ? autoColumnTracks
            : Array.from({ length: cols }, () => ({ min: 0, weight: 1 }));
      const resolvedRowTracks =
        normalized.rows.tracks.length > 0
          ? normalized.rows.tracks
          : autoRowTracks.length > 0
            ? autoRowTracks
            : Array.from({ length: effectiveRows || 1 }, () => ({ min: 0, weight: 1 }));

      const columnTracks = computeTrackSizes(measurementContext.container.cols, resolvedColumnTracks, colGap);
      const rowTracks = computeTrackSizes(measurementContext.container.rows, resolvedRowTracks, rowGap);

      const origins = new Map<string, ResolvedGridChild>();
      const covered = new Set<string>();
      for (const child of normalized.children) {
        origins.set(`${child.options.row}:${child.options.col}`, child);
        for (let r = child.options.row; r < child.options.row + child.options.rowSpan; r++) {
          for (let c = child.options.col; c < child.options.col + child.options.colSpan; c++) {
            if (r === child.options.row && c === child.options.col) continue;
            covered.add(`${r}:${c}`);
          }
        }
      }

      const rowNodes: VNode[] = [];
      for (let row = 0; row < rowTracks.length; row++) {
        const cells: VNode[] = [];
        let col = 0;
        while (col < cols) {
          const origin = origins.get(`${row}:${col}`);
          if (origin) {
            cells.push({
              kind: 'box',
              children: [origin.node],
              width: spanSize(columnTracks, col, origin.options.colSpan, colGap),
              height: spanSize(rowTracks, row, origin.options.rowSpan, rowGap),
            });
            col += origin.options.colSpan;
            continue;
          }

          if (covered.has(`${row}:${col}`)) {
            cells.push({
              kind: 'box',
              children: [{ kind: 'empty' }],
              width: columnTracks[col] ?? 0,
              height: rowTracks[row] ?? 0,
            });
            col += 1;
            continue;
          }

          cells.push({
            kind: 'box',
            children: [{ kind: 'empty' }],
            width: columnTracks[col] ?? 0,
            height: rowTracks[row] ?? 0,
          });
          col += 1;
        }

        rowNodes.push({ kind: 'row', gap: colGap, children: cells });
      }

      return wrapOverflow({ kind: 'column', gap: rowGap, children: rowNodes }, normalized.props, measurementContext);
    },
  };
}
