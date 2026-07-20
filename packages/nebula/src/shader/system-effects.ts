import { dimRgb, pseudoRandom, smoothstep } from './color.js';
import type { CellShader, ShaderOutput } from './contracts.js';

/**
 * Automatic style shader that applies modern effects defined in StyleProps.
 */
export function autoStyle(): CellShader {
  return {
    name: 'autoStyle',
    fn: (x, y, cell, uniforms, neighbors) => {
      const { effects } = cell.style;
      if (!effects) return null;

      const output: ShaderOutput = {};
      let fg = cell.fg;
      let bg = cell.bg;

      // Blur effect (simple box blur with neighbors)
      if (effects.blur && effects.blur > 0) {
        const radius = Math.min(2, Math.ceil(effects.blur / 2)); // Cap at radius 2 (5x5) for performance
        let r = fg ? fg[0] : 0,
          g = fg ? fg[1] : 0,
          b = fg ? fg[2] : 0;
        let rb = bg ? bg[0] : 0,
          gb = bg ? bg[1] : 0,
          bb = bg ? bg[2] : 0;
        let count = 1;

        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            if (dx === 0 && dy === 0) continue;
            const n = neighbors(dx, dy);
            if (n) {
              if (n.fg) {
                r += n.fg[0];
                g += n.fg[1];
                b += n.fg[2];
              }
              if (n.bg) {
                rb += n.bg[0];
                gb += n.bg[1];
                bb += n.bg[2];
              }
              count++;
            }
          }
        }
        fg = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
        bg = [Math.round(rb / count), Math.round(gb / count), Math.round(bb / count)];
        output.fg = fg;
        output.bg = bg;
      }

      // Opacity effect
      if (effects.opacity !== undefined && effects.opacity < 1) {
        const alpha = Math.max(0, effects.opacity);
        if (fg) fg = [Math.round(fg[0] * alpha), Math.round(fg[1] * alpha), Math.round(fg[2] * alpha)];
        if (bg) bg = [Math.round(bg[0] * alpha), Math.round(bg[1] * alpha), Math.round(bg[2] * alpha)];
        output.fg = fg;
        output.bg = bg;
      }

      // Glass tint effect
      if (effects.glass && cell.tint) {
        const alpha = effects.opacity ?? 0.3; // Default tint alpha
        const baseBg = bg ?? [5, 5, 5]; // Fallback to near-black for default terminal bg
        bg = [
          Math.round(baseBg[0] * (1 - alpha) + cell.tint[0] * alpha),
          Math.round(baseBg[1] * (1 - alpha) + cell.tint[1] * alpha),
          Math.round(baseBg[2] * (1 - alpha) + cell.tint[2] * alpha),
        ];
        output.bg = bg;
      }

      // Vignette effect
      if (effects.vignette && effects.vignette > 0) {
        const { cols, rows } = uniforms;
        const nx = (x / cols - 0.5) * 2;
        const ny = (y / rows - 0.5) * 2;
        const dist = Math.sqrt(nx * nx + ny * ny) / Math.sqrt(2);
        const factor = 1 - smoothstep(0.8, 1.0, dist) * effects.vignette;
        if (fg) fg = dimRgb(fg, factor);
        if (bg) bg = dimRgb(bg, factor);
        output.fg = fg;
        output.bg = bg;
      }

      // Scanline effect
      if (effects.scanline && effects.scanline > 0 && y % 2 === 0) {
        const factor = 1 - effects.scanline * 0.5;
        if (fg) fg = dimRgb(fg, factor);
        if (bg) bg = dimRgb(bg, factor);
        output.fg = fg;
        output.bg = bg;
      }

      // Noise / film grain effect
      // Perturbs each cell's color channels by a pseudo-random offset whose
      // magnitude is controlled by the noise intensity (0–1).
      if (effects.noise && effects.noise > 0) {
        const intensity = Math.min(1, effects.noise);
        // Use a seed derived from cell position + tick so noise animates each frame
        const seed = (x * 73856093) ^ (y * 19349663) ^ (uniforms.tick * 83492791);
        const rand = pseudoRandom(seed);
        // Signed perturbation in [-intensity/2, +intensity/2] mapped to [-127, 127]
        const delta = Math.round((rand - 0.5) * intensity * 255);
        if (fg) {
          fg = [Math.max(0, Math.min(255, fg[0] + delta)), Math.max(0, Math.min(255, fg[1] + delta)), Math.max(0, Math.min(255, fg[2] + delta))];
          output.fg = fg;
        }
        if (bg) {
          // Use a different seed offset for bg so it doesn't perfectly track fg
          const bgRand = pseudoRandom(seed ^ 0xdeadbeef);
          const bgDelta = Math.round((bgRand - 0.5) * intensity * 255);
          bg = [Math.max(0, Math.min(255, bg[0] + bgDelta)), Math.max(0, Math.min(255, bg[1] + bgDelta)), Math.max(0, Math.min(255, bg[2] + bgDelta))];
          output.bg = bg;
        }
      }

      return Object.keys(output).length > 0 ? output : null;
    },
    processOpaque: true,
  };
}

/**
 * Shadow shader that renders drop shadows for elements with elevation.
 */
export function shadow(): CellShader {
  return {
    name: 'shadow',
    fn: (_x, _y, cell, _uniforms, neighbors) => {
      if (cell.style.elevation) return null;

      let maxElevation = 0;
      // Check top and left neighbors for elevation to cast shadow onto current cell
      const radius = 2;
      for (let dx = -radius; dx <= 0; dx++) {
        for (let dy = -radius; dy <= 0; dy++) {
          if (dx === 0 && dy === 0) continue;
          const n = neighbors(dx, dy);
          if (n?.style.elevation) {
            maxElevation = Math.max(maxElevation, n.style.elevation);
          }
        }
      }

      if (maxElevation > 0) {
        const factor = Math.max(0.4, 0.85 - (maxElevation / 24) * 0.4);
        const bg = cell.bg ?? [10, 10, 10]; // slight lift from pure black
        return {
          bg: [Math.round(bg[0] * factor), Math.round(bg[1] * factor), Math.round(bg[2] * factor)],
        };
      }
      return null;
    },
    processOpaque: true,
  };
}

/**
 * Combined system shader that applies both elevation shadows and modern effects
 * in a single pass for maximum performance.
 */
export function systemStyle(): CellShader {
  const auto = autoStyle();
  const sh = shadow();

  return {
    name: 'systemStyle',
    fn: (x, y, cell, uniforms, neighbors) => {
      // 1. Elevation Shadow (Pass-through to shadow shader logic)
      const shadowOut = sh.fn(x, y, cell, uniforms, neighbors);

      // 2. Modern Effects (Pass-through to autoStyle shader logic)
      const effectsOut = auto.fn(x, y, cell, uniforms, neighbors);

      if (!shadowOut && !effectsOut) return null;
      return { ...shadowOut, ...effectsOut };
    },
    processOpaque: true,
  };
}
