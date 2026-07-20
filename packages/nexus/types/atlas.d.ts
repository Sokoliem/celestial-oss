declare module '@celestial/atlas' {
  export interface AtlasCapabilities {
    terminalName: string;
  }

  export function detectCapabilities(options?: { env?: NodeJS.ProcessEnv }): AtlasCapabilities;
}
