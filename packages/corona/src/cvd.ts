/**
 * Color Vision Deficiency (CVD) Simulation
 *
 * Simulates how colors appear to people with various forms of color blindness
 * using Viénot (1999) simulation matrices on linearized sRGB values.
 */

import { type Color, color } from './color.js';

export type CVDType = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

// Viénot 1999 simulation matrices (3x3, row-major)
type Matrix3x3 = [number, number, number, number, number, number, number, number, number];

const PROTANOPIA: Matrix3x3 = [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998];

const DEUTERANOPIA: Matrix3x3 = [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881];

const TRITANOPIA: Matrix3x3 = [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039];

const MATRICES: Record<Exclude<CVDType, 'achromatopsia'>, Matrix3x3> = {
  protanopia: PROTANOPIA,
  deuteranopia: DEUTERANOPIA,
  tritanopia: TRITANOPIA,
};

/** sRGB to linear */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear to sRGB */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function applyMatrix(m: Matrix3x3, r: number, g: number, b: number): [number, number, number] {
  return [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
}

/**
 * Simulate how a color appears to someone with a color vision deficiency.
 *
 * Returns a new Color with the simulated RGB values.
 * If the input color has no RGB representation (e.g. reset), returns it unchanged.
 */
export function simulateColorBlindness(c: Color, type: CVDType): Color {
  if (!c.rgb) return c;

  const [r8, g8, b8] = c.rgb;

  // Normalize to 0-1 and linearize
  const rLin = srgbToLinear(r8 / 255);
  const gLin = srgbToLinear(g8 / 255);
  const bLin = srgbToLinear(b8 / 255);

  let rOut: number;
  let gOut: number;
  let bOut: number;

  if (type === 'achromatopsia') {
    // Grayscale via luminance weights on linear values
    const lum = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
    rOut = lum;
    gOut = lum;
    bOut = lum;
  } else {
    [rOut, gOut, bOut] = applyMatrix(MATRICES[type], rLin, gLin, bLin);
  }

  // De-linearize and convert back to 0-255
  const rFinal = Math.round(clamp(linearToSrgb(clamp(rOut, 0, 1)), 0, 1) * 255);
  const gFinal = Math.round(clamp(linearToSrgb(clamp(gOut, 0, 1)), 0, 1) * 255);
  const bFinal = Math.round(clamp(linearToSrgb(clamp(bOut, 0, 1)), 0, 1) * 255);

  return color.rgb(rFinal, gFinal, bFinal);
}
