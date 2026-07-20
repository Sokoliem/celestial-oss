import { describe, expect, it } from 'vitest';
import { overlayRenderer } from '../overlay.js';

function collectText(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const value = node as { kind?: string; content?: string; child?: unknown; children?: unknown[] };

  if (value.kind === 'text' && typeof value.content === 'string') {
    return [value.content];
  }

  if (value.kind === 'scroll') {
    return collectText(value.child);
  }

  if (Array.isArray(value.children)) {
    return value.children.flatMap((child) => collectText(child));
  }

  if (value.child) {
    return collectText(value.child);
  }

  return [];
}

describe('overlayRenderer', () => {
  it('virtualizes the rendered window and preserves scroll anchors', () => {
    const content = ['# Overlay', '', 'Line one', '', 'Line two', '', 'Line three', '', 'Line four', '', 'Line five', '', 'Line six'].join('\n');

    const renderer = overlayRenderer({
      content,
      maxWidth: 80,
      maxHeight: 3,
      prefetch: 1,
      style: {
        density: 'compact',
        lineHighlight: (line) => line === 2,
      },
    });

    expect(renderer.lineCount()).toBeGreaterThanOrEqual(6);

    renderer.scrollTo(2);
    const firstViewport = renderer.vnode() as { kind: 'scroll'; height: number; offset: number; child: unknown };
    expect(firstViewport.kind).toBe('scroll');
    expect(firstViewport.height).toBe(3);
    expect(firstViewport.offset).toBe(2);
    {
      const renderedLines = collectText(firstViewport);
      expect(renderedLines.length).toBeLessThan(renderer.lineCount());
      expect(renderedLines.some((line) => line.includes('Line three'))).toBe(true);
    }

    const anchor = renderer.captureAnchor();
    expect(anchor).toEqual({ topLine: 2 });

    const resized = overlayRenderer({
      content,
      maxWidth: 80,
      maxHeight: 2,
      prefetch: 1,
      style: {
        density: 'compact',
      },
    });

    resized.restoreAnchor(anchor);
    const restoredViewport = resized.vnode() as { kind: 'scroll'; height: number; offset: number; child: unknown };
    expect(restoredViewport.kind).toBe('scroll');
    expect(restoredViewport.offset).toBe(2);
    expect(collectText(restoredViewport).some((line) => line.includes('Line three'))).toBe(true);
  });

  it('applies the line highlight predicate to the materialized line', () => {
    const renderer = overlayRenderer({
      content: ['Line one', '', 'Line two', '', 'Line three'].join('\n'),
      maxWidth: 80,
      maxHeight: 3,
      style: {
        density: 'compact',
        lineHighlight: (line) => line === 1,
      },
    });

    const root = renderer.vnode() as { kind: 'scroll'; child: { kind?: string; children?: unknown[] } };
    expect(root.kind).toBe('scroll');
    const viewport = root.child;
    expect(viewport.kind).toBe('column');
    if (viewport.kind === 'column' && viewport.children) {
      const highlighted = viewport.children.find(
        (child) => child && typeof child === 'object' && 'content' in child && (child as { content?: string }).content?.includes('Line two'),
      ) as { style?: { bold?: boolean } } | undefined;
      expect(highlighted?.style?.bold).toBe(true);
    }
  });

  it('preserves blank spacing in comfortable density mode', () => {
    const compact = overlayRenderer({
      content: ['Help', '', 'Details'].join('\n'),
      maxWidth: 80,
      maxHeight: 3,
      style: {
        density: 'compact',
      },
    });

    const comfortable = overlayRenderer({
      content: ['Help', '', 'Details'].join('\n'),
      maxWidth: 80,
      maxHeight: 3,
      style: {
        density: 'comfortable',
      },
    });

    expect(comfortable.lineCount()).toBeGreaterThan(compact.lineCount());
    expect(collectText(comfortable.vnode()).join('\n')).toContain('Details');
  });

  it('keeps partial content when async overlay sources fail', async () => {
    async function* chunks(): AsyncIterable<string> {
      yield '# Overlay\n\nLine one';
      throw new Error('stream failed');
    }

    const renderer = overlayRenderer({
      content: chunks(),
      maxWidth: 80,
      maxHeight: 3,
      style: {
        density: 'compact',
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    const rendered = collectText(renderer.vnode()).join('\n');
    expect(rendered).toContain('Overlay');
    expect(renderer.lineCount()).toBeGreaterThan(0);
  });
});
