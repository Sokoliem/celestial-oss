/**
 * Semantic Zoom / Level-of-Detail (LOD)
 *
 * Allows defining multiple views of the same content at different abstraction
 * levels. A `lod()` node contains 3 view functions (compact, summary, detail).
 * A `zoom()` wrapper selects which level renders based on a numeric zoom level.
 *
 * This is distinct from responsive layouts (which adapt dimensions) — LOD
 * adapts the *semantic content* shown.
 */

import type { VNode } from '@celestial/nebula';
import { column, row } from '@celestial/nebula';

// ─── Types ──────────────────────────────────────────────────────────────────

/** View functions for each level of detail */
export interface LodLevels {
  /** Level 0: Minimal — just a label or number */
  compact: () => VNode;
  /** Level 1: Summary — sparkline, short list, abbreviated */
  summary: () => VNode;
  /** Level 2: Full — complete interactive view */
  detail: () => VNode;
}

/** Options for lod() */
export interface LodOptions {
  /** Unique ID for this LOD node (used for transitions) */
  id: string;
  /** The three levels of detail */
  levels: LodLevels;
}

/** A LOD node that can render at different abstraction levels */
export interface LodNode {
  readonly kind: 'lod';
  readonly id: string;
  readonly levels: LodLevels;
  /** Resolve this LOD node at a specific zoom level */
  at(level: number): VNode;
}

export interface WidthAwareLodNode extends LodNode {
  /** Resolve this LOD node directly from a target width. */
  atWidth(width: number): VNode;
}

export interface LodRule<T = unknown> {
  minWidth: number;
  render: (data: T) => VNode;
}

export interface LodConfig<T = unknown> {
  data: T;
  levels: LodRule<T>[];
  id?: string;
}

export interface ZoomConfig {
  content: LodNode | LodNode[];
  scale: number;
}

export interface AutoZoomConfig {
  content: LodNode | LodNode[];
  targetWidth: number;
  targetHeight?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Clamp and round a numeric level to 0, 1, or 2.
 * - Values <= 0 clamp to 0 (compact)
 * - Values >= 2 clamp to 2 (detail)
 * - Fractional values round to nearest integer
 */
function resolveLevel(level: number): 0 | 1 | 2 {
  const rounded = Math.round(level);
  if (rounded <= 0) return 0;
  if (rounded >= 2) return 2;
  return 1;
}

// ─── Public API ─────────────────────────────────────────────────────────────

function createLodFromConfig<T>(config: LodConfig<T>): WidthAwareLodNode {
  if (config.levels.length === 0) {
    throw new Error('lod() config requires at least one level.');
  }

  const ordered = [...config.levels].sort((a, b) => a.minWidth - b.minWidth);
  const selectByWidth = (width: number): LodRule<T> => {
    let selected = ordered[0]!;
    for (const candidate of ordered) {
      if (width >= candidate.minWidth) {
        selected = candidate;
      }
    }
    return selected;
  };
  const selectByLevel = (level: number): LodRule<T> => {
    const resolved = resolveLevel(level);
    if (resolved === 0) return ordered[0]!;
    if (resolved === 1) return ordered[Math.min(1, ordered.length - 1)]!;
    return ordered[ordered.length - 1]!;
  };
  return {
    kind: 'lod',
    id: config.id ?? 'lod',
    levels: {
      compact: () => ordered[0]!.render(config.data),
      summary: () => (ordered[1] ?? ordered[0])!.render(config.data),
      detail: () => (ordered[ordered.length - 1] ?? ordered[0])!.render(config.data),
    },
    at(level: number): VNode {
      return selectByLevel(level).render(config.data);
    },
    atWidth(width: number): VNode {
      return selectByWidth(width).render(config.data);
    },
  };
}

function asArray(content: LodNode | LodNode[]): LodNode[] {
  return Array.isArray(content) ? content : [content];
}

function isConfigNode(node: LodNode): node is WidthAwareLodNode {
  return 'atWidth' in node;
}

function levelFromWidth(width: number, thresholds: { summary: number; detail: number }): 0 | 1 | 2 {
  if (width >= thresholds.detail) {
    return 2;
  }
  if (width >= thresholds.summary) {
    return 1;
  }
  return 0;
}

function resolveAutoZoomContent(content: LodNode | LodNode[], width: number, thresholds: { summary: number; detail: number }): VNode {
  const resolvedNodes = asArray(content);
  const resolved = resolvedNodes.map((node) => (isConfigNode(node) ? node.atWidth(width) : node.at(levelFromWidth(width, thresholds))));

  if (resolved.length === 1) {
    return resolved[0]!;
  }

  return column(...resolved);
}

export function lod<T>(config: LodConfig<T>): WidthAwareLodNode;
export function lod(id: string, levels: LodLevels): LodNode;
export function lod<T>(idOrConfig: string | LodConfig<T>, levels?: LodLevels): LodNode | WidthAwareLodNode {
  if (typeof idOrConfig === 'string') {
    return {
      kind: 'lod',
      id: idOrConfig,
      levels: levels!,
      at(level: number): VNode {
        const resolved = resolveLevel(level);
        switch (resolved) {
          case 0:
            return levels!.compact();
          case 1:
            return levels!.summary();
          case 2:
            return levels!.detail();
        }
      },
    };
  }
  return createLodFromConfig(idOrConfig);
}

/**
 * Resolve an array of LOD nodes at a given zoom level and stack them
 * vertically in a column.
 *
 * If `level` is fractional (e.g. 0.5), it is rounded to the nearest integer
 * level before resolving.
 */
export function zoom(level: number, nodes: LodNode[]): VNode;
export function zoom(config: ZoomConfig): VNode;
export function zoom(levelOrConfig: number | ZoomConfig, nodes?: LodNode[]): VNode {
  if (typeof levelOrConfig === 'object') {
    const resolvedScale = levelOrConfig.scale >= 0.75 ? 2 : levelOrConfig.scale >= 0.25 ? 1 : 0;
    const resolvedNodes = asArray(levelOrConfig.content);
    if (resolvedNodes.length === 1) {
      return resolvedNodes[0]!.at(resolvedScale);
    }
    return zoom(resolvedScale, resolvedNodes);
  }
  const resolved = (nodes ?? []).map((node) => node.at(levelOrConfig));
  return column(...resolved);
}

/** Default thresholds for `autoZoom` */
const DEFAULT_THRESHOLDS = { summary: 40, detail: 80 };

/**
 * Automatically determine zoom level based on available width and resolve
 * the LOD nodes accordingly.
 *
 * Default thresholds:
 * - Below 40 cols: compact (level 0)
 * - 40-79 cols: summary (level 1)
 * - 80+ cols: detail (level 2)
 */
export function autoZoom(availableWidth: number, nodes: LodNode[], thresholds?: { summary: number; detail: number }): VNode;
export function autoZoom(config: AutoZoomConfig): VNode;
export function autoZoom(availableWidthOrConfig: number | AutoZoomConfig, nodes?: LodNode[], thresholds?: { summary: number; detail: number }): VNode {
  const t = thresholds ?? DEFAULT_THRESHOLDS;

  if (typeof availableWidthOrConfig === 'object') {
    return resolveAutoZoomContent(availableWidthOrConfig.content, availableWidthOrConfig.targetWidth, t);
  }

  const availableWidth = availableWidthOrConfig;

  let level: number;
  if (availableWidth >= t.detail) {
    level = 2;
  } else if (availableWidth >= t.summary) {
    level = 1;
  } else {
    level = 0;
  }

  return zoom(level, nodes!);
}

/**
 * Render LOD nodes in a grid layout, with column count adapting to the
 * zoom level.
 *
 * Default column counts:
 * - Level 0 (compact): 4 columns
 * - Level 1 (summary): 2 columns
 * - Level 2 (detail): 1 column
 *
 * The `cols` parameter overrides the default column count.
 */
export function zoomGrid(level: number, nodes: LodNode[], cols?: number): VNode {
  const resolved = resolveLevel(level);

  if (cols !== undefined && (!Number.isInteger(cols) || cols <= 0)) {
    throw new Error('zoomGrid() cols must be a positive integer.');
  }

  // Determine column count
  let numCols: number;
  if (cols !== undefined) {
    numCols = cols;
  } else {
    switch (resolved) {
      case 0:
        numCols = 4;
        break;
      case 1:
        numCols = 2;
        break;
      case 2:
        numCols = 1;
        break;
    }
  }

  // Resolve each node at the given level
  const resolvedNodes = nodes.map((node) => node.at(level));

  // Build rows of `numCols` items each
  const rows: VNode[] = [];
  for (let i = 0; i < resolvedNodes.length; i += numCols) {
    const chunk = resolvedNodes.slice(i, i + numCols);
    rows.push(row(...chunk));
  }

  return column(...rows);
}
