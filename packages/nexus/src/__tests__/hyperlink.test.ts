import { describe, expect, it, vi } from 'vitest';
import { hyperlink } from '../hyperlink.js';

describe('hyperlink', () => {
  it('produces correct OSC 8 sequence', () => {
    const result = hyperlink('Click here', 'https://example.com');
    expect(result).toBe('\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07');
  });

  it('includes id param when id option is provided', () => {
    const result = hyperlink('Click here', 'https://example.com', { id: 'link-1' });
    expect(result).toBe('\x1b]8;id=link-1;https://example.com\x07Click here\x1b]8;;\x07');
  });

  it('with fallback=true on unsupported terminal appends URL', () => {
    const originalEnv = { ...process.env };
    // Simulate unsupported terminal
    delete process.env['NO_COLOR'];
    delete process.env['TERM_PROGRAM'];
    delete process.env['VTE_VERSION'];
    delete process.env['COLORTERM'];
    process.env['TERM'] = 'dumb';

    // Need to clear the capability cache since detection caches results
    vi.resetModules();

    // Re-import to get fresh detection state
    return import('../hyperlink.js').then(({ hyperlink: freshHyperlink }) => {
      return import('../detection.js').then(({ _resetCache }) => {
        _resetCache();
        const result = freshHyperlink('Click here', 'https://example.com', { fallback: true });
        expect(result).toBe('Click here (https://example.com)');
        // Restore env
        for (const key of Object.keys(process.env)) {
          if (!(key in originalEnv)) {
            delete process.env[key];
          }
        }
        Object.assign(process.env, originalEnv);
        _resetCache();
      });
    });
  });

  it('with fallback=true on supported terminal produces OSC 8', () => {
    const originalEnv = { ...process.env };
    delete process.env['NO_COLOR'];
    delete process.env['TERM'];
    process.env['TERM_PROGRAM'] = 'iTerm.app';

    vi.resetModules();

    return import('../hyperlink.js').then(({ hyperlink: freshHyperlink }) => {
      return import('../detection.js').then(({ _resetCache }) => {
        _resetCache();
        const result = freshHyperlink('Click here', 'https://example.com', { fallback: true });
        expect(result).toBe('\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07');
        for (const key of Object.keys(process.env)) {
          if (!(key in originalEnv)) {
            delete process.env[key];
          }
        }
        Object.assign(process.env, originalEnv);
        _resetCache();
      });
    });
  });

  it('handles empty text', () => {
    const result = hyperlink('', 'https://example.com');
    expect(result).toBe('\x1b]8;;https://example.com\x07\x1b]8;;\x07');
  });

  it('handles special characters in URL', () => {
    const url = 'https://example.com/path?q=hello%20world&foo=bar#section';
    const result = hyperlink('Link', url);
    expect(result).toBe(`\x1b]8;;${url}\x07Link\x1b]8;;\x07`);
  });

  describe('input validation', () => {
    it('throws when url contains BEL', () => {
      expect(() => hyperlink('x', 'https://example.com\x07evil')).toThrow(/control characters/);
    });

    it('throws when url contains ESC', () => {
      expect(() => hyperlink('x', 'https://example.com\x1b[0m')).toThrow(/control characters/);
    });

    it('throws when url contains a newline', () => {
      expect(() => hyperlink('x', 'https://example.com\n')).toThrow(/control characters/);
    });

    it('throws when id contains a control character', () => {
      expect(() => hyperlink('x', 'https://example.com', { id: 'foo\x07' })).toThrow(/control characters/);
    });

    it('throws when id contains `;` (OSC delimiter)', () => {
      expect(() => hyperlink('x', 'https://example.com', { id: 'a;b' })).toThrow(/`;`/);
    });

    it('throws when id contains `:` (OSC delimiter)', () => {
      expect(() => hyperlink('x', 'https://example.com', { id: 'a:b' })).toThrow(/`:`/);
    });

    it('allows printable text in url and id', () => {
      const result = hyperlink('x', 'https://example.com', { id: 'nav-1' });
      expect(result).toContain('id=nav-1');
    });
  });
});
