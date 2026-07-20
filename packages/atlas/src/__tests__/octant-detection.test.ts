import { describe, expect, it } from 'vitest';
import { detectCapabilities } from '../detect.js';
import { hasUnicodeOctants, hasUnicodeSextants } from '../policy.js';
import type { AtlasCapabilities } from '../types.js';

const baseCaps = (level: AtlasCapabilities['unicodeLevel']): Pick<AtlasCapabilities, 'unicodeLevel'> => ({ unicodeLevel: level });

describe('hasUnicodeOctants / hasUnicodeSextants', () => {
  it('returns true for unicode16 level (octants and sextants)', () => {
    expect(hasUnicodeOctants(baseCaps('unicode16'))).toBe(true);
    expect(hasUnicodeSextants(baseCaps('unicode16'))).toBe(true);
  });

  it('returns true only for sextants at "full" level', () => {
    expect(hasUnicodeOctants(baseCaps('full'))).toBe(false);
    expect(hasUnicodeSextants(baseCaps('full'))).toBe(true);
  });

  it('returns false for both at "wide", "basic", "none"', () => {
    for (const level of ['wide', 'basic', 'none'] as const) {
      expect(hasUnicodeOctants(baseCaps(level))).toBe(false);
      expect(hasUnicodeSextants(baseCaps(level))).toBe(false);
    }
  });
});

describe('detectCapabilities — Unicode 16 terminal whitelist', () => {
  it('reports unicode16 for kitty', () => {
    const caps = detectCapabilities({
      env: { TERM: 'xterm-kitty', LANG: 'en_US.UTF-8' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).toBe('unicode16');
  });

  it('reports unicode16 for ghostty', () => {
    const caps = detectCapabilities({
      env: { TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty', LANG: 'en_US.UTF-8' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).toBe('unicode16');
  });

  it('reports unicode16 for wezterm (the new addition)', () => {
    const caps = detectCapabilities({
      env: { TERM: 'wezterm', TERM_PROGRAM: 'WezTerm', LANG: 'en_US.UTF-8' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).toBe('unicode16');
  });

  it('reports "full" for Apple Terminal — must NOT be unicode16', () => {
    const caps = detectCapabilities({
      env: { TERM: 'xterm-256color', TERM_PROGRAM: 'Apple_Terminal', LANG: 'en_US.UTF-8' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).not.toBe('unicode16');
  });

  it('reports "full" for plain xterm — must NOT be unicode16', () => {
    const caps = detectCapabilities({
      env: { TERM: 'xterm-256color', LANG: 'en_US.UTF-8' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).not.toBe('unicode16');
  });

  it('honours TERM_FEATURES=unicode16 user opt-in for any terminal', () => {
    const caps = detectCapabilities({
      env: {
        TERM: 'xterm-256color',
        TERM_PROGRAM: 'Apple_Terminal',
        TERM_FEATURES: 'unicode16',
        LANG: 'en_US.UTF-8',
      } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).toBe('unicode16');
  });

  it('does not lift to unicode16 in non-UTF-8 locales even on capable terminals', () => {
    const caps = detectCapabilities({
      env: { TERM: 'xterm-kitty', LANG: 'C' } as NodeJS.ProcessEnv,
    });
    expect(caps.unicodeLevel).toBe('basic');
  });
});
