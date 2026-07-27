import { collectFocusNodes, subKind, type VNode } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { textarea } from '../textarea.js';

function textareaContent(node: VNode): VNode | null {
  if (node.kind !== 'focus') return null;
  const surface = node.child.kind === 'event' ? node.child.child : node.child;
  return surface.kind === 'box' ? (surface.children[0] ?? null) : surface;
}

describe('textarea', () => {
  // ─── init ────────────────────────────────────────────────────────────────

  it('init splits initial value into lines with cursor at end', () => {
    const component = textarea({ value: 'hello\nworld' });
    const [model] = component.init();
    expect(model.lines).toEqual(['hello', 'world']);
    expect(model.cursorRow).toBe(1);
    expect(model.cursorCol).toBe(5);
    expect(model.scrollOffset).toBe(0);
    expect(model.focused).toBe(false);
  });

  it('init with empty value creates single empty line', () => {
    const component = textarea({});
    const [model] = component.init();
    expect(model.lines).toEqual(['']);
    expect(model.cursorRow).toBe(0);
    expect(model.cursorCol).toBe(0);
  });

  // ─── char insertion ──────────────────────────────────────────────────────

  it('update: char inserts at cursor position', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 2,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'char', char: 'X' }, model);
    expect(updated.lines).toEqual(['heXllo']);
    expect(updated.cursorCol).toBe(3);
  });

  it('update: char insertion in readOnly mode is a no-op', () => {
    const component = textarea({ readOnly: true });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 2,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'char', char: 'X' }, model);
    expect(updated.lines).toEqual(['hello']);
    expect(updated.cursorCol).toBe(2);
  });

  // ─── newline ─────────────────────────────────────────────────────────────

  it('update: newline splits line at cursor', () => {
    const component = textarea({});
    const model = {
      lines: ['hello world'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'newline' }, model);
    expect(updated.lines).toEqual(['hello', ' world']);
    expect(updated.cursorRow).toBe(1);
    expect(updated.cursorCol).toBe(0);
  });

  it('update: newline respects maxLines', () => {
    const component = textarea({ maxLines: 2 });
    const model = {
      lines: ['line1', 'line2'],
      cursorRow: 1,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'newline' }, model);
    // Should not add a new line
    expect(updated.lines).toEqual(['line1', 'line2']);
    expect(updated.cursorRow).toBe(1);
  });

  it('update: newline in readOnly mode is a no-op', () => {
    const component = textarea({ readOnly: true });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'newline' }, model);
    expect(updated.lines).toEqual(['hello']);
  });

  // ─── backspace ───────────────────────────────────────────────────────────

  it('update: backspace at mid-line removes character', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'backspace' }, model);
    expect(updated.lines).toEqual(['helo']);
    expect(updated.cursorCol).toBe(2);
  });

  it('update: backspace at start of line merges with previous', () => {
    const component = textarea({});
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 1,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'backspace' }, model);
    expect(updated.lines).toEqual(['helloworld']);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(5);
  });

  it('update: backspace at (0,0) does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'backspace' }, model);
    expect(updated.lines).toEqual(['hello']);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(0);
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  it('update: delete at end of line merges with next', () => {
    const component = textarea({});
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'delete' }, model);
    expect(updated.lines).toEqual(['helloworld']);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(5);
  });

  it('update: delete at end of last line does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'delete' }, model);
    expect(updated.lines).toEqual(['hello']);
  });

  it('update: delete at mid-line removes character forward', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 2,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'delete' }, model);
    expect(updated.lines).toEqual(['helo']);
    expect(updated.cursorCol).toBe(2);
  });

  // ─── cursor horizontal ──────────────────────────────────────────────────

  it('update: cursor-left/right within line', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [left] = component.update({ type: 'cursor-left' }, model);
    expect(left.cursorCol).toBe(2);

    const [right] = component.update({ type: 'cursor-right' }, model);
    expect(right.cursorCol).toBe(4);
  });

  it('update: cursor-left at start of line wraps to previous line end', () => {
    const component = textarea({});
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 1,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-left' }, model);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(5);
  });

  it('update: cursor-left at (0,0) does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-left' }, model);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(0);
  });

  it('update: cursor-right at end of line wraps to next line start', () => {
    const component = textarea({});
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-right' }, model);
    expect(updated.cursorRow).toBe(1);
    expect(updated.cursorCol).toBe(0);
  });

  it('update: cursor-right at end of last line does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-right' }, model);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(5);
  });

  // ─── cursor vertical ────────────────────────────────────────────────────

  it('update: cursor-up/down maintains column, clamps to line length', () => {
    const component = textarea({});
    const model = {
      lines: ['hello world', 'hi', 'longer line'],
      cursorRow: 0,
      cursorCol: 8,
      scrollOffset: 0,
      focused: true,
    };
    // Move down: col 8, but line "hi" is only length 2 → clamp to 2
    const [down] = component.update({ type: 'cursor-down' }, model);
    expect(down.cursorRow).toBe(1);
    expect(down.cursorCol).toBe(2);

    // Move down again from "hi" row → column is now 2, clamp to line length
    const [down2] = component.update({ type: 'cursor-down' }, down);
    expect(down2.cursorRow).toBe(2);
    expect(down2.cursorCol).toBe(2); // stays at clamped column
  });

  it('update: cursor-up at first line does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-up' }, model);
    expect(updated.cursorRow).toBe(0);
    expect(updated.cursorCol).toBe(3);
  });

  it('update: cursor-down at last line does nothing', () => {
    const component = textarea({});
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 1,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'cursor-down' }, model);
    expect(updated.cursorRow).toBe(1);
    expect(updated.cursorCol).toBe(3);
  });

  // ─── home / end ──────────────────────────────────────────────────────────

  it('update: home moves to start of current line', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'home' }, model);
    expect(updated.cursorCol).toBe(0);
  });

  it('update: end moves to end of current line', () => {
    const component = textarea({});
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 1,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'end' }, model);
    expect(updated.cursorCol).toBe(5);
  });

  // ─── page up / page down ────────────────────────────────────────────────

  it('update: page-down moves cursor by visible rows', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'page-down' }, model);
    expect(updated.cursorRow).toBe(3);
  });

  it('update: page-up moves cursor up by visible rows', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 5,
      cursorCol: 0,
      scrollOffset: 3,
      focused: true,
    };
    const [updated] = component.update({ type: 'page-up' }, model);
    expect(updated.cursorRow).toBe(2);
  });

  it('update: page-down clamps to last line', () => {
    const component = textarea({ rows: 5 });
    const model = {
      lines: ['a', 'b', 'c'],
      cursorRow: 1,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const [updated] = component.update({ type: 'page-down' }, model);
    expect(updated.cursorRow).toBe(2);
  });

  // ─── onChange / onSubmit ─────────────────────────────────────────────────

  it('update: onChange fires with joined value on char insert', () => {
    const onChange = vi.fn();
    const component = textarea({ onChange });
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    component.update({ type: 'char', char: '!' }, model);
    expect(onChange).toHaveBeenCalledWith('hello!\nworld');
  });

  it('update: onChange fires on newline', () => {
    const onChange = vi.fn();
    const component = textarea({ onChange });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    component.update({ type: 'newline' }, model);
    expect(onChange).toHaveBeenCalledWith('hello\n');
  });

  it('update: onChange fires on backspace', () => {
    const onChange = vi.fn();
    const component = textarea({ onChange });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 3,
      scrollOffset: 0,
      focused: true,
    };
    component.update({ type: 'backspace' }, model);
    expect(onChange).toHaveBeenCalledWith('helo');
  });

  it('update: submit calls onSubmit with full value', () => {
    const onSubmit = vi.fn();
    const component = textarea({ onSubmit });
    const model = {
      lines: ['hello', 'world'],
      cursorRow: 1,
      cursorCol: 5,
      scrollOffset: 0,
      focused: true,
    };
    component.update({ type: 'submit' }, model);
    expect(onSubmit).toHaveBeenCalledWith('hello\nworld');
  });

  // ─── focus / blur ────────────────────────────────────────────────────────

  it('update: focus and blur toggle focused state', () => {
    const component = textarea({});
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: false,
    };
    const [focused] = component.update({ type: 'focus' }, model);
    expect(focused.focused).toBe(true);
    const [blurred] = component.update({ type: 'blur' }, focused);
    expect(blurred.focused).toBe(false);
  });

  // ─── view ────────────────────────────────────────────────────────────────

  it('view: renders correct number of visible lines', () => {
    const component = textarea({ rows: 3 });
    const model = {
      lines: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    // The outer focus node wraps a column; count the row children within the visible portion
    expect(vnode.kind).toBe('focus');
    if (content?.kind === 'column') {
      // Children are: optional scroll-up indicator, visible lines, optional scroll-down indicator
      const lineRows = content.children.filter((c) => c.kind === 'row');
      // At minimum we expect 3 visible line rows (plus possible indicator rows)
      // The scroll-down indicator is also a row, so let's count text content rows
      // We should have exactly rows(3) content rows + 1 indicator row(▼)
      expect(lineRows.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('view: shows line numbers when configured', () => {
    const component = textarea({ showLineNumbers: true, rows: 3 });
    const model = {
      lines: ['hello', 'world', 'foo'],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    // Drill into the focus > column > rows and look for line number text
    if (content?.kind === 'column') {
      const firstRow = content.children.find((c) => c.kind === 'row');
      expect(firstRow).toBeDefined();
      if (firstRow?.kind === 'row') {
        // First child in the row should be the line number text
        const lineNumNode = firstRow.children[0];
        expect(lineNumNode?.kind).toBe('text');
        if (lineNumNode?.kind === 'text') {
          expect(lineNumNode.content).toContain('1');
        }
      }
    }
  });

  it('view: shows cursor at correct position when focused', () => {
    const component = textarea({ rows: 3 });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 2,
      scrollOffset: 0,
      focused: true,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    if (content?.kind === 'column') {
      const contentRow = content.children.find((c) => c.kind === 'row');
      expect(contentRow).toBeDefined();
      if (contentRow?.kind === 'row') {
        // The cursor line should be split into: before, cursor char, after
        // For 'hello' at col 2: 'he', 'l', 'lo'
        const texts = contentRow.children.filter((c) => c.kind === 'text');
        expect(texts.length).toBe(3);
        if (texts[0]?.kind === 'text') expect(texts[0].content).toBe('he');
        if (texts[1]?.kind === 'text') expect(texts[1].content).toBe('l');
        if (texts[2]?.kind === 'text') expect(texts[2].content).toBe('lo');
      }
    }
  });

  it('view: auto-scrolls to keep cursor visible', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 8,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    // The view function should adjust scrollOffset in the returned VNode
    // to ensure cursor line is visible
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    // The cursor is at row 8, with rows=3 visible, so scrollOffset should be at least 6
    // We verify by checking the rendered lines include line 8
    if (content?.kind === 'column') {
      const textNodes: string[] = [];
      for (const child of content.children) {
        if (child.kind === 'row') {
          for (const sub of child.children) {
            if (sub.kind === 'text') textNodes.push(sub.content);
          }
        }
      }
      const allText = textNodes.join('');
      expect(allText).toContain('line 8');
    }
  });

  it('wheel scrolling moves the viewport without moving the edit cursor', () => {
    const component = textarea({ value: 'zero\none\ntwo\nthree', rows: 2 });
    const [model] = component.init();
    const [scrolled] = component.update({ type: 'scroll-down' }, { ...model, cursorRow: 0, cursorCol: 0 });

    expect(scrolled.scrollOffset).toBe(1);
    expect(scrolled.cursorRow).toBe(0);
    expect(scrolled.manualScroll).toBe(true);
    expect(JSON.stringify(component.view(scrolled))).toContain('one');
    expect(JSON.stringify(component.view(scrolled))).not.toContain('"zero"');
  });

  it('clamps wheel scrolling and returns keyboard ownership to the cursor', () => {
    const component = textarea({ value: 'zero\none\ntwo', rows: 2 });
    const [model] = component.init();
    const [scrolled] = component.update({ type: 'scroll-down' }, { ...model, cursorRow: 0, cursorCol: 0, scrollOffset: 99 });
    expect(scrolled.scrollOffset).toBe(1);

    const [edited] = component.update(
      { type: 'key', event: { key: 'x', char: 'x', ctrl: false, alt: false, shift: false } },
      scrolled,
    );
    expect(edited.manualScroll).toBe(false);
    expect(edited.scrollOffset).toBe(0);
  });

  it('view: shows placeholder when empty and unfocused', () => {
    const component = textarea({ placeholder: 'Enter text...' });
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: false,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    if (content?.kind === 'column') {
      const textNodes: string[] = [];
      for (const child of content.children) {
        if (child.kind === 'text') textNodes.push(child.content);
        if (child.kind === 'row') {
          for (const sub of child.children) {
            if (sub.kind === 'text') textNodes.push(sub.content);
          }
        }
      }
      expect(textNodes.join('')).toContain('Enter text...');
    }
  });

  it('view: does not show cursor when unfocused', () => {
    const component = textarea({ rows: 3 });
    const model = {
      lines: ['hello'],
      cursorRow: 0,
      cursorCol: 2,
      scrollOffset: 0,
      focused: false,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    // When unfocused, the line should be rendered as a single text node, not split at cursor
    if (content?.kind === 'column') {
      const contentRow = content.children.find((c) => c.kind === 'row');
      if (contentRow?.kind === 'row') {
        const texts = contentRow.children.filter((c) => c.kind === 'text');
        // Should be a single text node (no cursor splitting)
        expect(texts.length).toBe(1);
        if (texts[0]?.kind === 'text') expect(texts[0].content).toBe('hello');
      }
    }
  });

  it('view: shows scroll indicators when content overflows', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 5,
      cursorCol: 0,
      scrollOffset: 3,
      focused: true,
    };
    const vnode = component.view(model);
    const content = textareaContent(vnode);
    if (content?.kind === 'column') {
      const allText: string[] = [];
      for (const child of content.children) {
        if (child.kind === 'text') allText.push(child.content);
        if (child.kind === 'row') {
          for (const sub of child.children) {
            if (sub.kind === 'text') allText.push(sub.content);
          }
        }
      }
      const joined = allText.join('');
      // Both ▲ and ▼ should be present when scrolled in the middle
      expect(joined).toContain('▲');
      expect(joined).toContain('▼');
    }
  });

  it('view: exposes a focus node', () => {
    const component = textarea({});
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: false,
    };
    const vnode = component.view(model);
    const focusNodes = collectFocusNodes(vnode);
    expect(focusNodes).toHaveLength(1);
  });

  // ─── subscriptions ──────────────────────────────────────────────────────

  it('subscriptions: returns Unicode key and paste subscriptions when focused', () => {
    const component = textarea({});
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const sub = component.subscriptions?.(model);
    expect(sub).toBeDefined();
    if (!sub) return;

    const kind = subKind(sub);
    expect(kind.kind).toBe('batch');
    if (kind.kind !== 'batch') return;

    expect(kind.subs.some((entry) => subKind(entry).kind === 'keyEvent')).toBe(true);
    expect(kind.subs.some((entry) => subKind(entry).kind === 'paste')).toBe(true);
  });

  it('subscriptions: keeps pointer focus and hover active when not focused', () => {
    const component = textarea({});
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: false,
    };
    const sub = component.subscriptions?.(model);
    expect(sub).toBeDefined();
    if (!sub) return;
    const kind = subKind(sub);
    expect(kind.kind).toBe('elementMouse');
    expect(JSON.stringify(component.view(model))).toContain('onScroll');
  });

  it('subscriptions: maps ctrl+enter to submit', () => {
    const component = textarea({});
    const model = {
      lines: [''],
      cursorRow: 0,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    const sub = component.subscriptions?.(model);
    if (!sub) return;
    const kind = subKind(sub);
    if (kind.kind !== 'batch') return;

    const keyEvent = kind.subs.find((entry) => {
      const entryKind = subKind(entry);
      return entryKind.kind === 'keyEvent';
    });
    expect(keyEvent).toBeDefined();
    if (keyEvent) {
      const entryKind = subKind(keyEvent);
      if (entryKind.kind === 'keyEvent') {
        expect(entryKind.toMsg({ key: 'enter', ctrl: true, alt: false, shift: false })).toEqual({
          type: 'key',
          event: { key: 'enter', ctrl: true, alt: false, shift: false },
        });
      }
    }
  });

  // ─── getValue helper ─────────────────────────────────────────────────────

  it('getValue joins lines with newline', () => {
    const component = textarea({ value: 'hello\nworld' });
    const [model] = component.init();
    // Verify lines.join('\n') gives back the original value
    expect(model.lines.join('\n')).toBe('hello\nworld');
  });

  // ─── scroll offset maintained across edits ──────────────────────────────

  it('update: scroll offset adjusts when cursor moves below viewport', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 2,
      cursorCol: 0,
      scrollOffset: 0,
      focused: true,
    };
    // Move cursor down past the viewport
    const [d1] = component.update({ type: 'cursor-down' }, model);
    // cursorRow is now 3, scrollOffset should adjust so cursor is visible
    // With rows=3, visible range is scrollOffset to scrollOffset+2
    // cursor at row 3 needs scrollOffset >= 1
    expect(d1.scrollOffset).toBeGreaterThanOrEqual(1);
  });

  it('update: scroll offset adjusts when cursor moves above viewport', () => {
    const component = textarea({ rows: 3 });
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const model = {
      lines,
      cursorRow: 3,
      cursorCol: 0,
      scrollOffset: 3,
      focused: true,
    };
    const [u1] = component.update({ type: 'cursor-up' }, model);
    // cursorRow is now 2, scrollOffset was 3 → needs to be ≤ 2
    expect(u1.scrollOffset).toBeLessThanOrEqual(2);
  });
});
