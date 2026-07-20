/**
 * Tokenizer Tests
 *
 * Tests for the core state-machine tokenizer engine.
 */

import { describe, expect, it } from 'vitest';
import { initialState, tokenize, tokenizeLine } from '../tokenizer.js';
import type { LanguageGrammar, Token, TokenizerState } from '../types.js';

// ── Helper: minimal grammar for testing ────────────────────────────────

function testGrammar(): LanguageGrammar {
  return {
    name: 'test',
    rules: [
      { pattern: /\/\/.*/y, token: 'comment' },
      { pattern: /'(?:[^'\\]|\\.)*'/y, token: 'string' },
      { pattern: /\d+/y, token: 'number' },
      { pattern: /(?:if|else|return)(?![a-zA-Z_$0-9])/y, token: 'keyword' },
      { pattern: /[a-zA-Z_][a-zA-Z_0-9]*(?=\s*\()/y, token: 'function' },
      { pattern: /[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
      { pattern: /[+\-=<>!]+/y, token: 'operator' },
      { pattern: /\s+/y, token: 'text' },
      { pattern: /[(){}.,;]/y, token: 'punctuation' },
    ],
  };
}

function testGrammarWithStates(): LanguageGrammar {
  return {
    name: 'test-states',
    rules: [
      { pattern: /\/\/.*/y, token: 'comment' },
      { pattern: /'(?:[^'\\]|\\.)*'/y, token: 'string' },
      { pattern: /\d+/y, token: 'number' },
      { pattern: /(?:if|else|return)(?![a-zA-Z_$0-9])/y, token: 'keyword' },
      { pattern: /[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
      { pattern: /\s+/y, token: 'text' },
    ],
    states: [
      {
        name: 'blockComment',
        begin: /\/\*/y,
        end: /\*\//y,
        token: 'comment',
        contentToken: 'comment',
      },
    ],
  };
}

function categories(tokens: Token[]): string[] {
  return tokens.map((t) => t.category);
}

function texts(tokens: Token[]): string[] {
  return tokens.map((t) => t.text);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('initialState', () => {
  it('returns empty stack', () => {
    const s = initialState();
    expect(s.stack).toEqual([]);
  });
});

describe('tokenizeLine', () => {
  const grammar = testGrammar();

  it('tokenizes an empty line', () => {
    const [tokens, state] = tokenizeLine('', grammar, initialState());
    expect(tokens).toEqual([]);
    expect(state.stack).toEqual([]);
  });

  it('tokenizes a simple keyword', () => {
    const [tokens] = tokenizeLine('return', grammar, initialState());
    expect(tokens).toEqual([{ category: 'keyword', text: 'return' }]);
  });

  it('tokenizes a number', () => {
    const [tokens] = tokenizeLine('42', grammar, initialState());
    expect(tokens).toEqual([{ category: 'number', text: '42' }]);
  });

  it('tokenizes a string literal', () => {
    const [tokens] = tokenizeLine("'hello'", grammar, initialState());
    expect(tokens).toEqual([{ category: 'string', text: "'hello'" }]);
  });

  it('tokenizes a line comment', () => {
    const [tokens] = tokenizeLine('// comment here', grammar, initialState());
    expect(tokens).toEqual([{ category: 'comment', text: '// comment here' }]);
  });

  it('tokenizes mixed content', () => {
    const [tokens] = tokenizeLine('if (x == 42)', grammar, initialState());
    expect(texts(tokens)).toEqual(['if', ' ', '(', 'x', ' ', '==', ' ', '42', ')']);
    expect(categories(tokens)).toEqual(['keyword', 'text', 'punctuation', 'variable', 'text', 'operator', 'text', 'number', 'punctuation']);
  });

  it('identifies function calls', () => {
    const [tokens] = tokenizeLine('foo(42)', grammar, initialState());
    expect(tokens[0]).toEqual({ category: 'function', text: 'foo' });
  });

  it('handles string escapes', () => {
    const [tokens] = tokenizeLine("'he\\'llo'", grammar, initialState());
    expect(tokens).toEqual([{ category: 'string', text: "'he\\'llo'" }]);
  });

  it('falls back to text for unrecognized chars', () => {
    const [tokens] = tokenizeLine('@', grammar, initialState());
    expect(tokens).toEqual([{ category: 'text', text: '@' }]);
  });

  it('distinguishes keyword from identifier prefix', () => {
    const [tokens] = tokenizeLine('iffy', grammar, initialState());
    // "iffy" should NOT match "if" keyword because of the word boundary
    expect(tokens[0]!.category).toBe('variable');
    expect(tokens[0]!.text).toBe('iffy');
  });
});

describe('tokenizeLine with state rules', () => {
  const grammar = testGrammarWithStates();

  it('handles single-line block comment', () => {
    const [tokens] = tokenizeLine('/* hello */', grammar, initialState());
    // begin delimiter + char-by-char content + end delimiter
    // Content " hello " is consumed one char at a time as contentToken
    expect(tokens[0]).toEqual({ category: 'comment', text: '/*' });
    const lastToken = tokens[tokens.length - 1]!;
    expect(lastToken).toEqual({ category: 'comment', text: '*/' });
    // All tokens should be comment
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
    // Reconstructed text should match input
    const fullText = texts(tokens).join('');
    expect(fullText).toBe('/* hello */');
  });

  it('handles block comment start without end', () => {
    const [tokens, state] = tokenizeLine('/* hello', grammar, initialState());
    expect(texts(tokens)).toEqual(['/*', ' ', 'h', 'e', 'l', 'l', 'o']);
    expect(state.stack).toEqual(['blockComment']);
  });

  it('continues block comment state across lines', () => {
    const state: TokenizerState = { stack: ['blockComment'] };
    const [tokens, nextState] = tokenizeLine('still in comment */', grammar, state);
    // The content up to */ is consumed char-by-char as comment
    expect(nextState.stack).toEqual([]);
    // Last token should be the end delimiter
    const lastToken = tokens[tokens.length - 1]!;
    expect(lastToken.text).toBe('*/');
    expect(lastToken.category).toBe('comment');
  });

  it('continues block comment when no end on line', () => {
    const state: TokenizerState = { stack: ['blockComment'] };
    const [, nextState] = tokenizeLine('still in comment', grammar, state);
    expect(nextState.stack).toEqual(['blockComment']);
  });

  it('handles code after block comment closes', () => {
    const [tokens] = tokenizeLine('/* x */ 42', grammar, initialState());
    // After block comment closes, "42" should be a number
    const numberToken = tokens.find((t) => t.category === 'number');
    expect(numberToken).toBeDefined();
    expect(numberToken!.text).toBe('42');
  });
});

describe('tokenize (multi-line)', () => {
  it('tokenizes multi-line code', () => {
    const grammar = testGrammar();
    const tokens = tokenize('if\n42', grammar);
    expect(tokens.length).toBe(2);
    expect(tokens[0]).toEqual({ category: 'keyword', text: 'if' });
    expect(tokens[1]).toEqual({ category: 'number', text: '42' });
  });

  it('maintains state across lines for block comments', () => {
    const grammar = testGrammarWithStates();
    const tokens = tokenize('/* start\nend */', grammar);
    // All tokens should be comment
    for (const t of tokens) {
      expect(t.category).toBe('comment');
    }
  });
});

describe('state machine - contentRules', () => {
  it('matches content rules inside a state', () => {
    const grammar: LanguageGrammar = {
      name: 'test-content-rules',
      rules: [
        { pattern: /[a-zA-Z]+/, token: 'variable' },
        { pattern: /\s+/, token: 'text' },
      ],
      states: [
        {
          name: 'templateString',
          begin: /`/,
          end: /`/,
          token: 'string',
          contentToken: 'string',
          contentRules: [
            { pattern: /\$\{[^}]*\}/, token: 'variable' },
            { pattern: /\\[`\\$]/, token: 'escape' },
          ],
        },
      ],
    };

    const [tokens] = tokenizeLine('`hello ${x} world`', grammar, initialState());

    // Should contain: ` (string), hello (string content), ${x} (variable), world (string content), ` (string)
    const varToken = tokens.find((t) => t.category === 'variable');
    expect(varToken).toBeDefined();
    expect(varToken!.text).toBe('${x}');
  });
});

describe('state machine - push/pop on rules', () => {
  it('supports push on token rules', () => {
    const grammar: LanguageGrammar = {
      name: 'test-push',
      rules: [
        { pattern: /OPEN/, token: 'keyword', push: 'inner' },
        { pattern: /[a-zA-Z]+/, token: 'variable' },
        { pattern: /\s+/, token: 'text' },
      ],
      states: [
        {
          name: 'inner',
          begin: /(?!)/, // never matches from root (only via push)
          end: /CLOSE/,
          token: 'keyword',
          contentToken: 'string',
        },
      ],
    };

    const [tokens, state] = tokenizeLine('OPEN hello CLOSE', grammar, initialState());
    expect(state.stack).toEqual([]);
    // "hello" is inside the state, consumed char-by-char as contentToken 'string'
    // Check that we have string tokens for the 'hello' chars
    const stringTokens = tokens.filter((t) => t.category === 'string');
    expect(stringTokens.length).toBeGreaterThan(0);
    // Reconstruct the full text
    const fullText = tokens.map((t) => t.text).join('');
    expect(fullText).toBe('OPEN hello CLOSE');
    // First token is OPEN keyword
    expect(tokens[0]).toEqual({ category: 'keyword', text: 'OPEN' });
    // Last token is CLOSE keyword (the end delimiter)
    const lastToken = tokens[tokens.length - 1]!;
    expect(lastToken).toEqual({ category: 'keyword', text: 'CLOSE' });
  });
});
