import { type Color, color } from '../color.js';
import { type ColorScale, SCALE_STEPS, type ScaleStep, type Tone } from './types.js';

/** Canonical OKLCh L targets for each scale step (assuming base ~ 0.65). */
const CANONICAL_L: Record<ScaleStep, number> = {
  50: 0.95,
  100: 0.88,
  200: 0.78,
  300: 0.72,
  400: 0.65,
  500: 0.55,
  600: 0.45,
  700: 0.38,
  800: 0.32,
  900: 0.22,
};

/** Chroma multiplier for each step (parabolic falloff from base). */
const CANONICAL_C_MULT: Record<ScaleStep, number> = {
  50: 0.15,
  100: 0.3,
  200: 0.55,
  300: 0.75,
  400: 1.0,
  500: 0.95,
  600: 0.9,
  700: 0.82,
  800: 0.75,
  900: 0.6,
};

const MIN_L_GAP = 0.03;

/**
 * Generate a 10-step color scale from a single base color.
 * Operates in OKLCh space for perceptual uniformity.
 * Step 400 is the anchor (the input color unchanged).
 */
export function generateScale(base: Color): ColorScale {
  const lch = base.oklch;
  if (!lch) {
    return buildColorScale(SCALE_STEPS.map(() => base));
  }

  const [baseL, baseC, baseH] = lch;
  const headroomUp = Math.max(0.03, 0.97 - baseL);
  const headroomDown = Math.max(0.03, baseL - 0.15);
  const canonicalUp = CANONICAL_L[50] - CANONICAL_L[400];
  const canonicalDown = CANONICAL_L[400] - CANONICAL_L[900];

  const scaleUp = headroomUp / canonicalUp;
  const scaleDown = headroomDown / canonicalDown;

  const targetL: Record<ScaleStep, number> = {
    50: baseL + (CANONICAL_L[50] - CANONICAL_L[400]) * scaleUp,
    100: baseL + (CANONICAL_L[100] - CANONICAL_L[400]) * scaleUp,
    200: baseL + (CANONICAL_L[200] - CANONICAL_L[400]) * scaleUp,
    300: baseL + (CANONICAL_L[300] - CANONICAL_L[400]) * scaleUp,
    400: baseL,
    500: baseL - (CANONICAL_L[400] - CANONICAL_L[500]) * scaleDown,
    600: baseL - (CANONICAL_L[400] - CANONICAL_L[600]) * scaleDown,
    700: baseL - (CANONICAL_L[400] - CANONICAL_L[700]) * scaleDown,
    800: baseL - (CANONICAL_L[400] - CANONICAL_L[800]) * scaleDown,
    900: baseL - (CANONICAL_L[400] - CANONICAL_L[900]) * scaleDown,
  };

  const ordered = [...SCALE_STEPS];
  for (const step of ordered) {
    targetL[step] = Math.max(0.05, Math.min(0.98, targetL[step]));
  }
  for (let i = 1; i < ordered.length; i++) {
    if (targetL[ordered[i]!] > targetL[ordered[i - 1]!] - MIN_L_GAP) {
      targetL[ordered[i]!] = targetL[ordered[i - 1]!] - MIN_L_GAP;
    }
  }
  for (const step of ordered) {
    targetL[step] = Math.max(0.05, targetL[step]);
  }

  const colors = SCALE_STEPS.map((step) => {
    if (step === 400) return base;
    const l = targetL[step];
    const c = baseC * CANONICAL_C_MULT[step];
    return color.oklch(l, c, baseH);
  });

  for (let i = 1; i < colors.length; i++) {
    const prevLum = color.luminance(colors[i - 1]!);
    const curLum = color.luminance(colors[i]!);
    if (curLum > prevLum) {
      const prevColor = colors[i - 1]!;
      const l = targetL[SCALE_STEPS[i]!];
      colors[i] = color.oklch(l, 0, baseH);
      if (color.luminance(colors[i]!) > prevLum) {
        colors[i] = color.lerpOklch(prevColor, colors[i]!, 0.8);
      }
    }
  }

  return buildColorScale(colors);
}

function buildColorScale(colors: Color[]): ColorScale {
  const scale = {
    50: colors[0]!,
    100: colors[1]!,
    200: colors[2]!,
    300: colors[3]!,
    400: colors[4]!,
    500: colors[5]!,
    600: colors[6]!,
    700: colors[7]!,
    800: colors[8]!,
    900: colors[9]!,
    sample(t: number): Color {
      t = Math.max(0, Math.min(1, t));
      if (t === 0) return scale[50];
      if (t === 1) return scale[900];
      const pos = t * 9;
      const lo = Math.floor(pos);
      const hi = Math.min(lo + 1, 9);
      const frac = pos - lo;
      const loColor = colors[lo]!;
      const hiColor = colors[hi]!;
      return color.lerpOklch(loColor, hiColor, frac);
    },
  };
  return Object.freeze(scale) as ColorScale;
}

export function generateScales(tones: Record<Tone, Color>): Record<Tone, ColorScale> {
  const scales = {} as Record<Tone, ColorScale>;
  for (const tone of ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as Tone[]) {
    scales[tone] = generateScale(tones[tone]);
  }
  return Object.freeze(scales);
}
