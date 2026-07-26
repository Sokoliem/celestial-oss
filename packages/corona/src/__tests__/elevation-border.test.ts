import { describe, expect, it } from 'vitest';
import { border } from '../border.js';
import { resolveElevationBorder } from '../elevation-border.js';
import { createTheme } from '../theme.js';

describe('resolveElevationBorder', () => {
  it('uses one semantic frame family for each elevation', () => {
    const theme = createTheme({
      elevation: {
        flat: { borderStyle: 'none' },
        raised: { borderStyle: 'single' },
        floating: { borderStyle: 'rounded' },
        overlay: { borderStyle: 'rounded' },
        modal: { borderStyle: 'double' },
      },
    });

    expect(resolveElevationBorder(theme, 'flat')).toBe(border.hidden);
    expect(resolveElevationBorder(theme, 'raised')).toBe(border.square);
    expect(resolveElevationBorder(theme, 'floating')).toBe(border.rounded);
    expect(resolveElevationBorder(theme, 'overlay')).toBe(border.rounded);
    expect(resolveElevationBorder(theme, 'modal')).toBe(border.double);
  });

  it('keeps explicit theme elevation overrides authoritative', () => {
    const theme = createTheme({
      elevation: {
        modal: { borderStyle: 'heavy' },
      },
    });

    expect(resolveElevationBorder(theme, 'modal')).toBe(border.thick);
  });
});
