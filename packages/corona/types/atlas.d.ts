declare module '@celestial/atlas' {
  export type AtlasColorLevel = 'truecolor' | '256' | '16' | 'none';

  export function detectColorLevel(env?: NodeJS.ProcessEnv): AtlasColorLevel;
  export function detectDarkBackground(env?: NodeJS.ProcessEnv): boolean;
  export function detectReducedMotion(env?: NodeJS.ProcessEnv): boolean;
}
