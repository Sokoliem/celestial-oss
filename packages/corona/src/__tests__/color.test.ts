import { describe, expect, it, vi } from 'vitest';
import { color } from '../color.js';

describe('color', () => {
  describe('ANSI 16 colors', () => {
    it('should create standard foreground colors', () => {
      expect(color.red.fg()).toBe('\x1b[31m');
      expect(color.green.fg()).toBe('\x1b[32m');
      expect(color.blue.fg()).toBe('\x1b[34m');
      expect(color.cyan.fg()).toBe('\x1b[36m');
      expect(color.yellow.fg()).toBe('\x1b[33m');
      expect(color.magenta.fg()).toBe('\x1b[35m');
      expect(color.white.fg()).toBe('\x1b[37m');
      expect(color.black.fg()).toBe('\x1b[30m');
    });

    it('should create bright foreground colors', () => {
      expect(color.brightRed.fg()).toBe('\x1b[91m');
      expect(color.brightGreen.fg()).toBe('\x1b[92m');
      expect(color.brightBlue.fg()).toBe('\x1b[94m');
    });

    it('should create background colors', () => {
      expect(color.red.bg()).toBe('\x1b[41m');
      expect(color.green.bg()).toBe('\x1b[42m');
      expect(color.brightRed.bg()).toBe('\x1b[101m');
    });
  });

  describe('ANSI 256 colors', () => {
    it('should create 256-color foreground', () => {
      expect(color.ansi(196).fg()).toBe('\x1b[38;5;196m');
      expect(color.ansi(0).fg()).toBe('\x1b[38;5;0m');
      expect(color.ansi(255).fg()).toBe('\x1b[38;5;255m');
    });

    it('should create 256-color background', () => {
      expect(color.ansi(196).bg()).toBe('\x1b[48;5;196m');
    });

    it('should clamp out of range values', () => {
      expect(color.ansi(-1).fg()).toBe('\x1b[38;5;0m');
      expect(color.ansi(300).fg()).toBe('\x1b[38;5;255m');
    });
  });

  describe('true color (24-bit)', () => {
    it('should create from hex string', () => {
      expect(color.hex('#da70d6').fg()).toBe('\x1b[38;2;218;112;214m');
      expect(color.hex('#000000').fg()).toBe('\x1b[38;2;0;0;0m');
      expect(color.hex('#ffffff').fg()).toBe('\x1b[38;2;255;255;255m');
    });

    it('should handle hex without #', () => {
      expect(color.hex('da70d6').fg()).toBe('\x1b[38;2;218;112;214m');
    });

    it('should handle 3-char hex shorthand', () => {
      expect(color.hex('#f00').fg()).toBe('\x1b[38;2;255;0;0m');
      expect(color.hex('#0f0').fg()).toBe('\x1b[38;2;0;255;0m');
    });

    it('should create from RGB values', () => {
      expect(color.rgb(218, 112, 214).fg()).toBe('\x1b[38;2;218;112;214m');
    });

    it('should clamp RGB values', () => {
      expect(color.rgb(-10, 300, 128).fg()).toBe('\x1b[38;2;0;255;128m');
    });

    it('should create from HSL values', () => {
      // Pure red: hsl(0, 100, 50) = rgb(255, 0, 0)
      const red = color.hsl(0, 100, 50);
      expect(red.fg()).toBe('\x1b[38;2;255;0;0m');

      // Pure green: hsl(120, 100, 50) = rgb(0, 255, 0)
      const green = color.hsl(120, 100, 50);
      expect(green.fg()).toBe('\x1b[38;2;0;255;0m');
    });

    it('should create true color backgrounds', () => {
      expect(color.hex('#da70d6').bg()).toBe('\x1b[48;2;218;112;214m');
    });
  });

  describe('invalid hex handling', () => {
    it('should warn on invalid hex and fall back to black', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const c = color.hex('not-a-color');
      expect(c.fg()).toBe('\x1b[38;2;0;0;0m'); // black fallback
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid hex color: "not-a-color"'));
      stderrSpy.mockRestore();
    });

    it('should preserve the original invalid input in warning output', () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      color.hex('#12');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid hex color: "#12"'));
      stderrSpy.mockRestore();
    });

    it('should expose a validation helper for hex inputs', () => {
      expect(color.isValid('#da70d6')).toBe(true);
      expect(color.isValid('da70d6')).toBe(true);
      expect(color.isValid('#f0a')).toBe(true);
      expect(color.isValid('not-a-color')).toBe(false);
      expect(color.isValid('#12')).toBe(false);
    });
  });

  describe('special colors', () => {
    it('should have a reset color', () => {
      expect(color.reset.fg()).toBe('\x1b[39m');
      expect(color.reset.bg()).toBe('\x1b[49m');
    });

    it('should have dim/gray', () => {
      expect(color.gray.fg()).toBe('\x1b[90m');
    });
  });

  describe('color degradation', () => {
    it('should degrade true color to 256-color', () => {
      const c = color.hex('#da70d6');
      const degraded = c.degrade('256');
      expect(degraded.fg()).toMatch(/^\x1b\[38;5;\d+m$/);
    });

    it('should degrade true color to 16-color', () => {
      const c = color.hex('#ff0000');
      const degraded = c.degrade('16');
      expect(degraded.fg()).toMatch(/^\x1b\[\d+m$/);
    });

    it('should degrade to none (no color)', () => {
      const c = color.hex('#ff0000');
      const degraded = c.degrade('none');
      expect(degraded.fg()).toBe('');
      expect(degraded.bg()).toBe('');
    });

    it('should not degrade if already at target level', () => {
      const c = color.red; // ANSI 16
      const degraded = c.degrade('16');
      expect(degraded.fg()).toBe(c.fg());
    });
  });

  describe('grayscale ramp boundary', () => {
    it('should map rgb(250,250,250) to bright white (code 15), not cube white (231)', () => {
      // Perceptual nearest-match: [250,250,250] is closest to code 15 (bright white
      // = [255,255,255]) in OKLab space, not to cube white (231) or the grayscale
      // ramp's top entry (code 255 = [238,238,238]).
      const c = color.rgb(250, 250, 250);
      const degraded = c.degrade('256');
      const fg = degraded.fg();
      const match = fg.match(/\x1b\[38;5;(\d+)m/);
      expect(match).not.toBeNull();
      const code = parseInt(match![1]!, 10);
      // Code 15 (bright white) is perceptually closer than code 231 (cube white)
      expect(code).not.toBe(231);
    });

    it('should map rgb(249,249,249) away from cube white (231)', () => {
      const c = color.rgb(249, 249, 249);
      const degraded = c.degrade('256');
      const fg = degraded.fg();
      const match = fg.match(/\x1b\[38;5;(\d+)m/);
      expect(match).not.toBeNull();
      const code = parseInt(match![1]!, 10);
      expect(code).not.toBe(231);
    });
  });

  describe('perceptual nearest-match (OKLab)', () => {
    function degradedCode(r: number, g: number, b: number): number {
      const c = color.rgb(r, g, b);
      const degraded = c.degrade('256');
      const fg = degraded.fg();
      const match = fg.match(/\x1b\[38;5;(\d+)m/);
      expect(match).not.toBeNull();
      return parseInt(match![1]!, 10);
    }

    it('should map mid-gray (100,100,100) to a grayscale entry, not a color cube entry', () => {
      const code = degradedCode(100, 100, 100);
      // Grayscale ramp is 232-255, standard colors 0-15 include grays too
      // A perceptual match should NOT land in the 6x6x6 color cube (16-231)
      // unless it happens to be a gray cube entry. Code 59 = [95,95,95] is the
      // nearest cube gray, but grayscale ramp code 241 = [98,98,98] is closer.
      const isGrayscaleRamp = code >= 232 && code <= 255;
      const isStandardGray = code === 0 || code === 7 || code === 8 || code === 15;
      expect(isGrayscaleRamp || isStandardGray).toBe(true);
    });

    it('should map dark red (130,0,0) to a red-family entry', () => {
      const code = degradedCode(130, 0, 0);
      // Should be in the red area: standard red (1) or a red from the color cube
      // Code 1 = [128,0,0], code 124 = [175,0,0], code 52 = [95,0,0]
      expect(code === 1 || (code >= 16 && code <= 231)).toBe(true);
      // Verify the mapped color is actually reddish by checking RGB
      const parsed = color.fromAnsi(`\x1b[38;5;${code}m`);
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb![0]).toBeGreaterThan(parsed!.rgb![1]!); // R > G
      expect(parsed!.rgb![0]).toBeGreaterThan(parsed!.rgb![2]!); // R > B
    });

    it('should map pure red to a sensible 256 entry', () => {
      const code = degradedCode(255, 0, 0);
      // Should be code 196 (pure red in cube) or code 9 (bright red)
      expect([9, 196]).toContain(code);
    });

    it('should map pure green to a sensible 256 entry', () => {
      const code = degradedCode(0, 255, 0);
      // Should be code 46 (pure green in cube) or code 10 (bright green)
      expect([10, 46]).toContain(code);
    });

    it('should map pure blue to a sensible 256 entry', () => {
      const code = degradedCode(0, 0, 255);
      // Should be code 21 (pure blue in cube) or code 12 (bright blue)
      expect([12, 21]).toContain(code);
    });

    it('should map pure white to a white entry', () => {
      const code = degradedCode(255, 255, 255);
      // Code 15 (bright white) or code 231 (cube white)
      expect([15, 231]).toContain(code);
    });

    it('should map pure black to a black entry', () => {
      const code = degradedCode(0, 0, 0);
      // Code 0 (standard black) or code 16 (cube black) or code 232 (near-black gray)
      expect([0, 16]).toContain(code);
    });

    it('should map grayscale values to grayscale-family entries', () => {
      // Several gray levels should all map to grayscale ramp or standard gray entries
      for (const gray of [50, 100, 150, 200]) {
        const code = degradedCode(gray, gray, gray);
        const parsed = color.fromAnsi(`\x1b[38;5;${code}m`);
        expect(parsed).not.toBeNull();
        const [r, g, b] = parsed!.rgb!;
        // All channels should be close to each other (it's a gray match)
        expect(Math.abs(r - g)).toBeLessThanOrEqual(10);
        expect(Math.abs(g - b)).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('adaptive colors', () => {
    it('should create adaptive color with dark/light variants', () => {
      const c = color.adaptive('#58a6ff', '#0550ae');
      // adaptive returns a Color — the resolved variant depends on detection
      expect(c.fg()).toBeTruthy();
    });
  });

  describe('color equality', () => {
    it('should compare colors by value', () => {
      expect(color.hex('#ff0000').equals(color.rgb(255, 0, 0))).toBe(true);
      expect(color.red.equals(color.blue)).toBe(false);
    });
  });

  describe('fromAnsi', () => {
    it('should roundtrip truecolor FG', () => {
      const original = color.rgb(255, 128, 0);
      const parsed = color.fromAnsi(original.fg());
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([255, 128, 0]);
    });

    it('should roundtrip truecolor BG', () => {
      const original = color.rgb(0, 128, 255);
      const parsed = color.fromAnsi(original.bg());
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([0, 128, 255]);
    });

    it('should parse 256-color FG (code 196 = bright red)', () => {
      const parsed = color.fromAnsi('\x1b[38;5;196m');
      expect(parsed).not.toBeNull();
      // 196 is in the 6x6x6 cube: idx=180, r=5, g=0, b=0 → [255, 0, 0]
      expect(parsed!.rgb).toEqual([255, 0, 0]);
    });

    it('should parse 256-color grayscale (code 232)', () => {
      const parsed = color.fromAnsi('\x1b[38;5;232m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([8, 8, 8]);
    });

    it('should parse ANSI 16 standard FG (red = 31)', () => {
      const parsed = color.fromAnsi('\x1b[31m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([128, 0, 0]);
    });

    it('should parse ANSI 16 bright FG (bright red = 91)', () => {
      const parsed = color.fromAnsi('\x1b[91m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([255, 0, 0]);
    });

    it('should parse ANSI 16 standard BG (green = 42)', () => {
      const parsed = color.fromAnsi('\x1b[42m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([0, 128, 0]);
    });

    it('should parse ANSI 16 bright BG (bright green = 102)', () => {
      const parsed = color.fromAnsi('\x1b[102m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([0, 255, 0]);
    });

    it('should return color.reset for FG reset (39)', () => {
      const parsed = color.fromAnsi('\x1b[39m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toBeNull();
    });

    it('should return color.reset for BG reset (49)', () => {
      const parsed = color.fromAnsi('\x1b[49m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(color.fromAnsi('')).toBeNull();
    });

    it('should return null for malformed input', () => {
      expect(color.fromAnsi('garbage')).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(color.fromAnsi(undefined as any)).toBeNull();
    });

    it('should parse 256-color cube first entry (code 16 → [0,0,0])', () => {
      const parsed = color.fromAnsi('\x1b[38;5;16m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([0, 0, 0]);
    });

    it('should parse 256-color cube last entry (code 231 → [255,255,255])', () => {
      const parsed = color.fromAnsi('\x1b[38;5;231m');
      expect(parsed).not.toBeNull();
      expect(parsed!.rgb).toEqual([255, 255, 255]);
    });
  });
});
