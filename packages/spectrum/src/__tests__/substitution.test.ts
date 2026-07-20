import { describe, expect, it } from 'vitest';
import { getLanguageGrammar } from '../grammars.js';
import { highlight, tokenizeCode } from '../highlight.js';
import { registerSubstitutionMode, renderSubstitutions, tokenizeSubstitutions } from '../substitution.js';

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function flattenText(node: unknown): string {
  const vnode = node as { kind: 'row'; children: unknown[] } | { kind: 'text'; content: string } | { kind: string; children?: unknown[]; content?: string };
  if (vnode.kind === 'text') {
    return vnode.content ?? '';
  }
  if (vnode.kind === 'row') {
    return (vnode.children ?? []).map((child) => flattenText(child)).join('');
  }
  return '';
}

describe('tokenizeSubstitutions', () => {
  it('tokenizes literals, substitution syntax, and filled replacements', () => {
    const tokens = tokenizeSubstitutions('Hello ${name}!', {
      known: new Set(['name']),
      fills: new Map([['name', 'Ada']]),
    });

    expect(tokens.map((token) => token.kind)).toEqual([
      'literal',
      'substitution-open',
      'substitution-name',
      'substitution-close',
      'substitution-filled',
      'literal',
    ]);
    expect(tokens.map((token) => token.text)).toEqual(['Hello ', '${', 'name', '}', 'Ada', '!']);
    expect(tokens[2]?.substitutionName).toBe('name');
    expect(tokens[4]?.range).toEqual({ start: 6, end: 13 });
  });

  it('marks unknown substitutions and supports custom delimiters', () => {
    const tokens = tokenizeSubstitutions('Hello {{user}}', {
      opener: '{{',
      closer: '}}',
      known: new Set(['name']),
    });

    expect(tokens.map((token) => token.kind)).toEqual(['literal', 'substitution-open', 'substitution-name', 'substitution-close', 'substitution-unknown']);
    expect(tokens[4]?.text).toBe('{{user}}');
    expect(tokens[4]?.substitutionName).toBe('user');
  });

  it('preserves placeholder whitespace while keeping the normalized lookup name', () => {
    const tokens = tokenizeSubstitutions('Hello ${ user }', {
      known: new Set(['user']),
    });

    expect(tokens[2]?.text).toBe(' user ');
    expect(tokens[2]?.substitutionName).toBe('user');
    expect(tokens[2]?.range).toEqual({ start: 8, end: 14 });
  });

  it('treats escaped or unclosed substitutions as literal text', () => {
    const escaped = tokenizeSubstitutions(String.raw`\${name}`);
    const unclosed = tokenizeSubstitutions('Hello ${name');

    expect(escaped).toEqual([
      {
        kind: 'literal',
        text: String.raw`\${name}`,
        range: { start: 0, end: 8 },
      },
    ]);
    expect(unclosed).toEqual([
      {
        kind: 'literal',
        text: 'Hello ${name',
        range: { start: 0, end: 12 },
      },
    ]);
  });
});

describe('renderSubstitutions', () => {
  it('renders original template text by default', () => {
    const tokens = tokenizeSubstitutions('const ${name}', {
      fills: new Map([['name', 'Ada']]),
    });

    const rendered = renderSubstitutions(tokens);
    expect(stripAnsi(flattenText(rendered))).toBe('const ${name}');
  });

  it('renders filled substitutions in diff style when requested', () => {
    const tokens = tokenizeSubstitutions('const ${name}', {
      fills: new Map([['name', 'Ada']]),
    });

    const rendered = renderSubstitutions(tokens, { diffStyle: true });
    expect(stripAnsi(flattenText(rendered))).toBe('const ${name} -> Ada');
  });

  it('renders the original placeholder text when whitespace is part of the syntax', () => {
    const tokens = tokenizeSubstitutions('const ${ user }', {
      fills: new Map([['user', 'Ada']]),
    });

    const rendered = renderSubstitutions(tokens);
    expect(stripAnsi(flattenText(rendered))).toBe('const ${ user }');
  });
});

describe('registerSubstitutionMode', () => {
  it('registers the substitution grammar with a consumer registry', () => {
    const registered: Array<{ name: string }> = [];
    const disposable = registerSubstitutionMode({
      registerLanguage(grammar) {
        registered.push(grammar);
      },
    });

    expect(registered).toHaveLength(1);
    expect(registered[0]?.name).toBe('substitution');
    expect(typeof disposable.dispose).toBe('function');
  });

  it('ships a built-in substitution grammar shape', () => {
    expect(getLanguageGrammar('substitution')).toBeDefined();
    expect(getLanguageGrammar('prompt-template')?.name).toBe('substitution');
  });

  it('works with the core highlight pipeline', () => {
    const rendered = highlight('Hello ${name}', 'substitution');
    const tokens = tokenizeCode('Hello ${name}', 'substitution');

    expect(stripAnsi(rendered)).toBe('Hello ${name}');
    expect(tokens?.map((token) => token.category)).toEqual(['text', 'punctuation', 'variable', 'punctuation']);
  });
});
