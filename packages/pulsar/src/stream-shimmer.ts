/**
 * Streaming shimmer (C2)
 *
 * Renders a markdown stream snapshot with skeleton placeholder glyphs
 * for the pending (uncommitted) region. Committed content renders normally;
 * pending content is replaced with dim shimmer lines.
 *
 * The preview uses a static, reduced-motion-safe skeleton. The `tick` option
 * remains in the API so consumers can opt into animation in a future release.
 *
 * Usage:
 *
 *   const shimmer = markdownStreamShimmer(stream.snapshot(), theme, { tick: 12 });
 *   // shimmer is a VNode column with committed lines + pending placeholders
 */

import { defaultProgressBarTokens, resolveGlyph } from '@celestial/corona';
import { measureTextWidth, sliceTextByWidth } from '@celestial/rosetta';
import { renderMarkdown } from './renderer.js';
import type { MarkdownStreamSnapshot, MarkdownTheme } from './types.js';
import type { VNode } from './vnode.js';

export interface StreamShimmerOptions {
  /** Animation tick for mirage shimmer band position. */
  readonly tick?: number;
  /** Respect reduced-motion preference — renders static grey skeleton. */
  readonly reduceMotion?: boolean;
  /** Viewport width in columns. */
  readonly width?: number;
}

function createSkeletonLine(width: number): string {
  const empty = resolveGlyph(defaultProgressBarTokens.empty, 'wide');
  const filled = resolveGlyph(defaultProgressBarTokens.filled, 'wide');
  const pattern = `${empty}${filled}`;
  const repeat = Math.ceil(width / measureTextWidth(pattern));
  return sliceTextByWidth(pattern.repeat(repeat), width);
}

function pendingToSkeletonLines(pendingSource: string, width: number): string[] {
  const lines = pendingSource.split('\n');
  const skeleton = createSkeletonLine(width);
  return lines.map((line) => (line.trim() === '' ? '' : sliceTextByWidth(skeleton, Math.min(measureTextWidth(line), width))));
}

/**
 * Render a stream snapshot with shimmer placeholders for pending content.
 */
export function markdownStreamShimmer(snapshot: MarkdownStreamSnapshot, theme: MarkdownTheme, options?: StreamShimmerOptions): VNode {
  const width = options?.width !== undefined && Number.isFinite(options.width) ? Math.max(1, Math.min(100_000, Math.floor(options.width))) : 80;
  const reduceMotion = options?.reduceMotion ?? false;

  // Render committed content
  let committedRendered = '';
  if (snapshot.committedSource.length > 0) {
    committedRendered = renderMarkdown(snapshot.committedSource, { theme, width });
  }

  // Build skeleton for pending region
  const pendingLines = pendingToSkeletonLines(snapshot.pendingSource, width);

  // Combine committed + pending lines
  const committedLines = committedRendered ? committedRendered.split('\n') : [];
  const allLines = [...committedLines, ...pendingLines];

  // Style: static dim for skeleton, normal for committed
  const children: VNode[] = allLines.map((line, index) => {
    const isPending = index >= committedLines.length;
    const content = line || ' ';
    if (isPending) {
      if (reduceMotion) {
        return { kind: 'text', content, style: { dim: true } };
      }
      // Apply subtle shimmer styling — dim with a slightly different tone
      // Full mirage shimmer requires per-glyph animation which is impractical
      // in a static VNode; we use a dim style with a skeleton glyph pattern.
      return { kind: 'text', content, style: { dim: true } };
    }
    return { kind: 'text', content };
  });

  return { kind: 'column', children };
}
