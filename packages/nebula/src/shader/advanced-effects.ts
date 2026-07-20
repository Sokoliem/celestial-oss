import { cellOutput, clamp01, clamp255, luminance, mapFgBg, mixRgb, temperatureRgb } from './color.js';
import type { CellShader, RGB, ShaderCell } from './contracts.js';

/** Remap luminance through a user-provided gradient */
export function gradientMap(colorStops: RGB[]): CellShader {
  const stops =
    colorStops.length > 0
      ? colorStops
      : ([
          [0, 0, 0],
          [255, 255, 255],
        ] as RGB[]);

  return {
    name: 'gradientMap',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => {
        if (stops.length === 1) {
          return stops[0]!;
        }

        const position = clamp01(luminance(rgb) / 255) * (stops.length - 1);
        const lower = Math.floor(position);
        const upper = Math.min(stops.length - 1, lower + 1);
        const fraction = position - lower;
        return mixRgb(stops[lower]!, stops[upper]!, fraction);
      }),
  };
}

/** Sample from a displaced position for CRT-like curvature */
export function barrelDistortion(amount = 0.3): CellShader {
  return {
    name: 'barrelDistortion',
    fn: (x, y, cell, uniforms, neighbors) => {
      const nx = ((x + 0.5) / uniforms.cols) * 2 - 1;
      const ny = ((y + 0.5) / uniforms.rows) * 2 - 1;
      const radius = nx * nx + ny * ny;
      const factor = 1 - amount * radius;
      const sx = nx * factor;
      const sy = ny * factor;
      const sampleX = Math.round((sx + 1) * 0.5 * uniforms.cols - 0.5);
      const sampleY = Math.round((sy + 1) * 0.5 * uniforms.rows - 0.5);
      const sample = neighbors(sampleX - x, sampleY - y);

      if (!sample || sample === cell) return null;
      return cellOutput(sample);
    },
    processOpaque: true,
  };
}

/** Average colors inside fixed-size blocks */
export function pixelate(blockSize = 3): CellShader {
  const size = Math.max(1, Math.round(blockSize));
  if (size <= 1) {
    return { name: 'pixelate', fn: () => null };
  }

  return {
    name: 'pixelate',
    fn: (x, y, cell, _uniforms, neighbors) => {
      const startDx = -(x % size);
      const startDy = -(y % size);
      let exemplar: ShaderCell | null = neighbors(startDx, startDy);
      let fgRed = 0;
      let fgGreen = 0;
      let fgBlue = 0;
      let fgCount = 0;
      let bgRed = 0;
      let bgGreen = 0;
      let bgBlue = 0;
      let bgCount = 0;

      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const sample = neighbors(startDx + dx, startDy + dy);
          if (!sample) continue;
          exemplar ??= sample;
          if (sample.fg) {
            fgRed += sample.fg[0];
            fgGreen += sample.fg[1];
            fgBlue += sample.fg[2];
            fgCount++;
          }
          if (sample.bg) {
            bgRed += sample.bg[0];
            bgGreen += sample.bg[1];
            bgBlue += sample.bg[2];
            bgCount++;
          }
        }
      }

      const base = exemplar ?? cell;
      return {
        ...cellOutput(base),
        fg: fgCount > 0 ? [Math.round(fgRed / fgCount), Math.round(fgGreen / fgCount), Math.round(fgBlue / fgCount)] : null,
        bg: bgCount > 0 ? [Math.round(bgRed / bgCount), Math.round(bgGreen / bgCount), Math.round(bgBlue / bgCount)] : null,
      };
    },
    processOpaque: true,
  };
}

/** Apply a photographic white-balance shift */
export function colorTemperature(temp = 6500): CellShader {
  const target = temperatureRgb(temp);
  const neutral = temperatureRgb(6500);

  return {
    name: 'colorTemperature',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => [
        clamp255((rgb[0] * target[0]) / Math.max(1, neutral[0])),
        clamp255((rgb[1] * target[1]) / Math.max(1, neutral[1])),
        clamp255((rgb[2] * target[2]) / Math.max(1, neutral[2])),
      ]),
  };
}

/** Blend toward a local blur as rows move away from the focal plane */
export function depthOfField(focusY: number, range = 5, blurAmount = 0.6): CellShader {
  const OFFSETS: ReadonlyArray<[number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ];

  return {
    name: 'depthOfField',
    fn: (_x, y, cell, uniforms, neighbors) => {
      const distance = Math.abs(y - focusY);
      if (distance <= range) return null;

      const blend = clamp01(((distance - range) / Math.max(1, uniforms.rows - range)) * blurAmount);
      const blurChannel = (rgb: RGB | null, channel: 'fg' | 'bg'): RGB | null => {
        if (!rgb) return null;
        let red = rgb[0];
        let green = rgb[1];
        let blue = rgb[2];
        let count = 1;

        for (const [dx, dy] of OFFSETS) {
          const sample = neighbors(dx, dy)?.[channel] ?? null;
          if (!sample) continue;
          red += sample[0];
          green += sample[1];
          blue += sample[2];
          count++;
        }

        const blurred: RGB = [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
        return mixRgb(rgb, blurred, blend);
      };

      return {
        fg: blurChannel(cell.fg, 'fg'),
        bg: blurChannel(cell.bg, 'bg'),
        dim: blend > 0.35 ? true : cell.dim,
      };
    },
  };
}

/** Apply a warm sepia grade blended with the original color */
export function sepia(intensity = 0.8): CellShader {
  return {
    name: 'sepia',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => {
        const sepiaRgb: RGB = [
          clamp255(rgb[0] * 0.393 + rgb[1] * 0.769 + rgb[2] * 0.189),
          clamp255(rgb[0] * 0.349 + rgb[1] * 0.686 + rgb[2] * 0.168),
          clamp255(rgb[0] * 0.272 + rgb[1] * 0.534 + rgb[2] * 0.131),
        ];
        return mixRgb(rgb, sepiaRgb, intensity);
      }),
  };
}

/**
 * Mask content to a shape. Cells outside the shape are cleared.
 * The shapeFn receives cell coordinates and grid dimensions, returning 0-1
 * where 0 = outside (masked), 1 = inside (visible).
 * Values between 0-1 get anti-aliased (dim applied proportionally).
 *
 * @param shapeFn - (x, y, cols, rows) => 0-1 visibility value
 */
export function mask(shapeFn: (x: number, y: number, cols: number, rows: number) => number): CellShader {
  return {
    name: 'mask',
    fn: (x, y, _cell, uniforms) => {
      const value = shapeFn(x, y, uniforms.cols, uniforms.rows);
      if (value >= 1) return null; // fully inside, no change
      if (value <= 0) {
        // fully outside - clear the cell
        return { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
      }
      // Anti-alias: dim proportionally at the edge
      return { dim: true };
    },
    processOpaque: true, // masks should affect all cells
  };
}

/**
 * Animated reveal shader. Like mask but the visible area grows with progress.
 * At progress=0, nothing is visible. At progress=1, the full shape is visible.
 *
 * Uses a distance-from-center function: (x, y, cols, rows) => 0-1 where
 * 0 = center of the reveal origin and 1 = the edge/extent of the reveal.
 * As progress increases from 0→1, cells whose distance ≤ progress become visible.
 *
 * @param distanceFn - (x, y, cols, rows) => 0-1 normalized distance from reveal origin
 * @param progress - 0-1 animation progress
 */
export function reveal(distanceFn: (x: number, y: number, cols: number, rows: number) => number, progress: number): CellShader {
  return {
    name: 'reveal',
    fn: (x, y, _cell, uniforms) => {
      const dist = distanceFn(x, y, uniforms.cols, uniforms.rows);
      // Cells with distance <= progress are revealed
      const edge = 0.05;
      const value = dist <= progress - edge ? 1 : dist >= progress ? 0 : (progress - dist) / edge;

      if (value >= 1) return null;
      if (value <= 0) {
        return { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, strikethrough: false };
      }
      return { dim: true };
    },
    processOpaque: true,
  };
}
