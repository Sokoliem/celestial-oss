/**
 * CommandPalette — Fuzzy-searchable command list overlay.
 *
 * Provides a VS Code-style command palette with:
 * - Fuzzy search filtering
 * - Category grouping
 * - Keyboard shortcut display
 * - Full keyboard navigation
 *
 * Built on top of the existing palette.ts and fuzzy.ts modules.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { border, style } from '@celestial/core/corona';
import type { KeyEvent, Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import {
  box,
  Cmd,
  column,
  createKeybindingState,
  divider,
  event,
  flex,
  type KeybindingLayer,
  type KeybindingState,
  processKey,
  resetChord,
  row,
  Sub,
  setVNodeMeta,
  text,
} from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { positiveInteger, wheelDirection } from './internal.js';
import { type Command, createPaletteState, getSelectedCommand, type PaletteMsg, type PaletteState, paletteUpdate } from './palette.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface CommandPaletteTokens {
  text: Color;
  highlight: Color;
  textSoft: Color;
  muted: Color;
  bg: Color;
  border: Color;
  borderHover: Color;
  divider: Color;
  hoverBg: Color;
  selectedBg: Color;
  labelStyle: TypographyToken;
}

export const commandPaletteContract: TokenContract<CommandPaletteTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  highlight: (t: SemanticTheme) => t.colors.highlight,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  muted: (t: SemanticTheme) => t.colors.muted,
  bg: (t: SemanticTheme) => t.colors.surfaceRaised,
  border: (t: SemanticTheme) => t.colors.focusRing,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  divider: (t: SemanticTheme) => t.colors.divider,
  // Pointer hover and keyboard selection are the same active-row concept.
  // Keep both public override slots for compatibility, but derive them from
  // the same state token so input modality never changes the visual language.
  hoverBg: (t: SemanticTheme) => t.states.selected.bg ?? t.colors.surfaceAlt,
  selectedBg: (t: SemanticTheme) => t.states.selected.bg ?? t.colors.surfaceAlt,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/**
 * P0-4 — chip-shaped filter on the palette. A filter narrows which commands
 * are visible BEFORE the fuzzy query runs. The chip strip renders above the
 * results; clicking a chip activates the filter; the current selection is
 * accessible via `model.activeFilterId`.
 */
export interface PaletteFilter {
  readonly id: string;
  readonly label: string;
  /** Predicate that returns true to KEEP the command. */
  readonly predicate: (command: { id: string; label: string; category?: string }) => boolean;
}

/**
 * P0-4 — segmented sort mode. Each entry receives the filtered command list
 * and returns a sorted list. The active mode's id lives in `model.activeSortId`.
 */
export interface PaletteSortMode<M> {
  readonly id: string;
  readonly label: string;
  /** Returns a new array — must not mutate the input. */
  readonly compare: (a: Command<M>, b: Command<M>) => number;
}

/** Configuration for creating a command palette component. */
export interface CommandPaletteConfig<M> {
  /** Stable surface id used by semantic mouse regions. */
  id?: string;
  /** The list of available commands. */
  commands: Command<M>[];
  /** Callback when a command is selected. Receives the command's msg payload. */
  onSelect?: (msg: M) => void;
  /** Callback when the palette is closed without selection. */
  onClose?: () => void;
  /** Placeholder text for the search input (default: 'Type a command...'). */
  placeholder?: string;
  /** Maximum number of visible results (default: 10). */
  maxVisible?: number;
  /** Preferred outer width in terminal cells (default: 42). */
  width?: number;
  /** P0-4 — chip strip filters. Order in array = render order. */
  filters?: PaletteFilter[];
  /** P0-4 — segmented sort modes. Order in array = render order. */
  sortModes?: PaletteSortMode<M>[];
  /** P0-4 — initial filter id (default: first filter, or 'all'). */
  initialFilter?: string;
  /** P0-4 — initial sort id (default: first sortMode, or 'default'). */
  initialSort?: string;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** Model state for the command palette component. */
export interface CommandPaletteModel {
  /** The underlying palette state (query, selection, filtered IDs). */
  palette: PaletteState;
  /** Shared Nebula keybinding state for palette navigation. */
  keybindings: KeybindingState<PaletteBindingAction>;
  /** Pointer-owned row. Keyboard selection remains in palette.selectedIndex. */
  hoveredIndex?: number | null;
}

type PaletteBindingAction = 'backspace' | 'up' | 'down' | 'select' | 'close';

/** Messages the command palette can handle. */
export type CommandPaletteMsg =
  | Msg<'cp-open'>
  | Msg<'cp-close'>
  | Msg<'cp-key', { event: KeyEvent }>
  | Msg<'cp-input', { char: string }>
  | Msg<'cp-backspace'>
  | Msg<'cp-up'>
  | Msg<'cp-down'>
  | Msg<'cp-select'>
  | Msg<'cp-hover-at', { index: number }>
  | Msg<'cp-leave-at', { index: number }>
  | Msg<'cp-select-at', { index: number }>
  | Msg<'cp-noop'>;

const PALETTE_KEY_LAYER: KeybindingLayer<PaletteBindingAction> = {
  id: 'command-palette',
  bindings: [
    { id: 'palette-backspace', keys: [{ key: 'backspace' }], action: 'backspace' },
    { id: 'palette-up', keys: [{ key: 'up' }], action: 'up' },
    { id: 'palette-down', keys: [{ key: 'down' }], action: 'down' },
    { id: 'palette-select', keys: [{ key: 'enter' }], action: 'select' },
    { id: 'palette-close', keys: [{ key: 'escape' }], action: 'close' },
  ],
};

function createPaletteKeybindings(): KeybindingState<PaletteBindingAction> {
  return createKeybindingState([PALETTE_KEY_LAYER]);
}

function applyBindingAction(action: PaletteBindingAction): CommandPaletteMsg {
  switch (action) {
    case 'backspace':
      return { type: 'cp-backspace' };
    case 'up':
      return { type: 'cp-up' };
    case 'down':
      return { type: 'cp-down' };
    case 'select':
      return { type: 'cp-select' };
    case 'close':
      return { type: 'cp-close' };
  }

  return { type: 'cp-close' };
}

function toKeyChordEvent(event: KeyEvent): { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean } {
  return {
    key: event.key,
    ctrl: event.ctrl || undefined,
    alt: event.alt || undefined,
    shift: event.shift || undefined,
  };
}

function isPrintablePaletteInput(event: KeyEvent): event is KeyEvent & { char: string } {
  return typeof event.char === 'string' && !event.ctrl && !event.alt;
}

/** Map a CommandPaletteMsg to a PaletteMsg. */
function toPaletteMsg(msg: CommandPaletteMsg): PaletteMsg | null {
  switch (msg.type) {
    case 'cp-open':
      return { type: 'pal-open' };
    case 'cp-close':
      return { type: 'pal-close' };
    case 'cp-input':
      return { type: 'pal-input', char: msg.char };
    case 'cp-backspace':
      return { type: 'pal-backspace' };
    case 'cp-up':
      return { type: 'pal-up' };
    case 'cp-down':
      return { type: 'pal-down' };
    case 'cp-select':
      return { type: 'pal-select' };
    case 'cp-hover-at':
    case 'cp-leave-at':
    case 'cp-select-at':
    case 'cp-noop':
    case 'cp-key':
      return null;
  }

  return null;
}

/**
 * Create a command palette component with fuzzy search.
 *
 * @param config - Command palette configuration.
 * @returns A ComponentDescriptor for the command palette.
 */
export function commandPalette<M>(config: CommandPaletteConfig<M>): ComponentDescriptor<CommandPaletteModel, CommandPaletteMsg> {
  const commands = config.commands.slice(0, 100_000).map((command) => ({ ...command }));
  const placeholder = config.placeholder ?? 'Type a command...';
  const maxVisible = positiveInteger(config.maxVisible, 10);
  const width = positiveInteger(config.width, 42);
  const surfaceId = config.id ?? generateFocusGroupId('command-palette');
  const selectTag = `${surfaceId}:select-command`;
  const hoverTag = `${surfaceId}:hover-command`;
  const leaveTag = `${surfaceId}:leave-command`;
  const scrollTag = `${surfaceId}:scroll`;

  return {
    init(): [CommandPaletteModel, Cmd<CommandPaletteMsg>] {
      return [{ palette: createPaletteState(), keybindings: createPaletteKeybindings(), hoveredIndex: null }, Cmd.none()];
    },

    update(msg: CommandPaletteMsg, model: CommandPaletteModel): [CommandPaletteModel, Cmd<CommandPaletteMsg>] {
      if (msg.type === 'cp-key') {
        const result = processKey(model.keybindings, toKeyChordEvent(msg.event));
        const updatedModel = { ...model, keybindings: result.state };

        if (result.matched) {
          let nextModel = updatedModel;
          for (const action of result.actions) {
            [nextModel] = this.update(applyBindingAction(action), nextModel);
          }
          return [nextModel, Cmd.none()];
        }

        if (isPrintablePaletteInput(msg.event)) {
          return this.update({ type: 'cp-input', char: msg.event.char }, updatedModel);
        }

        return [updatedModel, Cmd.none()];
      }

      if (msg.type === 'cp-select') {
        const selected = getSelectedCommand(model.palette, commands);
        if (selected?.disabled) {
          return [model, Cmd.none()];
        }
        if (selected) {
          config.onSelect?.(selected.msg);
        }
        const newPalette = paletteUpdate({ type: 'pal-close' }, model.palette, commands);
        return [{ palette: newPalette, keybindings: resetChord(model.keybindings), hoveredIndex: null }, Cmd.none()];
      }

      if (msg.type === 'cp-select-at') {
        if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= model.palette.filteredIds.length) return [model, Cmd.none()];
        const pointedPalette = { ...model.palette, selectedIndex: msg.index };
        const selected = getSelectedCommand(pointedPalette, commands);
        if (selected?.disabled) {
          return [{ ...model, palette: pointedPalette, hoveredIndex: msg.index }, Cmd.none()];
        }
        if (selected) config.onSelect?.(selected.msg);
        return [
          { palette: paletteUpdate({ type: 'pal-close' }, pointedPalette, commands), keybindings: resetChord(model.keybindings), hoveredIndex: null },
          Cmd.none(),
        ];
      }

      if (msg.type === 'cp-hover-at') {
        if (!Number.isInteger(msg.index) || msg.index < 0 || msg.index >= model.palette.filteredIds.length) return [model, Cmd.none()];
        return [{ ...model, palette: { ...model.palette, selectedIndex: msg.index }, hoveredIndex: msg.index }, Cmd.none()];
      }

      if (msg.type === 'cp-leave-at') {
        return [model.hoveredIndex === msg.index ? { ...model, hoveredIndex: null } : model, Cmd.none()];
      }

      if (msg.type === 'cp-noop') return [model, Cmd.none()];

      if (msg.type === 'cp-close') {
        config.onClose?.();
        const newPalette = paletteUpdate({ type: 'pal-close' }, model.palette, commands);
        return [{ palette: newPalette, keybindings: resetChord(model.keybindings), hoveredIndex: null }, Cmd.none()];
      }

      const palMsg = toPaletteMsg(msg);
      if (!palMsg) return [model, Cmd.none()];
      const newPalette = paletteUpdate(palMsg, model.palette, commands);
      return [{ palette: newPalette, keybindings: resetChord(model.keybindings), hoveredIndex: null }, Cmd.none()];
    },

    view(model: CommandPaletteModel): VNode {
      if (!model.palette.open) return text('');

      const tokens = useTokens(commandPaletteContract, config, 'CommandPalette');

      const titleStyle = style({ bold: true, color: tokens.highlight });
      const inputStyle = style({ color: tokens.text });
      // Palette hints are actionable instructions. Color may make them
      // secondary, but terminal `dim` can push otherwise-safe tokens below
      // the contrast floor on real terminals.
      const secondaryStyle = style({ color: tokens.muted });
      const borderStyle = style({ border: border.rounded, color: model.hoveredIndex == null ? tokens.border : tokens.borderHover, background: tokens.bg });
      const categoryStyle = style({ color: tokens.highlight });

      const dividerStyle = style({ color: tokens.divider });

      // Search input line
      const queryDisplay = model.palette.query.length > 0 ? model.palette.query : placeholder;
      const queryStyle = model.palette.query.length > 0 ? inputStyle : secondaryStyle;

      const lines: VNode[] = [
        row(text('> ', titleStyle), flex(text(queryDisplay, queryStyle, { wrap: true }), { flex: 1, minWidth: 1 })),
        divider({ style: dividerStyle }),
      ];

      // Build command list — scroll the visible window to include the selected item
      const selectedIdx = Number.isInteger(model.palette.selectedIndex) ? model.palette.selectedIndex : 0;
      let start = 0;
      if (selectedIdx >= maxVisible) {
        start = selectedIdx - maxVisible + 1;
      }
      const visibleIds = model.palette.filteredIds.slice(start, start + maxVisible);
      const commandMap = new Map(commands.map((c) => [c.id, c]));

      let lastCategory = '';
      visibleIds.forEach((id, localIndex) => {
        const cmd = commandMap.get(id);
        if (!cmd) return;
        const index = start + localIndex;

        // Show category header if different from previous
        if (cmd.category && cmd.category !== lastCategory) {
          lastCategory = cmd.category;
          lines.push(text(`  ${cmd.category}`, categoryStyle));
        }

        const isSelected = id === model.palette.filteredIds[model.palette.selectedIndex];
        const isHovered = model.hoveredIndex === index;
        const prefix = isSelected ? '▸ ' : '  ';
        const isActive = isHovered || isSelected;
        const rowBackground = isActive ? tokens.selectedBg : undefined;
        const labelStyle = cmd.disabled
          ? style({ color: tokens.muted, background: rowBackground })
          : isActive
          ? style({ color: tokens.text, bold: true, background: rowBackground })
          : style({ color: tokens.text, background: rowBackground });

        const parts: VNode[] = [flex(text(prefix + cmd.label, labelStyle, { wrap: true }), { flex: 1, minWidth: 1 })];
        if (cmd.shortcut) {
          parts.push(text(`  ${cmd.shortcut}`, style({ color: tokens.textSoft, background: rowBackground })));
        }

        const content = row(...parts);
        const commandRow = cmd.disabled
          ? content
          : event(
              `${surfaceId}:command:${index}`,
              content,
              { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag, onScroll: scrollTag },
              {
                label: cmd.label,
                intent: 'select',
                affordances: ['hover', 'click', 'scroll'],
                cursor: 'pointer',
                keyboardHint: cmd.shortcut,
              },
            );
        setVNodeMeta(commandRow, {
          ...(cmd.disabled ? { states: ['disabled'] } : {}),
          a11y: {
            role: 'menuitem',
            label: cmd.label,
            disabled: cmd.disabled === true,
            selected: isSelected,
          },
        });
        lines.push(commandRow);
      });

      if (visibleIds.length === 0) {
        lines.push(text('  No matching commands', secondaryStyle));
      }

      // Show count
      const total = model.palette.filteredIds.length;
      if (total > maxVisible) {
        lines.push(text(`  ... and ${total - maxVisible} more`, secondaryStyle));
      }

      lines.push(text(''));
      lines.push(text('[↑↓] navigate  [enter] select  [esc] close', secondaryStyle, { wrap: true }));

      return box(column(...lines), borderStyle, { fit: 'content', width });
    },

    subscriptions(model: CommandPaletteModel): Sub<CommandPaletteMsg> {
      if (!model.palette.open) return Sub.none();

      return Sub.batch<CommandPaletteMsg>(
        Sub.keyEvent<CommandPaletteMsg>((event: KeyEvent) => ({ type: 'cp-key', event })),
        Sub.elementMouse<CommandPaletteMsg>((mouseEvent) => {
          if (mouseEvent.handlerTag === scrollTag) {
            const direction = wheelDirection(mouseEvent.deltaY);
            return direction < 0 ? { type: 'cp-up' } : direction > 0 ? { type: 'cp-down' } : { type: 'cp-noop' };
          }
          if (!mouseEvent.elementId.startsWith(`${surfaceId}:command:`)) return { type: 'cp-noop' };
          const index = Number(mouseEvent.elementId.slice(`${surfaceId}:command:`.length));
          if (!Number.isInteger(index)) return { type: 'cp-noop' };
          if (mouseEvent.handlerTag === selectTag) return { type: 'cp-select-at', index };
          if (mouseEvent.handlerTag === hoverTag) return { type: 'cp-hover-at', index };
          if (mouseEvent.handlerTag === leaveTag) return { type: 'cp-leave-at', index };
          return { type: 'cp-noop' };
        }),
      );
    },
  };
}
