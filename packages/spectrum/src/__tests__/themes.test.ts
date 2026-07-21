/**
 * Theme Tests
 *
 * Tests for the theme system — applyTheme, resolveTheme, built-in themes.
 */

import { defaultTheme } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { applyTheme, createTheme, fromSemanticTheme, getTheme, resolveTheme } from '../themes.js';
import type { HighlightThemeName, TokenCategory } from '../types.js';

// ── Helper ─────────────────────────────────────────────────────────────

/** Strip ANSI escape codes for text content checking */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function hasAnsi(str: string): boolean {
  return /\x1b\[/.test(str);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('getTheme', () => {
  const themeNames: HighlightThemeName[] = ['default', 'monokai', 'github', 'dracula', 'solarized'];

  for (const name of themeNames) {
    it(`returns '${name}' theme with all required fields`, () => {
      const theme = getTheme(name);
      expect(theme.name).toBe(name);
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

    it(`'${name}' theme produces styled output for keywords`, () => {
      const theme = getTheme(name);
      const result = theme.keyword('const');
      expect(stripAnsi(result)).toBe('const');
      // All themes except potentially some should add ANSI codes
      if (name !== 'default') {
        expect(hasAnsi(result)).toBe(true);
      }
    });
  }

  it('each theme returns a cached instance', () => {
    const t1 = getTheme('default');
    const t2 = getTheme('default');
    expect(t1).toBe(t2);
  });

  it('fails safe to the default for an invalid runtime name', () => {
    expect(getTheme('missing' as never).name).toBe('default');
  });
});

describe('createTheme', () => {
  it('creates a theme with default values', () => {
    const theme = createTheme({});
    expect(theme.name).toBe('default');
    expect(typeof theme.keyword).toBe('function');
  });

  it('applies overrides', () => {
    const custom = (t: string) => `CUSTOM:${t}`;
    const theme = createTheme({ keyword: custom, name: 'custom' });
    expect(theme.name).toBe('custom');
    expect(theme.keyword('test')).toBe('CUSTOM:test');
    // Other functions should still work from default
    expect(stripAnsi(theme.string('hi'))).toBe('hi');
  });

  it('ignores malformed runtime overrides instead of poisoning the theme', () => {
    const theme = createTheme({ name: 'safe', keyword: 'broken' as never });
    expect(stripAnsi(theme.keyword('const'))).toBe('const');
  });
});

describe('resolveTheme', () => {
  it('returns default theme when undefined', () => {
    const theme = resolveTheme();
    expect(theme.name).toBe('default');
  });

  it('resolves a theme name string', () => {
    const theme = resolveTheme('monokai');
    expect(theme.name).toBe('monokai');
  });

  it('normalizes theme names and fails safe for unknown strings', () => {
    expect(resolveTheme(' MONOKAI ' as never).name).toBe('monokai');
    expect(resolveTheme('missing' as never).name).toBe('default');
  });

  it('passes through a theme object', () => {
    const custom = getTheme('github');
    const resolved = resolveTheme(custom);
    expect(resolved).toBe(custom);
  });
});

describe('applyTheme', () => {
  const theme = getTheme('default');

  const baseCategories: TokenCategory[] = ['keyword', 'string', 'comment', 'number', 'operator', 'type', 'function', 'variable', 'punctuation', 'builtin'];

  for (const cat of baseCategories) {
    it(`applies '${cat}' category`, () => {
      const result = applyTheme(theme, cat, 'test');
      expect(stripAnsi(result)).toBe('test');
    });
  }

  const extendedCategories: TokenCategory[] = [
    'meta',
    'tag',
    'attribute',
    'regexp',
    'constant',
    'namespace',
    'parameter',
    'property',
    'label',
    'escape',
    'text',
  ];

  for (const cat of extendedCategories) {
    it(`applies extended '${cat}' category with fallback`, () => {
      const result = applyTheme(theme, cat, 'test');
      expect(stripAnsi(result)).toBe('test');
    });
  }

  it('text category returns unstyled text by default', () => {
    const result = applyTheme(theme, 'text', 'plain');
    expect(result).toBe('plain');
  });

  it('uses custom extended theme functions when provided', () => {
    const customTheme = createTheme({
      meta: (t: string) => `META:${t}`,
      tag: (t: string) => `TAG:${t}`,
    });
    expect(applyTheme(customTheme, 'meta', 'x')).toBe('META:x');
    expect(applyTheme(customTheme, 'tag', 'y')).toBe('TAG:y');
  });
});

describe('fromSemanticTheme', () => {
  it('produces a HighlightTheme with all required category functions', () => {
    const theme = fromSemanticTheme(defaultTheme);
    expect(theme.name).toBe('semantic');
    expect(typeof theme.keyword).toBe('function');
    expect(typeof theme.string).toBe('function');
    expect(typeof theme.comment).toBe('function');
    expect(typeof theme.number).toBe('function');
    expect(typeof theme.type).toBe('function');
    expect(typeof theme.function).toBe('function');
    expect(typeof theme.variable).toBe('function');
    expect(typeof theme.punctuation).toBe('function');
    expect(typeof theme.builtin).toBe('function');
  });

  it('honors a custom theme name', () => {
    const theme = fromSemanticTheme(defaultTheme, 'genesis-dark');
    expect(theme.name).toBe('genesis-dark');
  });

  it('renders ANSI-styled output for the basic categories', () => {
    const theme = fromSemanticTheme(defaultTheme);
    const keyword = theme.keyword('const');
    const string = theme.string('"hello"');
    const comment = theme.comment('// comment');
    expect(stripAnsi(keyword)).toBe('const');
    expect(hasAnsi(keyword)).toBe(true);
    expect(stripAnsi(string)).toBe('"hello"');
    expect(stripAnsi(comment)).toBe('// comment');
  });
});
