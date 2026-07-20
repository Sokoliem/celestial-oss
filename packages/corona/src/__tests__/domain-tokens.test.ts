import { describe, expect, expectTypeOf, it } from 'vitest';
import { type Color, color } from '../color.js';
import { simulateColorBlindness } from '../cvd.js';
import {
  appChromeTokens,
  CHROME_PIN_GLYPH,
  chromeTokens,
  costTokens,
  cursorStyleTokens,
  cursorTokens,
  type DomainTokenFamily,
  defineDomainTokens,
  diffTokens,
  ELEVATION_LEVEL_KEYS,
  type ElevationStepTokens,
  elevationTokens,
  elevationTokensBySemantic,
  gitTokens,
  PERMISSION_TOKEN_VALUES,
  type PermissionTokenValue,
  permissionColorTokens,
  permissionTokens,
  resolveDomainTokens,
  resolveFamilyGlyph,
  SOURCE_GLYPHS,
  SOURCE_TOKEN_VALUES,
  type SourceTokenValue,
  sourceColorTokens,
  sourceTokens,
  statusTokens,
  syntaxTokens,
} from '../domain-tokens.js';
import { applyVariant, createTheme, darkVariant, highContrastVariant, lightVariant, type SemanticTheme } from '../theme.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTheme(): SemanticTheme {
  return createTheme({});
}

function isColor(c: unknown): c is Color {
  return c !== null && typeof c === 'object' && 'fg' in c && 'bg' in c;
}

// ─── defineDomainTokens ─────────────────────────────────────────────────────

describe('defineDomainTokens', () => {
  it('creates a DomainTokenContract from resolver functions', () => {
    const contract = defineDomainTokens({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      secondary: (t: SemanticTheme) => t.colors.muted,
    });

    expect(typeof contract.primary).toBe('function');
    expect(typeof contract.secondary).toBe('function');
  });

  it('returned contract is the same object (no wrapping overhead)', () => {
    const input = {
      primary: (t: SemanticTheme) => t.colors.tones.accent,
    };
    const contract = defineDomainTokens(input);
    expect(contract).toBe(input);
  });
});

// ─── resolveDomainTokens ────────────────────────────────────────────────────

describe('resolveDomainTokens', () => {
  it('resolves all tokens against a theme', () => {
    const contract = defineDomainTokens({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      dimText: (t: SemanticTheme) => t.colors.muted,
    });

    const resolved = resolveDomainTokens(contract, getTheme());

    expect(isColor(resolved.primary)).toBe(true);
    expect(isColor(resolved.dimText)).toBe(true);
  });

  it('supports overrides', () => {
    const contract = defineDomainTokens({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
      dimText: (t: SemanticTheme) => t.colors.muted,
    });

    const theme = getTheme();
    const customColor = theme.colors.tones.danger;
    const resolved = resolveDomainTokens(contract, theme, { primary: customColor });

    expect(resolved.primary).toBe(customColor);
    // dimText should still resolve from the theme
    expect(isColor(resolved.dimText)).toBe(true);
  });

  it('overrides only specified keys; rest resolve normally', () => {
    const contract = defineDomainTokens({
      a: (t: SemanticTheme) => t.colors.text,
      b: (t: SemanticTheme) => t.colors.muted,
      c: (t: SemanticTheme) => t.colors.border,
    });

    const theme = getTheme();
    const override = theme.colors.tones.warning;
    const resolved = resolveDomainTokens(contract, theme, { b: override });

    expect(resolved.a).toEqual(theme.colors.text);
    expect(resolved.b).toBe(override);
    expect(resolved.c).toEqual(theme.colors.border);
  });
});

// ─── Built-in: statusTokens ────────────────────────────────────────────────

describe('statusTokens', () => {
  it('provides success, warning, danger, info, pending, running, denied colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(statusTokens, theme);

    expect(isColor(resolved.success)).toBe(true);
    expect(isColor(resolved.warning)).toBe(true);
    expect(isColor(resolved.danger)).toBe(true);
    expect(isColor(resolved.info)).toBe(true);
    expect(isColor(resolved.pending)).toBe(true);
    expect(isColor(resolved.running)).toBe(true);
    expect(isColor(resolved.denied)).toBe(true);
  });

  it('maps to the corresponding theme tones', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(statusTokens, theme);

    expect(resolved.success).toEqual(theme.colors.tones.success);
    expect(resolved.warning).toEqual(theme.colors.tones.warning);
    expect(resolved.danger).toEqual(theme.colors.tones.danger);
    expect(resolved.info).toEqual(theme.colors.tones.info);
    expect(resolved.pending).toEqual(theme.colors.muted);
    expect(resolved.running).toEqual(theme.colors.tones.accent);
  });

  it('denied sits between warning and danger (mix at 0.4)', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(statusTokens, theme);
    const expected = color.mix(theme.colors.tones.warning, theme.colors.tones.danger, 0.4);

    expect(resolved.denied).toEqual(expected);
  });

  it('pending and running are distinguishable from each other', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(statusTokens, theme);

    expect(resolved.pending).not.toEqual(resolved.running);
  });

  it('pending, running, denied remain distinguishable from each other under CVD', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(statusTokens, theme);

    for (const variant of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const pending = simulateColorBlindness(resolved.pending, variant).rgb;
      const running = simulateColorBlindness(resolved.running, variant).rgb;
      const denied = simulateColorBlindness(resolved.denied, variant).rgb;

      // The Wave-0 additive trio must stay mutually distinct under each CVD type.
      expect(pending).not.toEqual(running);
      expect(running).not.toEqual(denied);
      expect(pending).not.toEqual(denied);
    }
  });

  it('can override individual status colors', () => {
    const theme = getTheme();
    const custom = theme.colors.text;
    const resolved = resolveDomainTokens(statusTokens, theme, { danger: custom });

    expect(resolved.danger).toBe(custom);
    expect(resolved.success).toEqual(theme.colors.tones.success);
  });
});

// ─── Built-in: gitTokens ───────────────────────────────────────────────────

describe('gitTokens', () => {
  it('provides added, modified, deleted, renamed, untracked, branch colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(gitTokens, theme);

    expect(isColor(resolved.added)).toBe(true);
    expect(isColor(resolved.modified)).toBe(true);
    expect(isColor(resolved.deleted)).toBe(true);
    expect(isColor(resolved.renamed)).toBe(true);
    expect(isColor(resolved.untracked)).toBe(true);
    expect(isColor(resolved.branch)).toBe(true);
  });

  it('maps added to success, deleted to danger, etc.', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(gitTokens, theme);

    expect(resolved.added).toEqual(theme.colors.tones.success);
    expect(resolved.deleted).toEqual(theme.colors.tones.danger);
    expect(resolved.modified).toEqual(theme.colors.tones.warning);
  });
});

// ─── Built-in: costTokens ──────────────────────────────────────────────────

describe('costTokens', () => {
  it('provides low, mid, high cost colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(costTokens, theme);

    expect(isColor(resolved.low)).toBe(true);
    expect(isColor(resolved.mid)).toBe(true);
    expect(isColor(resolved.high)).toBe(true);
  });

  it('maps low→success, mid→warning, high→danger', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(costTokens, theme);

    expect(resolved.low).toEqual(theme.colors.tones.success);
    expect(resolved.mid).toEqual(theme.colors.tones.warning);
    expect(resolved.high).toEqual(theme.colors.tones.danger);
  });
});

// ─── Built-in: syntaxTokens ────────────────────────────────────────────────

describe('syntaxTokens', () => {
  it('provides keyword, string, number, comment, operator, function, type colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(syntaxTokens, theme);

    expect(isColor(resolved.keyword)).toBe(true);
    expect(isColor(resolved.string)).toBe(true);
    expect(isColor(resolved.number)).toBe(true);
    expect(isColor(resolved.comment)).toBe(true);
    expect(isColor(resolved.operator)).toBe(true);
    expect(isColor(resolved.function)).toBe(true);
    expect(isColor(resolved.type)).toBe(true);
  });
});

// ─── Built-in: diffTokens ──────────────────────────────────────────────────

describe('diffTokens', () => {
  it('provides added, removed, context, header colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(diffTokens, theme);

    expect(isColor(resolved.added)).toBe(true);
    expect(isColor(resolved.removed)).toBe(true);
    expect(isColor(resolved.context)).toBe(true);
    expect(isColor(resolved.header)).toBe(true);
  });

  it('maps added→success, removed→danger', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(diffTokens, theme);

    expect(resolved.added).toEqual(theme.colors.tones.success);
    expect(resolved.removed).toEqual(theme.colors.tones.danger);
  });
});

describe('chromeTokens', () => {
  it('provides overlay, menu, and row-state semantics from the semantic theme', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(chromeTokens, theme);

    expect(isColor(resolved.overlaySurface)).toBe(true);
    expect(isColor(resolved.overlayDetailSurface)).toBe(true);
    expect(isColor(resolved.overlayBorder)).toBe(true);
    expect(isColor(resolved.menuSurface)).toBe(true);
    expect(isColor(resolved.menuText)).toBe(true);
    expect(isColor(resolved.menuMuted)).toBe(true);
    expect(isColor(resolved.rowHoverSurface)).toBe(true);
    expect(isColor(resolved.rowHoverText)).toBe(true);
    expect(isColor(resolved.rowSelectedSurface)).toBe(true);
    expect(isColor(resolved.rowSelectedText)).toBe(true);
  });

  it('keeps selected row text readable on the selected row surface', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(chromeTokens, theme);

    expect(color.contrastRatio(resolved.rowSelectedText, resolved.rowSelectedSurface)).toBeGreaterThanOrEqual(4.5);
  });

  it('exposes a pin role for sidebar library pinned entries', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(chromeTokens, theme);

    expect(isColor(resolved.pin)).toBe(true);
  });

  it('CHROME_PIN_GLYPH provides the same glyph across levels', () => {
    expect(CHROME_PIN_GLYPH.level1).toBe('⚲');
    expect(CHROME_PIN_GLYPH.level2).toBe('⚲');
    expect(CHROME_PIN_GLYPH.level3).toBe('⚲');
  });
});

describe('appChromeTokens', () => {
  it('provides readable flagship app chrome tokens', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(appChromeTokens, theme);

    expect(isColor(resolved.panelSurface)).toBe(true);
    expect(isColor(resolved.panelBorderFocused)).toBe(true);
    expect(isColor(resolved.overlayText)).toBe(true);
    expect(isColor(resolved.badgeSurface)).toBe(true);
    expect(isColor(resolved.badgeText)).toBe(true);
    expect(color.contrastRatio(resolved.overlayText, resolved.overlaySurface)).toBeGreaterThanOrEqual(4.5);
    expect(color.contrastRatio(resolved.badgeText, resolved.badgeSurface)).toBeGreaterThanOrEqual(4.5);
  });
});

// ─── Built-in: sourceTokens / permissionTokens ─────────────────────────────

describe('sourceTokens (colour contract + glyph const, Phase C)', () => {
  it('resolves a color for every canonical source value', () => {
    const theme = getTheme();
    // Phase C's colour contract is `sourceColorTokens` — the legacy
    // `sourceTokens` is a family shape (name/values/glyphs/isValue) and
    // does NOT expose per-key resolvers.
    const resolved = resolveDomainTokens(sourceColorTokens, theme);
    for (const key of SOURCE_TOKEN_VALUES) {
      expect(isColor(resolved[key])).toBe(true);
    }
  });

  it('exposes glyphs at levels 1/2/3 for every source value', () => {
    for (const key of SOURCE_TOKEN_VALUES) {
      const entry = SOURCE_GLYPHS[key];
      expect(entry).toBeDefined();
      expect(typeof entry.level1).toBe('string');
      expect(typeof entry.level2).toBe('string');
      expect(typeof entry.level3).toBe('string');
      expect(entry.level1.length).toBeGreaterThan(0);
    }
  });

  it('declares all six canonical source kinds', () => {
    expect([...SOURCE_TOKEN_VALUES].sort()).toEqual(['builtin', 'generated', 'mcp', 'plugin', 'skill', 'slash']);
  });
});

describe('permissionTokens (colour contract, Phase C)', () => {
  it('resolves a color for every canonical permission value', () => {
    const theme = getTheme();
    // Phase C's colour contract is `permissionColorTokens`; the legacy
    // `permissionTokens` is a family shape without per-key resolvers.
    const resolved = resolveDomainTokens(permissionColorTokens, theme);
    for (const key of PERMISSION_TOKEN_VALUES) {
      expect(isColor(resolved[key])).toBe(true);
    }
  });

  it('declares all six canonical permission kinds', () => {
    expect([...PERMISSION_TOKEN_VALUES].sort()).toEqual(['destructive', 'invoke', 'network', 'none', 'read', 'write']);
  });
});

// ─── Type safety ────────────────────────────────────────────────────────────

describe('type safety', () => {
  it('DomainTokenContract types are inferred correctly', () => {
    const contract = defineDomainTokens({
      a: (t: SemanticTheme) => t.colors.text,
      b: (_t: SemanticTheme) => 'hello' as const,
      c: (_t: SemanticTheme) => 42 as const,
    });

    const theme = getTheme();
    const resolved = resolveDomainTokens(contract, theme);

    // These assignments type-check:
    const _a: Color = resolved.a;
    const _b: 'hello' = resolved.b;
    const _c: 42 = resolved.c;

    expect(_a).toBeDefined();
    expect(_b).toBe('hello');
    expect(_c).toBe(42);
  });

  it('override keys must match the contract', () => {
    const contract = defineDomainTokens({
      primary: (t: SemanticTheme) => t.colors.text,
      secondary: (t: SemanticTheme) => t.colors.muted,
    });

    // This should compile — overriding with the correct type
    const theme = getTheme();
    const resolved = resolveDomainTokens(contract, theme, { primary: theme.colors.border });
    expect(isColor(resolved.primary)).toBe(true);
  });
});

// ─── CC-1: source + permission token families ─────────────────────────────

describe('sourceTokens (CC-1)', () => {
  it('exposes a closed enum covering every provenance kind', () => {
    expect(sourceTokens.name).toBe('source');
    expect([...sourceTokens.values]).toEqual(['slash', 'skill', 'mcp', 'plugin', 'builtin', 'generated']);
  });

  it('provides a three-level glyph triple for every value', () => {
    for (const value of sourceTokens.values) {
      expect(sourceTokens.glyphs).not.toBeNull();
      const glyph = sourceTokens.glyphs![value];
      expect(typeof glyph.level1).toBe('string');
      expect(typeof glyph.level2).toBe('string');
      expect(typeof glyph.level3).toBe('string');
      expect(glyph.level1.length).toBeGreaterThan(0);
      expect(glyph.level2.length).toBeGreaterThan(0);
      expect(glyph.level3.length).toBeGreaterThan(0);
    }
  });

  it('resolves the slash source to "/" at every level', () => {
    expect(resolveFamilyGlyph(sourceTokens, 'slash', 1)).toBe('/');
    expect(resolveFamilyGlyph(sourceTokens, 'slash', 2)).toBe('/');
    expect(resolveFamilyGlyph(sourceTokens, 'slash', 3)).toBe('/');
  });

  it('narrows values via isValue()', () => {
    expect(sourceTokens.isValue('slash')).toBe(true);
    expect(sourceTokens.isValue('skill')).toBe(true);
    expect(sourceTokens.isValue('not-a-source')).toBe(false);
    expect(sourceTokens.isValue(42)).toBe(false);
    expect(sourceTokens.isValue(null)).toBe(false);
  });

  it('exposes a SourceTokenValue literal union consumable by wrapper code', () => {
    const value: SourceTokenValue = 'mcp';
    expect(sourceTokens.values).toContain(value);
    expectTypeOf(value).toMatchTypeOf<SourceTokenValue>();
    // A typo would be a compile-time error; the runtime check mirrors it.
    // @ts-expect-error — "bogus" is not a SourceTokenValue
    const bad: SourceTokenValue = 'bogus';
    expect(sourceTokens.isValue(bad)).toBe(false);
  });
});

describe('permissionTokens (CC-1)', () => {
  it('exposes a closed enum covering every permission role', () => {
    expect(permissionTokens.name).toBe('permission');
    expect([...permissionTokens.values]).toEqual(['none', 'read', 'write', 'invoke', 'network', 'destructive']);
  });

  it('deliberately ships without glyphs; resolveFamilyGlyph returns empty string', () => {
    expect(permissionTokens.glyphs).toBeNull();
    for (const value of permissionTokens.values) {
      expect(resolveFamilyGlyph(permissionTokens, value, 1)).toBe('');
      expect(resolveFamilyGlyph(permissionTokens, value, 2)).toBe('');
      expect(resolveFamilyGlyph(permissionTokens, value, 3)).toBe('');
    }
  });

  it('narrows values via isValue()', () => {
    expect(permissionTokens.isValue('read')).toBe(true);
    expect(permissionTokens.isValue('destructive')).toBe(true);
    expect(permissionTokens.isValue('nope')).toBe(false);
  });

  it('exposes a PermissionTokenValue literal union consumable by wrapper code', () => {
    const value: PermissionTokenValue = 'network';
    expect(permissionTokens.values).toContain(value);
    expectTypeOf(value).toMatchTypeOf<PermissionTokenValue>();
  });
});

describe('defineDomainTokens family overload (CC-1)', () => {
  it('returns a typed DomainTokenFamily when given the {name,values,glyphs} shape', () => {
    const custom = defineDomainTokens({
      name: 'mood',
      values: ['calm', 'alert'] as const,
      glyphs: {
        calm: { level1: '.', level2: '○', level3: '○' },
        alert: { level1: '!', level2: '⚠', level3: '⚠' },
      },
    });
    expectTypeOf(custom).toMatchTypeOf<DomainTokenFamily<'calm' | 'alert'>>();
    expect(custom.name).toBe('mood');
    expect(custom.isValue('calm')).toBe(true);
    expect(custom.isValue('alert')).toBe(true);
    expect(custom.isValue('off')).toBe(false);
    expect(resolveFamilyGlyph(custom, 'alert', 2)).toBe('⚠');
  });

  it('still accepts the legacy contract shape for colour resolvers', () => {
    const legacy = defineDomainTokens({
      primary: (t: SemanticTheme) => t.colors.tones.accent,
    });
    // Legacy shape is a map of resolver functions — no `.values` array.
    expect(typeof (legacy as { primary?: unknown }).primary).toBe('function');
    expect((legacy as { name?: unknown }).name).toBeUndefined();
    expect((legacy as { values?: unknown }).values).toBeUndefined();
  });
});

// ─── Composition ────────────────────────────────────────────────────────────

describe('composition', () => {
  it('can compose multiple domain contracts via spread', () => {
    const base = defineDomainTokens({
      text: (t: SemanticTheme) => t.colors.text,
      bg: (t: SemanticTheme) => t.colors.surface,
    });

    const extended = defineDomainTokens({
      ...base,
      accent: (t: SemanticTheme) => t.colors.tones.accent,
    });

    const theme = getTheme();
    const resolved = resolveDomainTokens(extended, theme);

    expect(isColor(resolved.text)).toBe(true);
    expect(isColor(resolved.bg)).toBe(true);
    expect(isColor(resolved.accent)).toBe(true);
  });
});

// ─── Built-in: elevationTokens ──────────────────────────────────────────────

describe('elevationTokens', () => {
  it('resolves all five levels to ElevationStepTokens', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(elevationTokens, theme);

    for (const key of ELEVATION_LEVEL_KEYS) {
      const step = resolved[key] as ElevationStepTokens;
      expect(isColor(step.background)).toBe(true);
      expect(isColor(step.border)).toBe(true);
      expect(typeof step.borderStyle).toBe('string');
      expect(typeof step.shadowDepth).toBe('number');
      expect(typeof step.backdropBlur).toBe('number');
      expect(typeof step.elevation).toBe('number');
    }
  });

  it('shadowDepth strictly increases from level1 to level5', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(elevationTokens, theme);

    expect(resolved.level1.shadowDepth).toBeLessThan(resolved.level2.shadowDepth);
    expect(resolved.level2.shadowDepth).toBeLessThan(resolved.level3.shadowDepth);
    expect(resolved.level3.shadowDepth).toBeLessThan(resolved.level4.shadowDepth);
    expect(resolved.level4.shadowDepth).toBeLessThan(resolved.level5.shadowDepth);
  });

  it('backdropBlur is 0 for level1/level2 and >0 for level3+', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(elevationTokens, theme);

    expect(resolved.level1.backdropBlur).toBe(0);
    expect(resolved.level2.backdropBlur).toBe(0);
    expect(resolved.level3.backdropBlur).toBeGreaterThan(0);
    expect(resolved.level4.backdropBlur).toBeGreaterThan(0);
    expect(resolved.level5.backdropBlur).toBeGreaterThan(0);
  });

  it('numeric `level{N}` and semantic `flat/raised/...` resolve to identical step values', () => {
    const theme = getTheme();
    const numeric = resolveDomainTokens(elevationTokens, theme);
    const semantic = resolveDomainTokens(elevationTokensBySemantic, theme);

    expect(numeric.level1).toEqual(semantic.flat);
    expect(numeric.level2).toEqual(semantic.raised);
    expect(numeric.level3).toEqual(semantic.floating);
    expect(numeric.level4).toEqual(semantic.overlay);
    expect(numeric.level5).toEqual(semantic.modal);
  });

  it('resolves correctly under dark / light / highContrast variants', () => {
    const base = createTheme({});
    for (const variant of [darkVariant, lightVariant, highContrastVariant]) {
      const theme = applyVariant(base, variant);
      const resolved = resolveDomainTokens(elevationTokens, theme);
      for (const key of ELEVATION_LEVEL_KEYS) {
        const step = resolved[key] as ElevationStepTokens;
        expect(isColor(step.background)).toBe(true);
        expect(isColor(step.border)).toBe(true);
      }
    }
  });

  it('ELEVATION_LEVEL_KEYS lists all five levels in order', () => {
    expect(ELEVATION_LEVEL_KEYS).toEqual(['level1', 'level2', 'level3', 'level4', 'level5']);
  });
});

// ─── Built-in: cursorTokens ─────────────────────────────────────────────────

describe('cursorTokens', () => {
  it('resolves fill, rule, off colors', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(cursorTokens, theme);

    expect(isColor(resolved.fill)).toBe(true);
    expect(isColor(resolved.rule)).toBe(true);
    expect(isColor(resolved.off)).toBe(true);
  });

  it('fill and off are distinct so the cursor visibly toggles', () => {
    const theme = getTheme();
    const resolved = resolveDomainTokens(cursorTokens, theme);

    expect(resolved.fill).not.toEqual(resolved.off);
  });
});

// ─── Built-in: cursorStyleTokens ────────────────────────────────────────────

describe('cursorStyleTokens', () => {
  it('exposes the four cursor styles as a closed enum', () => {
    expect(cursorStyleTokens.values).toEqual(['block', 'underscore', 'pulse', 'none']);
    expect(cursorStyleTokens.isValue('block')).toBe(true);
    expect(cursorStyleTokens.isValue('pulse')).toBe(true);
    expect(cursorStyleTokens.isValue('banana')).toBe(false);
  });

  it('provides per-level glyphs for each style', () => {
    expect(resolveFamilyGlyph(cursorStyleTokens, 'block', 2)).toBe('█');
    expect(resolveFamilyGlyph(cursorStyleTokens, 'underscore', 1)).toBe('_');
    expect(resolveFamilyGlyph(cursorStyleTokens, 'underscore', 2)).toBe('▁');
    expect(resolveFamilyGlyph(cursorStyleTokens, 'pulse', 3)).toBe('●');
    expect(resolveFamilyGlyph(cursorStyleTokens, 'none', 1)).toBe('');
  });
});
