import { describe, expect, it } from 'vitest';
import { parseCodeBlockInfoString } from '../parser/codeblock-meta.js';
import { parseMarkdown } from '../parser/index.js';
import { renderMarkdown } from '../renderer.js';
import type { Token } from '../types.js';
import { markdown } from '../vnode.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('parseCodeBlockInfoString', () => {
  it('returns just the language when no extra meta is present', () => {
    expect(parseCodeBlockInfoString('typescript')).toEqual({ language: 'typescript' });
  });

  it('parses a highlight-range block', () => {
    expect(parseCodeBlockInfoString('ts {3-5,7}')).toEqual({
      language: 'ts',
      meta: { highlightLines: [3, 4, 5, 7] },
    });
  });

  it('parses bare boolean tokens', () => {
    const result = parseCodeBlockInfoString('ts numbers copy');
    expect(result.language).toBe('ts');
    expect(result.meta?.showLineNumbers).toBe(true);
    expect(result.meta?.copy).toBe(true);
  });

  it('parses key=value pairs', () => {
    const result = parseCodeBlockInfoString('ts start=10 numbers=true diff=false');
    expect(result.meta?.startLine).toBe(10);
    expect(result.meta?.showLineNumbers).toBe(true);
    // Explicit diff=false records the literal false (caller can distinguish
    // "explicitly disabled" from "not set" if they care).
    expect(result.meta?.diff).toBe(false);
  });

  it('ignores unknown tokens', () => {
    expect(parseCodeBlockInfoString('ts unknownKey=42 alien').meta).toBeUndefined();
  });

  it('returns undefined meta when no meta tokens are present', () => {
    expect(parseCodeBlockInfoString('   ')).toEqual({ language: '' });
  });
});

describe('parseMarkdown code-block meta wiring', () => {
  it('attaches meta to the token when info string includes highlight ranges', () => {
    const tokens = parseMarkdown('```ts {3-5}\nconst a = 1;\n```');
    const block = tokens[0] as Extract<Token, { type: 'code-block' }>;
    expect(block.language).toBe('ts');
    expect(block.meta).toEqual({ highlightLines: [3, 4, 5] });
  });

  it('falls back to bare language when no meta is supplied', () => {
    const tokens = parseMarkdown('```ts\nconst a = 1;\n```');
    const block = tokens[0] as Extract<Token, { type: 'code-block' }>;
    expect(block.language).toBe('ts');
    expect(block.meta).toBeUndefined();
  });
});

describe('renderMarkdown code-block enrichment', () => {
  it('renders a line-number gutter when requested', () => {
    const out = stripAnsi(renderMarkdown('```ts numbers\nconst a = 1;\nconst b = 2;\n```'));
    expect(out).toMatch(/1 │ /);
    expect(out).toMatch(/2 │ /);
  });

  it('renders a [copy] affordance when requested', () => {
    const out = stripAnsi(renderMarkdown('```ts copy\nconst a = 1;\n```'));
    expect(out).toContain('[copy]');
  });

  it('marks highlighted lines with the highlight glyph', () => {
    const out = stripAnsi(renderMarkdown('```ts {2}\na\nb\nc\n```'));
    expect(out).toContain('▎ ');
  });

  it('honours start=N for line numbering', () => {
    const out = stripAnsi(renderMarkdown('```ts numbers start=42\na\nb\n```'));
    expect(out).toMatch(/42 │ /);
    expect(out).toMatch(/43 │ /);
  });

  it('preserves the existing plain code-block render when no meta is set', () => {
    const out = stripAnsi(renderMarkdown('```ts\nconst a = 1;\n```'));
    expect(out).not.toMatch(/^\s*1 │/);
    expect(out).not.toContain('[copy]');
  });
});

describe('markdown() VNode code-block enrichment', () => {
  it('emits a single text node for a plain code block (back-compat)', () => {
    const vnode = markdown('```ts\nconst a = 1;\n```');
    if (vnode.kind !== 'column') throw new Error('expected column');
    const block = vnode.children[0]!;
    expect(block.kind).toBe('text');
  });

  it('emits a column with a copy-tagged VNode when meta.copy is true', () => {
    const vnode = markdown('```ts copy\nconst a = 1;\n```');
    if (vnode.kind !== 'column') throw new Error('expected column');
    const block = vnode.children[0]!;
    expect(block.kind).toBe('column');
    if (block.kind !== 'column') return;
    const copyNode = block.children.find((n) => n.kind === 'text' && n.data?.kind === 'copy');
    expect(copyNode).toBeDefined();
    if (copyNode && copyNode.kind === 'text' && copyNode.data?.kind === 'copy') {
      expect(copyNode.data.code).toBe('const a = 1;');
      expect(copyNode.data.language).toBe('ts');
    }
  });
});

describe('code-block fold', () => {
  it('folds code blocks with more than 25 lines by default', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const out = stripAnsi(renderMarkdown('```ts fold\n' + lines.join('\n') + '\n```'));
    expect(out).toContain('+6 lines (click to expand)');
  });

  it('does not fold when fold is false', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const out = stripAnsi(renderMarkdown('```ts fold=false\n' + lines.join('\n') + '\n```'));
    expect(out).not.toContain('(click to expand)');
    expect(out).toContain('line 30');
  });

  it('uses custom fold threshold', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `line ${i + 1}`);
    const out = stripAnsi(renderMarkdown('```ts fold=10\n' + lines.join('\n') + '\n```'));
    expect(out).toContain('+6 lines (click to expand)');
  });

  it('emits fold-toggle data in VNode mode', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const vnode = markdown('```ts fold\n' + lines.join('\n') + '\n```');
    if (vnode.kind !== 'column') throw new Error('expected column');
    const block = vnode.children[0]!;
    expect(block.kind).toBe('column');
    if (block.kind !== 'column') return;
    const foldNode = block.children.find((n) => n.kind === 'text' && n.data?.kind === 'fold-toggle');
    expect(foldNode).toBeDefined();
  });
});
