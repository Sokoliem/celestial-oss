import type { LayoutPlan, ResolvedStyleAttrs } from '../vdom.js';

/** RGB color tuple [0-255, 0-255, 0-255] */
export type RGB = [number, number, number];

/** Parsed cell data for shader consumption */
export interface ShaderCell {
  readonly char: string;
  readonly fg: RGB | null;
  readonly bg: RGB | null;
  readonly bold: boolean;
  readonly dim: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
  readonly blink?: boolean;
  readonly reverse?: boolean;
  readonly hidden?: boolean;
  /** Pre-parsed tint color if applicable */
  readonly tint: RGB | null;
  /** Raw style attributes for effect-driven shaders */
  readonly style: ResolvedStyleAttrs;
}

/** What a shader returns — partial overrides */
export interface ShaderOutput {
  char?: string;
  fg?: RGB | null;
  bg?: RGB | null;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  blink?: boolean;
  reverse?: boolean;
  hidden?: boolean;
}

/** Uniforms available to all shaders */
export interface ShaderUniforms {
  readonly time: number;
  readonly tick: number;
  readonly cols: number;
  readonly rows: number;
  readonly plan: LayoutPlan;
  readonly custom: Record<string, unknown>;
}

/** Read a neighboring cell from the source grid */
export type NeighborFn = (dx: number, dy: number) => ShaderCell | null;

/** Core shader function */
export type ShaderFn = (x: number, y: number, cell: ShaderCell, uniforms: ShaderUniforms, neighbors: NeighborFn) => ShaderOutput | null;

/** A configured shader */
export interface CellShader {
  readonly name: string;
  readonly fn: ShaderFn;
  readonly regions?: string[];
  readonly processOpaque?: boolean;
  readonly enabled?: boolean;
}
