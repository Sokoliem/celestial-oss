import { afterEach, describe, expect, it, vi } from 'vitest';

describe('environment guards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keeps color, theme, and a11y helpers usable when process is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('process', undefined);

    const { color } = await import('../color.js');
    const { defaultTheme } = await import('../theme.js');
    const { reduceMotion } = await import('../a11y.js');

    expect(() => color.adaptive('#000000', '#ffffff')).not.toThrow();
    expect(defaultTheme.colors.text).toBeDefined();
    expect(reduceMotion()).toBe(false);
  });
});
