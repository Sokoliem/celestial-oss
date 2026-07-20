import { describe, expect, it } from 'vitest';
import type { Color } from '../color.js';
import { color } from '../color.js';
import { defineColorBridge, mergeColorBridge, resolveColorBridge } from '../color-bridge.js';
import { createTheme, type SemanticTheme } from '../theme.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTheme(): SemanticTheme {
  return createTheme({});
}

function isColor(c: unknown): c is Color {
  return c !== null && typeof c === 'object' && 'fg' in c && 'bg' in c;
}

// ─── defineColorBridge ──────────────────────────────────────────────────────

describe('defineColorBridge', () => {
  it('creates a bridge definition from resolver map', () => {
    const bridge = defineColorBridge({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      muted: (t: SemanticTheme) => t.colors.muted,
    });

    expect(typeof bridge.primary).toBe('function');
    expect(typeof bridge.muted).toBe('function');
  });

  it('returns the same object (identity — no wrapping overhead)', () => {
    const input = {
      primary: (t: SemanticTheme) => t.colors.tones.accent,
    };
    const bridge = defineColorBridge(input);
    expect(bridge).toBe(input);
  });
});

// ─── resolveColorBridge ─────────────────────────────────────────────────────

describe('resolveColorBridge', () => {
  it('resolves all bridge values from a theme', () => {
    const bridge = defineColorBridge({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      danger: (t: SemanticTheme) => t.colors.tones.danger,
      bg: (t: SemanticTheme) => t.colors.surface,
    });

    const result = resolveColorBridge(bridge, getTheme());

    expect(isColor(result.primary)).toBe(true);
    expect(isColor(result.danger)).toBe(true);
    expect(isColor(result.bg)).toBe(true);
  });

  it('resolves values that match the theme', () => {
    const bridge = defineColorBridge({
      accent: (t: SemanticTheme) => t.colors.tones.accent,
    });

    const theme = getTheme();
    const result = resolveColorBridge(bridge, theme);

    expect(result.accent).toEqual(theme.colors.tones.accent);
  });

  it('applies overrides when provided', () => {
    const bridge = defineColorBridge({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      secondary: (t: SemanticTheme) => t.colors.muted,
    });

    const theme = getTheme();
    const custom = color.hex('#ff0000');
    const result = resolveColorBridge(bridge, theme, { primary: custom });

    expect(result.primary).toBe(custom);
    expect(result.secondary).toEqual(theme.colors.muted);
  });

  it('undefined overrides fall through to the bridge resolver', () => {
    const bridge = defineColorBridge({
      a: (t: SemanticTheme) => t.colors.text,
      b: (t: SemanticTheme) => t.colors.muted,
    });

    const theme = getTheme();
    const result = resolveColorBridge(bridge, theme, { a: undefined });

    expect(result.a).toEqual(theme.colors.text);
  });
});

// ─── mergeColorBridge ───────────────────────────────────────────────────────

describe('mergeColorBridge', () => {
  it('merges two bridge definitions', () => {
    const base = defineColorBridge({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      bg: (t: SemanticTheme) => t.colors.surface,
    });

    const extension = defineColorBridge({
      danger: (t: SemanticTheme) => t.colors.tones.danger,
      warning: (t: SemanticTheme) => t.colors.tones.warning,
    });

    const merged = mergeColorBridge(base, extension);
    const theme = getTheme();
    const result = resolveColorBridge(merged, theme);

    expect(isColor(result.primary)).toBe(true);
    expect(isColor(result.bg)).toBe(true);
    expect(isColor(result.danger)).toBe(true);
    expect(isColor(result.warning)).toBe(true);
  });

  it('extension resolvers override base resolvers for same key', () => {
    const base = defineColorBridge({
      accent: (t: SemanticTheme) => t.colors.tones.accent,
    });

    const override = defineColorBridge({
      accent: (t: SemanticTheme) => t.colors.tones.danger,
    });

    const merged = mergeColorBridge(base, override);
    const theme = getTheme();
    const result = resolveColorBridge(merged, theme);

    expect(result.accent).toEqual(theme.colors.tones.danger);
  });

  it('preserves all keys from both bridges', () => {
    const a = defineColorBridge({ x: (t: SemanticTheme) => t.colors.text });
    const b = defineColorBridge({ y: (t: SemanticTheme) => t.colors.muted });

    const merged = mergeColorBridge(a, b);
    expect(Object.keys(merged)).toContain('x');
    expect(Object.keys(merged)).toContain('y');
  });
});

// ─── Nested bridge composition ──────────────────────────────────────────────

describe('nested bridge composition', () => {
  it('supports nested bridge objects via resolver returning a resolved sub-bridge', () => {
    // Simulating QuasarColorConfig's nested structure
    const costBridge = defineColorBridge({
      input: (t: SemanticTheme) => t.colors.tones.info,
      output: (t: SemanticTheme) => t.colors.tones.success,
    });

    const gitBridge = defineColorBridge({
      added: (t: SemanticTheme) => t.colors.tones.success,
      deleted: (t: SemanticTheme) => t.colors.tones.danger,
    });

    // A composite bridge can resolve sub-bridges in its resolvers
    const theme = getTheme();
    const costColors = resolveColorBridge(costBridge, theme);
    const gitColors = resolveColorBridge(gitBridge, theme);

    const composite = {
      cost: costColors,
      git: gitColors,
    };

    expect(isColor(composite.cost.input)).toBe(true);
    expect(isColor(composite.cost.output)).toBe(true);
    expect(isColor(composite.git.added)).toBe(true);
    expect(isColor(composite.git.deleted)).toBe(true);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty bridge produces empty result', () => {
    const bridge = defineColorBridge<Record<string, never>>({});
    const result = resolveColorBridge(bridge, getTheme());
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('bridge values can be non-Color types', () => {
    const bridge = defineColorBridge({
      label: (_t: SemanticTheme) => 'Hello' as string,
      count: (_t: SemanticTheme) => 42 as number,
    });

    const result = resolveColorBridge(bridge, getTheme());
    expect(result.label).toBe('Hello');
    expect(result.count).toBe(42);
  });

  it('overrides with all keys set skips all resolvers', () => {
    let called = false;
    const bridge = defineColorBridge({
      accent: (_t: SemanticTheme) => {
        called = true;
        return color.hex('#000000');
      },
    });

    const custom = color.hex('#ffffff');
    resolveColorBridge(bridge, getTheme(), { accent: custom });
    expect(called).toBe(false);
  });
});
