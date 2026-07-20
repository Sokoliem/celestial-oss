import { describe, expect, it } from 'vitest';
import { color } from '../color.js';

describe('ANSI escape caching', () => {
  describe('TrueColor', () => {
    it('returns the same string reference for repeated fg() calls', () => {
      const c = color.rgb(100, 150, 200);
      const first = c.fg();
      const second = c.fg();
      expect(first).toBe(second); // same reference, not just equal
    });

    it('returns the same string reference for repeated bg() calls', () => {
      const c = color.rgb(100, 150, 200);
      expect(c.bg()).toBe(c.bg());
    });

    it('produces correct ANSI escape for fg', () => {
      const c = color.rgb(255, 128, 0);
      expect(c.fg()).toBe('\x1b[38;2;255;128;0m');
    });

    it('produces correct ANSI escape for bg', () => {
      const c = color.rgb(255, 128, 0);
      expect(c.bg()).toBe('\x1b[48;2;255;128;0m');
    });

    it('different instances with same RGB produce equal strings', () => {
      const a = color.rgb(42, 42, 42);
      const b = color.rgb(42, 42, 42);
      expect(a.fg()).toEqual(b.fg());
      expect(a.bg()).toEqual(b.bg());
    });
  });

  describe('Ansi256Color', () => {
    it('returns the same string reference for repeated fg() calls', () => {
      const c = color.ansi(196);
      expect(c.fg()).toBe(c.fg());
    });

    it('returns the same string reference for repeated bg() calls', () => {
      const c = color.ansi(196);
      expect(c.bg()).toBe(c.bg());
    });

    it('produces correct ANSI escape', () => {
      const c = color.ansi(42);
      expect(c.fg()).toBe('\x1b[38;5;42m');
      expect(c.bg()).toBe('\x1b[48;5;42m');
    });
  });

  describe('degrade produces independent cache', () => {
    it('degraded color has its own fg/bg cache', () => {
      const tc = color.rgb(100, 200, 50);
      const degraded = tc.degrade('256');
      // They should produce different strings
      expect(tc.fg()).not.toEqual(degraded.fg());
      // Each should still cache independently
      expect(degraded.fg()).toBe(degraded.fg());
    });
  });
});
