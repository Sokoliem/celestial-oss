import { extractNodeText, subKind, type VNode } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { numberInput } from '../number-input.js';

function findText(node: VNode, content: string): Extract<VNode, { kind: 'text' }> | undefined {
  if (node.kind === 'text') return node.content.includes(content) ? node : undefined;
  if ('child' in node && node.child) return findText(node.child, content);
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findText(child, content);
      if (found) return found;
    }
  }
  return undefined;
}

describe('numberInput', () => {
  // ─── Init ──────────────────────────────────────────────────────────────────

  it('init: default value is 0, not editing, not focused', () => {
    const comp = numberInput({});
    const [model] = comp.init();
    expect(model.value).toBe(0);
    expect(model.editing).toBe(false);
    expect(model.buffer).toBe('');
    expect(model.focused).toBe(false);
  });

  it('init: uses custom value', () => {
    const comp = numberInput({ value: 42 });
    const [model] = comp.init();
    expect(model.value).toBe(42);
  });

  it('init: clamps value to min/max range', () => {
    const comp = numberInput({ value: 200, min: 0, max: 100 });
    const [model] = comp.init();
    expect(model.value).toBe(100);
  });

  it('init: clamps value below min', () => {
    const comp = numberInput({ value: -10, min: 0, max: 100 });
    const [model] = comp.init();
    expect(model.value).toBe(0);
  });

  // ─── Update: increment/decrement ──────────────────────────────────────────

  it('update: increment increases value by step', () => {
    const comp = numberInput({ step: 5 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'increment' }, model);
    expect(updated.value).toBe(5);
  });

  it('update: decrement decreases value by step', () => {
    const comp = numberInput({ value: 10, step: 3 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'decrement' }, model);
    expect(updated.value).toBe(7);
  });

  it('update: increment does not exceed max', () => {
    const comp = numberInput({ value: 98, max: 100, step: 5 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'increment' }, model);
    expect(updated.value).toBe(100);
  });

  it('update: decrement does not go below min', () => {
    const comp = numberInput({ value: 2, min: 0, step: 5 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'decrement' }, model);
    expect(updated.value).toBe(0);
  });

  it('update: increment-large increases by step * 10', () => {
    const comp = numberInput({ value: 0, step: 2 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'increment-large' }, model);
    expect(updated.value).toBe(20);
  });

  it('update: decrement-large decreases by step * 10', () => {
    const comp = numberInput({ value: 50, step: 3 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'decrement-large' }, model);
    expect(updated.value).toBe(20);
  });

  it('update: increment-large clamps to max', () => {
    const comp = numberInput({ value: 95, max: 100, step: 1 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'increment-large' }, model);
    expect(updated.value).toBe(100);
  });

  // ─── Update: set-min / set-max ────────────────────────────────────────────

  it('update: set-min jumps to min', () => {
    const comp = numberInput({ value: 50, min: 10 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'set-min' }, model);
    expect(updated.value).toBe(10);
  });

  it('update: set-max jumps to max', () => {
    const comp = numberInput({ value: 50, max: 100 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'set-max' }, model);
    expect(updated.value).toBe(100);
  });

  it('update: set-min is no-op when min is -Infinity', () => {
    const comp = numberInput({ value: 50 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'set-min' }, model);
    // Without a finite min, value should stay unchanged
    expect(updated.value).toBe(50);
  });

  it('update: set-max is no-op when max is Infinity', () => {
    const comp = numberInput({ value: 50 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'set-max' }, model);
    // Without a finite max, value should stay unchanged
    expect(updated.value).toBe(50);
  });

  // ─── Update: edit mode ────────────────────────────────────────────────────

  it('update: start-edit enters editing mode with buffer from current value', () => {
    const comp = numberInput({ value: 42 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'start-edit' }, model);
    expect(updated.editing).toBe(true);
    expect(updated.buffer).toBe('42');
  });

  it('update: start-edit formats buffer with precision', () => {
    const comp = numberInput({ value: 1.5, step: 0.01 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'start-edit' }, model);
    expect(updated.editing).toBe(true);
    expect(updated.buffer).toBe('1.50');
  });

  it('update: char appends digit to buffer', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '4', focused: true };
    const [updated] = comp.update({ type: 'char', char: '2' }, model);
    expect(updated.buffer).toBe('42');
  });

  it('update: char allows dot in buffer', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '3', focused: true };
    const [updated] = comp.update({ type: 'char', char: '.' }, model);
    expect(updated.buffer).toBe('3.');
  });

  it('update: char allows minus sign at start', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '', focused: true };
    const [updated] = comp.update({ type: 'char', char: '-' }, model);
    expect(updated.buffer).toBe('-');
  });

  it('update: char rejects non-numeric characters', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '42', focused: true };
    const [updated] = comp.update({ type: 'char', char: 'a' }, model);
    expect(updated.buffer).toBe('42');
  });

  it('update: char rejects second dot', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '3.1', focused: true };
    const [updated] = comp.update({ type: 'char', char: '.' }, model);
    expect(updated.buffer).toBe('3.1');
  });

  it('update: char rejects minus not at start', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '42', focused: true };
    const [updated] = comp.update({ type: 'char', char: '-' }, model);
    expect(updated.buffer).toBe('42');
  });

  it('update: backspace removes last char from buffer', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '42', focused: true };
    const [updated] = comp.update({ type: 'backspace' }, model);
    expect(updated.buffer).toBe('4');
  });

  it('update: backspace on empty buffer is no-op', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '', focused: true };
    const [updated] = comp.update({ type: 'backspace' }, model);
    expect(updated.buffer).toBe('');
  });

  // ─── Update: commit / cancel ──────────────────────────────────────────────

  it('update: commit parses buffer, clamps, and calls onChange', () => {
    const onChange = vi.fn();
    const comp = numberInput({ min: 0, max: 100, onChange });
    const model = { value: 50, editing: true, buffer: '75', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    expect(updated.value).toBe(75);
    expect(updated.editing).toBe(false);
    expect(updated.buffer).toBe('');
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('update: commit clamps value exceeding max', () => {
    const onChange = vi.fn();
    const comp = numberInput({ min: 0, max: 100, onChange });
    const model = { value: 50, editing: true, buffer: '150', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    expect(updated.value).toBe(100);
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('update: commit with invalid buffer reverts to previous value', () => {
    const onChange = vi.fn();
    const comp = numberInput({ onChange });
    const model = { value: 42, editing: true, buffer: 'abc', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    expect(updated.value).toBe(42);
    expect(updated.editing).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('update: commit with empty buffer reverts to previous value', () => {
    const comp = numberInput({});
    const model = { value: 42, editing: true, buffer: '', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    expect(updated.value).toBe(42);
    expect(updated.editing).toBe(false);
  });

  it('update: cancel-edit discards buffer and exits edit mode', () => {
    const comp = numberInput({});
    const model = { value: 42, editing: true, buffer: '999', focused: true };
    const [updated] = comp.update({ type: 'cancel-edit' }, model);
    expect(updated.editing).toBe(false);
    expect(updated.buffer).toBe('');
    expect(updated.value).toBe(42);
  });

  // ─── Update: focus / blur ─────────────────────────────────────────────────

  it('update: focus sets focused to true', () => {
    const comp = numberInput({});
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'focus' }, model);
    expect(updated.focused).toBe(true);
  });

  it('update: blur sets focused to false and cancels editing', () => {
    const comp = numberInput({});
    const model = { value: 42, editing: true, buffer: '99', focused: true };
    const [updated] = comp.update({ type: 'blur' }, model);
    expect(updated.focused).toBe(false);
    expect(updated.editing).toBe(false);
    expect(updated.buffer).toBe('');
  });

  // ─── Update: precision ────────────────────────────────────────────────────

  it('update: increment respects precision from step', () => {
    const comp = numberInput({ value: 0.1, step: 0.1 });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'increment' }, model);
    expect(updated.value).toBeCloseTo(0.2, 10);
  });

  it('update: increment calls onChange', () => {
    const onChange = vi.fn();
    const comp = numberInput({ value: 10, step: 1, onChange });
    const [model] = comp.init();
    comp.update({ type: 'increment' }, model);
    expect(onChange).toHaveBeenCalledWith(11);
  });

  // ─── View ─────────────────────────────────────────────────────────────────

  it('view: renders formatted value with prefix and suffix', () => {
    const comp = numberInput({ value: 50, prefix: '$', suffix: '%' });
    const [model] = comp.init();
    const vnode = comp.view({ ...model, focused: true });
    // Should produce a row containing text nodes
    expect(vnode.kind).toBe('row');
    if (vnode.kind === 'row') {
      const fullText = extractNodeText(vnode);
      expect(fullText).toContain('$');
      expect(fullText).toContain('50');
      expect(fullText).toContain('%');
    }
  });

  it('view: renders down/up indicators', () => {
    const comp = numberInput({ value: 50, min: 0, max: 100 });
    const [model] = comp.init();
    const vnode = comp.view({ ...model, focused: true });
    if (vnode.kind === 'row') {
      const fullText = extractNodeText(vnode);
      expect(fullText).toMatch(/[▼\u25BC]/);
      expect(fullText).toMatch(/[▲\u25B2]/);
    }
  });

  it('view: dims down indicator when at min', () => {
    const comp = numberInput({ value: 0, min: 0, max: 100 });
    const model = { value: 0, editing: false, buffer: '', focused: true };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      // Find the down arrow node and check it has dim styling
      const downNode = findText(vnode, '\u25BC');
      expect(downNode).toBeDefined();
      if (downNode && downNode.kind === 'text') {
        expect(downNode.style?.dim).toBe(true);
      }
    }
  });

  it('view: dims up indicator when at max', () => {
    const comp = numberInput({ value: 100, min: 0, max: 100 });
    const model = { value: 100, editing: false, buffer: '', focused: true };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const upNode = findText(vnode, '\u25B2');
      expect(upNode).toBeDefined();
      if (upNode && upNode.kind === 'text') {
        expect(upNode.style?.dim).toBe(true);
      }
    }
  });

  it('view: shows buffer text in edit mode', () => {
    const comp = numberInput({ value: 50 });
    const model = { value: 50, editing: true, buffer: '123', focused: true };
    const vnode = comp.view(model);
    if (vnode.kind === 'row') {
      const texts = vnode.children.filter((c: any) => c.kind === 'text').map((c: any) => c.content);
      const fullText = texts.join('');
      expect(fullText).toContain('123');
    }
  });

  it('view: renders label when provided', () => {
    const comp = numberInput({ value: 5, label: 'Volume' });
    const [model] = comp.init();
    const vnode = comp.view({ ...model, focused: true });
    if (vnode.kind === 'row') {
      const texts = vnode.children.filter((c: any) => c.kind === 'text').map((c: any) => c.content);
      const fullText = texts.join('');
      expect(fullText).toContain('Volume');
    }
  });

  // ─── Subscriptions ────────────────────────────────────────────────────────

  it('subscriptions: keeps pointer controls active when unfocused', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: false, buffer: '', focused: false };
    const sub = comp.subscriptions?.(model);
    expect(sub).toBeDefined();
    if (sub) {
      const kind = subKind(sub);
      expect(kind.kind).toBe('elementMouse');
    }
  });

  it('subscriptions: includes arrow keys in normal mode when focused', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: false, buffer: '', focused: true };
    const sub = comp.subscriptions?.(model);
    expect(sub).toBeDefined();
    if (!sub) return;

    const kind = subKind(sub);
    expect(kind.kind).toBe('batch');
    if (kind.kind !== 'batch') return;

    const keyNames = kind.subs.map((s) => {
      const k = subKind(s);
      return k.kind === 'key' ? k.key : null;
    });
    expect(keyNames).toContain('up');
    expect(keyNames).toContain('down');
    expect(keyNames).toContain('pageup');
    expect(keyNames).toContain('pagedown');
    expect(keyNames).toContain('home');
    expect(keyNames).toContain('end');
    expect(keyNames).toContain('enter');
  });

  it('subscriptions: includes digit keys in edit mode when focused', () => {
    const comp = numberInput({});
    const model = { value: 0, editing: true, buffer: '', focused: true };
    const sub = comp.subscriptions?.(model);
    expect(sub).toBeDefined();
    if (!sub) return;

    const kind = subKind(sub);
    expect(kind.kind).toBe('batch');
    if (kind.kind !== 'batch') return;

    // Should have digit bindings
    const charBindings = kind.subs.flatMap((entry) => {
      const k = subKind(entry);
      if (k.kind !== 'key' || (k.msg as any).type !== 'char') return [];
      return [(k.msg as any).char];
    });
    expect(charBindings).toContain('0');
    expect(charBindings).toContain('9');
    expect(charBindings).toContain('.');
    expect(charBindings).toContain('-');

    // Should also have escape and enter for commit/cancel
    const keyNames = kind.subs.map((s) => {
      const k = subKind(s);
      return k.kind === 'key' ? k.key : null;
    });
    expect(keyNames).toContain('escape');
    expect(keyNames).toContain('enter');
    expect(keyNames).toContain('backspace');
  });

  // ─── Step snapping ────────────────────────────────────────────────────────

  it('update: commit snaps value to step', () => {
    const comp = numberInput({ step: 5, min: 0, max: 100 });
    const model = { value: 0, editing: true, buffer: '13', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    // 13 snapped to step 5 from min 0: nearest is 15
    expect(updated.value).toBe(15);
  });

  it('update: commit snaps fractional step correctly', () => {
    const comp = numberInput({ step: 0.25, min: 0, max: 10 });
    const model = { value: 0, editing: true, buffer: '3.3', focused: true };
    const [updated] = comp.update({ type: 'commit' }, model);
    // 3.3 snapped to step 0.25 from min 0: nearest is 3.25
    expect(updated.value).toBe(3.25);
  });

  it('normalizes malformed ranges, steps, precision, and model values', () => {
    const comp = numberInput({ min: 10, max: -10, step: 0, precision: Number.POSITIVE_INFINITY, value: Number.NaN });
    const [model] = comp.init();
    expect(model.value).toBe(0);
    expect(() => comp.view({ ...model, value: Number.POSITIVE_INFINITY })).not.toThrow();
  });

  it('does not notify when an increment is already clamped', () => {
    const onChange = vi.fn();
    const comp = numberInput({ min: 0, max: 1, value: 1, onChange });
    comp.update({ type: 'increment' }, comp.init()[0]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
