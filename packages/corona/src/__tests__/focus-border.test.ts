import { describe, expect, it } from 'vitest';
import { border } from '../border.js';
import { color } from '../color.js';

describe('focus-aware border colors', () => {
  const focusColor = color.rgb(0, 120, 255);
  const normalColor = color.rgb(100, 100, 100);

  describe('border.render', () => {
    it('should render normally when not focused', () => {
      const result = border.render('hello', border.square);
      const lines = result.split('\n');
      expect(lines[0]).toBe('┌─────┐');
      expect(lines[1]).toBe('│hello│');
      expect(lines[2]).toBe('└─────┘');
    });

    it('should render with focusColor when focused is true', () => {
      const result = border.render('hi', border.square, undefined, undefined, {
        focused: true,
        focusColor,
      });
      const fgEsc = focusColor.fg();
      expect(result).toContain(fgEsc);
    });

    it('should ignore focusColor when focused is false', () => {
      const result = border.render('hi', border.square, undefined, undefined, {
        focused: false,
        focusColor,
      });
      const fgEsc = focusColor.fg();
      expect(result).not.toContain(fgEsc);
    });

    it('should ignore focusColor when focused is true but focusColor is not provided', () => {
      const plain = border.render('hi', border.square);
      const withFocusFlag = border.render('hi', border.square, undefined, undefined, {
        focused: true,
      });
      // Without focusColor, output should be the same as plain
      expect(withFocusFlag).toBe(plain);
    });

    it('should override borderColor with focusColor when focused', () => {
      const result = border.render('hi', border.square, undefined, normalColor, {
        focused: true,
        focusColor,
      });
      const focusFg = focusColor.fg();
      const normalFg = normalColor.fg();
      // focusColor should be present, normalColor should not
      expect(result).toContain(focusFg);
      expect(result).not.toContain(normalFg);
    });

    it('should use borderColor when focused is false even if focusColor is provided', () => {
      const result = border.render('hi', border.square, undefined, normalColor, {
        focused: false,
        focusColor,
      });
      const normalFg = normalColor.fg();
      const focusFg = focusColor.fg();
      expect(result).toContain(normalFg);
      expect(result).not.toContain(focusFg);
    });

    it('should work with all border styles when focused', () => {
      const styles = [border.rounded, border.square, border.double, border.thick, border.hidden];
      for (const b of styles) {
        const result = border.render('x', b, undefined, undefined, {
          focused: true,
          focusColor,
        });
        expect(result).toContain(focusColor.fg());
      }
    });

    it('should produce same structural output with focusColor as without', () => {
      const plain = border.render('hello', border.square);
      const focused = border.render('hello', border.square, undefined, undefined, {
        focused: true,
        focusColor,
      });
      const strip = (s: string) => s.replace(/\x1b\[[^m]*m/g, '');
      expect(strip(focused)).toBe(strip(plain));
    });
  });

  describe('border.titled', () => {
    it('should render titled border with focusColor when focused', () => {
      const result = border.titled('content', border.rounded, 20, 'Panel', {
        focused: true,
        focusColor,
      });
      expect(result).toContain(focusColor.fg());
      expect(result).toContain('Panel');
    });

    it('should ignore focusColor in titled border when not focused', () => {
      const result = border.titled('content', border.rounded, 20, 'Panel', {
        focused: false,
        focusColor,
      });
      expect(result).not.toContain(focusColor.fg());
    });

    it('should override borderColor with focusColor in titled border when focused', () => {
      const result = border.titled('content', border.rounded, 20, 'Panel', {
        borderColor: normalColor,
        focused: true,
        focusColor,
      });
      expect(result).toContain(focusColor.fg());
      expect(result).not.toContain(normalColor.fg());
    });

    it('should preserve titleColor and subtitleColor when focused', () => {
      const titleColor = color.rgb(255, 0, 0);
      const subtitleColor = color.rgb(0, 255, 0);
      const result = border.titled('body', border.square, 20, 'Title', {
        subtitle: 'Sub',
        titleColor,
        subtitleColor,
        focused: true,
        focusColor,
      });
      // Focus color for border chars
      expect(result).toContain(focusColor.fg());
      // Title and subtitle colors preserved
      expect(result).toContain(titleColor.fg());
      expect(result).toContain(subtitleColor.fg());
    });

    it('should produce same structural titled output with focusColor as without', () => {
      const plain = border.titled('hello', border.square, 20, 'Title');
      const focused = border.titled('hello', border.square, 20, 'Title', {
        focused: true,
        focusColor,
      });
      const strip = (s: string) => s.replace(/\x1b\[[^m]*m/g, '');
      expect(strip(focused)).toBe(strip(plain));
    });
  });
});
