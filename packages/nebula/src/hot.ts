/**
 * Nebula Hot Plugin
 *
 * Public facade for hot-swap plugin contracts, raw config wrapping, migration,
 * and file watcher orchestration.
 */

export type { HotPlugin, HotPluginOptions } from './hot/contracts.js';
export { convertSub, isProperCmd, isProperSub, wrapRawConfig } from './hot/convert.js';
export { buildMigrate } from './hot/migration.js';
export { hotPlugin } from './hot/plugin.js';
