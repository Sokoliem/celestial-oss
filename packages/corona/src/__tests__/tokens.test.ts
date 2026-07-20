import { describe, expect, it } from 'vitest';
import { type Color, color } from '../color.js';
import * as corona from '../index.js';
import { createTheme, type SemanticTheme } from '../theme.js';
import {
  type BaseTokens,
  baseTokensMixin,
  containerTokensMixin,
  feedbackTokensMixin,
  formTokensMixin,
  type InteractiveTokens,
  interactiveTokensMixin,
  mergeContracts,
  resolveComponentTokens,
  resolveTokens,
  surfaceTokensMixin,
  type TokenContract,
} from '../tokens.js';

interface TestTokens {
  bg: Color;
  border: Color;
  text: Color;
}

const testContract: TokenContract<TestTokens> = {
  bg: (t: SemanticTheme) => t.colors.surface,
  border: (t: SemanticTheme) => t.colors.border,
  text: (t: SemanticTheme) => t.colors.text,
};

describe('resolveTokens', () => {
  it('resolves all contract keys against a theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens<TestTokens>(testContract, theme);
    expect(tokens.bg.rgb).toEqual(theme.colors.surface.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
  });

  it('overrides take precedence over contract defaults', () => {
    const theme = createTheme();
    const customBg = color.hex('#ff0000');
    const tokens = resolveTokens<TestTokens>(testContract, theme, { bg: customBg });
    expect(tokens.bg.rgb).toEqual(customBg.rgb);
    // Non-overridden keys still from contract
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
  });

  it('works with scale-based contracts', () => {
    interface ScaleTokens {
      highlight: Color;
      hoverBg: Color;
    }
    const scaleContract: TokenContract<ScaleTokens> = {
      highlight: (t: SemanticTheme) => t.scales.accent[400],
      hoverBg: (t: SemanticTheme) => t.scales.accent[100],
    };
    const theme = createTheme();
    const tokens = resolveTokens<ScaleTokens>(scaleContract, theme);
    expect(tokens.highlight.rgb).toEqual(theme.scales.accent[400].rgb);
    expect(tokens.hoverBg.rgb).toEqual(theme.scales.accent[100].rgb);
  });
});

describe('resolveComponentTokens', () => {
  it('resolves without component overrides', () => {
    const theme = createTheme();
    const tokens = resolveComponentTokens<TestTokens>(testContract, theme, 'myComponent');
    expect(tokens.bg.rgb).toEqual(theme.colors.surface.rgb);
  });

  it('applies component-level overrides from theme', () => {
    const customBg = color.hex('#123456');
    const theme = createTheme({
      components: { myComponent: { bg: customBg } },
    });
    const tokens = resolveComponentTokens<TestTokens>(testContract, theme, 'myComponent');
    expect(tokens.bg.rgb).toEqual(customBg.rgb);
    // Non-overridden keys from contract
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
  });

  it('component overrides for different component do not apply', () => {
    const customBg = color.hex('#123456');
    const theme = createTheme({
      components: { otherComponent: { bg: customBg } },
    });
    const tokens = resolveComponentTokens<TestTokens>(testContract, theme, 'myComponent');
    // Should use contract default, not the other component's override
    expect(tokens.bg.rgb).toEqual(theme.colors.surface.rgb);
  });

  it('component overrides do not leak into Object.keys', () => {
    const theme = createTheme({
      components: { test: { bg: color.hex('#000000') } },
    });
    // The components data should not be a visible enumerable property
    expect(Object.keys(theme)).not.toContain('__componentOverrides');
  });
});

// ─── WS9: mergeContracts ────────────────────────────────────────────────────

describe('mergeContracts', () => {
  it('merges two contracts', () => {
    const a: TokenContract<{ x: Color }> = { x: (t) => t.colors.text };
    const b: TokenContract<{ y: Color }> = { y: (t) => t.colors.border };
    const merged = mergeContracts(a, b);
    const theme = createTheme();
    const tokens = resolveTokens(merged, theme);
    expect(tokens.x.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.y.rgb).toEqual(theme.colors.border.rgb);
  });

  it('merges three contracts', () => {
    const a: TokenContract<{ x: Color }> = { x: (t) => t.colors.text };
    const b: TokenContract<{ y: Color }> = { y: (t) => t.colors.border };
    const c: TokenContract<{ z: Color }> = { z: (t) => t.colors.muted };
    const merged = mergeContracts(a, b, c);
    const theme = createTheme();
    const tokens = resolveTokens(merged, theme);
    expect(tokens.x.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.y.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.z.rgb).toEqual(theme.colors.muted.rgb);
  });

  it('merges four contracts', () => {
    const a: TokenContract<{ x: Color }> = { x: (t) => t.colors.text };
    const b: TokenContract<{ y: Color }> = { y: (t) => t.colors.border };
    const c: TokenContract<{ z: Color }> = { z: (t) => t.colors.muted };
    const d: TokenContract<{ w: Color }> = { w: (t) => t.colors.surface };
    const merged = mergeContracts(a, b, c, d);
    const theme = createTheme();
    const tokens = resolveTokens(merged, theme);
    expect(tokens.x.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.y.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.z.rgb).toEqual(theme.colors.muted.rgb);
    expect(tokens.w.rgb).toEqual(theme.colors.surface.rgb);
  });

  it('later contracts override earlier keys', () => {
    const a: TokenContract<{ text: Color }> = { text: (t) => t.colors.text };
    const b: TokenContract<{ text: Color }> = { text: (t) => t.colors.muted };
    const merged = mergeContracts(a, b);
    const theme = createTheme();
    const tokens = resolveTokens(merged, theme);
    // b's resolver should win
    expect(tokens.text.rgb).toEqual(theme.colors.muted.rgb);
  });

  it('returns an object with all keys from all contracts', () => {
    const merged = mergeContracts(baseTokensMixin, surfaceTokensMixin, interactiveTokensMixin);
    const keys = Object.keys(merged).sort();
    expect(keys).toEqual(['bg', 'border', 'borderActive', 'borderHover', 'highlight', 'muted', 'text', 'textSoft'].sort());
  });
});

// ─── WS9: Shared mixin contracts ────────────────────────────────────────────

describe('baseTokensMixin', () => {
  it('resolves text and border from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(baseTokensMixin, theme);
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
  });

  it('has exactly 2 keys', () => {
    expect(Object.keys(baseTokensMixin).sort()).toEqual(['border', 'text']);
  });
});

describe('surfaceTokensMixin', () => {
  it('resolves bg, textSoft, muted from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(surfaceTokensMixin, theme);
    expect(tokens.bg.rgb).toEqual(theme.colors.surfaceRaised.rgb);
    expect(tokens.textSoft.rgb).toEqual(theme.colors.textSoft.rgb);
    expect(tokens.muted.rgb).toEqual(theme.colors.muted.rgb);
  });

  it('has exactly 3 keys', () => {
    expect(Object.keys(surfaceTokensMixin).sort()).toEqual(['bg', 'muted', 'textSoft']);
  });
});

describe('interactiveTokensMixin', () => {
  it('resolves highlight, borderHover, borderActive from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(interactiveTokensMixin, theme);
    expect(tokens.highlight.rgb).toEqual(theme.colors.highlight.rgb);
    expect(tokens.borderHover.rgb).toEqual(theme.colors.borderHover.rgb);
    expect(tokens.borderActive.rgb).toEqual(theme.colors.borderActive.rgb);
  });

  it('has exactly 3 keys', () => {
    expect(Object.keys(interactiveTokensMixin).sort()).toEqual(['borderActive', 'borderHover', 'highlight']);
  });
});

describe('containerTokensMixin', () => {
  it('resolves all 6 container tokens from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(containerTokensMixin, theme);
    expect(tokens.bg.rgb).toEqual(theme.colors.surfaceRaised.rgb);
    expect(tokens.backdrop.rgb).toEqual(theme.colors.backdrop.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.divider.rgb).toEqual(theme.colors.divider.rgb);
    expect(tokens.titleStyle).toEqual(theme.typography.heading);
    expect(tokens.captionStyle).toEqual(theme.typography.caption);
  });

  it('has exactly 6 keys', () => {
    expect(Object.keys(containerTokensMixin).sort()).toEqual(['backdrop', 'bg', 'border', 'captionStyle', 'divider', 'titleStyle']);
  });
});

describe('formTokensMixin', () => {
  it('resolves all 7 form tokens from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(formTokensMixin, theme);
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.borderHover.rgb).toEqual(theme.colors.borderHover.rgb);
    expect(tokens.borderActive.rgb).toEqual(theme.colors.borderActive.rgb);
    expect(tokens.highlight.rgb).toEqual(theme.colors.highlight.rgb);
    expect(tokens.muted.rgb).toEqual(theme.colors.muted.rgb);
    expect(tokens.labelStyle).toEqual(theme.typography.label);
  });

  it('has exactly 7 keys', () => {
    expect(Object.keys(formTokensMixin).sort()).toEqual(['border', 'borderActive', 'borderHover', 'highlight', 'labelStyle', 'muted', 'text']);
  });
});

describe('feedbackTokensMixin', () => {
  it('resolves all 4 feedback tokens from theme', () => {
    const theme = createTheme();
    const tokens = resolveTokens(feedbackTokensMixin, theme);
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.textSoft.rgb).toEqual(theme.colors.textSoft.rgb);
    expect(tokens.bg.rgb).toEqual(theme.colors.surfaceRaised.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(feedbackTokensMixin).sort()).toEqual(['bg', 'border', 'text', 'textSoft']);
  });
});

// ─── WS9: Mixin composition patterns ───────────────────────────────────────

describe('mixin composition', () => {
  it('spread mixins into a component contract with custom keys', () => {
    interface MyComponent extends BaseTokens, InteractiveTokens {
      custom: Color;
    }
    const contract: TokenContract<MyComponent> = {
      ...baseTokensMixin,
      ...interactiveTokensMixin,
      custom: (t) => t.colors.tones.info,
    };
    const theme = createTheme();
    const tokens = resolveTokens(contract, theme);
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
    expect(tokens.border.rgb).toEqual(theme.colors.border.rgb);
    expect(tokens.highlight.rgb).toEqual(theme.colors.highlight.rgb);
    expect(tokens.custom.rgb).toEqual(theme.colors.tones.info.rgb);
  });

  it('mergeContracts produces same result as spread', () => {
    const spread: TokenContract<BaseTokens & InteractiveTokens> = {
      ...baseTokensMixin,
      ...interactiveTokensMixin,
    };
    const merged = mergeContracts(baseTokensMixin, interactiveTokensMixin);
    const theme = createTheme();
    const spreadTokens = resolveTokens(spread, theme);
    const mergedTokens = resolveTokens(merged, theme);
    expect(mergedTokens.text.rgb).toEqual(spreadTokens.text.rgb);
    expect(mergedTokens.border.rgb).toEqual(spreadTokens.border.rgb);
    expect(mergedTokens.highlight.rgb).toEqual(spreadTokens.highlight.rgb);
    expect(mergedTokens.borderHover.rgb).toEqual(spreadTokens.borderHover.rgb);
    expect(mergedTokens.borderActive.rgb).toEqual(spreadTokens.borderActive.rgb);
  });

  it('component overrides work with mixin-based contracts', () => {
    const contract = mergeContracts(baseTokensMixin, surfaceTokensMixin);
    const customBg = color.hex('#abcdef');
    const theme = createTheme({
      components: { myWidget: { bg: customBg } },
    });
    const tokens = resolveComponentTokens(contract, theme, 'myWidget');
    expect(tokens.bg.rgb).toEqual(customBg.rgb);
    // Non-overridden keys still from contract
    expect(tokens.text.rgb).toEqual(theme.colors.text.rgb);
  });
});

// ─── WS9: Barrel exports ────────────────────────────────────────────────────

describe('WS9 barrel exports', () => {
  it('exports mergeContracts', () => {
    expect(corona.mergeContracts).toBe(mergeContracts);
  });

  it('exports the consumer-facing mixin contracts (surfaceTokensMixin is internal)', () => {
    expect(corona.baseTokensMixin).toBe(baseTokensMixin);
    expect(corona.interactiveTokensMixin).toBe(interactiveTokensMixin);
    expect(corona.containerTokensMixin).toBe(containerTokensMixin);
    expect(corona.formTokensMixin).toBe(formTokensMixin);
    expect(corona.feedbackTokensMixin).toBe(feedbackTokensMixin);
  });
});
