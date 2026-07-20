import { measureTextWidth } from '@celestial/rosetta';
import { describe, expect, it } from 'vitest';
import { findInteractiveNodes } from '../interactions.js';
import { parseCodeBlockInfoString } from '../parser/codeblock-meta.js';
import { parseMarkdown } from '../parser/index.js';
import { renderMarkdown } from '../renderer.js';
import { createTheme } from '../theme.js';
import type { RenderOptions, Token } from '../types.js';
import { markdown, type VNode } from '../vnode.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

function resolveFirstBlock(source: string, width: number, options?: RenderOptions): VNode {
  const vnode = markdown(source, options);
  if (vnode.kind !== 'column') throw new Error('expected document column');
  const block = vnode.children[0]!;
  if (block.kind !== 'component') return block;
  const space = { cols: width, rows: 100 };
  return block.render({ terminal: space, available: space, container: space });
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

  it('parses split-view and explicit wrapping modes', () => {
    const result = parseCodeBlockInfoString('diff view=split wraps=soft');
    expect(result.meta?.view).toBe('split');
    expect(result.meta?.wraps).toBe('soft');
  });

  it('bounds hostile numeric metadata', () => {
    const result = parseCodeBlockInfoString('ts {1-999999999} start=-5 fold=-10');
    expect(result.meta?.highlightLines?.length).toBeLessThanOrEqual(100_000);
    expect(result.meta?.startLine).toBe(1);
    expect(result.meta?.fold).toBe(2);
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

  it('soft-wraps long code lines without dropping content', () => {
    const source = 'abcdefghijklmnopqrstuvwxyz';
    const out = stripAnsi(renderMarkdown(`\`\`\`text wrap\n${source}\n\`\`\``, { width: 12 }));
    const body = out
      .split('\n')
      .filter((line) => !line.startsWith('┌') && !line.startsWith('└'))
      .map((line) => line.trim())
      .join('');
    expect(body).toBe(source);
    expect(out.split('\n').every((line) => line.length <= 12)).toBe(true);
  });

  it('indents the entire built-in frame within the render width', () => {
    const out = stripAnsi(renderMarkdown('```text copy\nvalue\n```', { width: 16, indent: 4 }));
    expect(out.split('\n').every((line) => line.startsWith('    '))).toBe(true);
    expect(out.split('\n').every((line) => line.length <= 16)).toBe(true);
  });
});

describe('markdown() VNode code-block enrichment', () => {
  it('emits a live-width component for a plain code block', () => {
    const vnode = markdown('```ts\nconst a = 1;\n```');
    if (vnode.kind !== 'column') throw new Error('expected column');
    const block = vnode.children[0]!;
    expect(block.kind).toBe('component');
    if (block.kind !== 'component') return;
    const space = { cols: 24, rows: 20 };
    const rendered = block.render({ terminal: space, available: space, container: space });
    expect(rendered.kind).toBe('text');
    if (rendered.kind === 'text') expect(stripAnsi(rendered.content)).toContain('const a = 1;');
  });

  it('keeps copy metadata discoverable through the responsive component', () => {
    const vnode = markdown('```ts copy\nconst a = 1;\n```');
    const copy = findInteractiveNodes(vnode).find(({ data }) => data.kind === 'copy');
    expect(copy?.data).toEqual({ kind: 'copy', code: 'const a = 1;', language: 'ts' });
  });

  it('passes the live width to custom fence renderers', () => {
    const rendered = resolveFirstBlock('```custom\nvalue\n```', 17, {
      fenceRenderers: { custom: (_token, context) => `custom:${context.width}` },
    });
    expect(rendered).toMatchObject({ kind: 'text', content: 'custom:17' });
  });

  it('soft-wraps VNode code without dropping the final character', () => {
    const source = 'abcdefghijklmnopq';
    const rendered = resolveFirstBlock(`\`\`\`text wrap\n${source}\n\`\`\``, 12);
    expect(rendered.kind).toBe('column');
    if (rendered.kind !== 'column') return;
    const plainLines = rendered.children.map((node) => (node.kind === 'text' ? stripAnsi(node.content) : ''));
    expect(plainLines.every((line) => measureTextWidth(line) <= 12)).toBe(true);
    expect(plainLines.slice(1, -1).join('').replace(/\s/gu, '')).toBe(source);
  });

  it('prioritizes code content over gutters at one-cell widths', () => {
    const rendered = resolveFirstBlock('```text numbers wrap {1}\nab\n```', 1);
    expect(rendered.kind).toBe('column');
    if (rendered.kind !== 'column') return;
    const plainLines = rendered.children.map((node) => (node.kind === 'text' ? stripAnsi(node.content) : ''));

    expect(plainLines.every((line) => measureTextWidth(line) <= 1)).toBe(true);
    expect(plainLines.slice(1, -1).join('')).toBe('ab');
  });

  it('uses semantic diff styles in VNode mode', () => {
    const theme = createTheme({ diffAdded: (line) => `ADD:${line}` });
    const rendered = resolveFirstBlock('```diff\n+added\n```', 30, { theme });
    expect(rendered.kind).toBe('column');
    if (rendered.kind !== 'column') return;
    expect(rendered.children.some((node) => node.kind === 'text' && node.content.includes('ADD:'))).toBe(true);
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
    const foldNode = findInteractiveNodes(vnode).find(({ data }) => data.kind === 'fold-toggle');
    expect(foldNode).toBeDefined();
  });
});
