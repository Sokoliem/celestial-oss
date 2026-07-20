import { collectFocusNodes, subKind, type VNode } from '@celestial/core/nebula';
import { describe, expect, it, vi } from 'vitest';
import { textInput } from '../text-input.js';

function inputContent(node: VNode): VNode | null {
  if (node.kind !== 'focus') return null;
  return node.child.kind === 'event' ? node.child.child : node.child;
}

describe('textInput', () => {
  it('init returns empty model with cursor at 0', () => {
    const component = textInput({});
    const [model] = component.init();
    expect(model.value).toBe('');
    expect(model.cursor).toBe(0);
    expect(model.focused).toBe(false);
  });

  it('init returns provided value with cursor at end', () => {
    const component = textInput({ value: 'hello' });
    const [model] = component.init();
    expect(model.value).toBe('hello');
    expect(model.cursor).toBe(5);
  });

  it('update handles character input', () => {
    const component = textInput({});
    const [model] = component.init();
    const [updated] = component.update({ type: 'char', char: 'a' }, model);
    expect(updated.value).toBe('a');
    expect(updated.cursor).toBe(1);
  });

  it('update inserts character at cursor position', () => {
    const component = textInput({});
    const model = { value: 'hllo', cursor: 1, focused: true };
    const [updated] = component.update({ type: 'char', char: 'e' }, model);
    expect(updated.value).toBe('hello');
    expect(updated.cursor).toBe(2);
  });

  it('update handles backspace', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 5, focused: true };
    const [updated] = component.update({ type: 'backspace' }, model);
    expect(updated.value).toBe('hell');
    expect(updated.cursor).toBe(4);
  });

  it('update handles backspace at position 0 (no-op)', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 0, focused: true };
    const [updated] = component.update({ type: 'backspace' }, model);
    expect(updated.value).toBe('hello');
    expect(updated.cursor).toBe(0);
  });

  it('update handles delete', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 0, focused: true };
    const [updated] = component.update({ type: 'delete' }, model);
    expect(updated.value).toBe('ello');
    expect(updated.cursor).toBe(0);
  });

  it('update handles delete at end (no-op)', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 5, focused: true };
    const [updated] = component.update({ type: 'delete' }, model);
    expect(updated.value).toBe('hello');
  });

  it('update handles cursor-left', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 3, focused: true };
    const [updated] = component.update({ type: 'cursor-left' }, model);
    expect(updated.cursor).toBe(2);
  });

  it('update handles cursor-right', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 3, focused: true };
    const [updated] = component.update({ type: 'cursor-right' }, model);
    expect(updated.cursor).toBe(4);
  });

  it('update handles home', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 3, focused: true };
    const [updated] = component.update({ type: 'home' }, model);
    expect(updated.cursor).toBe(0);
  });

  it('update handles end', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 0, focused: true };
    const [updated] = component.update({ type: 'end' }, model);
    expect(updated.cursor).toBe(5);
  });

  it('view renders placeholder when empty and not focused', () => {
    const component = textInput({ placeholder: 'Type here...' });
    const model = { value: '', cursor: 0, focused: false };
    const vnode = component.view(model);
    expect(vnode.kind).toBe('focus');
    const content = inputContent(vnode);
    if (content?.kind === 'text') {
      expect(content.content).toBe('Type here...');
    }
  });

  it('view renders mask character for password', () => {
    const component = textInput({ mask: '*' });
    const model = { value: 'secret', cursor: 6, focused: true };
    const vnode = component.view(model);
    expect(vnode.kind).toBe('focus');
    const content = inputContent(vnode);
    if (content?.kind === 'row') {
      const firstChild = content.children[0];
      expect(firstChild?.kind).toBe('text');
      if (firstChild?.kind === 'text') {
        expect(firstChild.content).toBe('******');
      }
    }
  });

  it('should not show cursor indicator when unfocused', () => {
    // Bug: When unfocused and cursor is on a space, it renders '▏' instead of ' '.
    // When unfocused, cursor should not be rendered at all.
    const component = textInput({});
    const model = { value: 'a b', cursor: 1, focused: false };
    const vnode = component.view(model);
    const content = inputContent(vnode);
    // The view should render the text without any cursor indicator
    if (content?.kind === 'row') {
      const allContent = content.children
        .filter((c) => c.kind === 'text')
        .map((c) => (c.kind === 'text' ? c.content : ''))
        .join('');
      expect(allContent).not.toContain('▏');
    }
  });

  it('should show normal character at cursor position when unfocused', () => {
    const component = textInput({});
    const model = { value: 'hello', cursor: 2, focused: false };
    const vnode = component.view(model);
    const content = inputContent(vnode);
    // When unfocused, the char at cursor position should render normally without reverse style
    if (content?.kind === 'row') {
      // Check that no child has the cursor reverse style
      const cursorNodes = content.children.filter((c: any) => c.style?.reverse === true);
      expect(cursorNodes).toHaveLength(0);
    }
  });

  it('keeps pointer focus and hover subscriptions active while unfocused', () => {
    const component = textInput({ placeholder: 'Name' });
    const [model] = component.init();
    const sub = component.subscriptions?.(model);
    const kind = subKind(sub!);
    expect(kind.kind).toBe('batch');
    if (kind.kind === 'batch') {
      expect(kind.subs.some((entry) => subKind(entry).kind === 'elementMouse')).toBe(true);
      expect(kind.subs.some((entry) => subKind(entry).kind === 'layout')).toBe(true);
    }

    const [hovered] = component.update({ type: 'hover' }, model);
    expect(hovered.hovered).toBe(true);
    const [focused] = component.update({ type: 'focus' }, hovered);
    expect(focused.focused).toBe(true);
  });

  it('exposes a stable focus node even when unfocused', () => {
    const component = textInput({});
    const vnode = component.view({ value: '', cursor: 0, focused: false });
    const focusNodes = collectFocusNodes(vnode);

    expect(vnode.kind).toBe('focus');
    expect(focusNodes).toHaveLength(1);
    expect(focusNodes[0]?.echoHint).toBeUndefined();
  });

  it('calls onChange callback on character input', () => {
    const onChange = vi.fn();
    const component = textInput({ onChange });
    const model = { value: 'hel', cursor: 3, focused: true };
    component.update({ type: 'char', char: 'l' }, model);
    expect(onChange).toHaveBeenCalledWith('hell');
  });

  it('calls onSubmit callback', () => {
    const onSubmit = vi.fn();
    const component = textInput({ onSubmit });
    const model = { value: 'hello', cursor: 5, focused: true };
    component.update({ type: 'submit' }, model);
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('subscribes to Unicode key events and bracketed paste when focused', () => {
    const component = textInput({});
    const sub = component.subscriptions?.({ value: '', cursor: 0, focused: true });
    expect(sub).toBeDefined();
    if (!sub) {
      return;
    }

    const kind = subKind(sub);

    expect(kind.kind).toBe('batch');
    if (kind.kind !== 'batch') {
      return;
    }

    expect(kind.subs.some((entry) => subKind(entry).kind === 'keyEvent')).toBe(true);
    expect(kind.subs.some((entry) => subKind(entry).kind === 'paste')).toBe(true);
  });

  it('exposes an echo hint on the focused input node', () => {
    const component = textInput({ mask: '*' });
    const vnode = component.view({ value: 'secret', cursor: 3, focused: true });
    const focusNodes = collectFocusNodes(vnode);

    expect(focusNodes).toHaveLength(1);
    expect(focusNodes[0]?.echoHint).toEqual({
      kind: 'text-input',
      value: 'secret',
      cursor: 3,
      mask: '*',
    });
  });
});
