/**
 * Controlled rendering adapter for the headless application shell.
 *
 * `createAppShell` continues to own state and receipts. This adapter projects
 * that state onto canonical UI surfaces and routes pointer input back into the
 * shell message vocabulary.
 */
import { style, surfaceZTokens, type ThemeInput } from '@celestial/core/corona';
import type { Sub as Subscription, ThemeContext, VNode } from '@celestial/core/nebula';
import {
  box,
  column,
  event,
  flex,
  layerStack,
  measure,
  overlay,
  row,
  setVNodeMeta,
  Sub,
  text,
} from '@celestial/core/nebula';
import type {
  AppShell,
  AppShellContext,
  AppShellModel,
  AppShellMsg,
} from './app-shell.js';
import { button } from './clickable.js';
import { helpView } from './keyboard.js';
import { positiveInteger } from './internal.js';
import {
  interactiveRow,
  semanticText,
  surfaceFrame,
} from './primitives.js';
import { resolveTheme } from './theme.js';

export interface AppShellViewConfig {
  readonly id?: string;
  readonly paletteWidth?: number;
  readonly helpWidth?: number;
  readonly confirmWidth?: number;
  readonly maxPaletteRows?: number;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

export interface AppShellView<HostModel> {
  layer(
    base: VNode,
    model: AppShellModel,
    context: AppShellContext<HostModel>,
  ): VNode;
  subscriptions(
    model: AppShellModel,
    context: AppShellContext<HostModel>,
  ): Subscription<AppShellMsg>;
}

export interface AppShellControlledViewOptions {
  readonly id?: string;
  readonly width: number;
  readonly maxRows?: number;
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

function shellSurface(
  title: string,
  content: VNode,
  options: AppShellControlledViewOptions,
  closeTag?: string,
): VNode {
  const header =
    closeTag === undefined
      ? semanticText(title, { role: 'heading', ...options })
      : row(
          semanticText(title, { role: 'heading', ...options }),
          flex(text(''), { flex: 1, minWidth: 1 }),
          button({
            id: `${options.id ?? 'app-shell-view'}:close`,
            label: 'Close',
            onClick: closeTag,
            buttonVariant: 'outline',
            keyboardHint: 'Escape',
            intent: 'dismiss',
            theme: options.theme,
            themeCtx: options.themeCtx,
          }),
        );
  return surfaceFrame({
    content: column(header, text(''), content),
    elevation: 'modal',
    width: options.width,
    padding: 1,
    role: 'dialog',
    label: title,
    theme: options.theme,
    themeCtx: options.themeCtx,
  });
}

/** Controlled command-palette projection for AppShell-owned palette state. */
export function appShellPaletteView<HostModel, HostMsg>(
  shell: AppShell<HostModel, HostMsg>,
  model: AppShellModel,
  hostModel: HostModel,
  options: AppShellControlledViewOptions,
): VNode {
  const id = options.id ?? 'app-shell-view';
  const maxRows = positiveInteger(options.maxRows, 8);
  const projection = shell.project(model, hostModel);
  const commands = new Map(
    projection.commands.map((command) => [command.id, command] as const),
  );
  const selected = Math.max(
    0,
    Math.min(
      Math.max(0, model.palette.filteredIds.length - 1),
      model.palette.selectedIndex,
    ),
  );
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, model.palette.filteredIds.length - maxRows),
      selected - maxRows + 1,
    ),
  );
  const visibleIds = model.palette.filteredIds.slice(start, start + maxRows);
  const rows = visibleIds.flatMap((commandId, offset) => {
    const command = commands.get(commandId);
    if (command === undefined) return [];
    const index = start + offset;
    const prefix = index === selected ? '▸ ' : '  ';
    const shortcut = command.shortcut ? `  ${command.shortcut}` : '';
    return [
      interactiveRow({
        id: `${id}:palette-row:${String(index)}`,
        label: command.label,
        content: row(
          flex(text(`${prefix}${command.label}`, undefined, { wrap: true }), {
            flex: 1,
            minWidth: 1,
          }),
          text(shortcut),
        ),
        onClick: `${id}:palette-select`,
        onMouseEnter: `${id}:palette-highlight`,
        onScroll: `${id}:palette-scroll`,
        selected: index === selected,
        disabled: command.disabled === true,
        shortcut: command.shortcut,
        theme: options.theme,
        themeCtx: options.themeCtx,
      }),
    ];
  });
  const total = model.palette.filteredIds.length;
  return shellSurface(
    'ACTION PALETTE',
    column(
      semanticText(
        `Filter: ${model.palette.query || 'all commands'}`,
        { role: 'muted', ...options },
      ),
      semanticText('Type to filter; use the wheel or arrow keys to navigate.', {
        role: 'muted',
        wrap: true,
        ...options,
      }),
      semanticText(
        total === 0
          ? 'Showing 0 of 0 commands.'
          : `Showing ${String(start + 1)}-${String(start + rows.length)} of ${String(total)} | selected ${String(selected + 1)}`,
        { role: 'muted', ...options },
      ),
      text(''),
      ...(start > 0
        ? [
            semanticText(`↑ ${String(start)} earlier command(s)`, {
              role: 'muted',
              ...options,
            }),
          ]
        : []),
      ...(rows.length === 0
        ? [
            semanticText('No matching actions.', {
              role: 'warning',
              ...options,
            }),
          ]
        : rows),
      ...(start + rows.length < total
        ? [
            semanticText(
              `↓ ${String(total - start - rows.length)} later command(s)`,
              { role: 'muted', ...options },
            ),
          ]
        : []),
      text(''),
      semanticText('[↑↓/wheel] navigate  [enter] select  [esc] close', {
        role: 'muted',
        wrap: true,
        ...options,
      }),
    ),
    options,
    `${id}:dismiss`,
  );
}

/** Controlled keyboard-help projection from the shell's canonical bindings. */
export function appShellHelpView<HostModel, HostMsg>(
  shell: AppShell<HostModel, HostMsg>,
  model: AppShellModel,
  hostModel: HostModel,
  options: AppShellControlledViewOptions,
): VNode {
  return shellSurface(
    'CANONICAL KEYBOARD HELP',
    helpView(shell.project(model, hostModel).helpBindings, {
      includeInactive: true,
      width: Math.max(16, options.width - 4),
      title: '',
      groupByCategory: true,
      theme: options.theme,
      themeCtx: options.themeCtx,
    }),
    options,
    `${options.id ?? 'app-shell-view'}:dismiss`,
  );
}

/** Controlled modal confirmation projection shared by every AppShell host. */
export function appShellConfirmView(
  model: AppShellModel,
  options: AppShellControlledViewOptions,
): VNode {
  const confirm = model.confirm;
  if (confirm === null) return text('');
  const id = options.id ?? 'app-shell-view';
  const selection = model.confirmSelection ?? 'confirm';
  const tone =
    confirm.variant === 'danger'
      ? 'danger'
      : confirm.variant === 'warning'
        ? 'warning'
        : 'accent';
  return shellSurface(
    'MODAL CONFIRMATION',
    column(
      semanticText(confirm.title, {
        role: 'title',
        wrap: true,
        ...options,
      }),
      ...(confirm.description === undefined
        ? []
        : [
            semanticText(confirm.description, {
              role: 'muted',
              wrap: true,
              ...options,
            }),
          ]),
      text(''),
      row(
        button({
          id: `${id}:confirm`,
          label: confirm.confirmLabel ?? 'Confirm',
          onClick: `${id}:confirm`,
          onMouseEnter: `${id}:confirm-select-confirm`,
          selected: selection === 'confirm',
          tone,
          keyboardHint: 'Y or Enter',
          theme: options.theme,
          themeCtx: options.themeCtx,
        }),
        text('  '),
        button({
          id: `${id}:cancel`,
          label: confirm.cancelLabel ?? 'Cancel',
          onClick: `${id}:cancel`,
          onMouseEnter: `${id}:confirm-select-cancel`,
          selected: selection === 'cancel',
          tone: 'neutral',
          keyboardHint: 'N or Escape',
          theme: options.theme,
          themeCtx: options.themeCtx,
        }),
      ),
      text(''),
      semanticText(
        'Use Tab or arrow keys to move; Y/N, Enter, or Escape resolves this confirmation.',
        { role: 'warning', wrap: true, ...options },
      ),
    ),
    options,
  );
}

/** Controlled toast projection including actions from the shell registry. */
export function appShellToastView<HostModel, HostMsg>(
  shell: AppShell<HostModel, HostMsg>,
  model: AppShellModel,
  hostModel: HostModel,
  options: AppShellControlledViewOptions,
): VNode {
  const projection = shell.projectToasts(model);
  const latestId = projection.visibleToastIds.at(-1);
  const latest =
    latestId === undefined
      ? undefined
      : projection.entries.find((entry) => entry.id === latestId);
  const commands = new Map(
    shell
      .project(model, hostModel)
      .commands.map((command) => [command.id, command] as const),
  );
  const actions =
    latest?.actionIds.flatMap((actionId) => {
      const command = commands.get(actionId);
      return command === undefined ? [] : [{ command, actionId }];
    }) ?? [];
  const id = options.id ?? 'app-shell-view';
  return surfaceFrame({
    content: column(
      shell.toastManager.view(projection, {
        width: Math.max(16, options.width - 4),
      }),
      ...(actions.length === 0
        ? []
        : [
            text(''),
            row(
              semanticText('Action  ', { role: 'muted', ...options }),
              ...actions.flatMap(({ command, actionId }, index) => [
                ...(index === 0 ? [] : [text(' ')]),
                button({
                  id: `${id}:toast-action:${String(latest?.id ?? 0)}:${encodeURIComponent(actionId)}`,
                  label: command.label,
                  onClick: `${id}:toast-action`,
                  disabled: command.disabled === true,
                  keyboardHint: command.shortcut,
                  theme: options.theme,
                  themeCtx: options.themeCtx,
                }),
              ]),
            ),
          ]),
    ),
    elevation: 'floating',
    width: options.width,
    padding: 1,
    role: latest?.level === 'error' ? 'alert' : 'status',
    label:
      latest === undefined
        ? 'Notification'
        : `${latest.level}: ${latest.message}`,
    theme: options.theme,
    themeCtx: options.themeCtx,
  });
}

function boundedWidth(
  preferred: number | undefined,
  fallback: number,
  cols: number,
): number {
  return Math.max(1, Math.min(positiveInteger(preferred, fallback), Math.max(1, cols - 2)));
}

function placeBlockingSurface(
  base: VNode,
  surface: VNode,
  bounds: { readonly cols: number; readonly rows: number },
  width: number,
  zIndex: number,
  id: string,
  dismissTag: string | undefined,
  themeOptions: Pick<AppShellViewConfig, 'theme' | 'themeCtx'>,
): VNode {
  const height = Math.max(1, Math.min(measure(surface, width).height, Math.max(1, bounds.rows - 2)));
  const x = Math.max(0, Math.floor((bounds.cols - width) / 2));
  const y = Math.max(0, Math.floor((bounds.rows - height) / 2));
  const theme = resolveTheme(themeOptions);
  setVNodeMeta(base, { a11y: { hidden: true } });
  const backdrop = event(
    `${id}:backdrop`,
    box(text(''), style({ background: theme.colors.backdrop }), {
      width: bounds.cols,
      height: bounds.rows,
      overflow: 'hidden',
    }),
    dismissTag === undefined ? {} : { onClick: dismissTag },
    {
      label: dismissTag === undefined ? `${id} modal backdrop` : `Dismiss ${id}`,
      intent: 'dismiss',
      affordances: dismissTag === undefined ? [] : ['click'],
      cursor: 'default',
    },
  );
  const shield = event(
    `${id}:surface`,
    box(surface, undefined, { width, height, overflow: 'hidden' }),
    {},
    {
      label: id,
      intent: 'interact',
      affordances: [],
      cursor: 'default',
    },
  );
  return layerStack(
    base,
    overlay(backdrop, {
      x: 0,
      y: 0,
      width: bounds.cols,
      height: bounds.rows,
      zIndex: zIndex - 1,
      focusMode: 'passive',
      layoutId: `${id}:backdrop`,
    }),
    overlay(shield, {
      x,
      y,
      width,
      height,
      zIndex,
      focusMode: 'modal',
      layoutId: `${id}:surface`,
    }),
  );
}

function placeFloatingSurface(
  base: VNode,
  surface: VNode,
  bounds: { readonly cols: number; readonly rows: number },
  width: number,
  zIndex: number,
  id: string,
): VNode {
  const height = Math.max(
    1,
    Math.min(measure(surface, width).height, Math.max(1, bounds.rows - 2)),
  );
  return layerStack(
    base,
    overlay(surface, {
      x: Math.max(0, bounds.cols - width - 1),
      y: Math.max(1, Math.min(14, bounds.rows - height - 2)),
      width,
      height,
      zIndex,
      transparent: true,
      focusMode: 'passive',
      layoutId: id,
    }),
  );
}

/** Create the framework-owned view/subscription adapter for a headless shell. */
export function createAppShellView<HostModel, HostMsg>(
  shell: AppShell<HostModel, HostMsg>,
  config: AppShellViewConfig = {},
): AppShellView<HostModel> {
  const id = config.id ?? 'app-shell-view';
  const paletteHighlightTag = `${id}:palette-highlight`;
  const paletteSelectTag = `${id}:palette-select`;
  const paletteScrollTag = `${id}:palette-scroll`;
  const dismissTag = `${id}:dismiss`;
  const confirmTag = `${id}:confirm`;
  const cancelTag = `${id}:cancel`;

  return Object.freeze({
    layer(
      base: VNode,
      model: AppShellModel,
      context: AppShellContext<HostModel>,
    ): VNode {
      const bounds = context.viewport;
      let layered = base;
      const blocking =
        model.confirm !== null
        || model.palette.open
        || model.helpOpen
        || model.notificationCenter.open;
      if (!blocking) {
        const projectedToasts = shell.projectToasts(model);
        if (projectedToasts.visibleToastIds.length > 0) {
          const width = Math.min(48, Math.max(20, bounds.cols - 4));
          layered = placeFloatingSurface(
            layered,
            appShellToastView(shell, model, context.hostModel, {
              ...config,
              id,
              width,
            }),
            bounds,
            width,
            surfaceZTokens.toast,
            `${id}:toasts`,
          );
        }
      }

      if (model.confirm !== null) {
        const width = boundedWidth(config.confirmWidth, 58, bounds.cols);
        return placeBlockingSurface(
          layered,
          appShellConfirmView(model, { ...config, id, width }),
          bounds,
          width,
          surfaceZTokens.panic - 1,
          `${id}:confirmation`,
          undefined,
          config,
        );
      }
      if (model.palette.open) {
        const width = boundedWidth(config.paletteWidth, 68, bounds.cols);
        return placeBlockingSurface(
          layered,
          appShellPaletteView(shell, model, context.hostModel, {
            ...config,
            id,
            width,
            maxRows: config.maxPaletteRows,
          }),
          bounds,
          width,
          surfaceZTokens.menu,
          `${id}:palette`,
          dismissTag,
          config,
        );
      }
      if (model.helpOpen) {
        const width = boundedWidth(config.helpWidth, 64, bounds.cols);
        return placeBlockingSurface(
          layered,
          appShellHelpView(shell, model, context.hostModel, {
            ...config,
            id,
            width,
          }),
          bounds,
          width,
          surfaceZTokens.overlay,
          `${id}:help`,
          dismissTag,
          config,
        );
      }
      if (model.notificationCenter.open) {
        const center = shell.notificationCenter(context.hostModel);
        const surface = center.view(
          model.notificationCenter,
          model.notifications,
          bounds,
        );
        setVNodeMeta(surface, {
          a11y: {
            role: 'dialog',
            label: 'Shared notification center',
          },
        });
        return placeBlockingSurface(
          layered,
          surface,
          bounds,
          boundedWidth(undefined, 56, bounds.cols),
          surfaceZTokens.overlay,
          `${id}:notifications`,
          dismissTag,
          config,
        );
      }
      return layered;
    },

    subscriptions(
      model: AppShellModel,
      context: AppShellContext<HostModel>,
    ): Subscription<AppShellMsg> {
      const pointer = Sub.elementMouse<AppShellMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === dismissTag) {
          return { type: 'shell-dismiss' };
        }
        if (mouseEvent.handlerTag === confirmTag && model.confirm !== null) {
          return { type: 'shell-confirm', id: model.confirm.id };
        }
        if (mouseEvent.handlerTag === cancelTag && model.confirm !== null) {
          return { type: 'shell-cancel-confirm', id: model.confirm.id };
        }
        if (mouseEvent.handlerTag === `${id}:confirm-select-confirm`) {
          return { type: 'shell-confirm-select', selection: 'confirm' };
        }
        if (mouseEvent.handlerTag === `${id}:confirm-select-cancel`) {
          return { type: 'shell-confirm-select', selection: 'cancel' };
        }
        if (
          (mouseEvent.handlerTag === paletteHighlightTag
            || mouseEvent.handlerTag === paletteSelectTag)
          && mouseEvent.elementId.startsWith(`${id}:palette-row:`)
        ) {
          const index = Number(
            mouseEvent.elementId.slice(`${id}:palette-row:`.length),
          );
          return mouseEvent.handlerTag === paletteSelectTag
            ? { type: 'shell-palette-select-at', index }
            : { type: 'shell-palette-highlight', index };
        }
        if (mouseEvent.handlerTag === paletteScrollTag) {
          const deltaY = mouseEvent.deltaY ?? 0;
          return deltaY < 0
            ? { type: 'shell-palette-up' }
            : deltaY > 0
              ? { type: 'shell-palette-down' }
              : { type: 'shell-noop' };
        }
        if (
          mouseEvent.handlerTag === `${id}:toast-action`
          && mouseEvent.elementId.startsWith(`${id}:toast-action:`)
        ) {
          const suffix = mouseEvent.elementId.slice(
            `${id}:toast-action:`.length,
          );
          const separator = suffix.indexOf(':');
          const notificationId = Number(
            separator < 0 ? '' : suffix.slice(0, separator),
          );
          let actionId = '';
          try {
            actionId =
              separator < 0
                ? ''
                : decodeURIComponent(suffix.slice(separator + 1));
          } catch {
            return { type: 'shell-noop' };
          }
          return {
            type: 'shell-activate-notification-action',
            id: notificationId,
            actionId,
          };
        }
        return { type: 'shell-noop' };
      });
      return Sub.batch(shell.subscriptions(model, context), pointer);
    },
  });
}
