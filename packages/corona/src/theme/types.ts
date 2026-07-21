import type { Color } from '../color.js';
import type { GlyphLevel } from '../glyphs.js';
import type { Responsive, StyleEffects } from '../style.js';

// Color scale types

export type ScaleStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export interface ColorScale {
  readonly 50: Color;
  readonly 100: Color;
  readonly 200: Color;
  readonly 300: Color;
  readonly 400: Color;
  readonly 500: Color;
  readonly 600: Color;
  readonly 700: Color;
  readonly 800: Color;
  readonly 900: Color;
  /** Continuously interpolate across the scale. t=0 -> step 50, t=1 -> step 900. */
  sample(t: number): Color;
}

// Low-level token bag

export type Theme<T extends Record<string, Color> = Record<string, Color>> = Readonly<T>;

// Semantic tones

/**
 * Named intent tones used across UI components.
 * - `neutral`  - default, no particular intent
 * - `accent`   - primary brand / interactive highlight
 * - `info`     - informational (blue-family)
 * - `success`  - positive outcome (green-family)
 * - `warning`  - caution (yellow/amber-family)
 * - `danger`   - error / destructive (red-family)
 */
export type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

/** T-shirt size scale used for spacing and component sizing */
export type Size = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// Semantic theme shape

export interface ThemeColors {
  /** Primary foreground / body text */
  text: Color;
  /** Secondary text: labels, descriptions, metadata */
  textSoft: Color;
  /** Tertiary / de-emphasized text: timestamps, placeholders, disabled */
  muted: Color;

  /** Outermost application background */
  bg: Color;
  /** Primary content surface */
  surface: Color;
  /** Alternate surface: striped rows, sidebar, secondary panels */
  surfaceAlt: Color;
  /** Elevated surface: cards, modals, popovers, dropdowns */
  surfaceRaised: Color;
  /** Deepest layer: overlay scrim, dimmed background */
  backdrop: Color;
  /** Inverted surface (e.g. dark text on light bg or vice-versa) */
  inverse: Color;

  /** Default / resting border */
  border: Color;
  /** Hover interaction border */
  borderHover: Color;
  /** Active / focused interaction border */
  borderActive: Color;
  /** Non-interactive separator (semantically distinct from interactive borders) */
  divider: Color;

  /** Selected / active item highlight (list rows, tabs, checkboxes, etc.) */
  highlight: Color;
  /** Button / toggle / clickable action accent */
  interactive: Color;
  /** Focus indicator border color */
  focusRing: Color;
  /** Progress bar, slider track, gauge fill */
  trackFill: Color;
  /** Text cursor / caret color */
  cursor: Color;
  /** Hyperlink / anchor text color */
  linkColor: Color;
  /** Placeholder / ghost text color */
  placeholder: Color;

  /** Per-tone accent colors */
  tones: Record<Tone, Color>;
}

export interface ThemeGlyphs {
  divider: string;
  bullet: string;
  keycapLeft: string;
  keycapRight: string;
  tagPrefix: string;
  selected: string;
  unselected: string;
  menuArrow: string;
  checked: string;
  unchecked: string;
  radioOn: string;
  radioOff: string;
  pipe: string;
  ellipsis: string;
  pointer: string;
  doubleArrowH: string;
  doubleArrowV: string;
  cornerTL: string;
  cornerTR: string;
  cornerBL: string;
  cornerBR: string;
}

// Typography tokens

export interface TypographyToken {
  color: Color;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

export interface ThemeTypography {
  heading: TypographyToken;
  title: TypographyToken;
  subtitle: TypographyToken;
  body: TypographyToken;
  caption: TypographyToken;
  overline: TypographyToken;
  code: TypographyToken;
  label: TypographyToken;
  link: TypographyToken;
  error: TypographyToken;
  warning: TypographyToken;
  success: TypographyToken;
}

/** A responsive typography token where each property can vary by breakpoint. */
export interface ResponsiveTypographyToken {
  color: Responsive<Color>;
  bold?: Responsive<boolean>;
  dim?: Responsive<boolean>;
  italic?: Responsive<boolean>;
  underline?: Responsive<boolean>;
  strikethrough?: Responsive<boolean>;
}

// State/interaction tokens

export type InteractionState = 'hover' | 'focus' | 'active' | 'disabled' | 'selected' | 'error' | 'loading' | 'readonly';

export interface StateToken {
  fg: Color;
  bg?: Color;
  border?: Color;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
}

export interface ThemeStates {
  hover: StateToken;
  focus: StateToken;
  active: StateToken;
  disabled: StateToken;
  selected: StateToken;
  error: StateToken;
  loading: StateToken;
  readonly: StateToken;
}

// Elevation tokens

export type ElevationLevel = 'flat' | 'raised' | 'floating' | 'overlay' | 'modal';

/** Border visual weight tied to elevation level. */
export type ElevationBorderStyle = 'none' | 'single' | 'double' | 'rounded' | 'heavy';

export interface ElevationToken {
  elevation: number;
  effects?: StyleEffects;
  /** Background surface color at this elevation level. */
  surface?: Color;
  /** Border color at this elevation level. */
  border?: Color;
  /** Border visual weight at this elevation level. */
  borderStyle?: ElevationBorderStyle;
}

export interface ThemeElevation {
  flat: ElevationToken;
  raised: ElevationToken;
  floating: ElevationToken;
  overlay: ElevationToken;
  modal: ElevationToken;
}

// Overlay chrome tokens

/**
 * Padding (in terminal cells) applied to a shell section. Values are additive
 * insets measured from the content edge of the section.
 */
export interface OverlaySectionInset {
  left: number;
  right: number;
}

/**
 * Per-section inset values for wrapper shell surfaces (blocking modals,
 * floating overlays, detail windows).
 */
export interface OverlayInsetTokens {
  header: OverlaySectionInset;
  body: OverlaySectionInset;
  footer: OverlaySectionInset;
}

/**
 * Overlay chrome tokens: shared values for floating surfaces and modals.
 *
 * - `backdropDim` - dim factor (0..1) applied to cells behind an overlay.
 * - `inset` - per-section left/right padding for the shell chrome.
 */
export interface OverlayTokens {
  backdropDim: number;
  inset: OverlayInsetTokens;
}

/**
 * Theme construction safety policy. Contrast enforcement is enabled unless
 * explicitly disabled for tooling that needs to inspect an intentionally
 * invalid theme.
 */
export interface ThemeContrastPolicy {
  /** Repair unsafe semantic foregrounds during createTheme(). Default true. */
  enforce?: boolean;
  /** Minimum contrast for semantic text. Default 4.5 (WCAG AA). */
  minimum?: number;
  /** Minimum contrast for interactive borders. Default 3. */
  graphicalMinimum?: number;
  /** Minimum contrast between layered/interaction surfaces. Default 1.12. */
  surfaceMinimum?: number;
}

// Motion tokens

/** Easing function signature: maps [0,1] to [0,1]. */
export type MotionEasingFn = (t: number) => number;

/** Named duration scale (milliseconds). */
export interface MotionDuration {
  /** Near-instant: 0-50ms. Cursor blinks, micro-feedback. */
  instant: number;
  /** Fast: ~100ms. Hover/focus transitions. */
  fast: number;
  /** Normal: ~200ms. Standard UI transitions. */
  normal: number;
  /** Slow: ~400ms. Page/panel transitions, complex animations. */
  slow: number;
  /** Glacial: ~800ms+. Onboarding reveals, dramatic entrances. */
  glacial: number;
  /**
   * Backdrop fade duration (~240ms). Promoted in Phase 0 P0-12 / Q-T2: themes
   * may override to tune the modal dim shroud and bootstrap timing without
   * touching `normal` (which lives in form / hover interaction lanes).
   *
   * Optional so the field is additive per PRD F-2 — pre-existing literal
   * `MotionDuration` constructors (e.g. genesis reduceMotion override) keep
   * type-checking. `DEFAULT_MOTION.duration.backdrop` provides 240ms; aurora's
   * `createBackdropTransition` falls back to `DEFAULT_BACKDROP_DURATION_MS`
   * when undefined.
   */
  backdrop?: number;
}

/** Named easing function presets. */
export interface MotionEasing {
  /** General-purpose easing (ease-in-out). */
  default: MotionEasingFn;
  /** Entrance easing: elements appearing (decelerate). */
  entrance: MotionEasingFn;
  /** Exit easing: elements leaving (accelerate). */
  exit: MotionEasingFn;
  /** Emphasis easing: attention-drawing bounce/overshoot. */
  emphasis: MotionEasingFn;
}

/** Named spring preset configuration. */
export interface MotionSpringPreset {
  stiffness: number;
  damping: number;
  mass?: number;
}

/** Named spring presets. */
export interface MotionSpring {
  /** Default spring for general UI (snappy). */
  default: MotionSpringPreset;
  /** Fast, responsive spring (stiff). */
  responsive: MotionSpringPreset;
  /** Soft, gentle spring (slow settle). */
  gentle: MotionSpringPreset;
  /** Playful, bouncy spring. */
  bouncy: MotionSpringPreset;
}

/** Full motion token set for the theme. */
export interface ThemeMotion {
  duration: MotionDuration;
  easing: MotionEasing;
  spring: MotionSpring;
  /** Whether the user prefers reduced motion (auto-detected from env). */
  reduceMotion: boolean;
}

// Semantic theme

export interface SemanticTheme {
  colors: ThemeColors;
  spacing: Record<Size, number>;
  glyphs: ThemeGlyphs;
  /** Capability level used to resolve `glyphs`; theme factories always populate it. */
  unicodeLevel?: GlyphLevel;
  /** Derived color scales (10 steps per tone). Always computed from tones. */
  readonly scales: Record<Tone, ColorScale>;
  typography: ThemeTypography;
  states: ThemeStates;
  elevation: ThemeElevation;
  motion: ThemeMotion;
  /**
   * Overlay chrome tokens (backdrop dim factor, section insets). Always
   * populated with defaults; apps may override via `ThemeInput.overlay`.
   */
  overlay: OverlayTokens;
  responsiveTypography?: Partial<Record<keyof ThemeTypography, Partial<ResponsiveTypographyToken>>>;
}

// Input type (partial overrides)

export interface ThemeInput {
  colors?: Partial<Omit<ThemeColors, 'tones'>> & {
    tones?: Partial<Record<Tone, Color>>;
  };
  spacing?: Partial<Record<Size, number>>;
  glyphs?: Partial<ThemeGlyphs>;
  typography?: Partial<Record<keyof ThemeTypography, Partial<TypographyToken>>>;
  states?: Partial<Record<InteractionState, Partial<StateToken>>>;
  elevation?: Partial<Record<ElevationLevel, Partial<ElevationToken>>>;
  motion?: Partial<{
    duration: Partial<MotionDuration>;
    easing: Partial<MotionEasing>;
    spring: Partial<MotionSpring>;
    reduceMotion: boolean;
  }>;
  /**
   * Overlay chrome overrides (backdrop dim factor, per-section insets).
   * Partial: any unspecified fields inherit from `DEFAULT_OVERLAY`.
   */
  overlay?: {
    backdropDim?: number;
    inset?: {
      header?: Partial<OverlaySectionInset>;
      body?: Partial<OverlaySectionInset>;
      footer?: Partial<OverlaySectionInset>;
    };
  };
  /** Responsive typography overrides for breakpoint-adaptive text styles. */
  responsiveTypography?: Partial<Record<keyof ThemeTypography, Partial<ResponsiveTypographyToken>>>;
  /** Unicode level for glyph fallback resolution. Uses default glyphs if omitted. */
  unicodeLevel?: GlyphLevel;
  /** Per-component token overrides. Keys are component names. */
  components?: Record<string, Record<string, unknown>>;
  /** Contrast policy applied while constructing the semantic theme. */
  contrast?: ThemeContrastPolicy;
}

export interface ThemeVariant {
  name: string;
  input: ThemeInput;
}
