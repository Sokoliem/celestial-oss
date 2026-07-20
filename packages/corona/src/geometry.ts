/**
 * Terminal-cell geometry helpers.
 *
 * Most monospace terminal fonts render cells with a roughly 1:2
 * width:height physical-pixel ratio (e.g. 8×16 px, 10×20 px, 14×32 px).
 * Code that maps source-image dimensions onto cell counts must account
 * for this — otherwise a square source renders as a wide ellipse.
 *
 * `CELL_ASPECT_RATIO` is the workspace-wide default. When you have a
 * live measurement (e.g. `probeTerminal().cellPixelSize` from
 * raster image renderers), pass `cellAspect: cellPxW / cellPxH` to
 * {@link aspectCorrectCells} for an exact result.
 */

/**
 * Approximate physical pixel aspect ratio (width / height) of a single
 * terminal cell. Defaults to 0.5 — i.e. cells are about twice as tall as
 * they are wide. Live cell-pixel-size queries (CSI 14 t) override this
 * when available.
 */
export const CELL_ASPECT_RATIO = 0.5;

/** Inputs to {@link aspectCorrectCells}. */
export interface AspectCorrectCellsOpts {
  /** Source image width in pixels. */
  srcW: number;
  /** Source image height in pixels. */
  srcH: number;
  /** Target width in terminal cells. */
  cols: number;
  /**
   * Cell width / height ratio in physical pixels. Defaults to
   * {@link CELL_ASPECT_RATIO}. Pass `cellPx.width / cellPx.height` when
   * you have a live measurement.
   */
  cellAspect?: number;
}

/**
 * Compute aspect-correct (cols, rows) for a source image rendered into a
 * terminal cell grid.
 *
 * Given source pixel dimensions and a target column count, returns the
 * row count that preserves the source's aspect ratio when rendered into
 * cells whose physical W:H ratio is `cellAspect`. Result is always at
 * least 1 row.
 *
 * **Math.** The visible width is `cols × cellW` and the visible height
 * is `rows × cellH`, so to preserve `srcW / srcH`:
 *
 *     rows = round(cols × cellAspect × srcH / srcW)
 *
 * where `cellAspect = cellW / cellH ≈ 0.5`.
 *
 * @example Square source, default aspect:
 *     aspectCorrectCells({ srcW: 1280, srcH: 1280, cols: 36 })
 *     // → { cols: 36, rows: 18 }   (renders as a square)
 *
 * @example Tall portrait source:
 *     aspectCorrectCells({ srcW: 480, srcH: 720, cols: 40 })
 *     // → { cols: 40, rows: 30 }
 *
 * @example Live cell pixel size:
 *     aspectCorrectCells({ srcW: 1920, srcH: 1080, cols: 80, cellAspect: 8 / 16 })
 *     // → { cols: 80, rows: 23 }
 */
export function aspectCorrectCells(opts: AspectCorrectCellsOpts): { cols: number; rows: number } {
  const { srcW, srcH, cols } = opts;
  const cellAspect = opts.cellAspect ?? CELL_ASPECT_RATIO;
  if (!Number.isFinite(srcW) || srcW <= 0) {
    throw new Error(`aspectCorrectCells: srcW must be a positive finite number, got ${srcW}`);
  }
  if (!Number.isFinite(srcH) || srcH <= 0) {
    throw new Error(`aspectCorrectCells: srcH must be a positive finite number, got ${srcH}`);
  }
  if (!Number.isFinite(cols) || cols <= 0) {
    throw new Error(`aspectCorrectCells: cols must be a positive finite number, got ${cols}`);
  }
  if (!Number.isFinite(cellAspect) || cellAspect <= 0) {
    throw new Error(`aspectCorrectCells: cellAspect must be a positive finite number, got ${cellAspect}`);
  }
  const rows = Math.max(1, Math.round(cols * cellAspect * (srcH / srcW)));
  return { cols: Math.max(1, Math.round(cols)), rows };
}
