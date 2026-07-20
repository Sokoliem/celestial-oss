/**
 * Nebula Cell Shader System
 *
 * Public facade for programmable post-processing transforms.
 */

export { applyShaderOutput, applyShaders, cellToShaderCell } from './shader/apply.js';
export { createParseCache, type ParseCache, parseAnsiToRgb, rgbToBgAnsi, rgbToFgAnsi } from './shader/color.js';
export type { CellShader, NeighborFn, RGB, ShaderCell, ShaderFn, ShaderOutput, ShaderUniforms } from './shader/contracts.js';
export { shaders } from './shader/registry.js';
