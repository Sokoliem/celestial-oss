import type { Color } from '../color.js';
import type { Theme } from './types.js';

/** Create a frozen theme from color tokens. */
export function theme<T extends Record<string, Color>>(tokens: T): Theme<T> {
  return Object.freeze({ ...tokens });
}
