import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetCache, detectCapabilities, supportsHyperlinks, supportsMouseTracking } from '../detection.js';

describe('detection', () => {
  let originalEnv: NodeJS.ProcessEnv;
  const isolatedKeys = [
    'COLORTERM',
    'FORCE_COLOR',
    'KITTY_PID',
    'LANG',
    'LC_ALL',
    'LC_TERMINAL',
    'NO_COLOR',
    'TERM',
    'TERM_PROGRAM',
    'VTE_VERSION',
    'WT_SESSION',
  ];

  beforeEach(() => {
    originalEnv = { ...process.env };
    for (const key of isolatedKeys) {
      delete process.env[key];
    }
    _resetCache();
  });

  afterEach(() => {
    // Restore env completely
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    _resetCache();
  });

  describe('detectCapabilities', () => {
    it('returns correct shape', () => {
      const caps = detectCapabilities();
      expect(caps).toHaveProperty('hyperlinks');
      expect(caps).toHaveProperty('mouseTracking');
      expect(caps).toHaveProperty('trueColor');
      expect(caps).toHaveProperty('images');
      expect(typeof caps.hyperlinks).toBe('boolean');
      expect(typeof caps.mouseTracking).toBe('boolean');
      expect(typeof caps.trueColor).toBe('boolean');
      expect(['kitty', 'iterm2', 'sixel', 'none']).toContain(caps.images);
    });

    it('results are cached after first call', () => {
      const first = detectCapabilities();
      const second = detectCapabilities();
      expect(first).toBe(second); // same reference
    });
  });

  describe('supportsHyperlinks', () => {
    it('returns true for iTerm2', () => {
      process.env['TERM_PROGRAM'] = 'iTerm.app';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for WezTerm', () => {
      process.env['TERM_PROGRAM'] = 'WezTerm';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for Ghostty', () => {
      process.env['TERM_PROGRAM'] = 'ghostty';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for high VTE version', () => {
      delete process.env['TERM_PROGRAM'];
      process.env['VTE_VERSION'] = '5000';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns false for dumb terminal', () => {
      delete process.env['TERM_PROGRAM'];
      delete process.env['VTE_VERSION'];
      delete process.env['COLORTERM'];
      process.env['TERM'] = 'dumb';
      expect(supportsHyperlinks()).toBe(false);
    });

    it('returns false when only COLORTERM=truecolor is set (no hyperlink support)', () => {
      delete process.env['TERM_PROGRAM'];
      delete process.env['VTE_VERSION'];
      process.env['COLORTERM'] = 'truecolor';
      process.env['TERM'] = 'xterm-256color';
      expect(supportsHyperlinks()).toBe(false);
    });

    it('returns false when only COLORTERM=24bit is set (no hyperlink support)', () => {
      delete process.env['TERM_PROGRAM'];
      delete process.env['VTE_VERSION'];
      process.env['COLORTERM'] = '24bit';
      process.env['TERM'] = 'xterm-256color';
      expect(supportsHyperlinks()).toBe(false);
    });
  });

  describe('supportsMouseTracking', () => {
    it('returns true for non-dumb terminals', () => {
      process.env['TERM'] = 'xterm-256color';
      expect(supportsMouseTracking()).toBe(true);
    });

    it('returns false for dumb terminal', () => {
      process.env['TERM'] = 'dumb';
      expect(supportsMouseTracking()).toBe(false);
    });

    it('returns true when TERM is not set (defaults to capable)', () => {
      delete process.env['TERM'];
      expect(supportsMouseTracking()).toBe(true);
    });
  });

  describe('image detection', () => {
    it('detects kitty', () => {
      process.env['KITTY_PID'] = '12345';
      const caps = detectCapabilities();
      expect(caps.images).toBe('kitty');
    });

    it('detects iterm2', () => {
      process.env['TERM_PROGRAM'] = 'iTerm.app';
      delete process.env['KITTY_PID'];
      const caps = detectCapabilities();
      expect(caps.images).toBe('iterm2');
    });

    it('returns none when no image protocol detected', () => {
      delete process.env['KITTY_PID'];
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'xterm-256color';
      const caps = detectCapabilities();
      expect(caps.images).toBe('none');
    });
  });

  describe('trueColor detection', () => {
    it('detects truecolor from COLORTERM', () => {
      process.env['COLORTERM'] = 'truecolor';
      const caps = detectCapabilities();
      expect(caps.trueColor).toBe(true);
    });

    it('detects 24bit from COLORTERM', () => {
      process.env['COLORTERM'] = '24bit';
      const caps = detectCapabilities();
      expect(caps.trueColor).toBe(true);
    });

    it('returns false when no truecolor indicators', () => {
      delete process.env['COLORTERM'];
      process.env['TERM'] = 'xterm';
      const caps = detectCapabilities();
      expect(caps.trueColor).toBe(false);
    });
  });
});
