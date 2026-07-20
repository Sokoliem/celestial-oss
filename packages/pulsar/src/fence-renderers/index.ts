/**
 * Built-in fence renderers
 *
 * Register these via `options.fenceRenderers`:
 *
 *   ```ts
 *   import { mermaidFenceRenderer } from '@celestial/pulsar/fence-renderers';
 *   markdown(source, {
 *     fenceRenderers: { mermaid: mermaidFenceRenderer },
 *   })
 *   ```
 */

export { chartFenceRenderer } from './chart.js';
export { csvFenceRenderer } from './csv.js';
export { diffSplitFenceRenderer } from './diff-split.js';
export { httpFenceRenderer } from './http.js';
export { jsonFenceRenderer } from './json.js';
export { mermaidFenceRenderer } from './mermaid.js';
export { sqlFenceRenderer } from './sql.js';
