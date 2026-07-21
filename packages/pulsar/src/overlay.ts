import { color, style } from '@celestial/corona';
import { column, computed, empty, type ScrollNode, type Signal, scroll, signal, text } from '@celestial/nebula';
import { createMarkdownStream } from './stream.js';
import { defaultTheme } from './theme.js';
import type { MarkdownTheme, RenderOptions } from './types.js';

export interface OverlayRendererConfig {
  readonly content: string | AsyncIterable<string>;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly style?: OverlayStyle;
  readonly prefetch?: number;
}

export interface OverlayStyle {
  readonly density: 'compact' | 'comfortable';
  readonly theme?: MarkdownTheme;
  readonly lineHighlight?: (line: number) => boolean;
}

export interface ScrollAnchor {
  readonly topLine: number;
}

export interface OverlayRenderer {
  readonly vnode: Signal<ScrollNode>;
  readonly lineCount: Signal<number>;
  scrollTo(line: number): void;
  captureAnchor(): ScrollAnchor;
  restoreAnchor(anchor: ScrollAnchor): void;
  dispose(): void;
}

const OVERLAY_PREFETCH = 20;
const MAX_OVERLAY_DIMENSION = 100_000;

function normalizeDimension(value: number, fallback: number, minimum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_OVERLAY_DIMENSION, Math.max(minimum, Math.floor(value)));
}

function normalizeLine(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function createOverlayTheme(base: MarkdownTheme): MarkdownTheme {
  const subdued = style({ dim: true });
  const accent = style({ color: color.cyan, bold: true });
  const muted = style({ color: color.gray, dim: true });

  return {
    ...base,
    heading1: (text) => accent.render(text),
    heading2: (text) => subdued.render(base.heading2(text)),
    heading3: (text) => subdued.render(base.heading3(text)),
    heading4: (text) => muted.render(base.heading4(text)),
    heading5: (text) => muted.render(base.heading5(text)),
    heading6: (text) => muted.render(base.heading6(text)),
    blockquote: (text) => subdued.render(base.blockquote(text)),
    tableBorder: subdued.render(base.tableBorder),
    taskChecked: subdued.render(base.taskChecked),
    taskUnchecked: subdued.render(base.taskUnchecked),
  };
}

function normalizeRenderedLines(lines: readonly string[], density: OverlayStyle['density']): string[] {
  if (density === 'compact') {
    return lines.filter((line) => line.trim() !== '');
  }

  const result: string[] = [];
  let lastBlank = false;

  for (const line of lines) {
    const blank = line.trim() === '';
    if (blank) {
      if (!lastBlank && result.length > 0) {
        result.push('');
      }
      lastBlank = true;
      continue;
    }

    result.push(line);
    lastBlank = false;
  }

  while (result[0] === '') result.shift();
  while (result[result.length - 1] === '') result.pop();

  return result;
}

function splitInputIntoChunks(source: string, chunkSize = 4096): string[] {
  if (source.length <= chunkSize) return [source];

  const chunks: string[] = [];
  let index = 0;

  while (index < source.length) {
    let end = Math.min(source.length, index + chunkSize);
    if (end < source.length) {
      const newline = source.lastIndexOf('\n', end);
      if (newline > index) {
        end = newline + 1;
      }
    }
    chunks.push(source.slice(index, end));
    index = end;
  }

  return chunks;
}

function buildViewport(lines: readonly string[], topLine: number, maxHeight: number, prefetch: number, highlight: (line: number) => boolean): ScrollNode {
  const start = Math.max(0, topLine - prefetch);
  const end = Math.min(lines.length, topLine + maxHeight + prefetch);
  const topSpacer = empty(0, start);
  const bottomSpacer = empty(0, Math.max(0, lines.length - end));
  const visible = lines.slice(start, end).map((line, index) => text(line, highlight(start + index) ? style({ bold: true }) : undefined, { wrap: false }));

  return scroll(column(topSpacer, ...visible, bottomSpacer), { height: maxHeight, offset: topLine });
}

async function collectAsyncContent(content: AsyncIterable<string>, onChunk: (chunk: string) => void, isActive: () => boolean): Promise<void> {
  for await (const chunk of content) {
    if (!isActive()) return;
    onChunk(chunk);
  }
}

export function overlayRenderer(config: OverlayRendererConfig): OverlayRenderer {
  const styleConfig = config.style?.density === 'comfortable' ? config.style : { ...config.style, density: 'compact' as const };
  const theme = createOverlayTheme(styleConfig.theme ?? defaultTheme());
  const maxWidth = normalizeDimension(config.maxWidth, 80, 1);
  const maxHeight = normalizeDimension(config.maxHeight, 24, 1);
  const prefetch = normalizeDimension(config.prefetch ?? OVERLAY_PREFETCH, OVERLAY_PREFETCH, 0);
  const renderOptions: RenderOptions = {
    width: maxWidth,
    theme,
  };
  const stream = createMarkdownStream(renderOptions);

  const [rendered, setRendered] = signal('');
  const [topLine, setTopLine] = signal(0);
  let disposed = false;

  const updateFromSnapshot = (finalize = false): void => {
    const snapshot = stream.snapshot({ finalize });
    const normalized = normalizeRenderedLines(snapshot.rendered.split('\n'), styleConfig.density);
    setRendered(normalized.join('\n'));

    const maxTop = Math.max(0, normalized.length - maxHeight);
    if (topLine() > maxTop) {
      setTopLine(maxTop);
    }
  };

  const appendChunk = (chunk: string): void => {
    if (disposed) return;
    const snapshot = stream.append(chunk);
    const normalized = normalizeRenderedLines(snapshot.rendered.split('\n'), styleConfig.density);
    setRendered(normalized.join('\n'));
    const maxTop = Math.max(0, normalized.length - maxHeight);
    if (topLine() > maxTop) {
      setTopLine(maxTop);
    }
  };

  if (typeof config.content === 'string') {
    for (const chunk of splitInputIntoChunks(config.content)) {
      if (disposed) break;
      stream.append(chunk);
    }
    updateFromSnapshot(true);
  } else {
    void collectAsyncContent(
      config.content,
      (chunk) => {
        appendChunk(chunk);
      },
      () => !disposed,
    )
      .then(() => {
        if (!disposed) updateFromSnapshot(true);
      })
      .catch(() => {
        if (!disposed) updateFromSnapshot(true);
      });
  }

  const lines = computed(() => {
    const current = rendered();
    return current ? current.split('\n') : [];
  });

  const highlight = (line: number): boolean => {
    try {
      return styleConfig.lineHighlight?.(line) === true;
    } catch {
      return false;
    }
  };
  const vnode = computed(() => buildViewport(lines(), topLine(), maxHeight, prefetch, highlight));

  return {
    vnode,
    lineCount: computed(() => lines().length),
    scrollTo(line: number): void {
      const maxTop = Math.max(0, lines().length - maxHeight);
      setTopLine(Math.min(normalizeLine(line), maxTop));
    },
    captureAnchor(): ScrollAnchor {
      return { topLine: topLine() };
    },
    restoreAnchor(anchor: ScrollAnchor): void {
      const maxTop = Math.max(0, lines().length - maxHeight);
      setTopLine(Math.min(normalizeLine(anchor?.topLine), maxTop));
    },
    dispose(): void {
      disposed = true;
    },
  };
}
