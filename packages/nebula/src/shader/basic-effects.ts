import { clamp01, clamp255, dimRgb, hslToRgb, luminance, mapFgBg, rgbToHsl, smoothstep } from './color.js';
import type { CellShader, RGB } from './contracts.js';

export function dim(amount: number): CellShader {
  return {
    name: 'dim',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => {
        const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        return hslToRgb(h, s, Math.max(0, l - amount)) as RGB;
      }),
  };
}

/** Darken edges/corners with a vignette effect */
export function vignette(strength = 0.5, radius = 0.8): CellShader {
  return {
    name: 'vignette',
    fn: (x, y, cell, uniforms) => {
      const { cols, rows } = uniforms;
      const nx = (x / cols - 0.5) * 2;
      const ny = (y / rows - 0.5) * 2;
      const dist = Math.sqrt(nx * nx + ny * ny) / Math.sqrt(2);
      const factor = 1 - smoothstep(radius, 1.0, dist) * strength;
      return mapFgBg(cell, (rgb) => dimRgb(rgb, factor));
    },
  };
}

/** Apply scanline darkening to every Nth row */
export function scanline(opacity = 0.3, spacing = 2): CellShader {
  return {
    name: 'scanline',
    fn: (_x, y, cell) => {
      if (y % spacing !== 0) return null;
      return mapFgBg(cell, (rgb) => dimRgb(rgb, 1 - opacity));
    },
  };
}

/** Rotate hue of fg/bg by `degrees` */
export function hueShift(degrees: number): CellShader {
  return {
    name: 'hueShift',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => {
        const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        const newH = (((h + degrees) % 360) + 360) % 360;
        return hslToRgb(newH, s, l) as RGB;
      }),
  };
}

/** Blend fg/bg toward a target color */
export function tint(tintColor: RGB, amount = 0.3): CellShader {
  return {
    name: 'tint',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => [
        Math.round(rgb[0] + (tintColor[0] - rgb[0]) * amount),
        Math.round(rgb[1] + (tintColor[1] - rgb[1]) * amount),
        Math.round(rgb[2] + (tintColor[2] - rgb[2]) * amount),
      ]),
  };
}

/** Invert all color channels */
export function invert(): CellShader {
  return {
    name: 'invert',
    fn: (_x, _y, cell) => mapFgBg(cell, (rgb) => [255 - rgb[0], 255 - rgb[1], 255 - rgb[2]]),
  };
}

/** Convert to grayscale using luminance weights */
export function grayscale(): CellShader {
  return {
    name: 'grayscale',
    fn: (_x, _y, cell) =>
      mapFgBg(cell, (rgb) => {
        const gray = Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]);
        return [gray, gray, gray];
      }),
  };
}

/** Average fg/bg with 4 cardinal neighbors */
export function blur(): CellShader {
  return {
    name: 'blur',
    fn: (_x, _y, cell, _uniforms, neighbors) => {
      const DIRS: ReadonlyArray<[number, number]> = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      const NEIGHBOR_WEIGHT = 0.125;

      const blurChannel = (rgb: RGB, channel: 'fg' | 'bg'): RGB => {
        let centerWeight = 0.5;
        let r = 0,
          g = 0,
          b = 0;

        for (const [dx, dy] of DIRS) {
          const nRgb = neighbors(dx, dy)?.[channel] ?? null;
          if (nRgb) {
            r += nRgb[0] * NEIGHBOR_WEIGHT;
            g += nRgb[1] * NEIGHBOR_WEIGHT;
            b += nRgb[2] * NEIGHBOR_WEIGHT;
          } else {
            centerWeight += NEIGHBOR_WEIGHT;
          }
        }

        r += rgb[0] * centerWeight;
        g += rgb[1] * centerWeight;
        b += rgb[2] * centerWeight;

        return [Math.round(r), Math.round(g), Math.round(b)];
      };

      return {
        fg: cell.fg ? blurChannel(cell.fg, 'fg') : null,
        bg: cell.bg ? blurChannel(cell.bg, 'bg') : null,
      };
    },
  };
}

/** Offset red/blue channels horizontally for lens-fringe effects */
export function chromaticAberration(offset = 1): CellShader {
  const sampleOffset = Math.max(1, Math.round(offset));
  return {
    name: 'chromaticAberration',
    fn: (_x, _y, cell, _uniforms, neighbors) => {
      const aberrate = (rgb: RGB | null, channel: 'fg' | 'bg'): RGB | null => {
        if (!rgb) return null;
        const left = neighbors(-sampleOffset, 0)?.[channel] ?? null;
        const right = neighbors(sampleOffset, 0)?.[channel] ?? null;
        return [left?.[0] ?? rgb[0], rgb[1], right?.[2] ?? rgb[2]];
      };

      return {
        fg: aberrate(cell.fg, 'fg'),
        bg: aberrate(cell.bg, 'bg'),
      };
    },
  };
}

/** Bleed bright neighboring colors into the current cell */
export function bloom(threshold = 180, intensity = 0.4): CellShader {
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
    name: 'bloom',
    fn: (_x, _y, cell, _uniforms, neighbors) => {
      const bloomChannel = (rgb: RGB | null, channel: 'fg' | 'bg'): RGB | null => {
        let red = rgb?.[0] ?? 0;
        let green = rgb?.[1] ?? 0;
        let blue = rgb?.[2] ?? 0;
        let hasColor = rgb !== null;

        for (const [dx, dy] of OFFSETS) {
          const neighbor = neighbors(dx, dy)?.[channel] ?? null;
          if (!neighbor) continue;

          const glow = clamp01((luminance(neighbor) - threshold) / Math.max(1, 255 - threshold));
          if (glow <= 0) continue;

          const weight = (glow * intensity) / OFFSETS.length;
          red += neighbor[0] * weight;
          green += neighbor[1] * weight;
          blue += neighbor[2] * weight;
          hasColor = true;
        }

        return hasColor ? [clamp255(red), clamp255(green), clamp255(blue)] : null;
      };

      return {
        fg: bloomChannel(cell.fg, 'fg'),
        bg: bloomChannel(cell.bg, 'bg'),
      };
    },
  };
}
