/**
 * Highlight API Tests
 *
 * Tests for the high-level highlight() and highlightCode() functions.
 */

import { describe, expect, it } from 'vitest';
import { highlight, highlightCode, highlightLineToVNodes, highlightPartial, highlightToVNodes, tokenizeCode } from '../highlight.js';
import { createTheme, getTheme } from '../themes.js';
import type { TokenizerState } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function hasAnsi(str: string): boolean {
  return /\x1b\[/.test(str);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('highlight', () => {
  it('returns empty string for empty input', () => {
    expect(highlight('', 'typescript')).toBe('');
  });

  it('returns unstyled code for unknown language', () => {
    const code = 'hello world';
    expect(highlight(code, 'brainfuck')).toBe(code);
  });

  it('produces styled output for known language', () => {
    const result = highlight('const x = 42', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('const x = 42');
  });

  it('preserves the text content through styling', () => {
    const code = 'function foo(x, y) { return x + y; }';
    const result = highlight(code, 'javascript');
    expect(stripAnsi(result)).toBe(code);
  });

  it('handles multi-line code', () => {
    const code = 'const x = 1;\nconst y = 2;';
    const result = highlight(code, 'typescript');
    const lines = result.split('\n');
    expect(lines.length).toBe(2);
    expect(stripAnsi(result)).toBe(code);
  });

  it('handles block comments across lines', () => {
    const code = '/* start\nend */';
    const result = highlight(code, 'typescript');
    expect(stripAnsi(result)).toBe(code);
  });

  it('accepts a theme name string', () => {
    const r1 = highlight('const x = 1', 'typescript', 'monokai');
    const r2 = highlight('const x = 1', 'typescript', 'github');
    expect(hasAnsi(r1)).toBe(true);
    expect(hasAnsi(r2)).toBe(true);
    // Different themes should produce different ANSI codes
    expect(r1).not.toBe(r2);
  });

  it('accepts a theme object', () => {
    const theme = getTheme('dracula');
    const result = highlight('const x = 1', 'typescript', theme);
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('const x = 1');
  });

  it('accepts a custom theme', () => {
    const theme = createTheme({
      keyword: (t) => `[K:${t}]`,
      number: (t) => `[N:${t}]`,
      variable: (t) => t,
      operator: (t) => t,
      text: (t) => t,
    });
    const result = highlight('const x = 42', 'typescript', theme);
    expect(result).toContain('[K:const]');
    expect(result).toContain('[N:42]');
  });

  it('defaults to the default theme', () => {
    const result = highlight('const x', 'typescript');
    expect(hasAnsi(result)).toBe(true);
  });
});

describe('highlightCode', () => {
  it('accepts an options object', () => {
    const result = highlightCode('const x = 1', { language: 'typescript' });
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('const x = 1');
  });

  it('accepts theme in options', () => {
    const result = highlightCode('const x', { language: 'typescript', theme: 'monokai' });
    expect(hasAnsi(result)).toBe(true);
  });
});

describe('tokenizeCode', () => {
  it('returns null for unknown language', () => {
    expect(tokenizeCode('hello', 'brainfuck')).toBeNull();
  });

  it('returns tokens for known language', () => {
    const tokens = tokenizeCode('const x = 42', 'typescript');
    expect(tokens).not.toBeNull();
    expect(tokens!.length).toBeGreaterThan(0);
  });

  it('returns tokens with correct categories', () => {
    const tokens = tokenizeCode('const x = 42', 'typescript')!;
    const keyword = tokens.find((t) => t.text === 'const');
    expect(keyword).toBeDefined();
    expect(keyword!.category).toBe('keyword');

    const num = tokens.find((t) => t.text === '42');
    expect(num).toBeDefined();
    expect(num!.category).toBe('number');
  });

  it('includes newline tokens between lines', () => {
    const tokens = tokenizeCode('a\nb', 'typescript')!;
    const newline = tokens.find((t) => t.text === '\n');
    expect(newline).toBeDefined();
    expect(newline!.category).toBe('text');
  });

  it('preserves full text content', () => {
    const code = 'const x = 42';
    const tokens = tokenizeCode(code, 'typescript')!;
    const reconstructed = tokens.map((t) => t.text).join('');
    expect(reconstructed).toBe(code);
  });
});

describe('highlight — all languages produce valid output', () => {
  const testCases: Array<{ lang: string; code: string }> = [
    { lang: 'typescript', code: 'const x: number = 42;' },
    { lang: 'javascript', code: 'const x = 42;' },
    { lang: 'python', code: 'def foo(x): return x + 1' },
    { lang: 'bash', code: 'echo "hello" | grep hello' },
    { lang: 'go', code: 'func main() { fmt.Println("hello") }' },
    { lang: 'rust', code: 'fn main() { println!("hello"); }' },
    { lang: 'ruby', code: 'def hello; puts "hi"; end' },
    { lang: 'java', code: 'public class Main { public static void main(String[] args) {} }' },
    { lang: 'c', code: '#include <stdio.h>\nint main() { return 0; }' },
    { lang: 'cpp', code: '#include <iostream>\nint main() { std::cout << "hi"; }' },
    { lang: 'csharp', code: 'public class Program { static void Main() {} }' },
    { lang: 'json', code: '{"key": "value", "n": 42, "b": true}' },
    { lang: 'yaml', code: 'name: test\nversion: 1' },
    { lang: 'css', code: '.foo { color: red; display: flex; }' },
    { lang: 'scss', code: '$spacing: 1rem;\n.button { &:hover { color: red; } }' },
    { lang: 'html', code: '<div class="foo">hello</div>' },
    { lang: 'sql', code: 'SELECT id, name FROM users WHERE active = true ORDER BY name;' },
    { lang: 'dockerfile', code: 'FROM node:20\nRUN npm install' },
    { lang: 'makefile', code: 'all: build\n\t$(CC) $< -o $@' },
    { lang: 'gitignore', code: 'node_modules/\n!dist/\n*.log' },
    { lang: 'markdown', code: '# Hello\n**bold** and *italic*' },
    { lang: 'toml', code: '[package]\nname = "test"\nversion = "1.0"' },
    { lang: 'diff', code: '+added\n-removed\n context' },
    { lang: 'php', code: '<?php echo "hello"; ?>' },
    { lang: 'swift', code: 'func greet() { print("hello") }' },
    { lang: 'kotlin', code: 'fun main() { println("hello") }' },
    { lang: 'lua', code: 'local function foo() print("hello") end' },
  ];

  for (const { lang, code } of testCases) {
    it(`${lang}: produces styled output preserving text`, () => {
      const result = highlight(code, lang);
      expect(stripAnsi(result)).toBe(code);
    });
  }
});

describe('highlight — all themes work', () => {
  const themes = ['default', 'monokai', 'github', 'dracula', 'solarized'] as const;

  for (const theme of themes) {
    it(`${theme}: produces output for TypeScript`, () => {
      const result = highlight('const x = 42', 'typescript', theme);
      expect(stripAnsi(result)).toBe('const x = 42');
    });
  }
});

// ── VNode Highlight Tests ──────────────────────────────────────────────

describe('highlightToVNodes', () => {
  it('returns empty array for empty input', () => {
    expect(highlightToVNodes('', 'typescript')).toEqual([]);
  });

  it('returns one row VNode per source line', () => {
    const result = highlightToVNodes('const x = 1;\nconst y = 2;', 'typescript');
    expect(result).toHaveLength(2);
    expect(result[0]!.kind).toBe('row');
    expect(result[1]!.kind).toBe('row');
  });

  it('row children are text nodes', () => {
    const result = highlightToVNodes('const x = 42', 'typescript');
    expect(result).toHaveLength(1);
    const rowNode = result[0] as { kind: string; children: Array<{ kind: string }> };
    expect(rowNode.kind).toBe('row');
    for (const child of rowNode.children) {
      expect(child.kind).toBe('text');
    }
  });

  it('text content is preserved through VNode rendering', () => {
    const code = 'const x = 42';
    const result = highlightToVNodes(code, 'typescript');
    const rowNode = result[0] as { children: Array<{ content: string }> };
    const reconstructed = rowNode.children.map((c) => stripAnsi(c.content)).join('');
    expect(reconstructed).toBe(code);
  });

  it('returns unstyled text rows for unknown language', () => {
    const result = highlightToVNodes('hello world', 'brainfuck');
    expect(result).toHaveLength(1);
    const rowNode = result[0] as { kind: string; children: Array<{ kind: string; content: string }> };
    expect(rowNode.kind).toBe('row');
    expect(rowNode.children[0]!.content).toBe('hello world');
  });

  it('handles multi-line code with block comments', () => {
    const code = '/* start\nend */';
    const result = highlightToVNodes(code, 'typescript');
    expect(result).toHaveLength(2);
    const line1 = result[0] as { children: Array<{ content: string }> };
    const line2 = result[1] as { children: Array<{ content: string }> };
    const fullText = [line1.children.map((c) => stripAnsi(c.content)).join(''), line2.children.map((c) => stripAnsi(c.content)).join('')].join('\n');
    expect(fullText).toBe(code);
  });

  it('accepts a theme name string', () => {
    const result = highlightToVNodes('const x = 1', 'typescript', 'monokai');
    expect(result).toHaveLength(1);
    const rowNode = result[0] as { children: Array<{ content: string }> };
    const hasStyled = rowNode.children.some((c) => hasAnsi(c.content));
    expect(hasStyled).toBe(true);
  });

  it('accepts a theme object', () => {
    const theme = getTheme('dracula');
    const result = highlightToVNodes('const x = 1', 'typescript', theme);
    expect(result).toHaveLength(1);
  });

  it('produces same text content as highlight()', () => {
    const code = 'function foo(x: number): string {\n  return String(x);\n}';
    const ansiResult = highlight(code, 'typescript');
    const vnodeResult = highlightToVNodes(code, 'typescript');
    const vnodeText = vnodeResult
      .map((r) => {
        const row = r as { children: Array<{ content: string }> };
        return row.children.map((c) => c.content).join('');
      })
      .join('\n');
    expect(vnodeText).toBe(ansiResult);
  });
});

describe('highlightLineToVNodes', () => {
  it('returns a row VNode', () => {
    const tokens = tokenizeCode('const x = 42', 'typescript')!;
    const lineTokens = tokens.filter((t) => t.text !== '\n');
    const result = highlightLineToVNodes(lineTokens);
    expect(result.kind).toBe('row');
  });

  it('produces one text node per token', () => {
    const tokens = tokenizeCode('const x = 42', 'typescript')!;
    const lineTokens = tokens.filter((t) => t.text !== '\n');
    const result = highlightLineToVNodes(lineTokens);
    const rowNode = result as { children: Array<{ kind: string }> };
    expect(rowNode.children).toHaveLength(lineTokens.length);
    for (const child of rowNode.children) {
      expect(child.kind).toBe('text');
    }
  });

  it('applies theme styling to tokens', () => {
    const tokens = tokenizeCode('const x', 'typescript')!;
    const lineTokens = tokens.filter((t) => t.text !== '\n');
    const result = highlightLineToVNodes(lineTokens, 'monokai');
    const rowNode = result as { children: Array<{ content: string }> };
    const hasStyled = rowNode.children.some((c) => hasAnsi(c.content));
    expect(hasStyled).toBe(true);
  });

  it('preserves text content', () => {
    const tokens = tokenizeCode('const x = 42', 'typescript')!;
    const lineTokens = tokens.filter((t) => t.text !== '\n');
    const result = highlightLineToVNodes(lineTokens);
    const rowNode = result as { children: Array<{ content: string }> };
    const text = rowNode.children.map((c) => stripAnsi(c.content)).join('');
    expect(text).toBe('const x = 42');
  });

  it('handles empty token array', () => {
    const result = highlightLineToVNodes([]);
    expect(result.kind).toBe('row');
    const rowNode = result as { children: Array<unknown> };
    expect(rowNode.children).toHaveLength(0);
  });
});

// ── highlightPartial ────────────────────────────────────────────────────

describe('highlightPartial', () => {
  it('returns unstyled text for unknown language', () => {
    const initial: TokenizerState = { stack: [] };
    const result = highlightPartial('hello', 'unknown-lang', initial);
    expect(result.text).toBe('hello');
    expect(result.state).toEqual({ stack: [] });
  });

  it('highlights a single line and returns next state', () => {
    const initial: TokenizerState = { stack: [] };
    const result = highlightPartial('const x = 42', 'typescript', initial);
    expect(hasAnsi(result.text)).toBe(true);
    expect(stripAnsi(result.text)).toBe('const x = 42');
    expect(result.state).toBeDefined();
  });

  it('preserves multi-line comment state across calls', () => {
    const initial: TokenizerState = { stack: [] };
    const line1 = highlightPartial('/* start', 'typescript', initial);
    expect(hasAnsi(line1.text)).toBe(true);
    expect(line1.state.stack.length).toBeGreaterThan(0);

    const line2 = highlightPartial('middle', 'typescript', line1.state);
    expect(hasAnsi(line2.text)).toBe(true);
    expect(line2.state.stack.length).toBeGreaterThan(0);

    const line3 = highlightPartial('end */', 'typescript', line2.state);
    expect(hasAnsi(line3.text)).toBe(true);
    expect(line3.state.stack.length).toBe(0);
  });

  it('produces identical output to highlight() for complete code', () => {
    const lines = ['const x = 1;', 'const y = 2;'];
    let state: TokenizerState = { stack: [] };
    const partialResults: string[] = [];
    for (const line of lines) {
      const result = highlightPartial(line, 'typescript', state);
      partialResults.push(result.text);
      state = result.state;
    }
    const fullResult = highlight(lines.join('\n'), 'typescript');
    expect(partialResults.join('\n')).toBe(fullResult);
  });
});
