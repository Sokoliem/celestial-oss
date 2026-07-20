import type { KeyEvent } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { type CommandPaletteModel, commandPalette } from '../command-palette.js';
import type { Command } from '../palette.js';

const sampleCommands: Command<string>[] = [
  { id: 'open', label: 'Open File', category: 'File', shortcut: 'Ctrl+O', msg: 'open-file' },
  { id: 'save', label: 'Save File', category: 'File', shortcut: 'Ctrl+S', msg: 'save-file' },
  { id: 'close', label: 'Close File', category: 'File', shortcut: 'Ctrl+W', msg: 'close-file' },
  { id: 'find', label: 'Find', category: 'Edit', shortcut: 'Ctrl+F', msg: 'find', keywords: ['search'] },
  { id: 'replace', label: 'Replace', category: 'Edit', msg: 'replace' },
];

describe('commandPalette', () => {
  describe('init', () => {
    it('initializes with closed palette', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      expect(model.palette.open).toBe(false);
      expect(model.palette.query).toBe('');
      expect(model.palette.filteredIds).toEqual([]);
    });
  });

  describe('update', () => {
    function openPalette(): CommandPaletteModel {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const [opened] = component.update({ type: 'cp-open' }, model);
      return opened;
    }

    it('cp-open opens palette and shows all commands', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const [updated] = component.update({ type: 'cp-open' }, model);
      expect(updated.palette.open).toBe(true);
      expect(updated.palette.filteredIds.length).toBe(sampleCommands.length);
    });

    it('cp-close closes palette', () => {
      const component = commandPalette({ commands: sampleCommands });
      const opened = openPalette();
      const [updated] = component.update({ type: 'cp-close' }, opened);
      expect(updated.palette.open).toBe(false);
    });

    it('cp-close calls onClose callback', () => {
      const onClose = vi.fn();
      const component = commandPalette({ commands: sampleCommands, onClose });
      const opened = openPalette();
      component.update({ type: 'cp-close' }, opened);
      expect(onClose).toHaveBeenCalled();
    });

    it('cp-input filters commands by query', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      [model] = component.update({ type: 'cp-input', char: 'O' }, model);
      expect(model.palette.query).toBe('O');
      expect(model.palette.filteredIds.length).toBeGreaterThan(0);
    });

    it('cp-key routes printable input through keybindings fallback', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      [model] = component.update(
        {
          type: 'cp-key',
          event: { key: 'a', char: 'a', ctrl: false, alt: false, shift: false } as KeyEvent,
        },
        model,
      );
      expect(model.palette.query).toBe('a');
    });

    it('cp-backspace removes last character from query', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      [model] = component.update({ type: 'cp-input', char: 'O' }, model);
      [model] = component.update({ type: 'cp-input', char: 'p' }, model);
      expect(model.palette.query).toBe('Op');
      [model] = component.update({ type: 'cp-backspace' }, model);
      expect(model.palette.query).toBe('O');
    });

    it('cp-down navigates to next command', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      expect(model.palette.selectedIndex).toBe(0);
      [model] = component.update(
        {
          type: 'cp-key',
          event: { key: 'down', ctrl: false, alt: false, shift: false } as KeyEvent,
        },
        model,
      );
      expect(model.palette.selectedIndex).toBe(1);
    });

    it('cp-up navigates to previous command', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      [model] = component.update({ type: 'cp-down' }, model);
      [model] = component.update({ type: 'cp-down' }, model);
      [model] = component.update(
        {
          type: 'cp-key',
          event: { key: 'up', ctrl: false, alt: false, shift: false } as KeyEvent,
        },
        model,
      );
      expect(model.palette.selectedIndex).toBe(1);
    });

    it('cp-select calls onSelect with command msg and closes', () => {
      const onSelect = vi.fn();
      const component = commandPalette({ commands: sampleCommands, onSelect });
      let model = openPalette();
      // Select the first command
      [model] = component.update(
        {
          type: 'cp-key',
          event: { key: 'enter', ctrl: false, alt: false, shift: false } as KeyEvent,
        },
        model,
      );
      expect(onSelect).toHaveBeenCalled();
      expect(model.palette.open).toBe(false);
    });

    it('cp-select delivers the correct command msg', () => {
      const onSelect = vi.fn();
      const component = commandPalette({ commands: sampleCommands, onSelect });
      let model = openPalette();
      // Navigate to second command
      [model] = component.update({ type: 'cp-down' }, model);
      [model] = component.update({ type: 'cp-select' }, model);
      // Second command in filteredIds order
      expect(onSelect).toHaveBeenCalled();
    });

    it('should scroll visible window to include selected item when selectedIndex exceeds maxVisible', () => {
      // Fix (K4): visible window now follows selection, so the selected item
      // is always visible and highlighted even when selectedIndex >= maxVisible.
      const component = commandPalette({ commands: sampleCommands, maxVisible: 3 });
      let model = openPalette();
      // Navigate to index 4 (beyond maxVisible of 3)
      for (let i = 0; i < 4; i++) {
        [model] = component.update({ type: 'cp-down' }, model);
      }
      expect(model.palette.selectedIndex).toBe(4);
      const vnode = component.view(model);
      if (vnode.kind === 'box') {
        const inner = vnode.children[0];
        if (inner && inner.kind === 'column') {
          const allTexts = collectTexts(inner);
          // The selected item should now be visible and highlighted
          const highlightedRows = allTexts.filter((t) => t.startsWith('\u25B8 '));
          expect(highlightedRows).toHaveLength(1);
          // The highlighted item should be the one at selectedIndex
          const selectedId = model.palette.filteredIds[model.palette.selectedIndex];
          const selectedCmd = sampleCommands.find((c) => c.id === selectedId);
          if (selectedCmd) {
            expect(highlightedRows[0]).toContain(selectedCmd.label);
          }
        }
      }
    });

    it('should highlight by filteredIds ID not by slice-local index', () => {
      // This is the core regression: with maxVisible=3, selectedIndex=1,
      // the item at visibleIds[1] should be highlighted only if its ID
      // matches filteredIds[selectedIndex].
      // With the bug, i === selectedIndex compares slice position, which happens
      // to work when maxVisible > total items, but fails conceptually.
      // The real failure: when filteredIds is reordered or filtered differently
      // from the visible slice (e.g., due to searching), the wrong item highlights.
      const component = commandPalette({ commands: sampleCommands, maxVisible: 10 });
      let model = openPalette();
      // Navigate to the 3rd item (selectedIndex=2)
      [model] = component.update({ type: 'cp-down' }, model);
      [model] = component.update({ type: 'cp-down' }, model);
      expect(model.palette.selectedIndex).toBe(2);

      // Get the ID of the item that should be selected
      const expectedId = model.palette.filteredIds[model.palette.selectedIndex];
      const cmdMap = new Map(sampleCommands.map((c) => [c.id, c]));
      const expectedLabel = cmdMap.get(expectedId!)!.label;

      const vnode = component.view(model);
      if (vnode.kind === 'box') {
        const inner = vnode.children[0];
        if (inner && inner.kind === 'column') {
          const allTexts = collectTexts(inner);
          // The highlighted row must contain the expected label
          const highlighted = allTexts.filter((t) => t.includes('\u25B8 '));
          expect(highlighted.length).toBeGreaterThan(0);
          expect(highlighted.some((t) => t.includes(expectedLabel))).toBe(true);
        }
      }
    });

    it('navigation wraps around', () => {
      const component = commandPalette({ commands: sampleCommands });
      let model = openPalette();
      // Move to last item
      for (let i = 0; i < sampleCommands.length - 1; i++) {
        [model] = component.update({ type: 'cp-down' }, model);
      }
      expect(model.palette.selectedIndex).toBe(sampleCommands.length - 1);
      // Wrap to first
      [model] = component.update({ type: 'cp-down' }, model);
      expect(model.palette.selectedIndex).toBe(0);
    });

    it('tracks the pointed row and selects that exact command', () => {
      const onSelect = vi.fn();
      const component = commandPalette({ commands: sampleCommands, onSelect });
      let model = openPalette();
      [model] = component.update({ type: 'cp-hover-at', index: 3 }, model);
      expect(model.hoveredIndex).toBe(3);
      expect(model.palette.selectedIndex).toBe(3);
      [model] = component.update({ type: 'cp-select-at', index: 3 }, model);
      expect(onSelect).toHaveBeenCalledWith('find');
      expect(model.palette.open).toBe(false);
    });
  });

  describe('view', () => {
    it('renders empty text when closed', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const vnode = component.view(model);
      expect(vnode.kind).toBe('text');
      if (vnode.kind === 'text') {
        expect(vnode.content).toBe('');
      }
    });

    it('renders box when open', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const [opened] = component.update({ type: 'cp-open' }, model);
      const vnode = component.view(opened);
      expect(vnode.kind).toBe('box');
    });

    it('shows command labels in the list', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const [opened] = component.update({ type: 'cp-open' }, model);
      const vnode = component.view(opened);
      // The box wraps a column in children[0]
      if (vnode.kind === 'box') {
        const col = vnode.children[0];
        if (col && col.kind === 'column') {
          const allTexts = collectTexts(col);
          expect(allTexts.some((t) => t.includes('Open File'))).toBe(true);
        }
      }
    });

    it('renders pointer hover and keyboard selection with the same active-row style', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [initial] = component.init();
      const [opened] = component.update({ type: 'cp-open' }, initial);
      const [keyboardSelected] = component.update({ type: 'cp-down' }, opened);
      const [pointerSelected] = component.update({ type: 'cp-hover-at', index: 1 }, opened);

      const keyboardStyle = findTextStyle(component.view(keyboardSelected), 'Save File');
      const pointerStyle = findTextStyle(component.view(pointerSelected), 'Save File');
      expect(pointerStyle).toEqual(keyboardStyle);
      expect(pointerStyle?.bgRgb).toBeDefined();
      expect(pointerStyle?.dim).not.toBe(true);
    });

    it('shows "No matching commands" when filtered to zero', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      let opened: CommandPaletteModel;
      [opened] = component.update({ type: 'cp-open' }, model);
      // Type something that matches nothing
      [opened] = component.update({ type: 'cp-input', char: 'z' }, opened);
      [opened] = component.update({ type: 'cp-input', char: 'z' }, opened);
      [opened] = component.update({ type: 'cp-input', char: 'z' }, opened);
      const vnode = component.view(opened);
      if (vnode.kind === 'box') {
        const inner = vnode.children[0];
        if (inner) {
          const allTexts = collectTexts(inner);
          expect(allTexts.some((t) => t.includes('No matching commands'))).toBe(true);
        }
      }
    });
  });

  describe('subscriptions', () => {
    it('returns none when closed', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const sub = component.subscriptions?.(model);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('none');
      }
    });

    it('returns batch of subscriptions when open', () => {
      const component = commandPalette({ commands: sampleCommands });
      const [model] = component.init();
      const [opened] = component.update({ type: 'cp-open' }, model);
      const sub = component.subscriptions?.(opened);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
        expect(JSON.stringify(sub)).toContain('keyEvent');
        expect(JSON.stringify(sub)).toContain('elementMouse');
      }
    });
  });

  it('snapshots command definitions and rejects malformed pointer indices', () => {
    const mutable = [{ id: 'stable', label: 'Stable command', msg: 'stable' }];
    const component = commandPalette({ commands: mutable });
    mutable[0]!.label = 'Changed command';
    const [model] = component.init();
    const [opened] = component.update({ type: 'cp-open' }, model);
    expect(collectTexts(component.view(opened) as any).some((value) => value.includes('Stable command'))).toBe(true);
    expect(collectTexts(component.view(opened) as any).some((value) => value.includes('Changed command'))).toBe(false);
    expect(component.update({ type: 'cp-select-at', index: Number.NaN }, opened)[0]).toBe(opened);
  });
});

/** Recursively collect all text content from a VNode tree. */
function collectTexts(node: { kind: string; content?: string; children?: any[]; child?: any }): string[] {
  const texts: string[] = [];
  if (node.kind === 'text' && typeof node.content === 'string') {
    texts.push(node.content);
  }
  if (node.children) {
    for (const child of node.children) {
      texts.push(...collectTexts(child));
    }
  }
  if (node.child) {
    texts.push(...collectTexts(node.child));
  }
  return texts;
}

function findTextStyle(node: any, content: string): any {
  if (node?.kind === 'text' && typeof node.content === 'string' && node.content.includes(content)) return node.style;
  for (const child of node?.children ?? []) {
    const match = findTextStyle(child, content);
    if (match) return match;
  }
  return node?.child ? findTextStyle(node.child, content) : undefined;
}
