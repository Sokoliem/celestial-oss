import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import { type AnsiPaletteTokenValues, ansiPaletteTokens, resolveDomainTokens } from '../domain-tokens.js';
import { applyVariant, defaultTheme, highContrastVariant } from '../theme.js';

function isColor(c: unknown): c is Color {
  return c !== null && typeof c === 'object' && 'fg' in c && 'bg' in c;
}

describe('ansiPaletteTokens', () => {
  const allKeys: (keyof AnsiPaletteTokenValues)[] = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'gray',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite',
  ];

  it('exposes a resolver for every ANSI 16-color slot', () => {
    for (const key of allKeys) {
      expect(typeof ansiPaletteTokens[key]).toBe('function');
    }
  });

  it('default resolvers return corona built-in ANSI colors for printf-style fidelity', () => {
    // The whole point of ANSI palette tokens defaulting to the raw corona
    // palette is that `printf '\\033[31mfoo'` should still render red. If a
    // future maintainer routes these through theme tones, this test fails and
    // forces the conversation.
    const resolved = resolveDomainTokens(ansiPaletteTokens, defaultTheme);
    expect(resolved.black).toBe(color.black);
    expect(resolved.red).toBe(color.red);
    expect(resolved.green).toBe(color.green);
    expect(resolved.yellow).toBe(color.yellow);
    expect(resolved.blue).toBe(color.blue);
    expect(resolved.magenta).toBe(color.magenta);
    expect(resolved.cyan).toBe(color.cyan);
    expect(resolved.white).toBe(color.white);
    expect(resolved.gray).toBe(color.gray);
    expect(resolved.brightRed).toBe(color.brightRed);
    expect(resolved.brightGreen).toBe(color.brightGreen);
    expect(resolved.brightYellow).toBe(color.brightYellow);
    expect(resolved.brightBlue).toBe(color.brightBlue);
    expect(resolved.brightMagenta).toBe(color.brightMagenta);
    expect(resolved.brightCyan).toBe(color.brightCyan);
    expect(resolved.brightWhite).toBe(color.brightWhite);
  });

  it('every resolved entry is a Color (shape check across all 16 slots)', () => {
    const resolved = resolveDomainTokens(ansiPaletteTokens, defaultTheme);
    for (const key of allKeys) {
      expect(isColor(resolved[key])).toBe(true);
    }
  });

  it('overrides take precedence over default resolvers', () => {
    const customRed = color.hex('#aa0000');
    const resolved = resolveDomainTokens(ansiPaletteTokens, defaultTheme, {
      red: customRed,
      brightRed: customRed,
    });
    expect(resolved.red).toBe(customRed);
    expect(resolved.brightRed).toBe(customRed);
    // Untouched entries still come from the corona palette.
    expect(resolved.green).toBe(color.green);
  });

  it('resolves stably against a high-contrast theme', () => {
    // The defaults are theme-agnostic, so a high-contrast theme produces
    // exactly the same palette unless the caller overrides — this is the
    // intentional contract (theme-aware ANSI is opt-in).
    const hc = applyVariant(defaultTheme, highContrastVariant);
    const resolved = resolveDomainTokens(ansiPaletteTokens, hc);
    expect(resolved.red).toBe(color.red);
    expect(resolved.brightWhite).toBe(color.brightWhite);
  });
});
