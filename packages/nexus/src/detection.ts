/**
 * Compatibility shim for simplified capability detection.
 *
 * Wraps the richer detectCapabilities() from capabilities.ts and exposes
 * the leaner { hyperlinks, mouseTracking, trueColor, images } shape that
 * older callers expect. Results are cached after the first call.
 *
 * Prefer importing directly from capabilities.ts for new code.
 */

import { detectCapabilities as detectFull, type TerminalCapabilities as FullCapabilities } from './capabilities.js';

export interface TerminalCapabilities {
  hyperlinks: boolean;
  mouseTracking: boolean;
  trueColor: boolean;
  images: FullCapabilities['images'];
}

let cachedCapabilities: TerminalCapabilities | null = null;

/**
 * Detect terminal capabilities by inspecting environment variables.
 * Results are cached after the first call.
 */
export function detectCapabilities(): TerminalCapabilities {
  if (cachedCapabilities !== null) return cachedCapabilities;

  const full = detectFull();
  cachedCapabilities = {
    hyperlinks: full.hyperlinks,
    mouseTracking: full.mouse,
    trueColor: full.color === 'truecolor',
    images: full.images,
  };

  return cachedCapabilities;
}

/** Check if terminal supports OSC 8 hyperlinks */
export function supportsHyperlinks(): boolean {
  return detectCapabilities().hyperlinks;
}

/** Check if terminal supports SGR 1006 mouse tracking */
export function supportsMouseTracking(): boolean {
  return detectCapabilities().mouseTracking;
}

/** Reset the capability cache (for testing purposes) */
export function _resetCache(): void {
  cachedCapabilities = null;
}
