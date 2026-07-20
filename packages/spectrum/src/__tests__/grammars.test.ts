/**
 * Grammar Tests
 *
 * Tests for all 23 language grammars — verifies tokenization correctness.
 */

import { describe, expect, it } from 'vitest';
import { getLanguageGrammar, listLanguages, registerLanguage } from '../grammars.js';
import { initialState, tokenizeLine } from '../tokenizer.js';
import type { LanguageGrammar, Token } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────────────

function tokenize(code: string, language: string): Token[] {
  const grammar = getLanguageGrammar(language);
  if (!grammar) throw new Error(`Unknown language: ${language}`);
  const lines = code.split('\n');
  const allTokens: Token[] = [];
  let state = initialState();
  for (const line of lines) {
    const [tokens, nextState] = tokenizeLine(line, grammar, state);
    allTokens.push(...tokens);
    state = nextState;
  }
  return allTokens;
}

function expectToken(tokens: Token[], text: string, category: string): void {
  const found = tokens.find((t) => t.text === text);
  expect(found, `expected token with text "${text}"`).toBeDefined();
  expect(found!.category).toBe(category);
}

// ── Registry Tests ─────────────────────────────────────────────────────

describe('getLanguageGrammar', () => {
  it('returns undefined for unknown language', () => {
    expect(getLanguageGrammar('brainfuck')).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(getLanguageGrammar('TypeScript')).toBeDefined();
    expect(getLanguageGrammar('PYTHON')).toBeDefined();
  });

  it('resolves aliases', () => {
    expect(getLanguageGrammar('ts')?.name).toBe('typescript');
    expect(getLanguageGrammar('py')?.name).toBe('python');
    expect(getLanguageGrammar('js')?.name).toBe('javascript');
    expect(getLanguageGrammar('sh')?.name).toBe('bash');
    expect(getLanguageGrammar('rs')?.name).toBe('rust');
    expect(getLanguageGrammar('rb')?.name).toBe('ruby');
    expect(getLanguageGrammar('golang')?.name).toBe('go');
    expect(getLanguageGrammar('yml')?.name).toBe('yaml');
    expect(getLanguageGrammar('docker')?.name).toBe('dockerfile');
  });
});

describe('listLanguages', () => {
  it('returns at least 27 canonical languages', () => {
    const langs = listLanguages();
    expect(langs.length).toBeGreaterThanOrEqual(27);
  });

  it('is sorted alphabetically', () => {
    const langs = listLanguages();
    const sorted = [...langs].sort();
    expect(langs).toEqual(sorted);
  });

  it('contains expected languages', () => {
    const langs = listLanguages();
    expect(langs).toContain('typescript');
    expect(langs).toContain('python');
    expect(langs).toContain('rust');
    expect(langs).toContain('sql');
    expect(langs).toContain('html');
    expect(langs).toContain('makefile');
    expect(langs).toContain('gitignore');
    expect(langs).toContain('scss');
  });
});

describe('registerLanguage', () => {
  it('registers a custom grammar', () => {
    const grammar: LanguageGrammar = {
      name: 'testlang',
      aliases: ['tl'],
      rules: [{ pattern: /hello/, token: 'keyword' }],
    };
    registerLanguage(grammar);
    expect(getLanguageGrammar('testlang')).toBe(grammar);
    expect(getLanguageGrammar('tl')).toBe(grammar);
  });
});

// ── Language-specific Tests ────────────────────────────────────────────

describe('TypeScript grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('const x = 42', 'typescript');
    expectToken(tokens, 'const', 'keyword');
    expectToken(tokens, '42', 'number');
  });

  it('highlights types', () => {
    const tokens = tokenize('string number boolean', 'typescript');
    expectToken(tokens, 'string', 'type');
    expectToken(tokens, 'number', 'type');
  });

  it('highlights builtins', () => {
    const tokens = tokenize('console Math JSON', 'typescript');
    expectToken(tokens, 'console', 'builtin');
    expectToken(tokens, 'Math', 'builtin');
  });

  it('highlights line comments', () => {
    const tokens = tokenize('// todo', 'typescript');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights string literals', () => {
    const tokens = tokenize("'hello'", 'typescript');
    expectToken(tokens, "'hello'", 'string');
  });

  it('highlights template literals', () => {
    const tokens = tokenize('`template`', 'typescript');
    expectToken(tokens, '`template`', 'string');
  });

  it('highlights function calls', () => {
    const tokens = tokenize('foo()', 'typescript');
    expectToken(tokens, 'foo', 'function');
  });

  it('handles block comments', () => {
    const tokens = tokenize('/* block */', 'typescript');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });

  it('handles multi-line block comments', () => {
    const tokens = tokenize('/* line1\nline2 */', 'typescript');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('JavaScript grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('const let var', 'javascript');
    expectToken(tokens, 'const', 'keyword');
    expectToken(tokens, 'let', 'keyword');
    expectToken(tokens, 'var', 'keyword');
  });

  it('resolves jsx alias', () => {
    expect(getLanguageGrammar('jsx')?.name).toBe('javascript');
  });
});

describe('Python grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('def foo():', 'python');
    expectToken(tokens, 'def', 'keyword');
    expectToken(tokens, 'foo', 'function');
  });

  it('highlights decorators as meta', () => {
    const tokens = tokenize('@property', 'python');
    expectToken(tokens, '@property', 'meta');
  });

  it('highlights triple-quoted strings', () => {
    const tokens = tokenize('"""docstring"""', 'python');
    expect(tokens[0]!.category).toBe('string');
  });

  it('highlights line comments', () => {
    const tokens = tokenize('# comment', 'python');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights builtins', () => {
    const tokens = tokenize('print(len(x))', 'python');
    expectToken(tokens, 'print', 'builtin');
    expectToken(tokens, 'len', 'builtin');
  });
});

describe('Bash grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('if then else fi', 'bash');
    expectToken(tokens, 'if', 'keyword');
    expectToken(tokens, 'then', 'keyword');
    expectToken(tokens, 'fi', 'keyword');
  });

  it('highlights variable expansion', () => {
    const tokens = tokenize('$HOME ${PATH}', 'bash');
    expectToken(tokens, '$HOME', 'variable');
    expectToken(tokens, '${PATH}', 'variable');
  });

  it('highlights builtins', () => {
    const tokens = tokenize('echo pwd', 'bash');
    expectToken(tokens, 'echo', 'builtin');
  });
});

describe('Go grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('func main() {}', 'go');
    expectToken(tokens, 'func', 'keyword');
    expectToken(tokens, 'main', 'function');
  });

  it('highlights types', () => {
    const tokens = tokenize('int string bool', 'go');
    expectToken(tokens, 'int', 'type');
    expectToken(tokens, 'string', 'type');
  });

  it('handles raw strings', () => {
    const tokens = tokenize('`raw string`', 'go');
    expect(tokens[0]!.category).toBe('string');
  });

  it('highlights block comments', () => {
    const tokens = tokenize('/* go comment */', 'go');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('Rust grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('fn let mut pub', 'rust');
    expectToken(tokens, 'fn', 'keyword');
    expectToken(tokens, 'let', 'keyword');
    expectToken(tokens, 'mut', 'keyword');
    expectToken(tokens, 'pub', 'keyword');
  });

  it('highlights attributes as meta', () => {
    const tokens = tokenize('#[derive(Debug)]', 'rust');
    expect(tokens[0]!.category).toBe('meta');
  });

  it('highlights macro invocations', () => {
    const tokens = tokenize('println!', 'rust');
    expectToken(tokens, 'println!', 'builtin');
  });

  it('highlights lifetime annotations', () => {
    const tokens = tokenize("'a", 'rust');
    expectToken(tokens, "'a", 'label');
  });
});

describe('SQL grammar', () => {
  it('highlights uppercase keywords', () => {
    const tokens = tokenize('SELECT * FROM users', 'sql');
    expectToken(tokens, 'SELECT', 'keyword');
    expectToken(tokens, 'FROM', 'keyword');
  });

  it('highlights lowercase keywords (case insensitive)', () => {
    const tokens = tokenize('select * from users', 'sql');
    expectToken(tokens, 'select', 'keyword');
    expectToken(tokens, 'from', 'keyword');
  });

  it('highlights types', () => {
    const tokens = tokenize('INTEGER VARCHAR', 'sql');
    expectToken(tokens, 'INTEGER', 'type');
    expectToken(tokens, 'VARCHAR', 'type');
  });

  it('highlights aggregation builtins', () => {
    const tokens = tokenize('COUNT(id)', 'sql');
    expectToken(tokens, 'COUNT', 'builtin');
  });

  it('highlights line comments', () => {
    const tokens = tokenize('-- comment', 'sql');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights strings', () => {
    const tokens = tokenize("'hello'", 'sql');
    expect(tokens[0]!.category).toBe('string');
  });
});

describe('JSON grammar', () => {
  it('highlights keys as property', () => {
    const tokens = tokenize('"name": "value"', 'json');
    // The first string (followed by :) should be property
    expectToken(tokens, '"name"', 'property');
  });

  it('highlights constants', () => {
    const tokens = tokenize('true false null', 'json');
    expectToken(tokens, 'true', 'constant');
    expectToken(tokens, 'false', 'constant');
    expectToken(tokens, 'null', 'constant');
  });

  it('highlights numbers', () => {
    const tokens = tokenize('42', 'json');
    expectToken(tokens, '42', 'number');
  });
});

describe('YAML grammar', () => {
  it('highlights keys as property', () => {
    const tokens = tokenize('name: value', 'yaml');
    expectToken(tokens, 'name', 'property');
  });

  it('highlights constants', () => {
    const tokens = tokenize('true false null', 'yaml');
    expectToken(tokens, 'true', 'constant');
    expectToken(tokens, 'false', 'constant');
    expectToken(tokens, 'null', 'constant');
  });
});

describe('HTML grammar', () => {
  it('highlights tags', () => {
    const tokens = tokenize('<div>', 'html');
    expectToken(tokens, '<div', 'tag');
  });

  it('highlights closing tags', () => {
    const tokens = tokenize('</div>', 'html');
    expectToken(tokens, '</div', 'tag');
  });

  it('highlights attributes', () => {
    const tokens = tokenize('<a href="url">', 'html');
    expectToken(tokens, 'href', 'attribute');
  });

  it('highlights entities as escape', () => {
    const tokens = tokenize('&amp;', 'html');
    expectToken(tokens, '&amp;', 'escape');
  });

  it('highlights HTML comments', () => {
    const tokens = tokenize('<!-- comment -->', 'html');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('CSS grammar', () => {
  it('highlights class selectors as tag', () => {
    const tokens = tokenize('.container', 'css');
    expectToken(tokens, '.container', 'tag');
  });

  it('highlights pseudo selectors as meta', () => {
    const tokens = tokenize(':hover', 'css');
    expectToken(tokens, ':hover', 'meta');
  });

  it('highlights block comments', () => {
    const tokens = tokenize('/* css */', 'css');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('SCSS grammar', () => {
  it('highlights variables', () => {
    const tokens = tokenize('$spacing: 1rem;', 'scss');
    expectToken(tokens, '$spacing', 'variable');
  });

  it('highlights directives as meta', () => {
    const tokens = tokenize('@use "theme";', 'scss');
    expectToken(tokens, '@use', 'meta');
  });

  it('highlights include directives as meta', () => {
    const tokens = tokenize('@include button($spacing);', 'scss');
    expectToken(tokens, '@include', 'meta');
  });

  it('highlights line comments', () => {
    const tokens = tokenize('// spacing override', 'scss');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights parent selector ampersand as operator', () => {
    const tokens = tokenize('&:hover { color: red; }', 'scss');
    expectToken(tokens, '&', 'operator');
    expectToken(tokens, ':hover', 'meta');
  });

  it('does not treat URL protocols as line comments', () => {
    const code = 'background: url(http://example.com/a.png);';
    const tokens = tokenize(code, 'scss');
    expect(tokens.some((token) => token.category === 'comment')).toBe(false);
    expect(tokens.map((token) => token.text).join('')).toBe(code);
  });
});

describe('Diff grammar', () => {
  it('highlights added lines as string', () => {
    const tokens = tokenize('+added line', 'diff');
    expect(tokens[0]!.category).toBe('string');
  });

  it('highlights removed lines as keyword', () => {
    const tokens = tokenize('-removed line', 'diff');
    expect(tokens[0]!.category).toBe('keyword');
  });

  it('highlights hunk headers as type', () => {
    const tokens = tokenize('@@ -1,3 +1,4 @@', 'diff');
    expect(tokens[0]!.category).toBe('type');
  });

  it('highlights file headers as comment', () => {
    const tokens = tokenize('diff --git a/file b/file', 'diff');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('handles context lines as text', () => {
    const tokens = tokenize(' unchanged context line', 'diff');
    expect(tokens.length).toBeGreaterThan(0);
    const joined = tokens.map((t) => t.text).join('');
    expect(joined).toBe(' unchanged context line');
  });
});

describe('Ruby grammar', () => {
  it('highlights symbols as constant', () => {
    const tokens = tokenize(':name', 'ruby');
    expectToken(tokens, ':name', 'constant');
  });

  it('highlights instance variables', () => {
    const tokens = tokenize('@name', 'ruby');
    expectToken(tokens, '@name', 'variable');
  });

  it('highlights block_given? as keyword', () => {
    const tokens = tokenize('block_given?', 'ruby');
    expectToken(tokens, 'block_given?', 'keyword');
  });

  it('highlights puts as builtin, not keyword', () => {
    const tokens = tokenize('puts "hello"', 'ruby');
    expectToken(tokens, 'puts', 'builtin');
  });

  it('highlights print as builtin, not keyword', () => {
    const tokens = tokenize('print "hello"', 'ruby');
    expectToken(tokens, 'print', 'builtin');
  });
});

describe('Java grammar', () => {
  it('highlights annotations as meta', () => {
    const tokens = tokenize('@Override', 'java');
    expectToken(tokens, '@Override', 'meta');
  });

  it('highlights keywords', () => {
    const tokens = tokenize('public class Foo', 'java');
    expectToken(tokens, 'public', 'keyword');
    expectToken(tokens, 'class', 'keyword');
  });
});

describe('C grammar', () => {
  it('highlights preprocessor directives as meta', () => {
    const tokens = tokenize('#include <stdio.h>', 'c');
    expect(tokens[0]!.category).toBe('meta');
  });

  it('highlights keywords', () => {
    const tokens = tokenize('int main()', 'c');
    expectToken(tokens, 'int', 'keyword');
    expectToken(tokens, 'main', 'function');
  });
});

describe('C++ grammar', () => {
  it('highlights preprocessor directives', () => {
    const tokens = tokenize('#include <iostream>', 'cpp');
    expect(tokens[0]!.category).toBe('meta');
  });

  it('resolves aliases', () => {
    expect(getLanguageGrammar('c++')?.name).toBe('cpp');
    expect(getLanguageGrammar('cxx')?.name).toBe('cpp');
    expect(getLanguageGrammar('cc')?.name).toBe('cpp');
  });
});

describe('C# grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('public class Program', 'csharp');
    expectToken(tokens, 'public', 'keyword');
    expectToken(tokens, 'class', 'keyword');
  });

  it('resolves aliases', () => {
    expect(getLanguageGrammar('cs')?.name).toBe('csharp');
    expect(getLanguageGrammar('c#')?.name).toBe('csharp');
  });
});

describe('Dockerfile grammar', () => {
  it('highlights instructions as keyword', () => {
    const tokens = tokenize('FROM node:20', 'dockerfile');
    expectToken(tokens, 'FROM', 'keyword');
  });

  it('highlights variable expansion', () => {
    const tokens = tokenize('$VERSION', 'dockerfile');
    expectToken(tokens, '$VERSION', 'variable');
  });
});

describe('Makefile grammar', () => {
  it('highlights targets as labels', () => {
    const tokens = tokenize('all: build', 'makefile');
    expectToken(tokens, 'all', 'label');
  });

  it('highlights assignment names as properties', () => {
    const tokens = tokenize('CC := gcc', 'makefile');
    expectToken(tokens, 'CC', 'property');
  });

  it('highlights directives as keywords', () => {
    const tokens = tokenize('include common.mk', 'makefile');
    expectToken(tokens, 'include', 'keyword');
  });

  it('highlights automatic and expanded variables', () => {
    const tokens = tokenize('$(CC) $@ $< $^', 'makefile');
    expectToken(tokens, '$(CC)', 'variable');
    expectToken(tokens, '$@', 'variable');
    expectToken(tokens, '$<', 'variable');
    expectToken(tokens, '$^', 'variable');
  });

  it('highlights comments', () => {
    const tokens = tokenize('# build target', 'makefile');
    expect(tokens[0]!.category).toBe('comment');
  });
});

describe('Gitignore grammar', () => {
  it('highlights comments', () => {
    const tokens = tokenize('# ignored files', 'gitignore');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights ignore patterns as regexp-like tokens', () => {
    const tokens = tokenize('*.log', 'gitignore');
    expectToken(tokens, '*.log', 'regexp');
  });

  it('highlights negated patterns', () => {
    const tokens = tokenize('!dist/', 'gitignore');
    expectToken(tokens, '!', 'operator');
    expectToken(tokens, 'dist/', 'regexp');
  });

  it('does not treat inline exclamation marks as negation operators', () => {
    const tokens = tokenize('foo!bar', 'gitignore');
    expect(tokens.some((token) => token.category === 'operator')).toBe(false);
  });

  it('does not treat escaped comments as comment lines', () => {
    const tokens = tokenize('\\#literal', 'gitignore');
    expect(tokens[0]!.category).not.toBe('comment');
  });

  it('does not treat leading-space patterns as comment lines', () => {
    const tokens = tokenize('  #literal', 'gitignore');
    expect(tokens.some((token) => token.category === 'comment')).toBe(false);
  });
});

describe('PHP grammar', () => {
  it('highlights PHP tags as meta', () => {
    const tokens = tokenize('<?php', 'php');
    expectToken(tokens, '<?php', 'meta');
  });

  it('highlights variables', () => {
    const tokens = tokenize('$name', 'php');
    expectToken(tokens, '$name', 'variable');
  });
});

describe('Swift grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('func let var', 'swift');
    expectToken(tokens, 'func', 'keyword');
    expectToken(tokens, 'let', 'keyword');
    expectToken(tokens, 'var', 'keyword');
  });

  it('highlights attributes as meta', () => {
    const tokens = tokenize('@available', 'swift');
    expectToken(tokens, '@available', 'meta');
  });
});

describe('Kotlin grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('fun val var', 'kotlin');
    expectToken(tokens, 'fun', 'keyword');
    expectToken(tokens, 'val', 'keyword');
    expectToken(tokens, 'var', 'keyword');
  });

  it('highlights annotations as meta', () => {
    const tokens = tokenize('@JvmStatic', 'kotlin');
    expectToken(tokens, '@JvmStatic', 'meta');
  });

  it('resolves aliases', () => {
    expect(getLanguageGrammar('kt')?.name).toBe('kotlin');
    expect(getLanguageGrammar('kts')?.name).toBe('kotlin');
  });
});

describe('Lua grammar', () => {
  it('highlights keywords', () => {
    const tokens = tokenize('local function end', 'lua');
    expectToken(tokens, 'local', 'keyword');
    expectToken(tokens, 'function', 'keyword');
    expectToken(tokens, 'end', 'keyword');
  });

  it('highlights line comments', () => {
    const tokens = tokenize('-- comment', 'lua');
    expect(tokens[0]!.category).toBe('comment');
  });

  it('highlights block comments', () => {
    const tokens = tokenize('--[[ block ]]', 'lua');
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('TOML grammar', () => {
  it('highlights table headers as tag', () => {
    const tokens = tokenize('[package]', 'toml');
    expectToken(tokens, '[package]', 'tag');
  });

  it('highlights keys as property', () => {
    const tokens = tokenize('name = "value"', 'toml');
    expectToken(tokens, 'name', 'property');
  });

  it('highlights booleans as constant', () => {
    const tokens = tokenize('true false', 'toml');
    expectToken(tokens, 'true', 'constant');
    expectToken(tokens, 'false', 'constant');
  });
});

describe('Markdown grammar', () => {
  it('highlights headings as keyword', () => {
    const tokens = tokenize('# Heading', 'markdown');
    expect(tokens[0]!.category).toBe('keyword');
  });

  it('highlights inline code as string', () => {
    const tokens = tokenize('`code`', 'markdown');
    expectToken(tokens, '`code`', 'string');
  });
});
