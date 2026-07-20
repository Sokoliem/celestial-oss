import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../renderer.js';
import type { FenceRenderer } from '../types.js';

const SAMPLE = '```ts\nconst x = 1;\n```\n';

describe('fenceRenderers', () => {
  it('preserves byte-identical output when option is unset', () => {
    const before = renderMarkdown(SAMPLE);
    const after = renderMarkdown(SAMPLE, { fenceRenderers: undefined });
    expect(after).toBe(before);
  });

  it('preserves byte-identical output when no key matches the fence language', () => {
    const baseline = renderMarkdown(SAMPLE);
    const renderer: FenceRenderer = vi.fn(() => 'should not run');
    const result = renderMarkdown(SAMPLE, { fenceRenderers: { python: renderer } });
    expect(renderer).not.toHaveBeenCalled();
    expect(result).toBe(baseline);
  });

  it('substitutes the rendered string when a matching renderer returns one', () => {
    const renderer: FenceRenderer = (token, ctx) => {
      expect(token.type).toBe('code-block');
      expect(token.language).toBe('diff');
      expect(typeof ctx.width).toBe('number');
      expect(typeof ctx.theme.code).toBe('function');
      return `[diff fence: ${token.content.length} bytes]`;
    };

    const result = renderMarkdown('```diff\n+a\n-b\n```\n', { fenceRenderers: { diff: renderer } });
    expect(result).toContain('[diff fence: 5 bytes]');
    // The default spectrum-styled body must NOT appear.
    expect(result).not.toContain('+a\n-b');
  });

  it('falls through to default rendering when the renderer returns null', () => {
    const renderer: FenceRenderer = () => null;
    const baseline = renderMarkdown(SAMPLE);
    const result = renderMarkdown(SAMPLE, { fenceRenderers: { ts: renderer } });
    expect(result).toBe(baseline);
  });

  it('preserves the host indent prefix on each line of the custom output', () => {
    const renderer: FenceRenderer = () => 'line one\nline two\nline three';
    const result = renderMarkdown('```diff\n+a\n```\n', { fenceRenderers: { diff: renderer }, indent: 4 });
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line.startsWith('    ')).toBe(true);
    }
  });

  it('passes the parsed CodeBlockMeta through to the renderer', () => {
    const renderer: FenceRenderer = vi.fn(() => 'ok');
    renderMarkdown('```ts {3-5} numbers\nconst x = 1;\n```\n', { fenceRenderers: { ts: renderer } });

    expect(renderer).toHaveBeenCalledTimes(1);
    const [token] = (renderer as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(token.meta?.highlightLines).toEqual([3, 4, 5]);
    expect(token.meta?.showLineNumbers).toBe(true);
  });
});
