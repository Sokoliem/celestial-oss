import { grid, gridItem } from './grid.js';
import type { ComponentNode, Gap, GridProps, VNode } from './types.js';

export interface ParsedTemplate {
  /** Each entry is the row token list (e.g. `['rail', 'header', 'header']`). */
  readonly rows: readonly (readonly string[])[];
  /** Optional explicit row size declarations (one per row, e.g. `'auto'`, `'1fr'`). */
  readonly rowSizes: readonly (string | undefined)[];
  /** Optional column template declared after the trailing `/`. */
  readonly columns?: string;
  /** Number of columns inferred from the widest row. */
  readonly cols: number;
}

/**
 * Parse the `template` DSL used by {@link templateShell} into a structured
 * representation. The DSL mirrors CSS `grid-template`:
 *
 *   `"rail header header" auto`
 *   `"rail chat   side  " 1fr`
 *   `"rail footer side  " auto`
 *   `/ auto 1fr 30`
 *
 * Each non-empty line is one row. Each row is a quoted string of tokens, with
 * an optional row-size suffix. A line beginning with `/` declares the column
 * template. Ragged rows (mismatched column counts) throw.
 */
export function parseTemplate(template: string): ParsedTemplate {
  const lines = template
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error('templateShell: template must declare at least one row.');
  }

  const rows: string[][] = [];
  const rowSizes: (string | undefined)[] = [];
  let columns: string | undefined;

  for (const line of lines) {
    if (line.startsWith('/')) {
      columns = line.slice(1).trim();
      if (!columns) {
        throw new Error('templateShell: trailing `/` declared but no column template found.');
      }
      continue;
    }

    const match = line.match(/^"([^"]*)"\s*(.*)$/);
    if (!match) {
      throw new Error(`templateShell: row '${line}' must be a quoted token string, optionally followed by a row size.`);
    }

    const tokens = match[1]!.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new Error(`templateShell: row '${line}' has no tokens.`);
    }

    rows.push(tokens);
    const trailing = match[2]?.trim();
    rowSizes.push(trailing && trailing.length > 0 ? trailing : undefined);
  }

  const cols = rows[0]!.length;
  for (const row of rows) {
    if (row.length !== cols) {
      throw new Error(`templateShell: ragged template — expected ${cols} columns per row but found ${row.length}.`);
    }
  }

  return { rows, rowSizes, columns, cols };
}

export type UnknownRegionMode = 'warn' | 'ignore' | 'throw';

export interface TemplateShellProps {
  /** The template DSL string. See {@link parseTemplate}. */
  template: string;
  /** Map from area name to a VNode rendered into that area. */
  regions: Readonly<Record<string, VNode>>;
  /**
   * Override the column template. Falls back to the trailing `/` clause in
   * `template`, then to an even-fr distribution.
   */
  columns?: string | number;
  /**
   * Override the row template. Falls back to the per-row size suffixes in
   * `template`, then to even-fr.
   */
  rows?: string | number;
  gap?: number | Gap | [number, number];
  overflow?: GridProps['overflow'];
  scrollOffset?: number;
  /**
   * What to do when `regions` contains a name that does not appear in the
   * template. Default: `'warn'` (forwarded to {@link onUnknownRegion}).
   */
  onUnknownRegion?: (area: string) => void;
  /** How to react when a row token has no matching region. Default: `'ignore'`. */
  unknownAreaMode?: UnknownRegionMode;
}

function buildRowTemplate(parsed: ParsedTemplate): string | undefined {
  const sizes = parsed.rowSizes;
  if (sizes.every((size) => size === undefined)) return undefined;
  return sizes.map((size) => size ?? '1fr').join(' ');
}

export function templateShell(props: TemplateShellProps): ComponentNode {
  const parsed = parseTemplate(props.template);
  const declaredAreas = new Set<string>();
  for (const row of parsed.rows) {
    for (const token of row) {
      if (token !== '.') declaredAreas.add(token);
    }
  }

  for (const region of Object.keys(props.regions)) {
    if (!declaredAreas.has(region)) {
      if (props.onUnknownRegion) {
        props.onUnknownRegion(region);
      }
    }
  }

  const children = Object.entries(props.regions)
    .filter(([area]) => declaredAreas.has(area))
    .map(([area, node]) => gridItem(node, { area }));

  const rowTemplate = props.rows ?? buildRowTemplate(parsed);
  const columnTemplate = props.columns ?? parsed.columns;

  const gridProps: GridProps = {
    columns: columnTemplate ?? parsed.cols,
    rows: rowTemplate,
    cols: parsed.cols,
    areas: parsed.rows.map((row) => [...row]),
    gap: props.gap,
    overflow: props.overflow,
    scrollOffset: props.scrollOffset,
    children,
  };

  return grid(gridProps);
}
