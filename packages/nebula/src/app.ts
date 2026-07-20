/**
 * Nebula App Runtime
 *
 * Public facade for the Elm Architecture event loop. Runtime internals live
 * in ./app/* so direct imports from ./app.js continue to resolve here.
 */

export type { AppConfig, AppHandle, AppOptions, RenderFrameTelemetry, ReplaceConfigOptions, SchedulerConfig } from './app/contracts.js';
export { app } from './app/runtime.js';
