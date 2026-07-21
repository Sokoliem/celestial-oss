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
  truncate,
  visualWidth,
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
  'x' | 'y' | 'width' | 'height' | 'mode' | 'chrome' | 'closable' | 'minimizable' | 'maximizable' | 'fullscreenable'
>;

function commandHandlerId(command: WindowCommand): string {
  if ('id' in command) {
    return `window:${encodeURIComponent(command.id)}:${command.type}`;
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
  const requested: Array<{ control: WindowChromeControl; width: number; priority: number }> = [];
  const chrome = window.chrome;
  if (chrome?.showClose ?? window.closable ?? true) requested.push({ control: 'close', width: 3, priority: 0 });
  if (chrome?.showMinimize ?? window.minimizable ?? true) requested.push({ control: 'minimize', width: 3, priority: 2 });
  if (chrome?.showMaximize ?? window.maximizable ?? true)
    requested.push({ control: window.mode === 'maximized' ? 'restore' : 'maximize', width: 3, priority: 1 });
  if (chrome?.showFullscreen ?? window.fullscreenable ?? true)
    requested.push({ control: window.mode === 'fullscreen' ? 'restore' : 'fullscreen', width: 4, priority: 3 });
  const budget = Math.max(0, window.width - 3);
  let used = 0;
  const included = new Set<WindowChromeControl>();
  for (const item of [...requested].sort((a, b) => a.priority - b.priority)) {
    if (used + item.width > budget) continue;
    used += item.width;
    included.add(item.control);
  }
  return requested.filter((item) => included.has(item.control)).reduce((sum, item) => sum + item.width, 0);
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
  const encodedId = encodeURIComponent(id);
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
      onMouseEnter: `window:${encodedId}:hover:${control}`,
      onMouseLeave: `window:${encodedId}:leave:${control}`,
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
  const controlCandidates: Array<{ control: WindowChromeControl; priority: number; node: VNode; width: number }> = [];
  const frameAffordances: Array<'drag' | 'resize'> = [];
  if (window.draggable !== false) frameAffordances.push('drag');
  if (window.resizable !== false) frameAffordances.push('resize');

  if (chrome?.showClose ?? window.closable ?? true) {
    controlCandidates.push({
      control: 'close',
      priority: 0,
      width: 3,
      node: commandButton(
        window.id,
        '[x]',
        { type: 'close', id: window.id, reason: chrome?.closeReason, source: 'chrome' },
        'Close window',
        hoveredTarget,
        tokens,
      ),
    });
  }
  if (chrome?.showMinimize ?? window.minimizable ?? true) {
    controlCandidates.push({
      control: 'minimize',
      priority: 2,
      width: 3,
      node: commandButton(window.id, '[_]', { type: 'minimize', id: window.id, source: 'chrome' }, 'Minimize window', hoveredTarget, tokens),
    });
  }
  if (chrome?.showMaximize ?? window.maximizable ?? true) {
    const control = window.mode === 'maximized' ? 'restore' : 'maximize';
    controlCandidates.push({
      control,
      priority: 1,
      width: 3,
      node: commandButton(
        window.id,
        window.mode === 'maximized' ? '[+]' : '[ ]',
        window.mode === 'maximized' ? { type: 'restore', id: window.id, source: 'chrome' } : { type: 'maximize', id: window.id, source: 'chrome' },
        window.mode === 'maximized' ? 'Restore window' : 'Maximize window',
        hoveredTarget,
        tokens,
      ),
    });
  }
  if (chrome?.showFullscreen ?? window.fullscreenable ?? true) {
    const control = window.mode === 'fullscreen' ? 'restore' : 'fullscreen';
    controlCandidates.push({
      control,
      priority: 3,
      width: 4,
      node: commandButton(
        window.id,
        '[fs]',
        window.mode === 'fullscreen' ? { type: 'restore', id: window.id, source: 'chrome' } : { type: 'fullscreen', id: window.id, source: 'chrome' },
        window.mode === 'fullscreen' ? 'Restore from fullscreen' : 'Fullscreen window',
        hoveredTarget,
        tokens,
      ),
    });
  }

  const innerWidth = Math.max(1, window.width - 2);
  const controlBudget = Math.max(0, innerWidth - (showTitle ? 1 : 0));
  let usedControlWidth = 0;
  const visibleControls = new Set<WindowChromeControl>();
  for (const candidate of [...controlCandidates].sort((a, b) => a.priority - b.priority)) {
    if (usedControlWidth + candidate.width > controlBudget) continue;
    usedControlWidth += candidate.width;
    visibleControls.add(candidate.control);
  }
  controls.push(...controlCandidates.filter((candidate) => visibleControls.has(candidate.control)).map((candidate) => candidate.node));

  const headerHovered = hoveredTarget === 'titlebar' || ['close', 'minimize', 'maximize', 'fullscreen', 'restore'].includes(hoveredTarget ?? '');
  const titleBudget = Math.max(0, innerWidth - usedControlWidth);
  const rawTitle = showTitle ? (window.title ?? window.id) : '';
  const title = visualWidth(rawTitle) <= titleBudget ? rawTitle : truncate(rawTitle, titleBudget);
  const titleNode = text(title, style({ color: tokens.text, bold: true }));
  const titleSurface = box(
    row(flex(titleNode, { flex: 1 }), ...controls),
    style({ background: headerHovered ? tokens.headerHoverBackground : tokens.headerBackground }),
    { width: innerWidth, height: 1, overflow: 'hidden' },
  );
  const titleBar = event(
    `window:${encodeURIComponent(window.id)}:titlebar`,
    titleSurface,
    {
      onMouseEnter: `window:${encodeURIComponent(window.id)}:hover:titlebar`,
      onMouseLeave: `window:${encodeURIComponent(window.id)}:leave:titlebar`,
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
    `window:${encodeURIComponent(window.id)}:frame`,
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
