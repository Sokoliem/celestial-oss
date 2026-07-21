/**
 * Corona Shared Utilities
 *
 * Canonical implementations of stripAnsi and visualWidth used across
 * style.ts, layout.ts, and border.ts. Having a single source of truth
 * prevents divergent ANSI-stripping behavior.
 */

export { cellWidth as visualWidth, sliceCells as sliceByVisualWidth, stripAnsi } from './terminal-text.js';
