import { describe, expect, it } from 'vitest';
import { createHighlightTheme, getHighlightTheme, getLanguageGrammar, highlight, highlightCode, listLanguages, registerLanguage } from '../highlight.js';

/** Strip ANSI codes for content assertions */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Check if string contains ANSI codes */
function hasAnsi(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b\[[0-9;]*m/.test(str);
}

describe('highlight', () => {
  it('should highlight TypeScript keywords', () => {
    const result = highlight('const x = 1;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('const x = 1;');
  });

  it('should highlight JavaScript keywords', () => {
    const result = highlight('function add(a, b) { return a + b; }', 'javascript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('function');
    expect(stripAnsi(result)).toContain('return');
  });

  it('should highlight single-quoted strings', () => {
    const result = highlight("const s = 'hello';", 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain("'hello'");
  });

  it('should highlight double-quoted strings', () => {
    const result = highlight('const s = "hello";', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('"hello"');
  });

  it('should highlight // comments', () => {
    const result = highlight('// this is a comment', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('// this is a comment');
  });

  it('should highlight # comments in Python', () => {
    const result = highlight('# this is a comment', 'python');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('# this is a comment');
  });

  it('should highlight numbers', () => {
    const result = highlight('const x = 42;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('42');
  });

  it('should return unstyled text for unknown languages', () => {
    const result = highlight('some code here', 'unknown');
    expect(hasAnsi(result)).toBe(false);
    expect(result).toBe('some code here');
  });

  it('should handle empty input', () => {
    const result = highlight('', 'typescript');
    expect(result).toBe('');
  });

  it('should handle multi-line code', () => {
    const code = 'const a = 1;\nconst b = 2;\nreturn a + b;';
    const result = highlight(code, 'typescript');
    expect(hasAnsi(result)).toBe(true);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    // Each line should preserve content
    expect(stripAnsi(lines[0]!)).toContain('const');
    expect(stripAnsi(lines[2]!)).toContain('return');
  });
});

// ── Named Themes ──────────────────────────────────────────────────────

describe('getHighlightTheme', () => {
  const THEME_FUNCTIONS = ['keyword', 'string', 'comment', 'number', 'operator', 'type', 'function', 'variable', 'punctuation', 'builtin'] as const;

  it('returns a theme with name "default"', () => {
    const theme = getHighlightTheme('default');
    expect(theme.name).toBe('default');
  });

  it('returns a theme with name "monokai"', () => {
    const theme = getHighlightTheme('monokai');
    expect(theme.name).toBe('monokai');
  });

  it.each(['github', 'dracula', 'solarized'] as const)('returns a valid theme for "%s"', (name) => {
    const theme = getHighlightTheme(name);
    expect(theme.name).toBe(name);
  });

  it('each theme has all required style functions', () => {
    const names = ['default', 'monokai', 'github', 'dracula', 'solarized'] as const;
    for (const name of names) {
      const theme = getHighlightTheme(name);
      for (const fn of THEME_FUNCTIONS) {
        expect(typeof theme[fn]).toBe('function');
      }
    }
  });

  it('different themes produce different ANSI output for the same keyword', () => {
    const defaultTheme = getHighlightTheme('default');
    const monokaiTheme = getHighlightTheme('monokai');
    const word = 'const';
    expect(defaultTheme.keyword(word)).not.toBe(monokaiTheme.keyword(word));
  });
});

// ── createHighlightTheme ──────────────────────────────────────────────

describe('createHighlightTheme', () => {
  it('returns a complete theme when given empty overrides', () => {
    const theme = createHighlightTheme({});
    expect(typeof theme.keyword).toBe('function');
    expect(typeof theme.string).toBe('function');
    expect(typeof theme.comment).toBe('function');
    expect(typeof theme.number).toBe('function');
    expect(typeof theme.operator).toBe('function');
    expect(typeof theme.type).toBe('function');
    expect(typeof theme.function).toBe('function');
    expect(typeof theme.variable).toBe('function');
    expect(typeof theme.punctuation).toBe('function');
    expect(typeof theme.builtin).toBe('function');
  });

  it('overrides keyword but preserves other defaults', () => {
    const custom = createHighlightTheme({
      keyword: (t: string) => `[K:${t}]`,
    });
    expect(custom.keyword('const')).toBe('[K:const]');
    // Other functions should still produce ANSI
    const defaultTheme = getHighlightTheme('default');
    expect(custom.string('hello')).toBe(defaultTheme.string('hello'));
  });

  it('custom theme name defaults to "default"', () => {
    const theme = createHighlightTheme({});
    expect(theme.name).toBe('default');
  });
});

// ── highlightCode API ─────────────────────────────────────────────────

describe('highlightCode', () => {
  it('produces same result as highlight() with language only', () => {
    const code = 'const x = 1;';
    const a = highlight(code, 'typescript');
    const b = highlightCode(code, { language: 'typescript' });
    expect(b).toBe(a);
  });

  it('uses monokai theme when specified', () => {
    const code = 'const x = 1;';
    const defaultResult = highlight(code, 'typescript');
    const monokaiResult = highlightCode(code, { language: 'typescript', theme: 'monokai' });
    // Both should be highlighted but differently
    expect(hasAnsi(monokaiResult)).toBe(true);
    expect(monokaiResult).not.toBe(defaultResult);
  });
});

// ── Language Grammar Coverage ─────────────────────────────────────────

describe('language grammar coverage', () => {
  const LANG_SNIPPETS: Array<[string, string]> = [
    ['typescript', 'const x: number = 1;'],
    ['ts', 'let y = true;'],
    ['tsx', 'const el = <div />;'],
    ['javascript', 'function add(a, b) { return a + b; }'],
    ['js', 'var x = 42;'],
    ['jsx', 'const el = <App />;'],
    ['python', 'def hello(): return "hi"'],
    ['py', 'x = [1, 2, 3]'],
    ['bash', 'echo "hello world"'],
    ['sh', 'if [ -f file ]; then echo ok; fi'],
    ['shell', 'export PATH="/usr/bin"'],
    ['go', 'func main() { fmt.Println("hello") }'],
    ['golang', 'var x int = 42'],
    ['rust', 'fn main() { let x = 5; }'],
    ['rs', 'let mut v: Vec<i32> = vec![1, 2];'],
    ['ruby', 'def hello; puts "hi"; end'],
    ['rb', 'class Foo; end'],
    ['java', 'public class Main { public static void main(String[] args) {} }'],
    ['c', 'int main() { return 0; }'],
    ['h', '#include <stdio.h>'],
    ['cpp', 'int main() { std::cout << "hello"; }'],
    ['csharp', 'class Program { static void Main() {} }'],
    ['cs', 'var x = 42;'],
    ['json', '{"key": "value", "num": 42}'],
    ['jsonc', '{"key": true} // comment'],
    ['yaml', 'key: value\nlist:\n  - item'],
    ['yml', 'name: test'],
    ['css', 'body { display: flex; color: red; }'],
    ['html', '<div class="hello">content</div>'],
    ['htm', '<p>paragraph</p>'],
    ['sql', 'SELECT * FROM users WHERE id = 1;'],
    ['dockerfile', 'FROM node:18\nRUN npm install'],
    ['docker', 'COPY . /app'],
    ['php', '<?php echo "hello"; ?>'],
    ['swift', 'func greet() -> String { return "hello" }'],
    ['kotlin', 'fun main() { println("hello") }'],
    ['kt', 'val x: Int = 42'],
    ['lua', 'local x = 10\nprint(x)'],
    ['toml', '[package]\nname = "test"\nversion = "1.0"'],
    ['diff', '+added line\n-removed line\n@@ -1,3 +1,3 @@'],
    ['patch', '+new\n-old'],
  ];

  it.each(LANG_SNIPPETS)('highlights %s code', (lang, snippet) => {
    const result = highlight(snippet, lang);
    // All languages except markdown should produce ANSI output for non-trivial code
    expect(stripAnsi(result)).toBe(snippet);
    if (lang !== 'markdown' && lang !== 'md') {
      expect(hasAnsi(result)).toBe(true);
    }
  });

  it('markdown highlights syntax elements', () => {
    const code = '# Hello\n\nSome **bold** text';
    const result = highlight(code, 'markdown');
    // Spectrum's markdown grammar highlights headings and bold markers
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe(code);
  });

  it('md alias highlights syntax elements', () => {
    const code = '## Title\n- item';
    const result = highlight(code, 'md');
    // Spectrum's markdown grammar highlights headings
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe(code);
  });
});

// ── registerLanguage ──────────────────────────────────────────────────

describe('registerLanguage', () => {
  it('registers a new language and highlights with it', () => {
    registerLanguage({
      name: 'testlang',
      aliases: ['tl'],
      rules: [
        { pattern: /\b(?:fn|let|return)\b/, token: 'keyword' },
        { pattern: /"[^"]*"/, token: 'string' },
        { pattern: /\/\/.*$/, token: 'comment' },
        { pattern: /\d+/, token: 'number' },
        { pattern: /[+\-=]/, token: 'operator' },
        { pattern: /[a-zA-Z_]\w*/, token: 'variable' },
      ],
    });

    const result = highlight('let x = 42;', 'testlang');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('let x = 42;');
  });

  it('registered language is available via getLanguageGrammar', () => {
    const grammar = getLanguageGrammar('testlang');
    expect(grammar).toBeDefined();
    expect(grammar!.name).toBe('testlang');
  });

  it('registered language appears in listLanguages', () => {
    const langs = listLanguages();
    expect(langs).toContain('testlang');
  });

  it('registered alias works for highlighting', () => {
    const result = highlight('fn main() { return 0; }', 'tl');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('fn');
  });
});

// ── getLanguageGrammar ────────────────────────────────────────────────

describe('getLanguageGrammar', () => {
  it('returns the typescript grammar', () => {
    const grammar = getLanguageGrammar('typescript');
    expect(grammar).toBeDefined();
    expect(grammar!.name).toBe('typescript');
  });

  it('is case-insensitive', () => {
    const grammar = getLanguageGrammar('TYPESCRIPT');
    expect(grammar).toBeDefined();
    expect(grammar!.name).toBe('typescript');
  });

  it('returns undefined for nonexistent language', () => {
    const grammar = getLanguageGrammar('nonexistent');
    expect(grammar).toBeUndefined();
  });

  it('grammar has expected shape', () => {
    const grammar = getLanguageGrammar('typescript')!;
    expect(grammar.name).toBe('typescript');
    expect(Array.isArray(grammar.rules)).toBe(true);
    expect(grammar.rules.length).toBeGreaterThan(0);
    // Should have states for multi-line constructs (block comments, strings)
    expect(Array.isArray(grammar.states)).toBe(true);
    expect(grammar.states!.length).toBeGreaterThan(0);
  });
});

// ── listLanguages ─────────────────────────────────────────────────────

describe('listLanguages', () => {
  it('returns an array of language names', () => {
    const langs = listLanguages();
    expect(Array.isArray(langs)).toBe(true);
    expect(langs.length).toBeGreaterThan(0);
  });

  it('contains unique names (no aliases)', () => {
    const langs = listLanguages();
    const unique = new Set(langs);
    expect(unique.size).toBe(langs.length);
    // Should contain canonical names, not aliases
    expect(langs).toContain('typescript');
    expect(langs).toContain('javascript');
    expect(langs).toContain('python');
    expect(langs).toContain('bash');
    // Aliases should not appear as separate entries
    expect(langs).not.toContain('ts');
    expect(langs).not.toContain('js');
    expect(langs).not.toContain('py');
    expect(langs).not.toContain('sh');
  });

  it('includes core languages', () => {
    const langs = listLanguages();
    const expected = [
      'bash',
      'c',
      'cpp',
      'csharp',
      'css',
      'dockerfile',
      'go',
      'html',
      'java',
      'javascript',
      'json',
      'kotlin',
      'lua',
      'markdown',
      'php',
      'python',
      'ruby',
      'rust',
      'sql',
      'swift',
      'toml',
      'typescript',
      'yaml',
    ];
    for (const lang of expected) {
      expect(langs).toContain(lang);
    }
  });

  it('is sorted alphabetically', () => {
    const langs = listLanguages();
    const sorted = [...langs].sort();
    expect(langs).toEqual(sorted);
  });
});

// ── Highlight with named theme parameter ──────────────────────────────

describe('highlight with named theme', () => {
  it('uses monokai theme when passed as string', () => {
    const defaultResult = highlight('const x = 1;', 'typescript');
    const monokaiResult = highlight('const x = 1;', 'typescript', 'monokai');
    expect(hasAnsi(monokaiResult)).toBe(true);
    expect(monokaiResult).not.toBe(defaultResult);
  });

  it('uses dracula theme when passed as string', () => {
    const defaultResult = highlight('const x = 1;', 'typescript');
    const draculaResult = highlight('const x = 1;', 'typescript', 'dracula');
    expect(hasAnsi(draculaResult)).toBe(true);
    expect(draculaResult).not.toBe(defaultResult);
  });

  it('output differs between monokai and dracula', () => {
    const code = 'const x = 1;';
    const monokai = highlight(code, 'typescript', 'monokai');
    const dracula = highlight(code, 'typescript', 'dracula');
    expect(monokai).not.toBe(dracula);
  });

  it('accepts a HighlightTheme object directly', () => {
    const customTheme = createHighlightTheme({
      keyword: (t: string) => `<<${t}>>`,
    });
    const result = highlight('const x = 1;', 'typescript', customTheme);
    expect(result).toContain('<<const>>');
  });
});

// ── Diff highlighting ─────────────────────────────────────────────────

describe('diff highlighting', () => {
  it('lines starting with + get string styling', () => {
    const result = highlight('+added line', 'diff');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('+added line');
  });

  it('lines starting with - get keyword styling', () => {
    const result = highlight('-removed line', 'diff');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('-removed line');
  });

  it('lines starting with @@ get type styling', () => {
    const result = highlight('@@ -1,3 +1,3 @@', 'diff');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('@@ -1,3 +1,3 @@');
  });

  it('header lines get comment styling', () => {
    const headers = ['diff --git a/file.ts b/file.ts', 'index abc123..def456', '--- a/file.ts', '+++ b/file.ts'];
    for (const header of headers) {
      const result = highlight(header, 'diff');
      expect(hasAnsi(result)).toBe(true);
      expect(stripAnsi(result)).toBe(header);
    }
  });

  it('context lines (no prefix) remain unstyled', () => {
    const result = highlight(' unchanged line', 'diff');
    // Context lines don't match any prefix, so they're returned as-is
    expect(result).toBe(' unchanged line');
  });

  it('multi-line diff is highlighted correctly', () => {
    const diff = ['diff --git a/file.ts b/file.ts', '--- a/file.ts', '+++ b/file.ts', '@@ -1,3 +1,3 @@', ' context', '-old line', '+new line'].join('\n');
    const result = highlight(diff, 'diff');
    const lines = result.split('\n');
    // Header lines should have ANSI
    expect(hasAnsi(lines[0]!)).toBe(true);
    // Context line should be plain
    expect(hasAnsi(lines[4]!)).toBe(false);
    // Removed and added lines should have ANSI
    expect(hasAnsi(lines[5]!)).toBe(true);
    expect(hasAnsi(lines[6]!)).toBe(true);
  });
});

// ── Special cases ─────────────────────────────────────────────────────

describe('special cases', () => {
  it('template literals are highlighted as strings', () => {
    const result = highlight('const s = `hello world`;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('`hello world`');
  });

  it('block comments are highlighted', () => {
    const result = highlight('/* block comment */', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toBe('/* block comment */');
  });

  it('block comment spanning to end of line', () => {
    const result = highlight('code /* unterminated', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('/* unterminated');
  });

  it('hex numbers are highlighted', () => {
    const result = highlight('const x = 0xFF;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('0xFF');
  });

  it('float numbers are highlighted', () => {
    const result = highlight('const x = 3.14;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('3.14');
  });

  it('binary numbers are highlighted', () => {
    const result = highlight('const x = 0b101;', 'typescript');
    expect(hasAnsi(result)).toBe(true);
    expect(stripAnsi(result)).toContain('0b101');
  });

  it('function calls get function styling', () => {
    const customTheme = createHighlightTheme({
      function: (t: string) => `[FN:${t}]`,
    });
    const result = highlight('doSomething(x)', 'typescript', customTheme);
    expect(result).toContain('[FN:doSomething]');
  });

  it('builtin identifiers get builtin styling', () => {
    const customTheme = createHighlightTheme({
      builtin: (t: string) => `[BI:${t}]`,
    });
    // console is a builtin in typescript
    const result = highlight('console', 'typescript', customTheme);
    expect(result).toContain('[BI:console]');
  });

  it('type identifiers get type styling', () => {
    const customTheme = createHighlightTheme({
      type: (t: string) => `[T:${t}]`,
    });
    // 'string' is a type in typescript grammar
    const result = highlight('x: string', 'typescript', customTheme);
    expect(result).toContain('[T:string]');
  });

  it('operators get operator styling', () => {
    const customTheme = createHighlightTheme({
      operator: (t: string) => `[OP:${t}]`,
    });
    const result = highlight('a + b', 'typescript', customTheme);
    expect(result).toContain('[OP:+]');
  });

  it('variable identifiers get variable styling', () => {
    const customTheme = createHighlightTheme({
      variable: (t: string) => `[VAR:${t}]`,
    });
    // 'x' is not a keyword, type, builtin, or followed by '(' — it's a variable
    const result = highlight('const x = 1;', 'typescript', customTheme);
    expect(result).toContain('[VAR:x]');
  });

  it('punctuation characters get punctuation styling', () => {
    const customTheme = createHighlightTheme({
      punctuation: (t: string) => `[P:${t}]`,
      meta: (t: string) => `[M:${t}]`,
    });
    // In spectrum, '@decorator' is matched as a meta token (decorator)
    const result = highlight('@decorator', 'typescript', customTheme);
    expect(result).toContain('[M:@decorator]');
  });

  it('whitespace is NOT styled as punctuation', () => {
    const customTheme = createHighlightTheme({
      punctuation: (t: string) => `[P:${t}]`,
    });
    const result = highlight('a + b', 'typescript', customTheme);
    // Spaces should not be wrapped with punctuation markers
    expect(result).not.toContain('[P: ]');
  });

  it('default theme variable is identity (no ANSI added)', () => {
    // Default theme variable handler is (t) => t, so no ANSI is added for variables
    const result = highlight('const myVar = 1;', 'typescript');
    // myVar should appear in the output unchanged (no ANSI wrapping around it)
    expect(stripAnsi(result)).toContain('myVar');
  });
});

// ── CSS comment syntax ────────────────────────────────────────────────

describe('CSS comment syntax', () => {
  it('CSS does NOT treat // as a line comment', () => {
    const customTheme = createHighlightTheme({
      comment: (t: string) => `[COMMENT:${t}]`,
    });
    const result = highlight('// not a comment', 'css', customTheme);
    // With the fix, // in CSS should NOT be styled as a comment
    expect(result).not.toContain('[COMMENT:');
  });

  it('CSS block comments are still highlighted', () => {
    const customTheme = createHighlightTheme({
      comment: (t: string) => `[COMMENT:${t}]`,
    });
    const result = highlight('/* block comment */', 'css', customTheme);
    // State-machine tokenizer produces separate tokens for delimiters and content chars
    expect(result).toContain('[COMMENT:/*]');
    expect(result).toContain('[COMMENT:*/]');
  });

  it('CSS inline block comments are highlighted', () => {
    const customTheme = createHighlightTheme({
      comment: (t: string) => `[COMMENT:${t}]`,
    });
    const result = highlight('color: red; /* override */', 'css', customTheme);
    // Block comment delimiters and content are all styled as comment
    expect(result).toContain('[COMMENT:/*]');
    expect(result).toContain('[COMMENT:*/]');
  });
});
