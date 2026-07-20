export type AtlasSurface = 'terminal' | 'portal' | 'warp' | 'lens' | 'test';
export type AtlasColorLevel = 'none' | '16' | '256' | 'truecolor';
export type AtlasUnicodeLevel = 'none' | 'basic' | 'wide' | 'full' | 'unicode16';
export type AtlasPerformanceClass = 'low' | 'standard' | 'high';
export type AtlasImageProtocol = 'kitty' | 'iterm2' | 'sixel' | 'octant' | 'sextant' | 'quadrant' | 'blocks' | 'braille' | 'none';
export type MultiplexerType = 'tmux' | 'screen' | 'zellij';

export interface AtlasCapabilities {
  readonly surface: AtlasSurface;
  readonly terminalName: string;
  readonly colorLevel: AtlasColorLevel;
  readonly darkBackground: boolean;
  readonly reducedMotion: boolean;
  readonly kittyKeyboard: boolean;
  readonly bracketedPaste: boolean;
  readonly focusEvents: boolean;
  readonly mouseTracking: boolean;
  readonly kittyGraphics: boolean;
  readonly iterm2Images: boolean;
  /**
   * True when the terminal supports iTerm2 inline-image *multipart*
   * transmission (iTerm2 3.5+, WezTerm). Callers may use this to gate the
   * `multipart: true` option on `renderITerm2Image`.
   */
  readonly iterm2ImagesMultipart: boolean;
  readonly sixelGraphics: boolean;
  readonly syncOutput: boolean;
  readonly hyperlinks: boolean;
  readonly undercurl: boolean;
  readonly styledUnderlines: boolean;
  readonly overline: boolean;
  readonly cursorShapes: boolean;
  readonly unicodeLevel: AtlasUnicodeLevel;
  readonly unicodeVersion: number;
  readonly performanceClass: AtlasPerformanceClass;
}

/** A row in the terminal database. All fields optional when partial; merged with defaults. */
export interface TerminalRecord {
  readonly colorLevel: AtlasColorLevel;
  readonly kittyKeyboard: boolean;
  readonly bracketedPaste: boolean;
  readonly focusEvents: boolean;
  readonly mouseTracking: boolean;
  readonly kittyGraphics: boolean;
  readonly iterm2Images: boolean;
  readonly iterm2ImagesMultipart: boolean;
  readonly sixelGraphics: boolean;
  readonly syncOutput: boolean;
  readonly hyperlinks: boolean;
  readonly undercurl: boolean;
  readonly styledUnderlines: boolean;
  readonly overline: boolean;
  readonly cursorShapes: boolean;
  readonly performanceClass: AtlasPerformanceClass;
}

export interface MultiplexerInfo {
  readonly type: MultiplexerType;
  readonly version?: string;
  readonly downgrades: Partial<TerminalRecord>;
}

export interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
}

export interface DeviceAttributeResult {
  readonly raw: string;
  readonly attributes: readonly number[];
  readonly sixel: boolean;
  readonly reGIS: boolean;
}

export interface SecondaryAttributeResult {
  readonly raw: string;
  readonly terminalType: number;
  readonly firmwareVersion: number;
  readonly romCartridgeRegistration: number;
}

export interface GetCapabilitiesOptions {
  readonly ttl?: number;
}

export interface DetectCapabilitiesOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly surface?: AtlasSurface;
  readonly stdinIsTTY?: boolean;
  readonly stdoutIsTTY?: boolean;
  readonly platform?: NodeJS.Platform;
}
