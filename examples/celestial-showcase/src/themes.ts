import {
  color,
  defineThemeVariant,
  type ThemeVariant,
} from '@celestial/core/corona';
import type { AtlasCapabilities } from '@celestial/core';
import type { ThemeContext } from '@celestial/core/nebula';
import type { LabId } from './types.js';

export interface ShowcaseLabTheme {
  readonly label: string;
  readonly variant: ThemeVariant;
}

const variant = (name: string, accent: string): ThemeVariant =>
  defineThemeVariant(name, {
    colors: {
      tones: { accent: color.hex(accent) },
    },
  });

/** A deliberately varied theme matrix: every Flight Deck page exercises a different token graph. */
export const SHOWCASE_LAB_THEMES: Record<LabId, ShowcaseLabTheme> = {
  core: { label: 'Aurora', variant: variant('flight-aurora', '#67e8f9') },
  components: { label: 'Daylight', variant: variant('flight-daylight', '#fde047') },
  workflows: { label: 'Orchid', variant: variant('flight-orchid', '#f5d0fe') },
  visuals: { label: 'Ember', variant: variant('flight-ember', '#fb923c') },
  mouse: { label: 'Phosphor', variant: variant('flight-phosphor', '#4ade80') },
  layers: { label: 'Amethyst', variant: variant('flight-amethyst', '#c4b5fd') },
  windows: { label: 'Cobalt', variant: variant('flight-cobalt', '#60a5fa') },
  smoke: { label: 'Signal', variant: variant('flight-signal', '#f87171') },
  'app-shell': { label: 'Copper', variant: variant('flight-copper', '#fbbf24') },
};

export function showcaseLabTheme(lab: LabId): ShowcaseLabTheme {
  return SHOWCASE_LAB_THEMES[lab];
}

export function applyShowcaseLabTheme(
  themeCtx: ThemeContext,
  lab: LabId,
  capabilities: Pick<AtlasCapabilities, 'unicodeLevel' | 'reducedMotion'>,
): void {
  themeCtx.setVariant(showcaseLabTheme(lab).variant);
  themeCtx.patch({
    unicodeLevel: capabilities.unicodeLevel,
    motion: { reduceMotion: capabilities.reducedMotion },
  });
}
