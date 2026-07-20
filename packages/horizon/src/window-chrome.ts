import {
  border,
  type Color,
  color,
  createTheme,
  resolveComponentTokens,
  type SemanticTheme,
  style,
  type ThemeInput,
  type TokenContract,
} from '@celestial/core/corona';
import { box, column, event, flex, row, type ThemeContext, text, type VNode } from '@celestial/core/nebula';
import { type FloatingWindowHitTestOptions, hitTestFloatingWindowTitleBar } from './floating-window-drag.js';
import type { DesktopWindowState, WindowChromeControl, WindowChromeHoverTarget, WindowCommand } from './window-lifecycle.js';

export interface WindowChromeTokens {
  bodyBackground: Color;
  headerBackground: Color;
  headerHoverBackground: Color;
  text: Color;
  control: Color;
  controlHoverText: Color;
  controlHoverBackground: Color;
  border: Color;
  borderActive: Color;
  borderHover: Color;
}

function distinctSurface(candidate: Color, against: Color, accent: Color, amount: number): Color {
  if (!candidate.equals(against)) return candidate;
  const mixed = color.lerpOklch(candidate, accent, amount);
  if (!mixed.equals(against)) return mixed;
  const average = candidate.rgb ? (candidate.rgb[0] + candidate.rgb[1] + candidate.rgb[2]) / 3 : 0;
  const shifted = average >= 128 ? color.darken(candidate, 8) : color.lighten(candidate, 8);
  return shifted.equals(against) ? accent : shifted;
}

function windowBodyBackground(theme: SemanticTheme): Color {
  return distinctSurface(theme.elevation.floating.surface ?? theme.colors.surfaceRaised, theme.colors.bg, theme.colors.interactive, 0.08);
}

function windowHeaderBackground(theme: SemanticTheme): Color {
  return distinctSurface(theme.colors.surfaceAlt, windowBodyBackground(theme), theme.colors.interactive, 0.1);
}

export const windowChromeContract: TokenContract<WindowChromeTokens> = {
  bodyBackground: windowBodyBackground,
  headerBackground: windowHeaderBackground,
  headerHoverBackground: (theme) =>
    distinctSurface(color.lerpOklch(windowHeaderBackground(theme), theme.colors.interactive, 0.12), windowHeaderBackground(theme), theme.colors.text, 0.08),
  text: (theme) => theme.colors.text,
  control: (theme) => theme.colors.interactive,
  controlHoverText: (theme) => theme.states.hover.fg,
  controlHoverBackground: (theme) => theme.states.hover.bg ?? theme.colors.surface,
  border: (theme) => theme.elevation.floating.border ?? theme.colors.border,
  borderActive: (theme) => theme.colors.borderActive,
  borderHover: (theme) =>
    distinctSurface(color.lerpOklch(theme.colors.borderActive, theme.colors.text, 0.2), theme.colors.borderActive, theme.colors.borderHover, 0.2),
};

export interface RenderWindowChromeOptions {
  content?: VNode;
  showTitle?: boolean;
  hoveredTarget?: WindowChromeHoverTarget | null;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

export type WindowChromeHitTarget = Pick<
  DesktopWindowState,
  'x' | 'y' | 'width' | 'height' | 'chrome' | 'closable' | 'minimizable' | 'maximizable' | 'fullscreenable'
>;

function commandHandlerId(command: WindowCommand): string {
  if ('id' in command) {
    return `window:${command.id}:${command.type}`;
  }
  return `window:create:${command.window.id}`;
}

function controlForCommand(command: WindowCommand): WindowChromeControl {
  if (command.type === 'restore') return 'restore';
  if (command.type === 'close' || command.type === 'minimize' || command.type === 'maximize' || command.type === 'fullscreen') return command.type;
  return 'restore';
}

/** Width, in terminal cells, occupied by the visible end-aligned controls. */
export function getWindowChromeControlWidth(window: WindowChromeHitTarget): number {
  let width = 0;
  const chrome = window.chrome;
  if (chrome?.showClose ?? window.closable ?? true) width += 3;
  if (chrome?.showMinimize ?? window.minimizable ?? true) width += 3;
  if (chrome?.showMaximize ?? window.maximizable ?? true) width += 3;
  if (chrome?.showFullscreen ?? window.fullscreenable ?? true) width += 4;
  return width;
}

/**
 * Hit-test the draggable part of integrated chrome. The complete titlebar is
 * draggable, including blank fill after the title, while visible controls
 * retain their own pointer targets.
 */
export function hitTestWindowChromeTitleBar(
  window: WindowChromeHitTarget,
  mouseX: number,
  mouseY: number,
  options: FloatingWindowHitTestOptions = {},
): boolean {
  return hitTestFloatingWindowTitleBar(window, mouseX, mouseY, {
    ...options,
    endInset: options.endInset ?? getWindowChromeControlWidth(window),
  });
}

function commandButton(
  id: string,
  label: string,
  command: WindowCommand,
  summary: string,
  hoveredTarget: WindowChromeHoverTarget | null,
  tokens: WindowChromeTokens,
): VNode {
  const control = controlForCommand(command);
  const hovered = hoveredTarget === control;
  return event(
    `${id}:${command.type}`,
    text(
      label,
      hovered ? style({ color: tokens.controlHoverText, background: tokens.controlHoverBackground, bold: true }) : style({ color: tokens.control, bold: true }),
    ),
    {
      onClick: commandHandlerId(command),
      onMouseEnter: `window:${id}:hover:${control}`,
      onMouseLeave: `window:${id}:leave:${control}`,
    },
    {
      label: summary,
      intent: command.type,
      affordances: ['hover', 'click'],
      cursor: 'pointer',
      extra: { windowCommand: command, hoverTarget: control },
    },
  );
}

export function renderWindowChrome<M = unknown>(window: DesktopWindowState<M>, options: RenderWindowChromeOptions = {}): VNode {
  const content = options.content ?? window.content;
  const chrome = window.chrome;
  const theme = options.themeCtx?.current() ?? chrome?.themeCtx?.current() ?? createTheme(options.theme ?? chrome?.theme);
  const tokens = resolveComponentTokens(windowChromeContract, theme, 'WindowChrome');
  const hoveredTarget = options.hoveredTarget ?? chrome?.hoveredTarget ?? null;
  const showTitle = options.showTitle ?? chrome?.showTitle ?? true;
  const controls: VNode[] = [];
  const frameAffordances: Array<'drag' | 'resize'> = [];
  if (window.draggable !== false) frameAffordances.push('drag');
  if (window.resizable !== false) frameAffordances.push('resize');

  if (chrome?.showClose ?? window.closable ?? true) {
    controls.push(
      commandButton(window.id, '[x]', { type: 'close', id: window.id, reason: chrome?.closeReason, source: 'chrome' }, 'Close window', hoveredTarget, tokens),
    );
  }
  if (chrome?.showMinimize ?? window.minimizable ?? true) {
    controls.push(commandButton(window.id, '[_]', { type: 'minimize', id: window.id, source: 'chrome' }, 'Minimize window', hoveredTarget, tokens));
  }
  if (chrome?.showMaximize ?? window.maximizable ?? true) {
    controls.push(
      commandButton(
        window.id,
        window.mode === 'maximized' ? '[+]' : '[ ]',
        window.mode === 'maximized' ? { type: 'restore', id: window.id, source: 'chrome' } : { type: 'maximize', id: window.id, source: 'chrome' },
        window.mode === 'maximized' ? 'Restore window' : 'Maximize window',
        hoveredTarget,
        tokens,
      ),
    );
  }
  if (chrome?.showFullscreen ?? window.fullscreenable ?? true) {
    controls.push(
      commandButton(
        window.id,
        '[fs]',
        window.mode === 'fullscreen' ? { type: 'restore', id: window.id, source: 'chrome' } : { type: 'fullscreen', id: window.id, source: 'chrome' },
        window.mode === 'fullscreen' ? 'Restore from fullscreen' : 'Fullscreen window',
        hoveredTarget,
        tokens,
      ),
    );
  }

  const headerHovered = hoveredTarget === 'titlebar' || ['close', 'minimize', 'maximize', 'fullscreen', 'restore'].includes(hoveredTarget ?? '');
  const titleNode = text(showTitle ? (window.title ?? window.id) : '', style({ color: tokens.text, bold: true }));
  const innerWidth = Math.max(1, window.width - 2);
  const titleSurface = box(
    row(flex(titleNode, { flex: 1 }), ...controls),
    style({ background: headerHovered ? tokens.headerHoverBackground : tokens.headerBackground }),
    { width: innerWidth, height: 1, overflow: 'hidden' },
  );
  const titleBar = event(
    `window:${window.id}:titlebar`,
    titleSurface,
    {
      onMouseEnter: `window:${window.id}:hover:titlebar`,
      onMouseLeave: `window:${window.id}:leave:titlebar`,
    },
    {
      label: window.title ?? window.id,
      intent: 'drag',
      affordances: ['hover', 'drag'],
      cursor: window.draggable === false ? undefined : 'move',
      extra: {
        windowId: window.id,
        role: window.role,
        mode: window.mode,
        escapeCommand: window.role === 'modal' || window.modal ? ({ type: 'close', id: window.id, source: 'escape' } satisfies WindowCommand) : undefined,
      },
    },
  );

  const borderColor = hoveredTarget ? tokens.borderHover : window.focused ? tokens.borderActive : tokens.border;
  const bodyHeight = Math.max(1, window.height - 3);
  const bodySurface = box(flex(content, { flex: 1 }), style({ background: tokens.bodyBackground }), {
    width: innerWidth,
    height: bodyHeight,
    overflow: 'hidden',
  });
  const frame = box(
    column(titleBar, flex(bodySurface, { flex: 1 })),
    style({ border: border.rounded, color: borderColor, background: tokens.bodyBackground }),
    { width: window.width, height: window.height, overflow: 'hidden' },
  );

  return event(
    `window:${window.id}:frame`,
    frame,
    {},
    {
      label: window.title ?? window.id,
      intent: 'manage-window',
      affordances: ['hover', ...frameAffordances],
      cursor: hoveredTarget?.startsWith('resize:') ? 'resize' : 'default',
      extra: { windowId: window.id, role: window.role, mode: window.mode, integratedChrome: true, hoveredTarget },
    },
  );
}
