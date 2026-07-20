import { color, darkVariant, highContrastVariant, lightVariant } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { computed } from '../signals.js';
import { createThemeContext, themePlugin } from '../theme-plugin.js';

describe('createThemeContext', () => {
  it('returns a context with a valid theme signal', () => {
    const ctx = createThemeContext();
    const theme = ctx.current();
    expect(theme.colors.text).toBeDefined();
    expect(theme.scales.accent[400]).toBeDefined();
    expect(theme.typography.body.color).toBeDefined();
  });

  it('accepts initial ThemeInput', () => {
    const customAccent = color.hex('#a78bfa');
    const ctx = createThemeContext({ colors: { tones: { accent: customAccent } } });
    expect(ctx.current().colors.tones.accent.rgb).toEqual(customAccent.rgb);
  });

  it('variantName defaults to "default"', () => {
    const ctx = createThemeContext();
    expect(ctx.variantName()).toBe('default');
  });
});

describe('ThemeContext.setVariant', () => {
  it('updates the theme signal', () => {
    const ctx = createThemeContext();
    const originalText = ctx.current().colors.text;
    ctx.setVariant(highContrastVariant);
    const newText = ctx.current().colors.text;
    // High contrast has different text color
    expect(newText.rgb).not.toEqual(originalText.rgb);
  });

  it('updates variantName', () => {
    const ctx = createThemeContext();
    ctx.setVariant(darkVariant);
    expect(ctx.variantName()).toBe('dark');
  });

  it('scales recompute after variant', () => {
    const ctx = createThemeContext();
    ctx.setVariant(lightVariant);
    const theme = ctx.current();
    // Light variant accent is #2563eb — scale 400 should match
    expect(theme.scales.accent[400].rgb).toEqual(theme.colors.tones.accent.rgb);
  });
});

describe('ThemeContext.patch', () => {
  it('merges partial input through the enforced contrast boundary', () => {
    const ctx = createThemeContext();
    const customText = color.hex('#ff0000');
    ctx.patch({ colors: { text: customText } });
    const patched = ctx.current();
    expect(patched.colors.text.rgb).not.toEqual(customText.rgb);
    expect(color.contrastRatio(patched.colors.text, patched.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(ctx.validate().pass).toBe(true);
  });

  it('preserves non-patched fields', () => {
    const ctx = createThemeContext();
    const originalMuted = ctx.current().colors.muted;
    ctx.patch({ colors: { text: color.hex('#ff0000') } });
    expect(ctx.current().colors.muted.rgb).toEqual(originalMuted.rgb);
  });
});

describe('ThemeContext.reset', () => {
  it('restores the initial theme', () => {
    const customAccent = color.hex('#a78bfa');
    const ctx = createThemeContext({ colors: { tones: { accent: customAccent } } });
    ctx.setVariant(darkVariant);
    expect(ctx.variantName()).toBe('dark');
    ctx.reset();
    expect(ctx.variantName()).toBe('default');
    expect(ctx.current().colors.tones.accent.rgb).toEqual(customAccent.rgb);
  });
});

describe('signal reactivity', () => {
  it('reading current() inside computed() establishes tracking', () => {
    const ctx = createThemeContext();
    let computedCount = 0;
    const accentColor = computed(() => {
      computedCount++;
      return ctx.current().colors.tones.accent;
    });

    // First read
    const initial = accentColor();
    expect(computedCount).toBe(1);

    // Change theme
    ctx.setVariant(lightVariant);
    const updated = accentColor();
    expect(computedCount).toBe(2);
    expect(updated.rgb).not.toEqual(initial.rgb);
  });
});

describe('ThemeContext.validate', () => {
  it('returns a ThemeA11yReport for the current theme', () => {
    const ctx = createThemeContext();
    const report = ctx.validate();
    expect(report).toBeDefined();
    expect(report.level).toBe('AA');
    expect(typeof report.pass).toBe('boolean');
    expect(Array.isArray(report.violations)).toBe(true);
  });

  it('accepts an a11y level parameter', () => {
    const ctx = createThemeContext();
    const reportAA = ctx.validate('AA');
    const reportAAA = ctx.validate('AAA');
    expect(reportAA.level).toBe('AA');
    expect(reportAAA.level).toBe('AAA');
  });

  it('validates after a variant change', () => {
    const ctx = createThemeContext();
    ctx.setVariant(highContrastVariant);
    const report = ctx.validate();
    // High contrast should generally pass AA
    expect(report.level).toBe('AA');
  });
});

describe('themePlugin', () => {
  it('has name "theme"', () => {
    const plugin = themePlugin();
    expect(plugin.name).toBe('theme');
  });

  it('exposes context', () => {
    const plugin = themePlugin();
    expect(plugin.context).toBeDefined();
    expect(plugin.context.current()).toBeDefined();
  });

  it('accepts initial ThemeInput', () => {
    const customAccent = color.hex('#a78bfa');
    const plugin = themePlugin({ colors: { tones: { accent: customAccent } } });
    expect(plugin.context.current().colors.tones.accent.rgb).toEqual(customAccent.rgb);
  });
});
