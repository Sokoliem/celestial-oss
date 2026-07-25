import { app } from '@celestial/core';
import { createHorizonWorkbenchApp } from './app.js';

app(createHorizonWorkbenchApp(), {
  onRenderError(error) {
    // The runtime deliberately keeps rendering after a caught error, so setting
    // exitCode rather than calling process.exit() preserves that resilience
    // while still making the process report failure on the way out. Without it
    // a crashed demo exits 0 and the PTY smoke jobs report green.
    process.exitCode = 1;
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`[horizon-workbench] render error: ${detail}\n`);
  },
});
