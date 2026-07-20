/**
 * Pulsar parser barrel — see `./parser/` for the decomposed implementation.
 *
 * Exists as a thin re-export so existing callers `import … from './parser.js'`
 * continue to work.
 */

export { getEmoji, parseInline, parseMarkdown, registerEmoji } from './parser/index.js';
