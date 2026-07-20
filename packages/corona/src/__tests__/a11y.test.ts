import { afterEach, describe, expect, it } from 'vitest';
import {
  announceText,
  auditTheme,
  ensureReadableColor,
  highContrast,
  normalizeThemeContrast,
  reduceMotion,
  stripAllStyles,
  validateThemeContrast,
} from '../a11y.js';
import { color } from '../color.js';
import * as corona from '../index.js';
import { applyVariant, createTheme, darkVariant, defaultTheme, highContrastVariant, lightVariant } from '../theme.js';

describe('a11y exports from index', () => {
  it('should export highContrast from the package index', () => {
    // Regression 1.4: a11y.ts exports were missing from index.ts
    expect(typeof corona.highContrast).toBe('function');
  });

  it('should export stripAllStyles from the package index', () => {
    expect(typeof corona.stripAllStyles).toBe('function');
  });

  it('should export announceText from the package index', () => {
    expect(typeof corona.announceText).toBe('function');
  });

  it('should export reduceMotion from the package index', () => {
    expect(typeof corona.reduceMotion).toBe('function');
  });

  it('exports flagship theme audit and repair helpers', () => {
    expect(typeof corona.ensureDistinctColor).toBe('function');
    expect(typeof corona.ensureReadableBackground).toBe('function');
    expect(typeof corona.ensureReadableColor).toBe('function');
    expect(typeof corona.normalizeThemeContrast).toBe('function');
    expect(typeof corona.auditTheme).toBe('function');
  });
});

describe('highContrast', () => {
  it('strips colors and adds bold', () => {
    const styled = '\x1b[31mHello\x1b[0m';
    const result = highContrast(styled);
    expect(result).toBe('\x1b[1mHello\x1b[22m');
  });

  it('preserves text content', () => {
    const styled = '\x1b[32;44mImportant message\x1b[0m';
    const result = highContrast(styled);
    expect(result).toContain('Important message');
    expect(result).not.toMatch(/\x1b\[32;44m/);
  });

  it('handles text without ANSI codes', () => {
    const result = highContrast('Plain text');
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('Plain text');
  });

  it('should not use full reset (\\x1b[0m) which resets all terminal state', () => {
    // Regression: highContrast used \x1b[0m (full reset) instead of \x1b[22m (bold-off).
    // Full reset clears ALL terminal state (colors, underline, etc.), which breaks
    // downstream rendering when highContrast output is embedded in styled content.
    const result = highContrast('text');
    expect(result).not.toContain('\x1b[0m');
    expect(result).toContain('\x1b[22m'); // bold-off only
  });
});

describe('highContrast with OSC hyperlinks', () => {
  it('should strip OSC hyperlink escapes and convert to bold', () => {
    // Regression 1.3: a11y.ts had a local ANSI_REGEX that only matched SGR sequences,
    // missing OSC hyperlinks, leaving raw escape codes in the output.
    const linked = '\x1b]8;;https://example.com\x07docs\x1b]8;;\x07';
    const result = highContrast(linked);
    expect(result).toBe('\x1b[1mdocs\x1b[22m');
    expect(result).not.toContain('\x1b]8');
  });
});

describe('stripAllStyles with OSC hyperlinks', () => {
  it('should strip OSC hyperlink escapes', () => {
    // Regression 1.3: stripAllStyles used a local regex that missed OSC hyperlinks
    const linked = '\x1b[31m\x1b]8;;https://x.com\x07link\x1b]8;;\x07\x1b[0m';
    const result = stripAllStyles(linked);
    expect(result).toBe('link');
    expect(result).not.toContain('\x1b');
  });
});

describe('stripAllStyles', () => {
  it('removes all ANSI sequences', () => {
    const styled = '\x1b[1m\x1b[31mBold Red\x1b[0m';
    const result = stripAllStyles(styled);
    expect(result).toBe('Bold Red');
  });

  it('handles plain text', () => {
    const result = stripAllStyles('No styles here');
    expect(result).toBe('No styles here');
  });

  it('removes multiple escape sequences', () => {
    const styled = '\x1b[1mBold\x1b[0m and \x1b[4mUnderline\x1b[0m';
    const result = stripAllStyles(styled);
    expect(result).toBe('Bold and Underline');
  });
});

describe('announceText', () => {
  it('prepends bell character', () => {
    const result = announceText('Alert!');
    expect(result).toBe('\x07Alert!');
  });

  it('works with empty string', () => {
    const result = announceText('');
    expect(result).toBe('\x07');
  });

  it('accepts polite priority without changing output', () => {
    const result = announceText('Polite message', 'polite');
    expect(result).toBe('\x07Polite message');
  });

  it('accepts assertive priority without changing output', () => {
    const result = announceText('Urgent!', 'assertive');
    expect(result).toBe('\x07Urgent!');
  });

  it('defaults to polite priority', () => {
    // Both calls should return identical output
    const withDefault = announceText('hello');
    const withExplicit = announceText('hello', 'polite');
    expect(withDefault).toBe(withExplicit);
  });
});

describe('reduceMotion', () => {
  // Save originals to restore after each test
  const originalEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    // Restore modified env vars
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    Object.keys(originalEnv).forEach((k) => delete originalEnv[k]);
  });

  function setEnv(key: string, value: string | undefined) {
    originalEnv[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  it('returns false when neither env var is set', () => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', undefined);
    expect(reduceMotion()).toBe(false);
  });

  it('returns true when NO_MOTION=1', () => {
    setEnv('NO_MOTION', '1');
    setEnv('REDUCE_MOTION', undefined);
    expect(reduceMotion()).toBe(true);
  });

  it('returns true when REDUCE_MOTION=1', () => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', '1');
    expect(reduceMotion()).toBe(true);
  });

  it('returns true when REDUCE_MOTION=true', () => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', 'true');
    expect(reduceMotion()).toBe(true);
  });

  it('returns false when NO_MOTION=0', () => {
    setEnv('NO_MOTION', '0');
    setEnv('REDUCE_MOTION', undefined);
    expect(reduceMotion()).toBe(false);
  });

  it('returns false when REDUCE_MOTION is empty string', () => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', '');
    expect(reduceMotion()).toBe(false);
  });

  it('returns false when REDUCE_MOTION=false', () => {
    setEnv('NO_MOTION', undefined);
    setEnv('REDUCE_MOTION', 'false');
    expect(reduceMotion()).toBe(false);
  });
});

// ─── WS8: Theme contrast validation ──────────────────────────────────────────

describe('validateThemeContrast', () => {
  it('is exported from the package index', () => {
    expect(typeof corona.validateThemeContrast).toBe('function');
  });

  it('returns a ThemeA11yReport', () => {
    const report = validateThemeContrast(defaultTheme);
    expect(report).toHaveProperty('level');
    expect(report).toHaveProperty('pass');
    expect(report).toHaveProperty('violations');
    expect(report).toHaveProperty('pairsChecked');
    expect(typeof report.pass).toBe('boolean');
    expect(Array.isArray(report.violations)).toBe(true);
    expect(typeof report.pairsChecked).toBe('number');
  });

  it('defaults to AA level', () => {
    const report = validateThemeContrast(defaultTheme);
    expect(report.level).toBe('AA');
  });

  it('checks multiple pairs', () => {
    const report = validateThemeContrast(defaultTheme);
    expect(report.pairsChecked).toBeGreaterThanOrEqual(10);
  });

  it('highContrastVariant passes AAA', () => {
    const hc = applyVariant(defaultTheme, highContrastVariant);
    const report = validateThemeContrast(hc, 'AAA');
    // High contrast should pass at least text on surface
    const textOnSurface = report.violations.find((v) => v.pair === 'text on surface');
    expect(textOnSurface).toBeUndefined();
  });

  it('violations include pair name, fg, bg, ratio, required', () => {
    // Create a theme with terrible contrast
    const badTheme = createTheme({
      colors: {
        text: color.hex('#333333'),
        surface: color.hex('#444444'),
      },
    });
    const report = validateThemeContrast(badTheme);
    if (report.violations.length > 0) {
      const v = report.violations[0]!;
      expect(v.pair).toBeDefined();
      expect(v.fg).toBeDefined();
      expect(v.bg).toBeDefined();
      expect(typeof v.ratio).toBe('number');
      expect(typeof v.required).toBe('number');
    }
  });

  it('bad contrast theme has violations', () => {
    const badTheme = createTheme({
      contrast: { enforce: false },
      colors: {
        text: color.hex('#555555'),
        surface: color.hex('#666666'),
      },
    });
    const report = validateThemeContrast(badTheme);
    expect(report.pass).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it('repairs unsafe semantic tokens during theme construction by default', () => {
    const safeTheme = createTheme({
      colors: {
        text: color.hex('#555555'),
        textSoft: color.hex('#555555'),
        muted: color.hex('#555555'),
        surface: color.hex('#666666'),
        surfaceRaised: color.hex('#666666'),
      },
    });

    expect(validateThemeContrast(safeTheme).pass).toBe(true);
    expect(color.contrastRatio(safeTheme.typography.caption.color, safeTheme.elevation.modal.surface!)).toBeGreaterThanOrEqual(4.5);
  });

  it('allows audit tooling to preserve an intentionally unsafe theme', () => {
    const unsafeTheme = createTheme({
      contrast: { enforce: false },
      colors: {
        text: color.hex('#555555'),
        muted: color.hex('#555555'),
        surface: color.hex('#666666'),
      },
    });

    expect(unsafeTheme.colors.text.rgb).toEqual([85, 85, 85]);
    expect(validateThemeContrast(unsafeTheme).pass).toBe(false);
  });

  it('AAA requires higher ratio than AA', () => {
    const theme = createTheme();
    const aaReport = validateThemeContrast(theme, 'AA');
    const aaaReport = validateThemeContrast(theme, 'AAA');
    // AAA should have at least as many violations as AA
    expect(aaaReport.violations.length).toBeGreaterThanOrEqual(aaReport.violations.length);
  });

  it('violation ratio is between 1 and 21', () => {
    const badTheme = createTheme({
      colors: {
        text: color.hex('#555555'),
        surface: color.hex('#666666'),
      },
    });
    const report = validateThemeContrast(badTheme);
    for (const v of report.violations) {
      expect(v.ratio).toBeGreaterThanOrEqual(1);
      expect(v.ratio).toBeLessThanOrEqual(21);
    }
  });

  it('darkVariant can be audited without error', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    const report = validateThemeContrast(dark);
    expect(report.pairsChecked).toBeGreaterThan(0);
  });

  it('darkVariant passes AA critical pairs', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    expect(validateThemeContrast(dark).pass).toBe(true);
  });

  it('lightVariant can be audited without error', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    const report = validateThemeContrast(light);
    expect(report.pairsChecked).toBeGreaterThan(0);
  });

  it('lightVariant passes AA critical pairs', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(validateThemeContrast(light).pass).toBe(true);
  });

  it('A11yLevel and ContrastViolation types are exported', () => {
    expect(typeof corona.validateThemeContrast).toBe('function');
    // Type-level check — these must compile
    const _level: corona.A11yLevel = 'AA';
    const _violation: corona.ContrastViolation = {
      pair: 'test',
      fg: color.white,
      bg: color.black,
      ratio: 21,
      required: 4.5,
    };
    expect(_level).toBe('AA');
    expect(_violation.pair).toBe('test');
  });
});

describe('theme contrast repair and audit', () => {
  it('repairs a low-contrast foreground against a background', () => {
    const bg = color.hex('#444444');
    const fixed = ensureReadableColor(color.hex('#555555'), bg, { minimum: 4.5 });
    expect(color.contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('supports fixed-step contrast repair sampling', () => {
    const bg = color.hex('#444444');
    const fixed = ensureReadableColor(color.hex('#555555'), bg, { minimum: 4.5, stepSize: 0.25 });
    expect(color.contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('normalizes semantic theme foreground tokens without changing surfaces', () => {
    const surface = color.hex('#444444');
    const theme = createTheme({
      colors: {
        text: color.hex('#555555'),
        surface,
        bg: surface,
        surfaceAlt: surface,
        surfaceRaised: surface,
      },
    });

    const normalized = normalizeThemeContrast(theme);
    expect(normalized.colors.surface.rgb).toEqual(surface.rgb);
    expect(color.contrastRatio(normalized.colors.text, normalized.colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('reports contrast, glyph, motion, and PTY audit state', () => {
    const report = auditTheme(defaultTheme, {
      pty: { variant: 'identity', ansi16: ['#000000'] },
      colorVision: ['deuteranopia'],
    });

    expect(report.contrast.pairsChecked).toBeGreaterThan(0);
    expect(report.glyphs.checked).toBeGreaterThan(0);
    expect(report.pty?.pass).toBe(false);
    expect(report.warnings.some((warning) => warning.kind === 'pty')).toBe(true);
  });
});
