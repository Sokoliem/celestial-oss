/**
 * Glass Morphism Shader
 *
 * Processes StyleEffects (glass, blur, opacity, tint) on individual cells
 * to produce frosted-glass visual effects in the terminal.
 */

import type { CellShader, NeighborFn, RGB, ShaderCell, ShaderOutput } from './shader.js';

// ─── Color Math Helpers ─────────────────────────────────────────────────────

/** Clamp a number to 0-255 */
function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Get an RGB value, defaulting null to black [0,0,0] */
function orBlack(rgb: RGB | null): RGB {
  return rgb ?? [0, 0, 0];
}

/** Linear interpolation between two RGB colors */
function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return [clamp255(a[0] + (b[0] - a[0]) * t), clamp255(a[1] + (b[1] - a[1]) * t), clamp255(a[2] + (b[2] - a[2]) * t)];
}

// ─── Blur: 3x3 Kernel ──────────────────────────────────────────────────────

/**
 * Average a cell's background color with its 8 neighbors (3x3 kernel).
 * Intensity controls the blend: 0 = no change, 10 = full average.
 */
function applyBlur(cell: ShaderCell, neighbors: NeighborFn, intensity: number): { bg: RGB } {
  const centerBg = orBlack(cell.bg);
  const clampedIntensity = Math.max(0, Math.min(10, intensity));
  const blend = clampedIntensity / 10;

  // Collect all 8 neighbors + center
  let rSum = centerBg[0];
  let gSum = centerBg[1];
  let bSum = centerBg[2];
  let count = 1;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const n = neighbors(dx, dy);
      const nBg = n ? orBlack(n.bg) : centerBg;
      rSum += nBg[0];
      gSum += nBg[1];
      bSum += nBg[2];
      count++;
    }
  }

  const avgR = rSum / count;
  const avgG = gSum / count;
  const avgB = bSum / count;

  // Blend center toward average by intensity
  return {
    bg: [
      clamp255(centerBg[0] + (avgR - centerBg[0]) * blend),
      clamp255(centerBg[1] + (avgG - centerBg[1]) * blend),
      clamp255(centerBg[2] + (avgB - centerBg[2]) * blend),
    ],
  };
}

// ─── Opacity ────────────────────────────────────────────────────────────────

/**
 * Dim foreground and background toward black based on opacity (0-1).
 * 0 = fully dimmed (black), 1 = no change.
 */
function applyOpacity(fg: RGB | null, bg: RGB | null, opacity: number): { fg: RGB | null; bg: RGB | null } {
  const alpha = Math.max(0, Math.min(1, opacity));
  const black: RGB = [0, 0, 0];
  return {
    fg: fg ? lerpRgb(black, fg, alpha) : null,
    bg: bg ? lerpRgb(black, bg, alpha) : null,
  };
}

// ─── Tint ───────────────────────────────────────────────────────────────────

/**
 * Overlay a tint color onto the background at ~0.3 mix ratio.
 */
function applyTint(bg: RGB | null, tintColor: RGB): RGB {
  const base = orBlack(bg);
  return lerpRgb(base, tintColor, 0.3);
}

// ─── Glass Shader ───────────────────────────────────────────────────────────

/**
 * Create a glass morphism CellShader.
 *
 * Reads `cell.style.effects` for `glass`, `blur`, `opacity`, `tint` and
 * applies the corresponding visual transforms. When `glass: true`, it
 * combines blur (intensity 3) + tint + opacity (0.7) even if individual
 * values are not explicitly set.
 */
export function glassShader(): CellShader {
  return {
    name: 'glass',
    fn: (_x, _y, cell, _uniforms, neighbors) => {
      const effects = cell.style.effects;
      if (!effects) return null;

      const hasGlass = effects.glass === true;
      const hasBlur = effects.blur !== undefined && effects.blur > 0;
      const hasOpacity = effects.opacity !== undefined && effects.opacity < 1;
      const hasTint = cell.tint !== null;

      // Early exit if no relevant effects
      if (!hasGlass && !hasBlur && !hasOpacity && !hasTint) return null;

      const output: ShaderOutput = {};
      const currentFg = cell.fg;
      let currentBg = cell.bg;

      // Determine effective values (glass provides defaults)
      const effectiveBlur = hasBlur ? effects.blur! : hasGlass ? 3 : 0;
      const effectiveOpacity = effects.opacity ?? (hasGlass ? 0.7 : 1);
      const effectiveTint = cell.tint ?? (hasGlass ? null : null);

      // 1. Blur (affects background only)
      if (effectiveBlur > 0) {
        const blurred = applyBlur(cell, neighbors, effectiveBlur);
        currentBg = blurred.bg;
        output.bg = currentBg;
      }

      // 2. Tint (affects background only)
      if (effectiveTint) {
        currentBg = applyTint(currentBg, effectiveTint);
        output.bg = currentBg;
      }

      // 3. Opacity (affects both fg and bg)
      if (effectiveOpacity < 1) {
        const dimmed = applyOpacity(currentFg, currentBg, effectiveOpacity);
        if (dimmed.fg !== null) output.fg = dimmed.fg;
        if (dimmed.bg !== null) output.bg = dimmed.bg;
      }

      return Object.keys(output).length > 0 ? output : null;
    },
    processOpaque: true,
  };
}
