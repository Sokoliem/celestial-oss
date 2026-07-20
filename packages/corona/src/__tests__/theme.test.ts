import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import {
  applyVariant,
  createTheme,
  darkVariant,
  defaultTheme,
  defineThemeVariant,
  extendTheme,
  highContrastVariant,
  lightVariant,
  resolveSpacing,
  resolveToneColor,
  type SemanticTheme,
  type ThemeElevation,
  type ThemeInput,
  type ThemeStates,
  type ThemeTypography,
  theme,
} from '../theme.js';

describe('theme (low-level token bag)', () => {
  it('creates a frozen object from color tokens', () => {
    const t = theme({ primary: color.red, secondary: color.blue });
    expect(t.primary).toBe(color.red);
    expect(t.secondary).toBe(color.blue);
    expect(Object.isFrozen(t)).toBe(true);
  });

  it('does not mutate the input tokens object', () => {
    const tokens = { primary: color.red };
    const t = theme(tokens);
    expect(t).not.toBe(tokens);
  });

  it('throws when attempting to mutate a frozen theme', () => {
    const t = theme({ a: color.green });
    expect(() => {
      (t as Record<string, Color>).a = color.blue;
    }).toThrow();
  });
});

describe('defaultTheme', () => {
  it('has all required color keys', () => {
    expect(defaultTheme.colors.text).toBeDefined();
    expect(defaultTheme.colors.muted).toBeDefined();
    expect(defaultTheme.colors.border).toBeDefined();
    expect(defaultTheme.colors.surface).toBeDefined();
    expect(defaultTheme.colors.inverse).toBeDefined();
  });

  // ─── Enriched ThemeColors ─────────────────────────────────────────────────
  it('has text hierarchy (3 tiers)', () => {
    expect(defaultTheme.colors.text).toBeDefined();
    expect(defaultTheme.colors.textSoft).toBeDefined();
    expect(defaultTheme.colors.muted).toBeDefined();
    // textSoft is visually between text and muted
    expect(typeof defaultTheme.colors.textSoft.fg).toBe('function');
  });

  it('has surface hierarchy (5 levels)', () => {
    expect(defaultTheme.colors.bg).toBeDefined();
    expect(defaultTheme.colors.surface).toBeDefined();
    expect(defaultTheme.colors.surfaceAlt).toBeDefined();
    expect(defaultTheme.colors.surfaceRaised).toBeDefined();
    expect(defaultTheme.colors.backdrop).toBeDefined();
    // All are Color objects
    expect(typeof defaultTheme.colors.bg.fg).toBe('function');
    expect(typeof defaultTheme.colors.surfaceAlt.fg).toBe('function');
    expect(typeof defaultTheme.colors.surfaceRaised.fg).toBe('function');
    expect(typeof defaultTheme.colors.backdrop.fg).toBe('function');
  });

  it('has border hierarchy (3 states + divider)', () => {
    expect(defaultTheme.colors.border).toBeDefined();
    expect(defaultTheme.colors.borderHover).toBeDefined();
    expect(defaultTheme.colors.borderActive).toBeDefined();
    expect(defaultTheme.colors.divider).toBeDefined();
    expect(typeof defaultTheme.colors.borderHover.fg).toBe('function');
    expect(typeof defaultTheme.colors.borderActive.fg).toBe('function');
    expect(typeof defaultTheme.colors.divider.fg).toBe('function');
  });

  // ─── Semantic color tokens (accent decomposition) ────────────────────────
  it('has all 7 semantic color tokens', () => {
    expect(defaultTheme.colors.highlight).toBeDefined();
    expect(defaultTheme.colors.interactive).toBeDefined();
    expect(defaultTheme.colors.focusRing).toBeDefined();
    expect(defaultTheme.colors.trackFill).toBeDefined();
    expect(defaultTheme.colors.cursor).toBeDefined();
    expect(defaultTheme.colors.linkColor).toBeDefined();
    expect(defaultTheme.colors.placeholder).toBeDefined();
  });

  it('semantic tokens are Color objects', () => {
    const tokens = ['highlight', 'interactive', 'focusRing', 'trackFill', 'cursor', 'linkColor', 'placeholder'] as const;
    for (const token of tokens) {
      expect(typeof defaultTheme.colors[token].fg).toBe('function');
    }
  });

  it('semantic tokens default to accent/muted (backward compatible)', () => {
    const t = defaultTheme;
    // Accent-derived tokens should match tones.accent
    expect(t.colors.highlight.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.interactive.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.focusRing.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.trackFill.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.cursor.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.linkColor.rgb).toEqual(t.colors.tones.accent.rgb);
    // Placeholder derives from muted
    expect(t.colors.placeholder.rgb).toEqual(t.colors.muted.rgb);
  });

  it('has all tone colors', () => {
    const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      expect(defaultTheme.colors.tones[tone]).toBeDefined();
      expect(typeof defaultTheme.colors.tones[tone].fg).toBe('function');
    }
  });

  it('has spacing for all sizes', () => {
    const sizes = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
    for (const size of sizes) {
      expect(typeof defaultTheme.spacing[size]).toBe('number');
    }
  });

  it('has spacing values in ascending order', () => {
    const { none, xs, sm, md, lg, xl } = defaultTheme.spacing;
    expect(none).toBeLessThanOrEqual(xs);
    expect(xs).toBeLessThanOrEqual(sm);
    expect(sm).toBeLessThanOrEqual(md);
    expect(md).toBeLessThanOrEqual(lg);
    expect(lg).toBeLessThanOrEqual(xl);
    expect(xl).toBeLessThanOrEqual(defaultTheme.spacing['2xl']);
  });

  it('has all required glyphs', () => {
    expect(typeof defaultTheme.glyphs.divider).toBe('string');
    expect(typeof defaultTheme.glyphs.bullet).toBe('string');
    expect(typeof defaultTheme.glyphs.pipe).toBe('string');
    expect(typeof defaultTheme.glyphs.ellipsis).toBe('string');
    expect(typeof defaultTheme.glyphs.checked).toBe('string');
    expect(typeof defaultTheme.glyphs.unchecked).toBe('string');
  });

  // ─── Motion tokens ────────────────────────────────────────────────────────
  it('has motion property on SemanticTheme', () => {
    expect(defaultTheme.motion).toBeDefined();
  });

  it('has duration scale with all named durations', () => {
    const durations = ['instant', 'fast', 'normal', 'slow', 'glacial'] as const;
    for (const d of durations) {
      expect(typeof defaultTheme.motion.duration[d]).toBe('number');
    }
  });

  it('duration values are in ascending order', () => {
    const { instant, fast, normal, slow, glacial } = defaultTheme.motion.duration;
    expect(instant).toBeLessThanOrEqual(fast);
    expect(fast).toBeLessThanOrEqual(normal);
    expect(normal).toBeLessThanOrEqual(slow);
    expect(slow).toBeLessThanOrEqual(glacial);
  });

  it('has named easing functions', () => {
    const easings = ['default', 'entrance', 'exit', 'emphasis'] as const;
    for (const e of easings) {
      expect(typeof defaultTheme.motion.easing[e]).toBe('function');
      // Should accept a number and return a number
      expect(typeof defaultTheme.motion.easing[e](0.5)).toBe('number');
    }
  });

  it('has named spring presets', () => {
    const springs = ['default', 'responsive', 'gentle', 'bouncy'] as const;
    for (const s of springs) {
      expect(typeof defaultTheme.motion.spring[s].stiffness).toBe('number');
      expect(typeof defaultTheme.motion.spring[s].damping).toBe('number');
    }
  });

  it('has reduceMotion boolean', () => {
    expect(typeof defaultTheme.motion.reduceMotion).toBe('boolean');
  });
});

describe('createTheme', () => {
  it('matches the canonical default theme when no overrides are supplied', () => {
    const created = createTheme();
    expect(created.colors).toEqual(defaultTheme.colors);
    expect(created.typography).toEqual(defaultTheme.typography);
    expect(created.states).toEqual(defaultTheme.states);
    expect(created.elevation).toEqual(defaultTheme.elevation);
  });

  it('returns a SemanticTheme with default values when called with no args', () => {
    const t = createTheme();
    expect(t.colors.text).toBeDefined();
    expect(t.spacing.md).toBe(defaultTheme.spacing.md);
    expect(t.glyphs.bullet).toBe(defaultTheme.glyphs.bullet);
  });

  it('overrides specific tone colors while preserving others', () => {
    const customAccent = color.hex('#a78bfa');
    const t = createTheme({
      contrast: { enforce: false },
      colors: {
        tones: { accent: customAccent },
      },
    });
    expect(t.colors.tones.accent).toBe(customAccent);
    // Other tones should remain as defaults
    expect(t.colors.tones.danger).toBe(defaultTheme.colors.tones.danger);
    expect(t.colors.tones.success).toBe(defaultTheme.colors.tones.success);
  });

  it('overrides top-level color fields', () => {
    const customText = color.rgb(240, 240, 240);
    const t = createTheme({ colors: { text: customText } });
    expect(t.colors.text).toBe(customText);
    // Other colors unchanged
    expect(t.colors.muted).toBe(defaultTheme.colors.muted);
  });

  it('overrides spacing values', () => {
    const t = createTheme({ spacing: { md: 4, xl: 8 } });
    expect(t.spacing.md).toBe(4);
    expect(t.spacing.xl).toBe(8);
    // Others unchanged
    expect(t.spacing.xs).toBe(defaultTheme.spacing.xs);
    expect(t.spacing.sm).toBe(defaultTheme.spacing.sm);
  });

  it('overrides glyph values', () => {
    const t = createTheme({ glyphs: { bullet: '*', checked: '[x]' } });
    expect(t.glyphs.bullet).toBe('*');
    expect(t.glyphs.checked).toBe('[x]');
    // Others unchanged
    expect(t.glyphs.divider).toBe(defaultTheme.glyphs.divider);
  });

  it('does not mutate defaultTheme', () => {
    const originalText = defaultTheme.colors.text;
    createTheme({ colors: { text: color.rgb(1, 2, 3) } });
    expect(defaultTheme.colors.text).toBe(originalText);
  });

  it('accepts empty ThemeInput', () => {
    const t = createTheme({});
    expect(t.spacing.md).toBe(defaultTheme.spacing.md);
  });

  it('accepts a full ThemeInput override', () => {
    const input: ThemeInput = {
      colors: {
        text: color.white,
        muted: color.gray,
        tones: {
          accent: color.cyan,
          danger: color.brightRed,
        },
      },
      spacing: { none: 0, xs: 0, sm: 1, md: 2, lg: 4, xl: 6, '2xl': 10 },
      glyphs: { bullet: '-' },
    };
    const t = createTheme(input);
    expect(t.colors.text).toBe(color.white);
    expect(t.colors.tones.accent).toBe(color.cyan);
    expect(t.colors.tones.danger).toBe(color.brightRed);
    expect(t.spacing.lg).toBe(4);
    expect(t.glyphs.bullet).toBe('-');
  });

  // ─── Smart defaults for enriched tokens ─────────────────────────────────
  it('derives enriched tokens when not explicitly provided', () => {
    const t = createTheme();
    // All enriched tokens should be defined
    expect(t.colors.textSoft).toBeDefined();
    expect(t.colors.bg).toBeDefined();
    expect(t.colors.surfaceAlt).toBeDefined();
    expect(t.colors.surfaceRaised).toBeDefined();
    expect(t.colors.backdrop).toBeDefined();
    expect(t.colors.borderHover).toBeDefined();
    expect(t.colors.borderActive).toBeDefined();
    expect(t.colors.divider).toBeDefined();
  });

  it('allows explicit override of enriched tokens', () => {
    const customTextSoft = color.hex('#aabbcc');
    const customBg = color.hex('#112233');
    const t = createTheme({
      colors: {
        textSoft: customTextSoft,
        bg: customBg,
      },
    });
    expect(t.colors.textSoft.rgb).toEqual(customTextSoft.rgb);
    expect(t.colors.bg.rgb).toEqual(customBg.rgb);
    // Non-overridden enriched tokens still derive
    expect(t.colors.surfaceAlt).toBeDefined();
    expect(t.colors.borderHover).toBeDefined();
  });

  it('enriched tokens re-derive when base tokens change', () => {
    const t1 = createTheme({
      colors: { text: color.hex('#dbe4ff'), muted: color.hex('#94a3b8') },
    });
    const t2 = createTheme({
      colors: { text: color.hex('#ffffff'), muted: color.hex('#333333') },
    });
    // textSoft should differ since its derivation inputs changed
    expect(t2.colors.textSoft.rgb).not.toEqual(t1.colors.textSoft.rgb);
  });

  // ─── Semantic token overrides ─────────────────────────────────────────────
  it('allows explicit override of semantic color tokens', () => {
    const customHighlight = color.hex('#ff00ff');
    const customCursor = color.hex('#00ff00');
    const t = createTheme({
      colors: {
        highlight: customHighlight,
        cursor: customCursor,
      },
    });
    expect(t.colors.highlight.rgb).toEqual(customHighlight.rgb);
    expect(t.colors.cursor.rgb).toEqual(customCursor.rgb);
    // Non-overridden semantic tokens still derive from accent
    expect(t.colors.interactive.rgb).toEqual(t.colors.tones.accent.rgb);
    expect(t.colors.focusRing.rgb).toEqual(t.colors.tones.accent.rgb);
  });

  it('semantic tokens re-derive when accent changes', () => {
    const customAccent = color.hex('#a78bfa');
    const t = createTheme({
      contrast: { enforce: false },
      colors: {
        tones: { accent: customAccent },
      },
    });
    // All accent-derived semantic tokens should follow the new accent
    expect(t.colors.highlight.rgb).toEqual(customAccent.rgb);
    expect(t.colors.interactive.rgb).toEqual(customAccent.rgb);
    expect(t.colors.focusRing.rgb).toEqual(customAccent.rgb);
    expect(t.colors.trackFill.rgb).toEqual(customAccent.rgb);
    expect(t.colors.cursor.rgb).toEqual(customAccent.rgb);
    expect(t.colors.linkColor.rgb).toEqual(customAccent.rgb);
  });

  it('placeholder re-derives when muted changes', () => {
    const customMuted = color.hex('#888888');
    const t = createTheme({
      contrast: { enforce: false },
      colors: {
        muted: customMuted,
      },
    });
    expect(t.colors.placeholder.rgb).toEqual(customMuted.rgb);
  });

  it('explicit semantic token wins over accent derivation', () => {
    const customAccent = color.hex('#a78bfa');
    const customHighlight = color.hex('#ff5555');
    const t = createTheme({
      colors: {
        highlight: customHighlight,
        tones: { accent: customAccent },
      },
    });
    // highlight should use the explicit value, not derive from accent
    expect(t.colors.highlight.rgb).toEqual(customHighlight.rgb);
    // other semantic tokens still derive from new accent
    expect(t.colors.interactive.rgb).toEqual(customAccent.rgb);
  });

  // ─── Motion token overrides ───────────────────────────────────────────────
  it('overrides motion duration values', () => {
    const t = createTheme({
      motion: { duration: { fast: 50, slow: 500 } },
    });
    expect(t.motion.duration.fast).toBe(50);
    expect(t.motion.duration.slow).toBe(500);
    // Others unchanged
    expect(t.motion.duration.normal).toBe(defaultTheme.motion.duration.normal);
  });

  it('overrides motion reduceMotion flag', () => {
    const t = createTheme({
      motion: { reduceMotion: true },
    });
    expect(t.motion.reduceMotion).toBe(true);
  });
});

describe('extendTheme', () => {
  it('extends an existing theme without mutating the base theme', () => {
    const base = createTheme({
      contrast: { enforce: false },
      colors: { text: color.hex('#ddeeff') },
      spacing: { md: 6 },
    });

    const extended = extendTheme(base, {
      colors: { muted: color.hex('#778899') },
      spacing: { xl: 10 },
    });

    expect(extended.colors.text.rgb).toEqual(base.colors.text.rgb);
    expect(extended.colors.muted.rgb).toEqual(color.hex('#778899').rgb);
    expect(extended.spacing.md).toBe(6);
    expect(extended.spacing.xl).toBe(10);

    expect(base.colors.muted.rgb).not.toEqual(color.hex('#778899').rgb);
    expect(base.spacing.xl).not.toBe(10);
  });

  it('preserves existing base typography, state, and elevation customizations', () => {
    const customHeading = color.hex('#ff00ff');
    const customFocus = color.hex('#00ffcc');
    const base = createTheme({
      typography: { heading: { bold: false, color: customHeading } },
      states: { focus: { bold: false, border: customFocus } },
      elevation: { modal: { elevation: 20 } },
    });

    const extended = extendTheme(base, {
      spacing: { lg: 12 },
    });

    expect(extended.typography.heading.bold).toBe(false);
    expect(extended.typography.heading.color.rgb).toEqual(customHeading.rgb);
    expect(extended.states.focus.bold).toBe(false);
    expect(extended.states.focus.border!.rgb).toEqual(customFocus.rgb);
    expect(extended.elevation.modal.elevation).toBe(20);
    expect(extended.spacing.lg).toBe(12);
  });

  it('recomputes derived theme layers from the extended base theme', () => {
    const base = createTheme({
      contrast: { enforce: false },
      colors: { tones: { accent: color.hex('#2563eb') } },
    });
    const nextAccent = color.hex('#8b5cf6');

    const extended = extendTheme(base, {
      colors: { tones: { accent: nextAccent } },
    });

    expect(extended.colors.tones.accent.rgb).toEqual(nextAccent.rgb);
    expect(extended.scales.accent[400].rgb).toEqual(nextAccent.rgb);
    expect(extended.typography.link.color.rgb).toEqual(nextAccent.rgb);
    expect(extended.states.focus.border!.rgb).toEqual(extended.scales.accent[400].rgb);
  });

  it('re-derives semantic and enriched color tokens from updated base colors', () => {
    const nextAccent = color.hex('#8b5cf6');
    const nextMuted = color.hex('#7c8798');
    const nextSurface = color.hex('#1f2937');
    const nextBorder = color.hex('#334155');
    const surfaceIsLight = color.luminance(nextSurface) > 0.6;
    const borderIsLight = color.luminance(nextBorder) > 0.6;
    const base = createTheme({
      contrast: { enforce: false },
      spacing: { md: 7 },
    });

    const extended = extendTheme(base, {
      colors: {
        tones: { accent: nextAccent },
        muted: nextMuted,
        surface: nextSurface,
        border: nextBorder,
      },
    });

    expect(extended.colors.highlight.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.interactive.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.focusRing.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.trackFill.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.cursor.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.linkColor.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.placeholder.rgb).toEqual(nextMuted.rgb);
    expect(extended.colors.bg.rgb).toEqual(color.mix(nextSurface, color.hex('#000000'), surfaceIsLight ? 0.04 : 0.15).rgb);
    expect(extended.colors.surfaceAlt.rgb).toEqual(color.mix(nextSurface, color.hex('#000000'), surfaceIsLight ? 0.06 : 0.05).rgb);
    expect(extended.colors.surfaceRaised.rgb).toEqual(
      color.mix(nextSurface, surfaceIsLight ? color.hex('#000000') : color.hex('#ffffff'), surfaceIsLight ? 0.1 : 0.08).rgb,
    );
    expect(extended.colors.backdrop.rgb).toEqual(color.mix(nextSurface, color.hex('#000000'), surfaceIsLight ? 0.18 : 0.3).rgb);
    expect(extended.colors.borderHover.rgb).toEqual((borderIsLight ? color.mix(nextBorder, color.hex('#000000'), 0.25) : color.lighten(nextBorder, 15)).rgb);
    expect(extended.colors.borderActive.rgb).toEqual(nextAccent.rgb);
    expect(extended.colors.divider.rgb).toEqual(nextBorder.rgb);
    expect(extended.spacing.md).toBe(7);
  });

  it('preserves and merges component overrides', () => {
    const baseBg = color.hex('#112233');
    const nextBorder = color.hex('#abcdef');
    const base = createTheme({
      components: {
        card: { bg: baseBg },
      },
    });

    const extended = extendTheme(base, {
      components: {
        card: { border: nextBorder },
      },
    });

    expect(Object.keys(extended)).not.toContain('__componentOverrides');
    const overrides = (extended as unknown as { __componentOverrides?: Record<string, Record<string, unknown>> }).__componentOverrides;
    expect(overrides?.card).toEqual({ bg: baseBg, border: nextBorder });
  });
});

describe('resolveToneColor', () => {
  it('resolves a tone from a SemanticTheme', () => {
    const t = createTheme();
    expect(resolveToneColor(t, 'accent')).toBe(t.colors.tones.accent);
  });

  it('resolves a tone from a ThemeInput (merges with default)', () => {
    const customDanger = color.rgb(255, 0, 0);
    const input: ThemeInput = { colors: { tones: { danger: customDanger } } };
    expect(resolveToneColor(input, 'danger')).toBe(customDanger);
    // Other tones fall back to default
    expect(resolveToneColor(input, 'success')).toBe(defaultTheme.colors.tones.success);
  });

  it('defaults to neutral tone', () => {
    expect(resolveToneColor(undefined)).toBe(defaultTheme.colors.tones.neutral);
  });

  it('resolves all tones without error', () => {
    const tones = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const;
    for (const tone of tones) {
      const result = resolveToneColor(undefined, tone);
      expect(result).toBeDefined();
      expect(typeof result.fg).toBe('function');
    }
  });
});

describe('resolveSpacing', () => {
  it('resolves spacing from a SemanticTheme', () => {
    const t: SemanticTheme = { ...defaultTheme, spacing: { none: 0, xs: 1, sm: 2, md: 4, lg: 6, xl: 8, '2xl': 16 } };
    expect(resolveSpacing('md', t)).toBe(4);
  });

  it('resolves spacing from a ThemeInput', () => {
    const input: ThemeInput = { spacing: { md: 10 } };
    expect(resolveSpacing('md', input)).toBe(10);
    // Other sizes fall back to default
    expect(resolveSpacing('sm', input)).toBe(defaultTheme.spacing.sm);
  });

  it('defaults to md size', () => {
    expect(resolveSpacing()).toBe(defaultTheme.spacing.md);
  });

  it('returns correct default spacing for all sizes', () => {
    const sizes = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
    for (const size of sizes) {
      expect(resolveSpacing(size)).toBe(defaultTheme.spacing[size]);
    }
  });

  it('resolves from undefined input uses defaultTheme', () => {
    expect(resolveSpacing('xl', undefined)).toBe(defaultTheme.spacing.xl);
  });
});

// ─── Typography tokens ────────────────────────────────────────────────────────

describe('typography tokens', () => {
  it('defaultTheme has all typography keys', () => {
    const keys: (keyof ThemeTypography)[] = [
      'heading',
      'title',
      'subtitle',
      'body',
      'caption',
      'overline',
      'code',
      'label',
      'link',
      'error',
      'warning',
      'success',
    ];
    for (const key of keys) {
      expect(defaultTheme.typography[key]).toBeDefined();
      expect(defaultTheme.typography[key].color).toBeDefined();
    }
  });

  it('heading and title are bold', () => {
    expect(defaultTheme.typography.heading.bold).toBe(true);
    expect(defaultTheme.typography.title.bold).toBe(true);
  });

  it('keeps captions readable without terminal dim', () => {
    expect(defaultTheme.typography.caption.dim).not.toBe(true);
  });

  it('link has underline and uses accent color', () => {
    expect(defaultTheme.typography.link.underline).toBe(true);
    expect(defaultTheme.typography.link.color.rgb).toEqual(defaultTheme.colors.tones.accent.rgb);
  });

  it('error uses danger tone', () => {
    expect(defaultTheme.typography.error.color.rgb).toEqual(defaultTheme.colors.tones.danger.rgb);
  });

  it('overriding a tone cascades into typography', () => {
    const customAccent = color.hex('#a78bfa');
    const t = createTheme({ colors: { tones: { accent: customAccent } }, contrast: { enforce: false } });
    expect(t.typography.link.color.rgb).toEqual(customAccent.rgb);
  });

  it('partial typography override merges correctly', () => {
    const customColor = color.hex('#ff00ff');
    const t = createTheme({
      typography: { heading: { color: customColor } },
    });
    // Overridden field
    expect(t.typography.heading.color.rgb).toEqual(customColor.rgb);
    // Preserved field from default
    expect(t.typography.heading.bold).toBe(true);
    // Other typography keys unchanged
    expect(t.typography.body.color.rgb).toEqual(defaultTheme.typography.body.color.rgb);
  });
});

// ─── State tokens ─────────────────────────────────────────────────────────────

describe('state tokens', () => {
  it('defaultTheme has all state keys', () => {
    const keys: (keyof ThemeStates)[] = ['hover', 'focus', 'active', 'disabled', 'selected', 'error', 'loading', 'readonly'];
    for (const key of keys) {
      expect(defaultTheme.states[key]).toBeDefined();
      expect(defaultTheme.states[key].fg).toBeDefined();
    }
  });

  it('hover has a background color', () => {
    expect(defaultTheme.states.hover.bg).toBeDefined();
  });

  it('focus has a border and is bold', () => {
    expect(defaultTheme.states.focus.border).toBeDefined();
    expect(defaultTheme.states.focus.bold).toBe(true);
  });

  it('disabled is dim', () => {
    expect(defaultTheme.states.disabled.dim).toBe(true);
  });

  it('selected is bold with accent color', () => {
    expect(defaultTheme.states.selected.bold).toBe(true);
  });

  it('states derive from scales', () => {
    const t = createTheme();
    // hover bg is a subtle surface emphasis (not the pure neutral scale) so
    // dark themes get a dark-tinted highlight instead of near-white.
    expect(t.states.hover.bg).toBeDefined();
    expect(t.states.hover.bg!.rgb).not.toEqual(t.scales.neutral[100].rgb);
    // focus border should be scales.accent[400]
    expect(t.states.focus.border!.rgb).toEqual(t.scales.accent[400].rgb);
    // Active and selected surfaces are dark-theme-safe surface emphasis, not
    // light accent fills behind light text.
    expect(t.states.active.bg).toBeDefined();
    expect(color.contrastRatio(t.states.active.fg, t.states.active.bg!)).toBeGreaterThanOrEqual(4.5);
    expect(t.states.selected.bg!.rgb).toEqual(t.states.hover.bg!.rgb);
  });

  it('overriding tone cascades into states via scales', () => {
    const customAccent = color.hex('#a78bfa');
    const t = createTheme({ colors: { tones: { accent: customAccent } } });
    // Focus border derives from accent scale
    expect(t.states.focus.border!.rgb).toEqual(t.scales.accent[400].rgb);
  });

  it('partial state override merges correctly', () => {
    const customBorder = color.hex('#ff0000');
    const t = createTheme({
      contrast: { enforce: false },
      states: { focus: { border: customBorder } },
    });
    expect(t.states.focus.border!.rgb).toEqual(customBorder.rgb);
    // Other state fields preserved
    expect(t.states.focus.bold).toBe(true);
    // Other states unchanged
    expect(t.states.hover.fg.rgb).toEqual(defaultTheme.states.hover.fg.rgb);
  });
});

// ─── Elevation tokens ─────────────────────────────────────────────────────────

describe('elevation tokens', () => {
  it('defaultTheme has all elevation keys', () => {
    const keys: (keyof ThemeElevation)[] = ['flat', 'raised', 'floating', 'overlay', 'modal'];
    for (const key of keys) {
      expect(defaultTheme.elevation[key]).toBeDefined();
      expect(typeof defaultTheme.elevation[key].elevation).toBe('number');
    }
  });

  it('elevation values increase from flat to modal', () => {
    expect(defaultTheme.elevation.flat.elevation).toBeLessThan(defaultTheme.elevation.raised.elevation);
    expect(defaultTheme.elevation.raised.elevation).toBeLessThan(defaultTheme.elevation.floating.elevation);
    expect(defaultTheme.elevation.floating.elevation).toBeLessThan(defaultTheme.elevation.overlay.elevation);
    expect(defaultTheme.elevation.overlay.elevation).toBeLessThan(defaultTheme.elevation.modal.elevation);
  });

  it('floating and above have glass effects', () => {
    expect(defaultTheme.elevation.floating.effects?.glass).toBe(true);
    expect(defaultTheme.elevation.overlay.effects?.glass).toBe(true);
    expect(defaultTheme.elevation.modal.effects?.glass).toBe(true);
  });

  it('flat has no effects', () => {
    expect(defaultTheme.elevation.flat.effects).toBeUndefined();
  });

  it('partial elevation override merges correctly', () => {
    const t = createTheme({
      elevation: { modal: { elevation: 20 } },
    });
    expect(t.elevation.modal.elevation).toBe(20);
    // Effects preserved from default
    expect(t.elevation.modal.effects?.glass).toBe(true);
    // Other elevations unchanged
    expect(t.elevation.flat.elevation).toBe(0);
  });
});

// ─── Full cascade ─────────────────────────────────────────────────────────────

describe('full tone → scale → state → typography cascade', () => {
  it('overriding accent tone cascades through all layers', () => {
    const customAccent = color.hex('#8b5cf6');
    const t = createTheme({ colors: { tones: { accent: customAccent } }, contrast: { enforce: false } });

    // Scale step 400 matches the custom accent
    expect(t.scales.accent[400].rgb).toEqual(customAccent.rgb);
    // Typography link uses the custom accent
    expect(t.typography.link.color.rgb).toEqual(customAccent.rgb);
    // Focus derives from the custom accent scale while selected surfaces stay
    // theme-neutral so they remain readable across accent choices.
    expect(t.states.focus.border!.rgb).toEqual(t.scales.accent[400].rgb);
    expect(t.states.active.bg!.rgb).not.toEqual(t.scales.accent[200].rgb);
  });
});

// ─── Theme variants ───────────────────────────────────────────────────────────

describe('defineThemeVariant', () => {
  it('returns a variant with name and input', () => {
    const variant = defineThemeVariant('custom', {
      colors: { text: color.hex('#ffffff') },
    });
    expect(variant.name).toBe('custom');
    expect(variant.input.colors?.text).toBeDefined();
  });
});

describe('applyVariant', () => {
  it('applies variant input onto a base theme', () => {
    const customText = color.hex('#aabbcc');
    const variant = defineThemeVariant('test', {
      colors: { text: customText },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.colors.text.rgb).toEqual(customText.rgb);
    // Other colors unchanged
    expect(result.colors.muted.rgb).toEqual(defaultTheme.colors.muted.rgb);
  });

  it('scales recompute after variant', () => {
    const customAccent = color.hex('#ff6600');
    const variant = defineThemeVariant('orange', {
      colors: { tones: { accent: customAccent } },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.scales.accent[400].rgb).toEqual(customAccent.rgb);
  });

  it('typography and states cascade after variant', () => {
    const customDanger = color.hex('#ff0000');
    const variant = defineThemeVariant('red', {
      contrast: { enforce: false },
      colors: { tones: { danger: customDanger } },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.typography.error.color.rgb).toEqual(customDanger.rgb);
  });
});

describe('built-in variants', () => {
  it('darkVariant produces a valid theme', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    expect(dark.colors.text).toBeDefined();
    expect(dark.scales.accent[400]).toBeDefined();
    expect(dark.typography.body.color).toBeDefined();
  });

  it('lightVariant produces a valid theme', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(light.colors.text).toBeDefined();
    expect(light.scales.accent[400]).toBeDefined();
  });

  it('highContrastVariant meets WCAG AAA', () => {
    const hc = applyVariant(defaultTheme, highContrastVariant);
    const ratio = color.contrastRatio(hc.colors.text, hc.colors.surface);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it('variants have correct names', () => {
    expect(darkVariant.name).toBe('dark');
    expect(lightVariant.name).toBe('light');
    expect(highContrastVariant.name).toBe('high-contrast');
  });

  it('darkVariant applies typography and state overrides', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    expect(dark.typography.code.bold).toBe(true);
    expect(dark.states.hover.bold).toBe(true);
    expect(dark.states.selected.bold).toBe(true);
  });

  it('lightVariant applies typography and state overrides', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(light.typography.heading.bold).toBe(true);
    expect(light.typography.label.bold).toBe(true);
    expect(light.states.focus.bold).toBe(true);
    expect(light.states.disabled.dim).toBe(true);
  });

  it('darkVariant colors are still correctly applied alongside typography/states', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    expect(dark.colors.text.rgb).toEqual(color.hex('#dbe4ff').rgb);
    expect(dark.colors.surface.rgb).toEqual(color.hex('#0f172a').rgb);
    expect(dark.colors.tones.accent.rgb).toEqual(color.hex('#60a5fa').rgb);
  });

  it('lightVariant colors are still correctly applied alongside typography/states', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(light.colors.text.rgb).toEqual(color.hex('#0f172a').rgb);
    expect(light.colors.surface.rgb).toEqual(color.hex('#ffffff').rgb);
    expect(light.colors.tones.accent.rgb).toEqual(color.hex('#1d4ed8').rgb);
  });

  // ─── Enriched tokens in built-in variants ─────────────────────────────────
  it('darkVariant has all enriched color tokens', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    expect(dark.colors.textSoft).toBeDefined();
    expect(dark.colors.bg).toBeDefined();
    expect(dark.colors.surfaceAlt).toBeDefined();
    expect(dark.colors.surfaceRaised).toBeDefined();
    expect(dark.colors.backdrop).toBeDefined();
    expect(dark.colors.borderHover).toBeDefined();
    expect(dark.colors.borderActive).toBeDefined();
    expect(dark.colors.divider).toBeDefined();
  });

  it('lightVariant has all enriched color tokens', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(light.colors.textSoft).toBeDefined();
    expect(light.colors.bg).toBeDefined();
    expect(light.colors.surfaceAlt).toBeDefined();
    expect(light.colors.surfaceRaised).toBeDefined();
    expect(light.colors.backdrop).toBeDefined();
    expect(light.colors.borderHover).toBeDefined();
    expect(light.colors.borderActive).toBeDefined();
    expect(light.colors.divider).toBeDefined();
  });

  it('highContrastVariant has all enriched color tokens', () => {
    const hc = applyVariant(defaultTheme, highContrastVariant);
    expect(hc.colors.textSoft).toBeDefined();
    expect(hc.colors.bg).toBeDefined();
    expect(hc.colors.surfaceAlt).toBeDefined();
    expect(hc.colors.surfaceRaised).toBeDefined();
    expect(hc.colors.backdrop).toBeDefined();
    expect(hc.colors.borderHover).toBeDefined();
    expect(hc.colors.borderActive).toBeDefined();
    expect(hc.colors.divider).toBeDefined();
  });

  it('darkVariant enriched tokens have explicit values', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    // bg should be darker than surface
    expect(dark.colors.bg.rgb).toBeDefined();
    // borderActive should use accent color
    expect(dark.colors.borderActive.rgb).toBeDefined();
  });

  it('lightVariant enriched tokens have explicit values', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    // bg should be a warm off-white, lighter than surface
    expect(light.colors.bg.rgb).toBeDefined();
    // textSoft should be readable on the light surface
    expect(light.colors.textSoft.rgb).toBeDefined();
  });

  it('lightVariant keeps floating and modal surfaces distinct from base surfaces', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(light.elevation.floating.surface!.rgb).not.toEqual(light.colors.surface.rgb);
    expect(light.elevation.modal.surface!.rgb).not.toEqual(light.elevation.floating.surface!.rgb);
  });

  it('custom light surfaces derive distinct raised and modal layers', () => {
    const custom = createTheme({
      colors: {
        surface: color.hex('#ffffff'),
        border: color.hex('#cbd5e1'),
      },
    });

    expect(custom.colors.surfaceRaised.rgb).not.toEqual(custom.colors.surface.rgb);
    expect(custom.elevation.modal.surface!.rgb).not.toEqual(custom.elevation.floating.surface!.rgb);
    expect(color.contrastRatio(custom.colors.text, custom.elevation.modal.surface!)).toBeGreaterThanOrEqual(4.5);
  });

  it('highContrastVariant text on bg meets WCAG AAA', () => {
    const hc = applyVariant(defaultTheme, highContrastVariant);
    const ratio = color.contrastRatio(hc.colors.text, hc.colors.bg);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it('applyVariant propagates enriched tokens through merge', () => {
    const customBg = color.hex('#1a1a2e');
    const variant = defineThemeVariant('custom', {
      colors: { bg: customBg },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.colors.bg.rgb).toEqual(customBg.rgb);
    // Non-overridden enriched tokens still derive
    expect(result.colors.surfaceAlt).toBeDefined();
  });

  // ─── Semantic tokens in variants ──────────────────────────────────────────
  it('darkVariant has all 7 semantic color tokens', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    const tokens = ['highlight', 'interactive', 'focusRing', 'trackFill', 'cursor', 'linkColor', 'placeholder'] as const;
    for (const token of tokens) {
      expect(dark.colors[token]).toBeDefined();
      expect(typeof dark.colors[token].fg).toBe('function');
    }
  });

  it('lightVariant has all 7 semantic color tokens', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    const tokens = ['highlight', 'interactive', 'focusRing', 'trackFill', 'cursor', 'linkColor', 'placeholder'] as const;
    for (const token of tokens) {
      expect(light.colors[token]).toBeDefined();
      expect(typeof light.colors[token].fg).toBe('function');
    }
  });

  it('highContrastVariant has all 7 semantic color tokens', () => {
    const hc = applyVariant(defaultTheme, highContrastVariant);
    const tokens = ['highlight', 'interactive', 'focusRing', 'trackFill', 'cursor', 'linkColor', 'placeholder'] as const;
    for (const token of tokens) {
      expect(hc.colors[token]).toBeDefined();
      expect(typeof hc.colors[token].fg).toBe('function');
    }
  });

  it('semantic tokens follow variant accent when not explicitly set', () => {
    const dark = applyVariant(defaultTheme, darkVariant);
    // dark variant's accent is #60a5fa — semantic tokens should derive from it
    expect(dark.colors.highlight.rgb).toEqual(dark.colors.tones.accent.rgb);
    expect(dark.colors.interactive.rgb).toEqual(dark.colors.tones.accent.rgb);
    expect(dark.colors.focusRing.rgb).toEqual(dark.colors.tones.accent.rgb);
    expect(dark.colors.trackFill.rgb).toEqual(dark.colors.tones.accent.rgb);
    expect(dark.colors.cursor.rgb).toEqual(dark.colors.tones.accent.rgb);
    expect(dark.colors.linkColor.rgb).toEqual(dark.colors.tones.accent.rgb);
    // placeholder follows muted
    expect(dark.colors.placeholder.rgb).toEqual(dark.colors.muted.rgb);
  });

  it('applyVariant propagates explicit semantic token overrides', () => {
    const customHighlight = color.hex('#ff69b4');
    const variant = defineThemeVariant('pink-highlight', {
      colors: { highlight: customHighlight },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.colors.highlight.rgb).toEqual(customHighlight.rgb);
    // Other semantic tokens still derive from accent
    expect(result.colors.interactive.rgb).toEqual(result.colors.tones.accent.rgb);
  });
});

// ─── WS4: Missing interaction states ──────────────────────────────────────────

describe('WS4: interaction states (error, loading, readonly)', () => {
  it('defaultTheme.states has error state', () => {
    expect(defaultTheme.states.error).toBeDefined();
    expect(defaultTheme.states.error.fg).toBeDefined();
  });

  it('defaultTheme.states has loading state', () => {
    expect(defaultTheme.states.loading).toBeDefined();
    expect(defaultTheme.states.loading.fg).toBeDefined();
  });

  it('defaultTheme.states has readonly state', () => {
    expect(defaultTheme.states.readonly).toBeDefined();
    expect(defaultTheme.states.readonly.fg).toBeDefined();
  });

  it('error state uses danger scale', () => {
    const t = createTheme({ contrast: { enforce: false } });
    expect(t.states.error.fg.rgb).toEqual(t.scales.danger[400].rgb);
    expect(t.states.error.border!.rgb).toEqual(t.scales.danger[400].rgb);
  });

  it('loading state uses muted color and is dim', () => {
    expect(defaultTheme.states.loading.fg.rgb).toEqual(defaultTheme.colors.muted.rgb);
    expect(defaultTheme.states.loading.dim).toBe(true);
  });

  it('readonly state uses textSoft and a subtle surface-derived background', () => {
    const t = createTheme();
    expect(t.states.readonly.fg.rgb).toEqual(t.colors.textSoft.rgb);
    expect(t.states.readonly.bg).toBeDefined();
    // Now derived from the surface (emphasized slightly) rather than the
    // fixed `scales.neutral[50]` — keeps dark themes legibly dark.
    expect(t.states.readonly.bg!.rgb).not.toEqual(t.scales.neutral[50].rgb);
  });

  it('error state re-derives when danger tone changes', () => {
    const customDanger = color.hex('#ff0000');
    const t = createTheme({ colors: { tones: { danger: customDanger } }, contrast: { enforce: false } });
    expect(t.states.error.fg.rgb).toEqual(t.scales.danger[400].rgb);
    expect(t.states.error.border!.rgb).toEqual(t.scales.danger[400].rgb);
  });

  it('partial error state override merges correctly', () => {
    const customBorder = color.hex('#ff0000');
    const t = createTheme({
      contrast: { enforce: false },
      states: { error: { border: customBorder } },
    });
    expect(t.states.error.border!.rgb).toEqual(customBorder.rgb);
    // fg preserved from default
    expect(t.states.error.fg).toBeDefined();
  });

  it('partial loading state override merges correctly', () => {
    const customFg = color.hex('#aabbcc');
    const t = createTheme({
      states: { loading: { fg: customFg } },
    });
    expect(t.states.loading.fg.rgb).toEqual(customFg.rgb);
    // dim preserved from default
    expect(t.states.loading.dim).toBe(true);
  });

  it('partial readonly state override merges correctly', () => {
    const customBg = color.hex('#222222');
    const t = createTheme({
      states: { readonly: { bg: customBg } },
    });
    expect(t.states.readonly.bg!.rgb).toEqual(customBg.rgb);
    // fg preserved from default
    expect(t.states.readonly.fg).toBeDefined();
  });

  it('InteractionState type includes all 8 states', () => {
    // Compile-time assertion — these must all be valid InteractionState values
    const states: import('../theme.js').InteractionState[] = ['hover', 'focus', 'active', 'disabled', 'selected', 'error', 'loading', 'readonly'];
    expect(states).toHaveLength(8);
  });

  it('new states propagate through applyVariant', () => {
    const variant = defineThemeVariant('test', {
      states: { error: { bold: true } },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.states.error.bold).toBe(true);
    // fg preserved
    expect(result.states.error.fg).toBeDefined();
  });
});

// ─── WS5: Typography cleanup ─────────────────────────────────────────────────

describe('WS5: typography (subtitle, overline, warning, strikethrough)', () => {
  it('defaultTheme.typography has subtitle token', () => {
    expect(defaultTheme.typography.subtitle).toBeDefined();
    expect(defaultTheme.typography.subtitle.color).toBeDefined();
  });

  it('defaultTheme.typography has overline token', () => {
    expect(defaultTheme.typography.overline).toBeDefined();
    expect(defaultTheme.typography.overline.color).toBeDefined();
  });

  it('defaultTheme.typography has warning token', () => {
    expect(defaultTheme.typography.warning).toBeDefined();
    expect(defaultTheme.typography.warning.color).toBeDefined();
  });

  it('subtitle uses textSoft color', () => {
    expect(defaultTheme.typography.subtitle.color.rgb).toEqual(defaultTheme.colors.textSoft.rgb);
  });

  it('overline uses muted color and is bold', () => {
    expect(defaultTheme.typography.overline.color.rgb).toEqual(defaultTheme.colors.muted.rgb);
    expect(defaultTheme.typography.overline.bold).toBe(true);
  });

  it('warning uses warning tone color', () => {
    expect(defaultTheme.typography.warning.color.rgb).toEqual(defaultTheme.colors.tones.warning.rgb);
  });

  it('warning re-derives when warning tone changes', () => {
    const customWarning = color.hex('#ff8800');
    const t = createTheme({ colors: { tones: { warning: customWarning } } });
    expect(t.typography.warning.color.rgb).toEqual(customWarning.rgb);
  });

  it('subtitle re-derives when text changes (via textSoft)', () => {
    const t1 = createTheme({
      colors: { text: color.hex('#dbe4ff'), muted: color.hex('#94a3b8') },
    });
    const t2 = createTheme({
      colors: { text: color.hex('#ffffff'), muted: color.hex('#333333') },
    });
    expect(t2.typography.subtitle.color.rgb).not.toEqual(t1.typography.subtitle.color.rgb);
  });

  it('TypographyToken supports strikethrough', () => {
    const t = createTheme({
      typography: { heading: { strikethrough: true } },
    });
    expect(t.typography.heading.strikethrough).toBe(true);
  });

  it('strikethrough defaults to undefined', () => {
    expect(defaultTheme.typography.heading.strikethrough).toBeUndefined();
    expect(defaultTheme.typography.body.strikethrough).toBeUndefined();
  });

  it('partial typography override for new tokens merges correctly', () => {
    const customColor = color.hex('#ff00ff');
    const t = createTheme({
      typography: { subtitle: { color: customColor, bold: true } },
    });
    expect(t.typography.subtitle.color.rgb).toEqual(customColor.rgb);
    expect(t.typography.subtitle.bold).toBe(true);
    // Other typography keys unchanged
    expect(t.typography.heading.bold).toBe(true);
  });

  it('new typography tokens propagate through applyVariant', () => {
    const variant = defineThemeVariant('test', {
      typography: { overline: { italic: true } },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.typography.overline.italic).toBe(true);
    // bold preserved from default
    expect(result.typography.overline.bold).toBe(true);
  });

  it('ThemeTypography has 12 keys', () => {
    const keys = Object.keys(defaultTheme.typography);
    expect(keys).toHaveLength(12);
    expect(keys).toContain('subtitle');
    expect(keys).toContain('overline');
    expect(keys).toContain('warning');
  });
});

// ─── WS6: Spacing expansion ─────────────────────────────────────────────────

describe('WS6: spacing expansion (none, 2xl, xs: 0→1)', () => {
  it('Size includes none', () => {
    expect(defaultTheme.spacing.none).toBeDefined();
    expect(typeof defaultTheme.spacing.none).toBe('number');
  });

  it('Size includes 2xl', () => {
    expect(defaultTheme.spacing['2xl']).toBeDefined();
    expect(typeof defaultTheme.spacing['2xl']).toBe('number');
  });

  it('none = 0', () => {
    expect(defaultTheme.spacing.none).toBe(0);
  });

  it('xs = 1 (BREAKING: was 0)', () => {
    expect(defaultTheme.spacing.xs).toBe(1);
  });

  it('2xl = 12', () => {
    expect(defaultTheme.spacing['2xl']).toBe(12);
  });

  it('full scale is none=0, xs=1, sm=1, md=2, lg=3, xl=4, 2xl=12', () => {
    expect(defaultTheme.spacing).toEqual({
      none: 0,
      xs: 1,
      sm: 1,
      md: 2,
      lg: 3,
      xl: 4,
      '2xl': 12,
    });
  });

  it('spacing values are monotonically non-decreasing', () => {
    const sizes = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
    for (let i = 1; i < sizes.length; i++) {
      expect(defaultTheme.spacing[sizes[i]!]).toBeGreaterThanOrEqual(defaultTheme.spacing[sizes[i - 1]!]);
    }
  });

  it('resolveSpacing works with none', () => {
    expect(resolveSpacing('none')).toBe(0);
  });

  it('resolveSpacing works with 2xl', () => {
    expect(resolveSpacing('2xl')).toBe(12);
  });

  it('createTheme overrides none and 2xl', () => {
    const t = createTheme({ spacing: { none: 0, '2xl': 16 } });
    expect(t.spacing.none).toBe(0);
    expect(t.spacing['2xl']).toBe(16);
    // Others unchanged
    expect(t.spacing.md).toBe(2);
  });

  it('spacing has 7 keys', () => {
    expect(Object.keys(defaultTheme.spacing)).toHaveLength(7);
  });
});

// ─── WS7: Elevation system (connected to border/surface) ────────────────────

describe('WS7: elevation connected to border/surface styling', () => {
  it('flat elevation has surface color', () => {
    expect(defaultTheme.elevation.flat.surface).toBeDefined();
    expect(typeof defaultTheme.elevation.flat.surface!.fg).toBe('function');
  });

  it('flat elevation uses theme surface color', () => {
    const t = createTheme();
    expect(t.elevation.flat.surface!.rgb).toEqual(t.colors.surface.rgb);
  });

  it('raised elevation uses surfaceRaised color', () => {
    const t = createTheme();
    expect(t.elevation.raised.surface!.rgb).toEqual(t.colors.surfaceRaised.rgb);
  });

  it('all elevation levels have surface color', () => {
    const levels = ['flat', 'raised', 'floating', 'overlay', 'modal'] as const;
    for (const level of levels) {
      expect(defaultTheme.elevation[level].surface).toBeDefined();
    }
  });

  it('all elevation levels have border color', () => {
    const levels = ['flat', 'raised', 'floating', 'overlay', 'modal'] as const;
    for (const level of levels) {
      expect(defaultTheme.elevation[level].border).toBeDefined();
    }
  });

  it('all elevation levels have borderStyle', () => {
    const levels = ['flat', 'raised', 'floating', 'overlay', 'modal'] as const;
    for (const level of levels) {
      expect(defaultTheme.elevation[level].borderStyle).toBeDefined();
    }
  });

  it('flat has borderStyle none', () => {
    expect(defaultTheme.elevation.flat.borderStyle).toBe('none');
  });

  it('raised has borderStyle single', () => {
    expect(defaultTheme.elevation.raised.borderStyle).toBe('single');
  });

  it('floating has borderStyle rounded', () => {
    expect(defaultTheme.elevation.floating.borderStyle).toBe('rounded');
  });

  it('modal has borderStyle double', () => {
    expect(defaultTheme.elevation.modal.borderStyle).toBe('double');
  });

  it('border colors escalate with elevation', () => {
    const t = createTheme();
    // flat and raised use theme.border
    expect(t.elevation.flat.border!.rgb).toEqual(t.colors.border.rgb);
    expect(t.elevation.raised.border!.rgb).toEqual(t.colors.border.rgb);
    // floating uses borderHover (more prominent)
    expect(t.elevation.floating.border!.rgb).toEqual(t.colors.borderHover.rgb);
    // overlay and modal use borderActive (most prominent)
    expect(t.elevation.overlay.border!.rgb).toEqual(t.colors.borderActive.rgb);
    expect(t.elevation.modal.border!.rgb).toEqual(t.colors.borderActive.rgb);
  });

  it('elevation surface/border re-derive when colors change', () => {
    const customSurface = color.hex('#112233');
    const t = createTheme({ colors: { surface: customSurface } });
    expect(t.elevation.flat.surface!.rgb).toEqual(customSurface.rgb);
  });

  it('partial elevation override preserves surface/border from defaults', () => {
    const t = createTheme({
      elevation: { raised: { elevation: 2 } },
    });
    expect(t.elevation.raised.elevation).toBe(2);
    // surface preserved from computed default
    expect(t.elevation.raised.surface).toBeDefined();
    expect(t.elevation.raised.borderStyle).toBe('single');
  });

  it('explicit surface/border override in elevation', () => {
    const customSurface = color.hex('#aabbcc');
    const customBorder = color.hex('#112233');
    const t = createTheme({
      contrast: { enforce: false },
      elevation: { modal: { surface: customSurface, border: customBorder, borderStyle: 'heavy' } },
    });
    expect(t.elevation.modal.surface!.rgb).toEqual(customSurface.rgb);
    expect(t.elevation.modal.border!.rgb).toEqual(customBorder.rgb);
    expect(t.elevation.modal.borderStyle).toBe('heavy');
  });

  it('elevation propagates through applyVariant', () => {
    const variant = defineThemeVariant('test', {
      elevation: { floating: { borderStyle: 'double' } },
    });
    const result = applyVariant(defaultTheme, variant);
    expect(result.elevation.floating.borderStyle).toBe('double');
    // Other properties preserved
    expect(result.elevation.floating.effects?.glass).toBe(true);
  });
});

// ─── Overlay chrome tokens ───────────────────────────────────────────────────
describe('overlay chrome tokens', () => {
  it('defaultTheme has overlay tokens with historic defaults', () => {
    expect(defaultTheme.overlay).toBeDefined();
    expect(defaultTheme.overlay.backdropDim).toBe(0.7);
    expect(defaultTheme.overlay.inset.header).toEqual({ left: 1, right: 1 });
    expect(defaultTheme.overlay.inset.body).toEqual({ left: 1, right: 1 });
    expect(defaultTheme.overlay.inset.footer).toEqual({ left: 1, right: 1 });
  });

  it('createTheme inherits overlay defaults', () => {
    const t = createTheme({ colors: { tones: { accent: color.hex('#8b5cf6') } } });
    expect(t.overlay.backdropDim).toBe(0.7);
    expect(t.overlay.inset.body.left).toBe(1);
  });

  it('createTheme round-trips a custom backdropDim', () => {
    const t = createTheme({ overlay: { backdropDim: 0.5 } });
    expect(t.overlay.backdropDim).toBe(0.5);
    // Other overlay fields keep defaults
    expect(t.overlay.inset.header).toEqual({ left: 1, right: 1 });
  });

  it('createTheme round-trips per-section inset overrides', () => {
    const t = createTheme({
      overlay: {
        inset: {
          header: { left: 2 },
          footer: { right: 3 },
        },
      },
    });
    expect(t.overlay.inset.header).toEqual({ left: 2, right: 1 });
    expect(t.overlay.inset.body).toEqual({ left: 1, right: 1 });
    expect(t.overlay.inset.footer).toEqual({ left: 1, right: 3 });
  });

  it('extendTheme merges overlay overrides onto the base theme', () => {
    const base = createTheme({ overlay: { backdropDim: 0.5 } });
    const extended = extendTheme(base, { overlay: { inset: { body: { left: 4, right: 4 } } } });
    expect(extended.overlay.backdropDim).toBe(0.5);
    expect(extended.overlay.inset.body).toEqual({ left: 4, right: 4 });
    // Untouched sections retain defaults
    expect(extended.overlay.inset.header).toEqual({ left: 1, right: 1 });
  });
});
