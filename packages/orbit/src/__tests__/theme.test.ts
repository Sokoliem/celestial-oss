import { defaultTheme } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { feedbackColor, formColor, orbitToneColor, resolveOrbitTheme } from '../theme.js';

describe('resolveOrbitTheme', () => {
  it('falls back to the corona default theme when nothing is supplied', () => {
    expect(resolveOrbitTheme(undefined)).toBe(defaultTheme);
    expect(resolveOrbitTheme({})).toBe(defaultTheme);
  });

  it('uses a theme supplied via themeCtx when one is present', () => {
    const fakeTheme = { colors: defaultTheme.colors };
    expect(resolveOrbitTheme({ themeCtx: { theme: fakeTheme } })).toBe(fakeTheme);
  });

  it('routes theme overrides through createTheme', () => {
    const resolved = resolveOrbitTheme({ theme: { colors: { ...defaultTheme.colors } } });
    expect(resolved.colors).toBeDefined();
  });
});

describe('feedbackColor / formColor / orbitToneColor', () => {
  it('returns a defined color for every named slot', () => {
    expect(feedbackColor(undefined, 'success')).toBeDefined();
    expect(feedbackColor(undefined, 'warning')).toBeDefined();
    expect(feedbackColor(undefined, 'danger')).toBeDefined();
    expect(feedbackColor(undefined, 'info')).toBeDefined();
    expect(feedbackColor(undefined, 'muted')).toBeDefined();
    expect(feedbackColor(undefined, 'textSoft')).toBeDefined();

    expect(formColor(undefined, 'text')).toBeDefined();
    expect(formColor(undefined, 'highlight')).toBeDefined();
    expect(formColor(undefined, 'muted')).toBeDefined();
    expect(formColor(undefined, 'border')).toBeDefined();

    expect(orbitToneColor(undefined, 'accent')).toBeDefined();
  });

  it('returns the muted color from a themeCtx-provided theme', () => {
    const customMuted = '#abcdef';
    const fakeTheme = {
      colors: {
        ...defaultTheme.colors,
        muted: customMuted,
      },
    };
    expect(formColor({ themeCtx: { theme: fakeTheme } }, 'muted')).toBe(customMuted);
  });
});
