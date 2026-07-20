/**
 * TextMate Grammar Import Tests
 *
 * Verifies JSON/plist parsing and the imported grammar subset.
 */

import { describe, expect, it } from 'vitest';
import { getLanguageGrammar, importTextMateGrammar, parseTextMateGrammar } from '../index.js';
import { initialState, tokenizeLine } from '../tokenizer.js';
import type { LanguageGrammar, Token } from '../types.js';

function tokenize(grammar: LanguageGrammar, source: string): Token[][] {
  const lines = source.split('\n');
  const result: Token[][] = [];
  let state = initialState();

  for (const line of lines) {
    const [tokens, nextState] = tokenizeLine(line, grammar, state);
    result.push(tokens);
    state = nextState;
  }

  return result;
}

describe('parseTextMateGrammar', () => {
  it('parses JSON grammars', () => {
    const parsed = parseTextMateGrammar(JSON.stringify({ name: 'json-demo', patterns: [] })) as { name?: string };
    expect(parsed.name).toBe('json-demo');
  });

  it('parses plist grammars', () => {
    const parsed = parseTextMateGrammar(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>name</key>
    <string>plist-demo</string>
    <key>patterns</key>
    <array></array>
  </dict>
</plist>`) as { name?: string };
    expect(parsed.name).toBe('plist-demo');
  });

  it('uses prototype-safe dictionaries for plist keys', () => {
    const parsed = parseTextMateGrammar(`<plist><dict><key>__proto__</key><string>safe</string></dict></plist>`) as Record<string, unknown>;
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(parsed.__proto__).toBe('safe');
  });
});

describe('importTextMateGrammar', () => {
  it('imports JSON grammars with repository includes and begin/end blocks', () => {
    const grammar = importTextMateGrammar(
      JSON.stringify({
        name: 'tmjson',
        patterns: [
          { include: '#core' },
          {
            begin: '/\\*',
            end: '\\*/',
            name: 'comment.block',
            contentName: 'comment.block',
          },
        ],
        repository: {
          core: {
            patterns: [{ match: '\\b(foo|bar)\\b', name: 'keyword.control' }],
          },
        },
      }),
      { register: true },
    );

    expect(grammar.name).toBe('tmjson');
    expect(getLanguageGrammar('tmjson')).toBe(grammar);

    const tokens = tokenize(grammar, 'foo\n/* comment\ninside\n*/');
    expect(tokens[0]!.some((token) => token.category === 'keyword')).toBe(true);
    expect(tokens[1]!.every((token) => token.category === 'comment' || token.category === 'text')).toBe(true);
    expect(tokens[2]!.every((token) => token.category === 'comment' || token.category === 'text')).toBe(true);
  });

  it('imports plist grammars', () => {
    const grammar = importTextMateGrammar(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>name</key>
    <string>tmplist</string>
    <key>patterns</key>
    <array>
      <dict>
        <key>match</key>
        <string>\\b(alpha|beta)\\b</string>
        <key>name</key>
        <string>keyword.control</string>
      </dict>
    </array>
  </dict>
</plist>`);

    const tokens = tokenize(grammar, 'alpha beta');
    expect(tokens[0]!.some((token) => token.category === 'keyword')).toBe(true);
  });

  it('terminates cyclic repository and self includes', () => {
    const grammar = importTextMateGrammar({
      name: 'cyclic',
      patterns: [{ include: '#loop' }, { include: '$self' }, { match: 'ok', name: 'keyword.control' }],
      repository: {
        loop: { include: '#loop' },
      },
    });

    const [tokens] = tokenizeLine('ok', grammar, initialState());
    expect(tokens).toEqual([{ category: 'keyword', text: 'ok' }]);
  });

  it('terminates cyclic object pattern graphs', () => {
    const node: Record<string, unknown> = {};
    node.patterns = [node];

    const grammar = importTextMateGrammar({ name: 'object-cycle', patterns: [node] });
    expect(grammar.rules).toEqual([]);
  });

  it('rejects non-dictionary roots', () => {
    expect(() => importTextMateGrammar('null')).toThrow(/root must be a dictionary/);
    expect(() => importTextMateGrammar('[]')).toThrow(/root must be a dictionary/);
  });

  it('ignores malformed capture keys without producing invalid group indices', () => {
    const grammar = importTextMateGrammar({
      name: 'captures',
      patterns: [
        {
          match: '(foo)',
          name: 'variable',
          captures: {
            nope: { name: 'keyword.control' },
            1: { name: 'function.call' },
          },
        },
      ],
    });

    const [tokens] = tokenizeLine('foo', grammar, initialState());
    expect(tokens).toEqual([{ category: 'function', text: 'foo' }]);
  });

  it('bounds deeply nested object grammars', () => {
    const root: Record<string, unknown> = { name: 'deep' };
    let node = root;
    for (let depth = 0; depth < 140; depth++) {
      const child: Record<string, unknown> = {};
      node.patterns = [child];
      node = child;
    }

    expect(() => importTextMateGrammar(root)).toThrow(/nesting/);
  });
});
