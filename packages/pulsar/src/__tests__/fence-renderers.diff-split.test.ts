import { describe, expect, it } from 'vitest';
import { diffSplitFenceRenderer } from '../fence-renderers/diff-split.js';
import { defaultTheme } from '../theme.js';
import type { FenceRenderContext } from '../types.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function ctx(width: number): FenceRenderContext {
  return {
    theme: defaultTheme(),
    options: {},
    width,
    indent: 0,
  };
}

describe('diffSplitFenceRenderer', () => {
  it('falls back to null when width < 80', () => {
    const token = { type: 'code-block' as const, language: 'diff', content: '-a\n+b' };
    const result = diffSplitFenceRenderer(token, ctx(60));
    expect(result).toBeNull();
  });

  it('renders a side-by-side diff for a simple hunk', () => {
    const token = {
      type: 'code-block' as const,
      language: 'diff',
      content: '@@ -1,2 +1,2 @@\n-hello\n+world\n unchanged',
    };
    const result = diffSplitFenceRenderer(token, ctx(120));
    expect(result).not.toBeNull();
    const plain = stripAnsi(result!);
    expect(plain).toContain('hello');
    expect(plain).toContain('world');
    expect(plain).toContain('unchanged');
  });

  it('colors deletions red and additions green', () => {
    const token = {
      type: 'code-block' as const,
      language: 'diff',
      content: '-removed\n+added',
    };
    const result = diffSplitFenceRenderer(token, ctx(120));
    expect(result).not.toBeNull();
    expect(result).toContain('\x1b[31m');
    expect(result).toContain('\x1b[32m');
  });

  it('renders hunk headers spanning the full width', () => {
    const token = {
      type: 'code-block' as const,
      language: 'diff',
      content: '@@ -1,1 +1,1 @@\n-old\n+new',
    };
    const result = diffSplitFenceRenderer(token, ctx(120));
    expect(result).not.toBeNull();
    const plain = stripAnsi(result!);
    expect(plain).toContain('@@ -1,1 +1,1 @@');
  });
});
