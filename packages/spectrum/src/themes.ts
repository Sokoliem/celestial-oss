/**
 * Spectrum Theme System
 *
 * Built-in themes and theme creation utilities.
 * Maps token categories to ANSI-styled strings via @celestial/corona.
 */

import type { SemanticTheme } from '@celestial/corona';
import { color, style } from '@celestial/corona';
import type { HighlightTheme, HighlightThemeName, TokenCategory } from './types.js';

// ── Theme Styling Helper ────────────────────────────────────────────────

/**
 * Resolve a token category to the appropriate theme function.
 * Falls back to related categories for extended token types.
 */
export function applyTheme(theme: HighlightTheme, category: TokenCategory, text: string): string {
  switch (category) {
    case 'keyword':
      return theme.keyword(text);
    case 'string':
      return theme.string(text);
    case 'comment':
      return theme.comment(text);
    case 'number':
      return theme.number(text);
    case 'operator':
      return theme.operator(text);
    case 'type':
      return theme.type(text);
    case 'function':
      return theme.function(text);
    case 'variable':
      return theme.variable(text);
    case 'punctuation':
      return theme.punctuation(text);
    case 'builtin':
      return theme.builtin(text);
    // Extended categories — fall back to related base categories
    case 'meta':
      return (theme.meta ?? theme.keyword)(text);
    case 'tag':
      return (theme.tag ?? theme.keyword)(text);
    case 'attribute':
      return (theme.attribute ?? theme.variable)(text);
    case 'regexp':
      return (theme.regexp ?? theme.string)(text);
    case 'constant':
      return (theme.constant ?? theme.keyword)(text);
    case 'namespace':
      return (theme.namespace ?? theme.type)(text);
    case 'parameter':
      return (theme.parameter ?? theme.variable)(text);
    case 'property':
      return (theme.property ?? theme.variable)(text);
    case 'label':
      return (theme.label ?? theme.keyword)(text);
    case 'escape':
      return (theme.escape ?? theme.keyword)(text);
    case 'text':
      return (theme.text ?? ((t: string) => t))(text);
  }
}

// ── Built-in Themes ─────────────────────────────────────────────────────

function createDefaultTheme(): HighlightTheme {
  return {
    name: 'default',
    keyword: (t) => style({ color: color.cyan }).render(t),
    string: (t) => style({ color: color.green }).render(t),
    comment: (t) => style({ color: color.gray, dim: true }).render(t),
    number: (t) => style({ color: color.yellow }).render(t),
    operator: (t) => style({ color: color.white }).render(t),
    type: (t) => style({ color: color.blue }).render(t),
    function: (t) => style({ color: color.yellow }).render(t),
    variable: (t) => t,
    punctuation: (t) => style({ dim: true }).render(t),
    builtin: (t) => style({ color: color.cyan, italic: true }).render(t),
  };
}

function createMonokaiTheme(): HighlightTheme {
  return {
    name: 'monokai',
    keyword: (t) => style({ color: color.hex('#F92672') }).render(t),
    string: (t) => style({ color: color.hex('#E6DB74') }).render(t),
    comment: (t) => style({ color: color.hex('#75715E') }).render(t),
    number: (t) => style({ color: color.hex('#AE81FF') }).render(t),
    operator: (t) => style({ color: color.hex('#F92672') }).render(t),
    type: (t) => style({ color: color.hex('#66D9EF'), italic: true }).render(t),
    function: (t) => style({ color: color.hex('#A6E22E') }).render(t),
    variable: (t) => style({ color: color.hex('#F8F8F2') }).render(t),
    punctuation: (t) => style({ color: color.hex('#F8F8F2') }).render(t),
    builtin: (t) => style({ color: color.hex('#66D9EF') }).render(t),
  };
}

function createGithubTheme(name: 'github' | 'github-light' = 'github'): HighlightTheme {
  return {
    name,
    keyword: (t) => style({ color: color.hex('#CF222E') }).render(t),
    string: (t) => style({ color: color.hex('#0A3069') }).render(t),
    comment: (t) => style({ color: color.hex('#6E7781') }).render(t),
    number: (t) => style({ color: color.hex('#0550AE') }).render(t),
    operator: (t) => style({ color: color.hex('#CF222E') }).render(t),
    type: (t) => style({ color: color.hex('#953800') }).render(t),
    function: (t) => style({ color: color.hex('#8250DF') }).render(t),
    variable: (t) => style({ color: color.hex('#24292F') }).render(t),
    punctuation: (t) => style({ color: color.hex('#24292F') }).render(t),
    builtin: (t) => style({ color: color.hex('#0550AE') }).render(t),
  };
}

function createGithubDarkTheme(): HighlightTheme {
  return {
    name: 'github-dark',
    keyword: (t) => style({ color: color.hex('#FF7B72') }).render(t),
    string: (t) => style({ color: color.hex('#A5D6FF') }).render(t),
    comment: (t) => style({ color: color.hex('#8B949E') }).render(t),
    number: (t) => style({ color: color.hex('#79C0FF') }).render(t),
    operator: (t) => style({ color: color.hex('#FF7B72') }).render(t),
    type: (t) => style({ color: color.hex('#FFA657') }).render(t),
    function: (t) => style({ color: color.hex('#D2A8FF') }).render(t),
    variable: (t) => style({ color: color.hex('#E6EDF3') }).render(t),
    punctuation: (t) => style({ color: color.hex('#E6EDF3') }).render(t),
    builtin: (t) => style({ color: color.hex('#79C0FF') }).render(t),
  };
}

function createDraculaTheme(): HighlightTheme {
  return {
    name: 'dracula',
    keyword: (t) => style({ color: color.hex('#FF79C6') }).render(t),
    string: (t) => style({ color: color.hex('#F1FA8C') }).render(t),
    comment: (t) => style({ color: color.hex('#6272A4') }).render(t),
    number: (t) => style({ color: color.hex('#BD93F9') }).render(t),
    operator: (t) => style({ color: color.hex('#FF79C6') }).render(t),
    type: (t) => style({ color: color.hex('#8BE9FD'), italic: true }).render(t),
    function: (t) => style({ color: color.hex('#50FA7B') }).render(t),
    variable: (t) => style({ color: color.hex('#F8F8F2') }).render(t),
    punctuation: (t) => style({ color: color.hex('#F8F8F2') }).render(t),
    builtin: (t) => style({ color: color.hex('#8BE9FD') }).render(t),
  };
}

function createNordTheme(): HighlightTheme {
  return {
    name: 'nord',
    keyword: (t) => style({ color: color.hex('#81A1C1') }).render(t),
    string: (t) => style({ color: color.hex('#A3BE8C') }).render(t),
    comment: (t) => style({ color: color.hex('#616E88') }).render(t),
    number: (t) => style({ color: color.hex('#B48EAD') }).render(t),
    operator: (t) => style({ color: color.hex('#81A1C1') }).render(t),
    type: (t) => style({ color: color.hex('#8FBCBB') }).render(t),
    function: (t) => style({ color: color.hex('#88C0D0') }).render(t),
    variable: (t) => style({ color: color.hex('#D8DEE9') }).render(t),
    punctuation: (t) => style({ color: color.hex('#D8DEE9') }).render(t),
    builtin: (t) => style({ color: color.hex('#5E81AC') }).render(t),
  };
}

function createSolarizedTheme(): HighlightTheme {
  return {
    name: 'solarized',
    keyword: (t) => style({ color: color.hex('#859900') }).render(t),
    string: (t) => style({ color: color.hex('#2AA198') }).render(t),
    comment: (t) => style({ color: color.hex('#586E75') }).render(t),
    number: (t) => style({ color: color.hex('#D33682') }).render(t),
    operator: (t) => style({ color: color.hex('#859900') }).render(t),
    type: (t) => style({ color: color.hex('#B58900') }).render(t),
    function: (t) => style({ color: color.hex('#268BD2') }).render(t),
    variable: (t) => style({ color: color.hex('#839496') }).render(t),
    punctuation: (t) => style({ color: color.hex('#839496') }).render(t),
    builtin: (t) => style({ color: color.hex('#CB4B16') }).render(t),
  };
}

function createOneDarkTheme(): HighlightTheme {
  return {
    name: 'one-dark',
    keyword: (t) => style({ color: color.hex('#C678DD') }).render(t),
    string: (t) => style({ color: color.hex('#98C379') }).render(t),
    comment: (t) => style({ color: color.hex('#5C6370'), italic: true }).render(t),
    number: (t) => style({ color: color.hex('#D19A66') }).render(t),
    operator: (t) => style({ color: color.hex('#56B6C2') }).render(t),
    type: (t) => style({ color: color.hex('#E5C07B') }).render(t),
    function: (t) => style({ color: color.hex('#61AFEF') }).render(t),
    variable: (t) => style({ color: color.hex('#E06C75') }).render(t),
    punctuation: (t) => style({ color: color.hex('#ABB2BF') }).render(t),
    builtin: (t) => style({ color: color.hex('#56B6C2') }).render(t),
  };
}

function createCatppuccinTheme(): HighlightTheme {
  return {
    name: 'catppuccin',
    keyword: (t) => style({ color: color.hex('#CBA6F7') }).render(t),
    string: (t) => style({ color: color.hex('#A6E3A1') }).render(t),
    comment: (t) => style({ color: color.hex('#6C7086'), italic: true }).render(t),
    number: (t) => style({ color: color.hex('#FAB387') }).render(t),
    operator: (t) => style({ color: color.hex('#89DCEB') }).render(t),
    type: (t) => style({ color: color.hex('#F9E2AF') }).render(t),
    function: (t) => style({ color: color.hex('#89B4FA') }).render(t),
    variable: (t) => style({ color: color.hex('#CDD6F4') }).render(t),
    punctuation: (t) => style({ color: color.hex('#BAC2DE') }).render(t),
    builtin: (t) => style({ color: color.hex('#F38BA8') }).render(t),
  };
}

function createTokyoNightTheme(): HighlightTheme {
  return {
    name: 'tokyo-night',
    keyword: (t) => style({ color: color.hex('#BB9AF7') }).render(t),
    string: (t) => style({ color: color.hex('#9ECE6A') }).render(t),
    comment: (t) => style({ color: color.hex('#565F89'), italic: true }).render(t),
    number: (t) => style({ color: color.hex('#FF9E64') }).render(t),
    operator: (t) => style({ color: color.hex('#89DDFF') }).render(t),
    type: (t) => style({ color: color.hex('#2AC3DE') }).render(t),
    function: (t) => style({ color: color.hex('#7AA2F7') }).render(t),
    variable: (t) => style({ color: color.hex('#C0CAF5') }).render(t),
    punctuation: (t) => style({ color: color.hex('#A9B1D6') }).render(t),
    builtin: (t) => style({ color: color.hex('#7DCFFF') }).render(t),
  };
}

function createGruvboxTheme(): HighlightTheme {
  return {
    name: 'gruvbox',
    keyword: (t) => style({ color: color.hex('#FB4934') }).render(t),
    string: (t) => style({ color: color.hex('#B8BB26') }).render(t),
    comment: (t) => style({ color: color.hex('#928374'), italic: true }).render(t),
    number: (t) => style({ color: color.hex('#D3869B') }).render(t),
    operator: (t) => style({ color: color.hex('#FE8019') }).render(t),
    type: (t) => style({ color: color.hex('#FABD2F') }).render(t),
    function: (t) => style({ color: color.hex('#8EC07C') }).render(t),
    variable: (t) => style({ color: color.hex('#EBDBB2') }).render(t),
    punctuation: (t) => style({ color: color.hex('#A89984') }).render(t),
    builtin: (t) => style({ color: color.hex('#83A598') }).render(t),
  };
}

// ── Theme Registry ──────────────────────────────────────────────────────

const THEME_REGISTRY: Record<HighlightThemeName, () => HighlightTheme> = {
  default: createDefaultTheme,
  monokai: createMonokaiTheme,
  github: createGithubTheme,
  'github-light': () => createGithubTheme('github-light'),
  'github-dark': createGithubDarkTheme,
  dracula: createDraculaTheme,
  nord: createNordTheme,
  solarized: createSolarizedTheme,
  'one-dark': createOneDarkTheme,
  catppuccin: createCatppuccinTheme,
  'tokyo-night': createTokyoNightTheme,
  gruvbox: createGruvboxTheme,
};

const themeCache = new Map<HighlightThemeName, HighlightTheme>();

/**
 * Get a built-in theme by name. Instances are cached for performance.
 */
export function getTheme(name: HighlightThemeName): HighlightTheme {
  let theme = themeCache.get(name);
  if (!theme) {
    theme = THEME_REGISTRY[name]();
    themeCache.set(name, theme);
  }
  return theme;
}

/**
 * Create a custom theme by merging overrides onto the default.
 */
export function createTheme(overrides: Partial<HighlightTheme>): HighlightTheme {
  return { ...createDefaultTheme(), ...overrides };
}

/**
 * Resolve a theme argument — accepts a name string, a theme object, or undefined (= default).
 */
export function resolveTheme(theme?: HighlightTheme | HighlightThemeName): HighlightTheme {
  if (!theme) return createDefaultTheme();
  if (typeof theme === 'string') return getTheme(theme);
  return theme;
}

/**
 * Build a {@link HighlightTheme} from a corona {@link SemanticTheme}. This is
 * the bridge that lets a Genesis (or any TUI) theme switch automatically
 * recolor code-block highlighting — keywords pick up the accent tone, strings
 * pick up success, comments pick up muted, and so on.
 *
 * Maps semantic tones to syntax categories:
 *  - keyword       → tones.accent     (the strongest brand color)
 *  - string        → tones.success    (typically green-ish)
 *  - comment       → muted            (de-emphasized)
 *  - number        → tones.info
 *  - type          → tones.info + bold
 *  - function      → tones.warning
 *  - constant      → tones.accent + bold
 *  - operator/punct→ text / muted
 *  - regexp/escape → tones.danger     (strings with structure)
 *
 * Apps that want to deviate can call {@link createTheme} on top of the result.
 */
export function fromSemanticTheme(semantic: SemanticTheme, name = 'semantic'): HighlightTheme {
  const { colors } = semantic;
  return {
    name,
    keyword: (t) => style({ color: colors.tones.accent }).render(t),
    string: (t) => style({ color: colors.tones.success }).render(t),
    comment: (t) => style({ color: colors.muted, italic: true }).render(t),
    number: (t) => style({ color: colors.tones.info }).render(t),
    operator: (t) => style({ color: colors.text }).render(t),
    type: (t) => style({ color: colors.tones.info, bold: true }).render(t),
    function: (t) => style({ color: colors.tones.warning }).render(t),
    variable: (t) => style({ color: colors.text }).render(t),
    punctuation: (t) => style({ color: colors.muted }).render(t),
    builtin: (t) => style({ color: colors.tones.accent, italic: true }).render(t),
    meta: (t) => style({ color: colors.tones.warning }).render(t),
    tag: (t) => style({ color: colors.tones.accent }).render(t),
    attribute: (t) => style({ color: colors.tones.info }).render(t),
    regexp: (t) => style({ color: colors.tones.danger }).render(t),
    constant: (t) => style({ color: colors.tones.accent, bold: true }).render(t),
    namespace: (t) => style({ color: colors.tones.info }).render(t),
    parameter: (t) => style({ color: colors.text }).render(t),
    property: (t) => style({ color: colors.tones.info }).render(t),
    label: (t) => style({ color: colors.tones.warning }).render(t),
    escape: (t) => style({ color: colors.tones.danger, italic: true }).render(t),
    text: (t) => t,
  };
}
