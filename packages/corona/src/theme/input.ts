import { COMPONENT_OVERRIDES_KEY } from '../tokens.js';
import type {
  ElevationLevel,
  ElevationToken,
  InteractionState,
  ResponsiveTypographyToken,
  SemanticTheme,
  StateToken,
  ThemeInput,
  ThemeTypography,
  TypographyToken,
} from './types.js';

const THEME_INPUT_KEY = '__themeInput';

export type ComponentOverrides = NonNullable<ThemeInput['components']>;

function mergeComponentOverrides(base: ComponentOverrides | undefined, overrides: ThemeInput['components']): ComponentOverrides | undefined {
  if (!base && !overrides) return undefined;

  const merged: ComponentOverrides = { ...(base ?? {}) };
  for (const [componentName, componentOverrides] of Object.entries(overrides ?? {})) {
    merged[componentName] = {
      ...(base?.[componentName] ?? {}),
      ...componentOverrides,
    };
  }

  return merged;
}

function mergeNestedPartialRecords<K extends string, V extends object>(
  base: Partial<Record<K, Partial<V>>> | undefined,
  overrides: Partial<Record<K, Partial<V>>> | undefined,
): Partial<Record<K, Partial<V>>> | undefined {
  if (!base && !overrides) return undefined;

  const merged: Partial<Record<K, Partial<V>>> = {};
  const keys = new Set<K>([...(Object.keys(base ?? {}) as K[]), ...(Object.keys(overrides ?? {}) as K[])]);
  for (const key of keys) {
    merged[key] = {
      ...(base?.[key] ?? {}),
      ...(overrides?.[key] ?? {}),
    };
  }

  return merged;
}

function mergeOverlayInput(base: ThemeInput['overlay'], overrides: ThemeInput['overlay']): ThemeInput['overlay'] | undefined {
  if (!base && !overrides) return undefined;

  const mergedInset =
    base?.inset || overrides?.inset
      ? {
          header: { ...(base?.inset?.header ?? {}), ...(overrides?.inset?.header ?? {}) },
          body: { ...(base?.inset?.body ?? {}), ...(overrides?.inset?.body ?? {}) },
          footer: { ...(base?.inset?.footer ?? {}), ...(overrides?.inset?.footer ?? {}) },
        }
      : undefined;

  return {
    backdropDim: overrides?.backdropDim ?? base?.backdropDim,
    inset: mergedInset,
  };
}

function mergeMotionInput(base: ThemeInput['motion'], overrides: ThemeInput['motion']): ThemeInput['motion'] | undefined {
  if (!base && !overrides) return undefined;

  return {
    duration: {
      ...(base?.duration ?? {}),
      ...(overrides?.duration ?? {}),
    },
    easing: {
      ...(base?.easing ?? {}),
      ...(overrides?.easing ?? {}),
    },
    spring: {
      ...(base?.spring ?? {}),
      ...(overrides?.spring ?? {}),
    },
    reduceMotion: overrides?.reduceMotion ?? base?.reduceMotion,
  };
}

export function mergeThemeInputs(base: ThemeInput = {}, overrides: ThemeInput = {}): ThemeInput {
  const mergedColors =
    base.colors || overrides.colors
      ? {
          ...(base.colors ?? {}),
          ...(overrides.colors ?? {}),
          tones: {
            ...(base.colors?.tones ?? {}),
            ...(overrides.colors?.tones ?? {}),
          },
        }
      : undefined;

  return {
    colors: mergedColors,
    spacing: base.spacing || overrides.spacing ? { ...(base.spacing ?? {}), ...(overrides.spacing ?? {}) } : undefined,
    glyphs: base.glyphs || overrides.glyphs ? { ...(base.glyphs ?? {}), ...(overrides.glyphs ?? {}) } : undefined,
    typography: mergeNestedPartialRecords<keyof ThemeTypography, TypographyToken>(base.typography, overrides.typography),
    states: mergeNestedPartialRecords<InteractionState, StateToken>(base.states, overrides.states),
    elevation: mergeNestedPartialRecords<ElevationLevel, ElevationToken>(base.elevation, overrides.elevation),
    motion: mergeMotionInput(base.motion, overrides.motion),
    overlay: mergeOverlayInput(base.overlay, overrides.overlay),
    responsiveTypography: mergeNestedPartialRecords<keyof ThemeTypography, ResponsiveTypographyToken>(
      base.responsiveTypography,
      overrides.responsiveTypography,
    ),
    unicodeLevel: overrides.unicodeLevel ?? base.unicodeLevel,
    components: mergeComponentOverrides(base.components, overrides.components),
    contrast:
      base.contrast || overrides.contrast
        ? {
            ...(base.contrast ?? {}),
            ...(overrides.contrast ?? {}),
          }
        : undefined,
  };
}

function cloneRecordValues<K extends string, V extends object>(record: Record<K, V>): Partial<Record<K, Partial<V>>> {
  const copy: Partial<Record<K, Partial<V>>> = {};
  for (const key of Object.keys(record) as K[]) {
    copy[key] = { ...record[key] };
  }
  return copy;
}

export function getStoredThemeInput(theme: SemanticTheme): ThemeInput | undefined {
  return (theme as unknown as Record<string, unknown>)[THEME_INPUT_KEY] as ThemeInput | undefined;
}

function getComponentOverrides(theme: SemanticTheme): ComponentOverrides | undefined {
  return (theme as unknown as Record<string, unknown>)[COMPONENT_OVERRIDES_KEY] as ComponentOverrides | undefined;
}

export function snapshotThemeInput(theme: SemanticTheme): ThemeInput {
  return {
    colors: {
      text: theme.colors.text,
      textSoft: theme.colors.textSoft,
      muted: theme.colors.muted,
      bg: theme.colors.bg,
      surface: theme.colors.surface,
      surfaceAlt: theme.colors.surfaceAlt,
      surfaceRaised: theme.colors.surfaceRaised,
      backdrop: theme.colors.backdrop,
      inverse: theme.colors.inverse,
      border: theme.colors.border,
      borderHover: theme.colors.borderHover,
      borderActive: theme.colors.borderActive,
      divider: theme.colors.divider,
      highlight: theme.colors.highlight,
      interactive: theme.colors.interactive,
      focusRing: theme.colors.focusRing,
      trackFill: theme.colors.trackFill,
      cursor: theme.colors.cursor,
      linkColor: theme.colors.linkColor,
      placeholder: theme.colors.placeholder,
      tones: { ...theme.colors.tones },
    },
    spacing: { ...theme.spacing },
    glyphs: { ...theme.glyphs },
    typography: cloneRecordValues(theme.typography),
    states: cloneRecordValues(theme.states),
    elevation: cloneRecordValues(theme.elevation),
    motion: {
      duration: { ...theme.motion.duration },
      easing: { ...theme.motion.easing },
      spring: { ...theme.motion.spring },
      reduceMotion: theme.motion.reduceMotion,
    },
    overlay: {
      backdropDim: theme.overlay.backdropDim,
      inset: {
        header: { ...theme.overlay.inset.header },
        body: { ...theme.overlay.inset.body },
        footer: { ...theme.overlay.inset.footer },
      },
    },
    responsiveTypography: theme.responsiveTypography ? { ...theme.responsiveTypography } : undefined,
    components: getComponentOverrides(theme),
    contrast: { enforce: true },
  };
}

export function attachThemeMetadata(theme: SemanticTheme, input: ThemeInput): SemanticTheme {
  const storedInput = mergeThemeInputs({}, input);

  Object.defineProperty(theme, THEME_INPUT_KEY, {
    value: storedInput,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  if (storedInput.components) {
    Object.defineProperty(theme, COMPONENT_OVERRIDES_KEY, {
      value: storedInput.components,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  return theme;
}
