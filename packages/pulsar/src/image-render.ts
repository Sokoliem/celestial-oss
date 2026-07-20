/**
 * Inline Image Rendering (A1)
 *
 * The focused public preview renders safe styled placeholders. Binary image
 * protocol encoding remains outside the preview boundary, so Markdown never
 * emits unverified terminal control sequences from image data.
 *
 * The consumer is responsible for fetching network assets and providing them
 * as buffers; pulsar never initiates network requests.
 */

import type { MarkdownTheme, RenderOptions, TerminalCapabilities } from './types.js';
import { wrapText } from './renderer/wrap.js';

export interface ImageRenderContext {
  readonly theme: MarkdownTheme;
  readonly options: RenderOptions;
  readonly width: number;
}

/**
 * Synchronous best-effort image render.
 *
 * Always returns a placeholder in the focused public preview.
 */
export function renderImage(token: { alt: string; url: string; title?: string }, ctx: ImageRenderContext, buffer?: Uint8Array): string {
  void buffer;
  const width = Number.isFinite(ctx.width) ? Math.max(1, Math.min(1_000_000, Math.floor(ctx.width))) : 80;
  return wrapText(ctx.theme.imagePlaceholder(token.alt, token.url), width, '');
}

/**
 * Async-compatible placeholder path. This preserves the full API shape while
 * keeping the preview deterministic and free of private rendering peers.
 */
export function renderImageAsync(token: { alt: string; url: string; title?: string }, ctx: ImageRenderContext, buffer?: Uint8Array): Promise<string> {
  return Promise.resolve(renderImage(token, ctx, buffer));
}

/**
 * Choose the richest image protocol available based on capabilities.
 */
export function bestImageProtocol(caps: TerminalCapabilities): TerminalCapabilities['imageProtocol'] {
  const order: TerminalCapabilities['imageProtocol'][] = ['kitty', 'sixel', 'iterm', 'blocks', 'braille'];
  for (const p of order) {
    if (caps.imageProtocol === p) return p;
  }
  return 'none';
}
