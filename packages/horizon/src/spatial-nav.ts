/**
 * Horizon spatial-nav integration — re-exports nexus's spatial-nav primitives
 * so horizon-level layouts (workspace tabs, splitter focus chains, canvas-like
 * grids) can build a positional nav map without piping nexus imports through
 * each consumer.
 */

export type { SpatialDirection, SpatialNavMap, SpatialNavMsg, SpatialNavState, SpatialRegion } from '@celestial/core/nexus';
export { buildSpatialNavMap, createSpatialNavState, findSpatialNeighbor, spatialNavUpdate } from '@celestial/core/nexus';
