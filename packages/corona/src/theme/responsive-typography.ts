import { style as createStyle, type Style } from '../style.js';
import type { ResponsiveTypographyToken, ThemeTypography, TypographyToken } from './types.js';

/**
 * Create a Style from a responsive typography token.
 * The returned Style resolves to different text decoration at each breakpoint.
 */
export function typographyStyle(token: ResponsiveTypographyToken): Style {
  return createStyle({
    color: token.color,
    bold: token.bold,
    dim: token.dim,
    italic: token.italic,
    underline: token.underline,
    strikethrough: token.strikethrough,
  });
}

/** Convert a static TypographyToken to a ResponsiveTypographyToken. */
export function toResponsiveTypography(token: TypographyToken): ResponsiveTypographyToken {
  return {
    color: token.color,
    bold: token.bold,
    dim: token.dim,
    italic: token.italic,
    underline: token.underline,
    strikethrough: token.strikethrough,
  };
}

export const DEFAULT_RESPONSIVE_TYPOGRAPHY: Partial<Record<keyof ThemeTypography, Partial<ResponsiveTypographyToken>>> = {
  heading: {
    bold: { xs: true, md: true },
    dim: { xs: false },
  },
  caption: {
    dim: { xs: true, md: false },
    italic: { xs: false, md: true },
  },
};
