import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectCapabilities, fallback, type TerminalCapabilities, withCapability } from '../capabilities.js';

describe('capabilities', () => {
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
  });

  afterEach(() => {
    // Restore env completely
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('detectCapabilities', () => {
    it('returns the correct shape', () => {
      const caps = detectCapabilities();
      expect(caps).toHaveProperty('color');
      expect(caps).toHaveProperty('mouse');
      expect(caps).toHaveProperty('hyperlinks');
      expect(caps).toHaveProperty('images');
      expect(caps).toHaveProperty('kittyKeyboard');
      expect(caps).toHaveProperty('synchronizedOutput');
      expect(caps).toHaveProperty('unicode');
      expect(caps).toHaveProperty('bracketedPaste');
    });

    it('returns valid color values', () => {
      const caps = detectCapabilities();
      expect(['none', '16', '256', 'truecolor']).toContain(caps.color);
    });

    it('returns boolean for mouse', () => {
      const caps = detectCapabilities();
      expect(typeof caps.mouse).toBe('boolean');
    });

    it('returns boolean for hyperlinks', () => {
      const caps = detectCapabilities();
      expect(typeof caps.hyperlinks).toBe('boolean');
    });

    it('returns valid images value', () => {
      const caps = detectCapabilities();
      expect(['kitty', 'iterm2', 'sixel', 'none']).toContain(caps.images);
    });

    it('returns boolean for kittyKeyboard', () => {
      const caps = detectCapabilities();
      expect(typeof caps.kittyKeyboard).toBe('boolean');
    });

    it('returns boolean for synchronizedOutput', () => {
      const caps = detectCapabilities();
      expect(typeof caps.synchronizedOutput).toBe('boolean');
    });

    it('returns valid unicode value', () => {
      const caps = detectCapabilities();
      expect(['none', 'basic', 'wide', 'full']).toContain(caps.unicode);
    });

    it('returns boolean for bracketedPaste', () => {
      const caps = detectCapabilities();
      expect(typeof caps.bracketedPaste).toBe('boolean');
    });
  });

  describe('color detection', () => {
    it('detects truecolor from COLORTERM=truecolor', () => {
      process.env['COLORTERM'] = 'truecolor';
      delete process.env['NO_COLOR'];
      const caps = detectCapabilities();
      expect(caps.color).toBe('truecolor');
    });

    it('detects truecolor from COLORTERM=24bit', () => {
      process.env['COLORTERM'] = '24bit';
      delete process.env['NO_COLOR'];
      const caps = detectCapabilities();
      expect(caps.color).toBe('truecolor');
    });

    it('detects 256 colors from TERM containing 256color', () => {
      delete process.env['COLORTERM'];
      delete process.env['NO_COLOR'];
      process.env['TERM'] = 'xterm-256color';
      const caps = detectCapabilities();
      expect(caps.color).toBe('256');
    });

    it('detects 16 colors from generic TERM', () => {
      delete process.env['COLORTERM'];
      delete process.env['NO_COLOR'];
      process.env['TERM'] = 'xterm';
      const caps = detectCapabilities();
      expect(caps.color).toBe('16');
    });

    it('returns none when NO_COLOR is set', () => {
      process.env['NO_COLOR'] = '1';
      process.env['COLORTERM'] = 'truecolor';
      const caps = detectCapabilities();
      expect(caps.color).toBe('none');
    });

    it('returns none when NO_COLOR is empty string (still set)', () => {
      process.env['NO_COLOR'] = '';
      const caps = detectCapabilities();
      expect(caps.color).toBe('none');
    });
  });

  describe('mouse detection', () => {
    it('returns true for modern terminals (always supported)', () => {
      const caps = detectCapabilities();
      expect(caps.mouse).toBe(true);
    });
  });

  describe('hyperlinks detection', () => {
    it('detects hyperlinks for iTerm2', () => {
      process.env['TERM_PROGRAM'] = 'iTerm2';
      const caps = detectCapabilities();
      expect(caps.hyperlinks).toBe(true);
    });

    it('detects hyperlinks for WezTerm', () => {
      process.env['TERM_PROGRAM'] = 'WezTerm';
      const caps = detectCapabilities();
      expect(caps.hyperlinks).toBe(true);
    });

    it('detects hyperlinks for kitty', () => {
      process.env['TERM_PROGRAM'] = 'kitty';
      const caps = detectCapabilities();
      expect(caps.hyperlinks).toBe(true);
    });

    it('detects hyperlinks for Hyper', () => {
      process.env['TERM_PROGRAM'] = 'Hyper';
      const caps = detectCapabilities();
      expect(caps.hyperlinks).toBe(true);
    });

    it('returns false for unknown terminal', () => {
      delete process.env['TERM_PROGRAM'];
      const caps = detectCapabilities();
      expect(caps.hyperlinks).toBe(false);
    });
  });

  describe('images detection', () => {
    it('detects kitty image protocol', () => {
      process.env['TERM_PROGRAM'] = 'kitty';
      const caps = detectCapabilities();
      expect(caps.images).toBe('kitty');
    });

    it('detects iterm2 image protocol for iTerm2', () => {
      process.env['TERM_PROGRAM'] = 'iTerm2';
      const caps = detectCapabilities();
      expect(caps.images).toBe('iterm2');
    });

    it('detects iterm2 image protocol for WezTerm', () => {
      process.env['TERM_PROGRAM'] = 'WezTerm';
      const caps = detectCapabilities();
      expect(caps.images).toBe('iterm2');
    });

    it('returns none for unknown terminal', () => {
      delete process.env['TERM_PROGRAM'];
      const caps = detectCapabilities();
      expect(caps.images).toBe('none');
    });
  });

  describe('kittyKeyboard detection', () => {
    it('detects kitty keyboard for TERM_PROGRAM=kitty', () => {
      process.env['TERM_PROGRAM'] = 'kitty';
      const caps = detectCapabilities();
      expect(caps.kittyKeyboard).toBe(true);
    });

    it('detects kitty keyboard for TERM=xterm-kitty', () => {
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'xterm-kitty';
      const caps = detectCapabilities();
      expect(caps.kittyKeyboard).toBe(true);
    });

    it('returns false for non-kitty terminal', () => {
      delete process.env['TERM_PROGRAM'];
      process.env['TERM'] = 'xterm-256color';
      const caps = detectCapabilities();
      expect(caps.kittyKeyboard).toBe(false);
    });
  });

  describe('synchronizedOutput detection', () => {
    it('detects for WezTerm', () => {
      process.env['TERM_PROGRAM'] = 'WezTerm';
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(true);
    });

    it('detects for iTerm2', () => {
      process.env['TERM_PROGRAM'] = 'iTerm2';
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(true);
    });

    it('detects for kitty', () => {
      process.env['TERM_PROGRAM'] = 'kitty';
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(true);
    });

    it('detects for contour', () => {
      process.env['TERM_PROGRAM'] = 'contour';
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(true);
    });

    it('detects for rio', () => {
      process.env['TERM_PROGRAM'] = 'rio';
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(true);
    });

    it('returns false for unknown terminal', () => {
      delete process.env['TERM_PROGRAM'];
      const caps = detectCapabilities();
      expect(caps.synchronizedOutput).toBe(false);
    });
  });

  describe('unicode detection', () => {
    it('detects full unicode from LANG with UTF-8', () => {
      process.env['LANG'] = 'en_US.UTF-8';
      delete process.env['LC_ALL'];
      const caps = detectCapabilities();
      expect(caps.unicode).toBe('full');
    });

    it('detects full unicode from LC_ALL with UTF-8', () => {
      delete process.env['LANG'];
      process.env['LC_ALL'] = 'en_US.UTF-8';
      const caps = detectCapabilities();
      expect(caps.unicode).toBe('full');
    });

    it('detects full unicode from lowercase utf-8', () => {
      process.env['LANG'] = 'en_US.utf-8';
      delete process.env['LC_ALL'];
      const caps = detectCapabilities();
      expect(caps.unicode).toBe('full');
    });

    it('returns basic when no UTF-8 locale', () => {
      delete process.env['LANG'];
      delete process.env['LC_ALL'];
      const caps = detectCapabilities();
      expect(caps.unicode).toBe('basic');
    });

    it('returns basic for non-UTF-8 locale', () => {
      process.env['LANG'] = 'C';
      delete process.env['LC_ALL'];
      const caps = detectCapabilities();
      expect(caps.unicode).toBe('basic');
    });
  });

  describe('bracketedPaste detection', () => {
    it('returns true (always supported in raw mode)', () => {
      const caps = detectCapabilities();
      expect(caps.bracketedPaste).toBe(true);
    });
  });

  describe('fallback chain', () => {
    it('returns the first matching capability value', () => {
      const result = fallback<string>().when('color', 'truecolor', 'rich-colors').when('color', '256', 'medium-colors').otherwise('basic-colors');

      // The actual result depends on the test env, but the chain should work
      expect(typeof result).toBe('string');
    });

    it('returns otherwise value when no conditions match', () => {
      // Set up env so color is definitely not 'truecolor'
      process.env['NO_COLOR'] = '1';
      delete process.env['COLORTERM'];

      const result = fallback<string>().when('color', 'truecolor', 'rich').otherwise('fallback');

      expect(result).toBe('fallback');
    });

    it('returns first match in chain order', () => {
      process.env['COLORTERM'] = 'truecolor';
      delete process.env['NO_COLOR'];

      const result = fallback<string>().when('color', 'truecolor', 'first-match').when('color', 'truecolor', 'second-match').otherwise('no-match');

      expect(result).toBe('first-match');
    });

    it('can chain multiple different capabilities', () => {
      const result = fallback<string>().when('mouse', true, 'has-mouse').otherwise('no-mouse');

      // mouse is always true
      expect(result).toBe('has-mouse');
    });
  });

  describe('withCapability', () => {
    it('returns enhanced value when capability matches', () => {
      const caps: TerminalCapabilities = {
        color: 'truecolor',
        mouse: true,
        hyperlinks: true,
        images: 'kitty',
        kittyKeyboard: true,
        synchronizedOutput: true,
        unicode: 'full',
        bracketedPaste: true,
      };

      const result = withCapability(caps, 'color', 'truecolor', 'rich', 'basic');
      expect(result).toBe('rich');
    });

    it('returns fallback value when capability does not match', () => {
      const caps: TerminalCapabilities = {
        color: '16',
        mouse: true,
        hyperlinks: false,
        images: 'none',
        kittyKeyboard: false,
        synchronizedOutput: false,
        unicode: 'basic',
        bracketedPaste: true,
      };

      const result = withCapability(caps, 'color', 'truecolor', 'rich', 'basic');
      expect(result).toBe('basic');
    });

    it('works with boolean capabilities', () => {
      const caps: TerminalCapabilities = {
        color: 'truecolor',
        mouse: true,
        hyperlinks: false,
        images: 'none',
        kittyKeyboard: false,
        synchronizedOutput: false,
        unicode: 'basic',
        bracketedPaste: true,
      };

      expect(withCapability(caps, 'mouse', true, 'mouse-ui', 'keyboard-ui')).toBe('mouse-ui');
      expect(withCapability(caps, 'hyperlinks', true, 'linked', 'plain')).toBe('plain');
    });

    it('works with images capability', () => {
      const caps: TerminalCapabilities = {
        color: 'truecolor',
        mouse: true,
        hyperlinks: true,
        images: 'kitty',
        kittyKeyboard: true,
        synchronizedOutput: true,
        unicode: 'full',
        bracketedPaste: true,
      };

      expect(withCapability(caps, 'images', 'kitty', 'kitty-img', 'no-img')).toBe('kitty-img');
      expect(withCapability(caps, 'images', 'iterm2', 'iterm-img', 'no-img')).toBe('no-img');
    });
  });
});
