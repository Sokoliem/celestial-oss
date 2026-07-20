import { type Border, border, type Color, color } from '@celestial/core/corona';

export interface PanelTheme {
  borderStyle: Border;
  borderColor: Color;
  titleColor: Color;
  focusColor: Color;
}

export interface LayoutTheme {
  primary: PanelTheme;
  secondary: PanelTheme;
  accent: PanelTheme;
  dim: PanelTheme;
}

function createPanelTheme(borderColor: Color, titleColor: Color, focusColor: Color, borderStyle: Border = border.rounded): PanelTheme {
  return { borderStyle, borderColor, titleColor, focusColor };
}

export const themes = {
  default: {
    primary: createPanelTheme(color.cyan, color.yellow, color.green),
    secondary: createPanelTheme(color.blue, color.cyan, color.brightBlue),
    accent: createPanelTheme(color.magenta, color.brightYellow, color.brightMagenta),
    dim: createPanelTheme(color.gray, color.gray, color.white),
  },

  ocean: {
    primary: createPanelTheme(color.brightCyan, color.cyan, color.brightGreen),
    secondary: createPanelTheme(color.blue, color.brightBlue, color.cyan),
    accent: createPanelTheme(color.brightBlue, color.white, color.brightCyan),
    dim: createPanelTheme(color.gray, color.blue, color.white),
  },

  forest: {
    primary: createPanelTheme(color.green, color.brightGreen, color.brightYellow),
    secondary: createPanelTheme(color.brightGreen, color.green, color.cyan),
    accent: createPanelTheme(color.yellow, color.brightYellow, color.white),
    dim: createPanelTheme(color.gray, color.green, color.white),
  },

  sunset: {
    primary: createPanelTheme(color.red, color.yellow, color.brightRed),
    secondary: createPanelTheme(color.yellow, color.brightYellow, color.red),
    accent: createPanelTheme(color.magenta, color.brightMagenta, color.brightYellow),
    dim: createPanelTheme(color.gray, color.red, color.white),
  },

  monochrome: {
    primary: createPanelTheme(color.white, color.brightWhite, color.brightWhite),
    secondary: createPanelTheme(color.gray, color.white, color.brightWhite),
    accent: createPanelTheme(color.brightWhite, color.white, color.white),
    dim: createPanelTheme(color.gray, color.gray, color.white),
  },

  neon: {
    primary: createPanelTheme(color.brightMagenta, color.brightCyan, color.brightYellow),
    secondary: createPanelTheme(color.brightCyan, color.brightGreen, color.brightMagenta),
    accent: createPanelTheme(color.brightYellow, color.brightRed, color.brightWhite),
    dim: createPanelTheme(color.gray, color.brightMagenta, color.white),
  },

  minimal: {
    primary: createPanelTheme(color.gray, color.white, color.cyan),
    secondary: createPanelTheme(color.gray, color.gray, color.white),
    accent: createPanelTheme(color.white, color.cyan, color.brightCyan),
    dim: createPanelTheme(color.gray, color.gray, color.gray),
  },

  retro: {
    primary: createPanelTheme(color.green, color.brightGreen, color.brightYellow, border.double),
    secondary: createPanelTheme(color.yellow, color.brightYellow, color.white, border.double),
    accent: createPanelTheme(color.cyan, color.brightCyan, color.brightWhite, border.double),
    dim: createPanelTheme(color.gray, color.gray, color.white, border.double),
  },

  hacker: {
    primary: createPanelTheme(color.brightGreen, color.green, color.brightYellow),
    secondary: createPanelTheme(color.green, color.brightGreen, color.white),
    accent: createPanelTheme(color.brightYellow, color.yellow, color.brightWhite),
    dim: createPanelTheme(color.gray, color.green, color.white),
  },
} as const satisfies Record<string, LayoutTheme>;

export type ThemeName = keyof typeof themes;

export function getTheme(name: ThemeName): LayoutTheme {
  return themes[name];
}

export function listThemes(): ThemeName[] {
  return Object.keys(themes) as ThemeName[];
}

export interface IDEPreset {
  sidebar: PanelTheme;
  editor: PanelTheme;
  terminal: PanelTheme;
}

export const idePresets = {
  vscode: {
    sidebar: themes.default.primary,
    editor: themes.default.secondary,
    terminal: themes.default.accent,
  },

  terminal: {
    sidebar: themes.hacker.primary,
    editor: themes.hacker.secondary,
    terminal: themes.hacker.accent,
  },

  retro: {
    sidebar: themes.retro.primary,
    editor: themes.retro.secondary,
    terminal: themes.retro.accent,
  },
} as const satisfies Record<string, IDEPreset>;

export type IDEPresetName = keyof typeof idePresets;

export function getIDEPreset(name: IDEPresetName): IDEPreset {
  return idePresets[name];
}

export interface ShellPreset {
  header: PanelTheme;
  sidebar: PanelTheme;
  content: PanelTheme;
  statusBar: PanelTheme;
}

export const shellPresets = {
  dashboard: {
    header: themes.ocean.primary,
    sidebar: themes.ocean.secondary,
    content: themes.ocean.accent,
    statusBar: themes.ocean.dim,
  },

  admin: {
    header: themes.sunset.primary,
    sidebar: themes.sunset.secondary,
    content: themes.sunset.accent,
    statusBar: themes.sunset.dim,
  },

  minimal: {
    header: themes.minimal.primary,
    sidebar: themes.minimal.secondary,
    content: themes.minimal.accent,
    statusBar: themes.minimal.dim,
  },
} as const satisfies Record<string, ShellPreset>;

export type ShellPresetName = keyof typeof shellPresets;

export function getShellPreset(name: ShellPresetName): ShellPreset {
  return shellPresets[name];
}
