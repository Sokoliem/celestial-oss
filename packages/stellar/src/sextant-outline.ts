/**
 * @deprecated This module has been renamed to `./subcell-outline.js` —
 * the primitive is codec-agnostic and the new name reflects that.
 * Imports from `./sextant-outline.js` continue to work for one minor
 * cycle and forward to the new module.
 */

export {
  type DensityReducer,
  type SubcellOutlineOpts as SextantOutlineOpts,
  type SubcellOutlineResult as SextantOutlineResult,
  type SubcellOutlineRow as SextantOutlineRow,
  sextantOutline,
} from './subcell-outline.js';
