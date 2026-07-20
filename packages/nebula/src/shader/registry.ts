import { barrelDistortion, colorTemperature, depthOfField, gradientMap, mask, pixelate, reveal, sepia } from './advanced-effects.js';
import { bloom, blur, chromaticAberration, dim, grayscale, hueShift, invert, scanline, tint, vignette } from './basic-effects.js';
import { autoStyle, shadow, systemStyle } from './system-effects.js';

/** Built-in shader factory functions */
export const shaders = {
  systemStyle,
  autoStyle,
  shadow,
  dim,
  vignette,
  scanline,
  hueShift,
  tint,
  invert,
  grayscale,
  blur,
  chromaticAberration,
  bloom,
  gradientMap,
  barrelDistortion,
  pixelate,
  colorTemperature,
  depthOfField,
  sepia,
  mask,
  reveal,
};
