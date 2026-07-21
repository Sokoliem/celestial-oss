import type { ThemeGlyphs } from './theme.js';

/** Unicode capability level for glyph resolution. Matches AtlasUnicodeLevel. */
export type GlyphLevel = 'none' | 'basic' | 'wide' | 'full' | 'unicode16';

/**
 * A glyph token with fallback variants for different terminal capabilities.
 * Resolution picks the best available variant for the detected unicode level.
 */
export interface GlyphToken {
  /** Unicode 16-specific character; falls back to `wide` when omitted. */
  unicode16?: string;
  /** Nerd Font icon (requires 'full' unicode level) */
  full: string;
  /** Standard Unicode character (requires 'wide' or higher) */
  wide: string;
  /** Basic Unicode / box-drawing (requires 'basic' or higher) */
  basic: string;
  /** Pure ASCII fallback (works everywhere) */
  none: string;
}

/**
 * Resolve a glyph token to the best available string for the given unicode level.
 */
export function resolveGlyph(token: GlyphToken, level: GlyphLevel): string {
  switch (level) {
    case 'unicode16':
      return token.unicode16 || token.wide || token.basic || token.none;
    case 'full':
      return token.full || token.wide || token.basic || token.none;
    case 'wide':
      return token.wide || token.basic || token.none;
    case 'basic':
      return token.basic || token.none;
    case 'none':
      return token.none;
  }
}

/**
 * Default glyph tokens with fallback chains for all ThemeGlyph properties.
 */
export const DEFAULT_GLYPH_TOKENS: Record<keyof ThemeGlyphs, GlyphToken> = {
  divider: { full: '\ue621', wide: '\u2500', basic: '-', none: '-' },
  bullet: { full: '\uf444', wide: '\u2022', basic: '*', none: '*' },
  keycapLeft: { full: '\uf0cf', wide: '\u2308', basic: '[', none: '[' },
  keycapRight: { full: '\uf0cf', wide: '\u2309', basic: ']', none: ']' },
  tagPrefix: { full: '\uf02b', wide: '\u204D', basic: '#', none: '#' },
  selected: { full: '\uf058', wide: '\u25C9', basic: '(*)', none: '(*)' },
  unselected: { full: '\uf111', wide: '\u25CB', basic: '( )', none: '( )' },
  menuArrow: { full: '\uf054', wide: '\u25B8', basic: '>', none: '>' },
  checked: { full: '\uf14a', wide: '\u2611', basic: '[x]', none: '[x]' },
  unchecked: { full: '\uf096', wide: '\u2610', basic: '[ ]', none: '[ ]' },
  radioOn: { full: '\uf192', wide: '\u25C9', basic: '(*)', none: '(*)' },
  radioOff: { full: '\uf10c', wide: '\u25CB', basic: '( )', none: '( )' },
  pipe: { full: '\u2502', wide: '\u2502', basic: '|', none: '|' },
  ellipsis: { full: '\u2026', wide: '\u2026', basic: '...', none: '...' },
  pointer: { full: '\uf054', wide: '\u25B8', basic: '>', none: '>' },
  doubleArrowH: { full: '\uf101', wide: '\u00BB', basic: '>>', none: '>>' },
  doubleArrowV: { full: '\uf103', wide: '\u21E3', basic: 'v', none: 'v' },
  cornerTL: { full: '\u256D', wide: '\u256D', basic: '+', none: '+' },
  cornerTR: { full: '\u256E', wide: '\u256E', basic: '+', none: '+' },
  cornerBL: { full: '\u2570', wide: '\u2570', basic: '+', none: '+' },
  cornerBR: { full: '\u256F', wide: '\u256F', basic: '+', none: '+' },
};

/**
 * Resolve all glyph tokens to strings for the given unicode level.
 * Returns a complete ThemeGlyphs object ready for theme consumption.
 */
export function resolveGlyphs(level: GlyphLevel): ThemeGlyphs {
  const result: Record<string, string> = {};
  for (const [key, token] of Object.entries(DEFAULT_GLYPH_TOKENS)) {
    result[key] = resolveGlyph(token, level);
  }
  return result as unknown as ThemeGlyphs;
}
