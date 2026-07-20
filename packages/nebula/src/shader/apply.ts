import type { Cell, CellGrid, LayoutEntry, LayoutPlan } from '../vdom.js';
import { createParseCache, type ParseCache, rgbToBgAnsi, rgbToFgAnsi } from './color.js';
import type { CellShader, NeighborFn, ShaderCell, ShaderOutput, ShaderUniforms } from './contracts.js';

/** Convert a Cell to a ShaderCell using the parse cache */
export function cellToShaderCell(cell: Cell, cache: ParseCache): ShaderCell {
  return {
    char: cell.char,
    fg: cache.get(cell.style.fg),
    bg: cache.get(cell.style.bg),
    bold: cell.style.bold ?? false,
    dim: cell.style.dim ?? false,
    italic: cell.style.italic ?? false,
    underline: cell.style.underline ?? false,
    strikethrough: cell.style.strikethrough ?? false,
    tint: cache.get(cell.style.effects?.tint),
    style: cell.style,
  };
}

/** Merge ShaderOutput back into a Cell, re-encoding RGB as truecolor ANSI */
export function applyShaderOutput(original: Cell, output: ShaderOutput): Cell {
  const newStyle = { ...original.style };

  if ('fg' in output) {
    newStyle.fg = output.fg ? rgbToFgAnsi(output.fg) : undefined;
  }
  if ('bg' in output) {
    newStyle.bg = output.bg ? rgbToBgAnsi(output.bg) : undefined;
  }
  if ('bold' in output) newStyle.bold = output.bold;
  if ('dim' in output) newStyle.dim = output.dim;
  if ('italic' in output) newStyle.italic = output.italic;
  if ('underline' in output) newStyle.underline = output.underline;
  if ('strikethrough' in output) newStyle.strikethrough = output.strikethrough;

  return {
    char: output.char ?? original.char,
    style: newStyle,
    opaqueId: original.opaqueId,
  };
}

// ─── Composition Engine ─────────────────────────────────────────────────────

/**
 * Apply a list of cell shaders to a rasterized grid.
 *
 * Shaders run left-to-right. Each shader sees the cumulative result
 * of previous shaders in the source ShaderCell grid, enabling composition.
 */
export function applyShaders(grid: CellGrid, plan: LayoutPlan, shaderList: CellShader[], uniforms: ShaderUniforms): CellGrid {
  if (shaderList.length === 0) {
    return cloneGrid(grid);
  }

  const { height, width } = grid;

  // Step 1: Create parse cache and convert all cells to ShaderCell[][]
  const cache = createParseCache();
  const source: ShaderCell[][] = [];
  for (let r = 0; r < height; r++) {
    const row: ShaderCell[] = [];
    for (let c = 0; c < width; c++) {
      row.push(cellToShaderCell(grid.cells[r]![c]!, cache));
    }
    source.push(row);
  }

  // Step 2: Clone output grid (shallow clone rows, cells cloned only when modified)
  const outCells: Cell[][] = [];
  for (let r = 0; r < height; r++) {
    outCells.push([...grid.cells[r]!]);
  }

  // Step 3: Apply each shader in order
  for (const shader of shaderList) {
    if (shader.enabled === false) continue;

    // Precompute region mask if regions are specified
    let regionMask: boolean[][] | null = null;
    if (shader.regions) {
      regionMask = precomputeRegionMask(width, height, shader.regions, plan);
    }

    // Optimization: Create neighbors once per shader
    let sharedNr = 0;
    let sharedNc = 0;
    const neighbors: NeighborFn = (dx, dy) => {
      const nr = sharedNr + dy;
      const nc = sharedNc + dx;
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) return null;
      return source[nr]![nc]!;
    };

    for (let row = 0; row < height; row++) {
      sharedNr = row;
      for (let col = 0; col < width; col++) {
        sharedNc = col;
        const originalCell = grid.cells[row]![col]!;

        // Skip opaque cells unless processOpaque is true
        if (originalCell.opaqueId && !shader.processOpaque) continue;

        // Skip cells outside all named regions
        if (regionMask && !regionMask[row]![col]) continue;

        const sourceCell = source[row]![col]!;

        // Call shader: x=col, y=row
        const result = shader.fn(col, row, sourceCell, uniforms, neighbors);

        if (result !== null && result !== undefined) {
          // Apply to output grid
          const currentOut = outCells[row]![col]!;
          const newCell = applyShaderOutput(currentOut, result);
          outCells[row]![col] = newCell;

          // Update source ShaderCell for cumulative effect on next shaders
          source[row]![col] = cellToShaderCell(newCell, cache);
        }
      }
    }
  }

  // Step 4: Copy rawBlobs unchanged
  const outGrid: CellGrid = {
    cells: outCells,
    width,
    height,
  };
  if (grid.rawBlobs) {
    outGrid.rawBlobs = new Map(grid.rawBlobs);
  }

  return outGrid;
}

/** Clone a CellGrid (shallow clone of rows and cells) */
export function cloneGrid(grid: CellGrid): CellGrid {
  const cells: Cell[][] = [];
  for (let r = 0; r < grid.height; r++) {
    cells.push([...grid.cells[r]!]);
  }
  const out: CellGrid = { cells, width: grid.width, height: grid.height };
  if (grid.rawBlobs) {
    out.rawBlobs = new Map(grid.rawBlobs);
  }
  return out;
}

/** Precompute a boolean mask of which cells fall within named layout regions */
export function precomputeRegionMask(width: number, height: number, regionNames: string[], plan: LayoutPlan): boolean[][] {
  const mask: boolean[][] = [];
  for (let r = 0; r < height; r++) {
    mask.push(new Array<boolean>(width).fill(false));
  }

  for (const name of regionNames) {
    const entry: LayoutEntry | undefined = plan.index.get(name);
    if (!entry) continue;
    const rect = entry.rect;
    const rStart = Math.max(0, rect.y);
    const rEnd = Math.min(height, rect.y + rect.height);
    const cStart = Math.max(0, rect.x);
    const cEnd = Math.min(width, rect.x + rect.width);
    for (let r = rStart; r < rEnd; r++) {
      for (let c = cStart; c < cEnd; c++) {
        mask[r]![c] = true;
      }
    }
  }

  return mask;
}
