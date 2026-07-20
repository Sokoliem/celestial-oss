import { describe, expect, it } from 'vitest';
import { color } from '../color.js';
import { createTheme, DEFAULT_RESPONSIVE_TYPOGRAPHY, type ResponsiveTypographyToken, toResponsiveTypography, typographyStyle } from '../theme.js';

describe('typographyStyle', () => {
  it('creates a Style from responsive typography token', () => {
    const token: ResponsiveTypographyToken = {
      color: { xs: color.white, md: color.rgb(200, 200, 255) },
      bold: { xs: false, md: true },
    };
    const s = typographyStyle(token);
    expect(s).toBeDefined();
    expect(typeof s.render).toBe('function');
  });

  it('renders differently at different breakpoints', () => {
    const token: ResponsiveTypographyToken = {
      color: color.white,
      bold: { xs: false, md: true },
    };
    const s = typographyStyle(token);
    const atXs = s.render('Hello', 'xs');
    const atMd = s.render('Hello', 'md');
    // md should have bold ANSI code, xs should not
    expect(atMd).toContain('\x1b[1m'); // bold on
    expect(atXs).not.toContain('\x1b[1m');
  });

  it('resolves responsive cascade (lg inherits md)', () => {
    const token: ResponsiveTypographyToken = {
      color: color.white,
      bold: { xs: false, md: true },
    };
    const s = typographyStyle(token);
    const atLg = s.render('Hello', 'lg');
    // lg should inherit md's bold: true
    expect(atLg).toContain('\x1b[1m');
  });

  it('handles plain (non-responsive) values', () => {
    const token: ResponsiveTypographyToken = {
      color: color.red,
      bold: true,
      italic: true,
    };
    const s = typographyStyle(token);
    const rendered = s.render('Hello', 'md');
    expect(rendered).toContain('\x1b[1m'); // bold
    expect(rendered).toContain('\x1b[3m'); // italic
  });

  it('handles mixed responsive and static properties', () => {
    const token: ResponsiveTypographyToken = {
      color: { xs: color.white, md: color.blue },
      bold: true, // static
      italic: { xs: false, lg: true }, // responsive
    };
    const s = typographyStyle(token);
    expect(s.props.bold).toBe(true);
  });
});

describe('toResponsiveTypography', () => {
  it('converts a static TypographyToken', () => {
    const result = toResponsiveTypography({
      color: color.white,
      bold: true,
      italic: false,
    });
    expect(result.color).toBe(color.white);
    expect(result.bold).toBe(true);
    expect(result.italic).toBe(false);
  });

  it('preserves undefined optional fields', () => {
    const result = toResponsiveTypography({ color: color.white });
    expect(result.dim).toBeUndefined();
    expect(result.underline).toBeUndefined();
  });
});

describe('DEFAULT_RESPONSIVE_TYPOGRAPHY', () => {
  it('is defined with heading and caption defaults', () => {
    expect(DEFAULT_RESPONSIVE_TYPOGRAPHY).toBeDefined();
    expect(DEFAULT_RESPONSIVE_TYPOGRAPHY.heading).toBeDefined();
    expect(DEFAULT_RESPONSIVE_TYPOGRAPHY.caption).toBeDefined();
  });

  it('heading has bold at all breakpoints', () => {
    const heading = DEFAULT_RESPONSIVE_TYPOGRAPHY.heading!;
    expect(heading.bold).toEqual({ xs: true, md: true });
  });

  it('caption has responsive dim and italic', () => {
    const caption = DEFAULT_RESPONSIVE_TYPOGRAPHY.caption!;
    expect(caption.dim).toEqual({ xs: true, md: false });
    expect(caption.italic).toEqual({ xs: false, md: true });
  });
});

describe('createTheme with responsiveTypography', () => {
  it('stores responsive typography on the theme', () => {
    const theme = createTheme({
      responsiveTypography: {
        heading: {
          bold: { xs: false, lg: true },
        },
      },
    });
    expect(theme.responsiveTypography).toBeDefined();
    expect(theme.responsiveTypography?.heading?.bold).toEqual({ xs: false, lg: true });
  });

  it('default theme has no responsiveTypography (backward compat)', () => {
    const theme = createTheme({});
    // responsiveTypography is optional -- should be undefined
    expect(theme.responsiveTypography).toBeUndefined();
    // static typography still works
    expect(theme.typography.heading).toBeDefined();
  });

  it('merges responsive typography through extendTheme', async () => {
    const { extendTheme } = await import('../theme.js');
    const base = createTheme({
      responsiveTypography: {
        heading: {
          bold: { xs: true, md: true },
        },
      },
    });
    const extended = extendTheme(base, {
      responsiveTypography: {
        caption: {
          italic: { xs: false, lg: true },
        },
      },
    });
    // Both heading and caption should be present
    expect(extended.responsiveTypography?.heading?.bold).toEqual({ xs: true, md: true });
    expect(extended.responsiveTypography?.caption?.italic).toEqual({ xs: false, lg: true });
  });
});
