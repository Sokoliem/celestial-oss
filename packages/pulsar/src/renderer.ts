/**
 * Pulsar renderer barrel — see `./renderer/` for the decomposed implementation.
 *
 * Exists as a thin re-export so existing callers `import … from './renderer.js'`
 * continue to work.
 */

export { injectAnsiCodes, renderMarkdown } from './renderer/index.js';
