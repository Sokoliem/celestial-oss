/**
 * Resolve semantic elevation into the terminal border vocabulary.
 *
 * Keeping this mapping in Corona prevents renderers from independently
 * deciding that a panel is rounded or a dialog is double-lined.
 */
import { border, type Border } from './border.js';
import { createTheme } from './theme/create.js';
import { isSemanticTheme } from './theme/resolvers.js';
import type { ElevationBorderStyle, ElevationLevel, SemanticTheme, ThemeInput } from './theme/types.js';

const BORDER_BY_STYLE: Readonly<Record<ElevationBorderStyle, Border>> = Object.freeze({
  none: border.hidden,
  single: border.square,
  double: border.double,
  rounded: border.rounded,
  heavy: border.thick,
});

/** Resolve a concrete terminal border from a semantic elevation level. */
export function resolveElevationBorder(
  themeOrInput: SemanticTheme | ThemeInput | undefined,
  level: ElevationLevel,
): Border {
  const theme = isSemanticTheme(themeOrInput) ? themeOrInput : createTheme(themeOrInput);
  const fallback: ElevationBorderStyle =
    level === 'flat'
      ? 'none'
      : level === 'raised'
        ? 'single'
        : level === 'modal'
          ? 'double'
          : 'rounded';
  return BORDER_BY_STYLE[theme.elevation[level].borderStyle ?? fallback];
}
