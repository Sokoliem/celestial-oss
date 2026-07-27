import { describe, expect, it, vi } from 'vitest';
import type { TagInputModel, TagInputMsg } from '../tag-input.js';
import { tagInput, tagInputHitTest } from '../tag-input.js';

/* ── helpers ─────────────────────────────────────────────────── */

function initModel(cfg: Parameters<typeof tagInput>[0] = {}): [ReturnType<typeof tagInput>, TagInputModel] {
  const comp = tagInput(cfg);
  const [model] = comp.init();
  return [comp, model];
}

/* ── init ────────────────────────────────────────────────────── */

describe('tagInput – init', () => {
  it('returns empty tags by default', () => {
    const [, model] = initModel();
    expect(model.tags).toEqual([]);
  });

  it('accepts initial tags from config', () => {
    const [, model] = initModel({ tags: ['foo', 'bar'] });
    expect(model.tags).toEqual(['foo', 'bar']);
  });

  it('does not alias the config tags array', () => {
    const original = ['a', 'b'];
    const [, model] = initModel({ tags: original });
    model.tags.push('c');
    expect(original).toEqual(['a', 'b']);
  });

  it('sets correct model defaults', () => {
    const [, model] = initModel();
    expect(model.inputBuffer).toBe('');
    expect(model.cursorPos).toBe(0);
    expect(model.highlightedTag).toBe(-1);
    expect(model.focused).toBe(false);
  });

  it('returns Cmd.none()', () => {
    const comp = tagInput({});
    const [, cmd] = comp.init();
    expect(cmd._kind.kind).toBe('none');
  });
});

/* ── update – text editing ───────────────────────────────────── */

describe('tagInput – update – text editing', () => {
  it('insert-char appends character at cursor', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    expect(m1.inputBuffer).toBe('a');
    expect(m1.cursorPos).toBe(1);
  });

  it('insert-char inserts at cursor position', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'move-left' }, m2); // cursor between a and b
    const [m4] = comp.update({ type: 'insert-char', char: 'X' }, m3);
    expect(m4.inputBuffer).toBe('aXb');
    expect(m4.cursorPos).toBe(2);
  });

  it('backspace removes character before cursor', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'backspace' }, m2);
    expect(m3.inputBuffer).toBe('a');
    expect(m3.cursorPos).toBe(1);
  });

  it('backspace does nothing when cursor is at start with text', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'home' }, m1);
    const [m3] = comp.update({ type: 'backspace' }, m2);
    expect(m3.inputBuffer).toBe('a');
    expect(m3.cursorPos).toBe(0);
  });

  it('delete-char removes character at cursor', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'home' }, m2);
    const [m4] = comp.update({ type: 'delete-char' }, m3);
    expect(m4.inputBuffer).toBe('b');
    expect(m4.cursorPos).toBe(0);
  });

  it('delete-char does nothing when cursor is at end', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'delete-char' }, m1);
    expect(m2.inputBuffer).toBe('a');
    expect(m2.cursorPos).toBe(1);
  });

  it('move-left decrements cursor', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'move-left' }, m2);
    expect(m3.cursorPos).toBe(1);
  });

  it('move-left clamps at 0', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'move-left' }, m);
    expect(m1.cursorPos).toBe(0);
  });

  it('move-right increments cursor', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'move-left' }, m1);
    const [m3] = comp.update({ type: 'move-right' }, m2);
    expect(m3.cursorPos).toBe(1);
  });

  it('move-right clamps at end of buffer', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'move-right' }, m1);
    expect(m2.cursorPos).toBe(1);
  });

  it('home moves cursor to 0', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'home' }, m2);
    expect(m3.cursorPos).toBe(0);
  });

  it('end moves cursor to buffer length', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'b' }, m1);
    const [m3] = comp.update({ type: 'home' }, m2);
    const [m4] = comp.update({ type: 'end' }, m3);
    expect(m4.cursorPos).toBe(2);
  });

  it('all editing messages return Cmd.none()', () => {
    const [comp, m] = initModel();
    const msgs: TagInputMsg[] = [
      { type: 'insert-char', char: 'x' },
      { type: 'backspace' },
      { type: 'delete-char' },
      { type: 'move-left' },
      { type: 'move-right' },
      { type: 'home' },
      { type: 'end' },
    ];
    for (const msg of msgs) {
      const [, cmd] = comp.update(msg, m);
      expect(cmd._kind.kind).toBe('none');
    }
  });
});

/* ── update – tag management ─────────────────────────────────── */

describe('tagInput – update – tag management', () => {
  it('commit-tag adds trimmed text as a new tag', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'f' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'o' }, m1);
    const [m3] = comp.update({ type: 'insert-char', char: 'o' }, m2);
    const [m4] = comp.update({ type: 'commit-tag' }, m3);
    expect(m4.tags).toEqual(['foo']);
    expect(m4.inputBuffer).toBe('');
    expect(m4.cursorPos).toBe(0);
  });

  it('commit-tag calls onChange with updated tags', () => {
    const onChange = vi.fn();
    const [comp, m] = initModel({ onChange });
    const [m1] = comp.update({ type: 'insert-char', char: 'a' }, m);
    comp.update({ type: 'commit-tag' }, m1);
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('commit-tag rejects duplicate tags', () => {
    const [comp, m] = initModel({ tags: ['foo'] });
    const [m1] = comp.update({ type: 'insert-char', char: 'f' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: 'o' }, m1);
    const [m3] = comp.update({ type: 'insert-char', char: 'o' }, m2);
    const [m4] = comp.update({ type: 'commit-tag' }, m3);
    expect(m4.tags).toEqual(['foo']);
    expect(m4.inputBuffer).toBe('foo');
  });

  it('commit-tag rejects when at maxTags', () => {
    const [comp, m] = initModel({ tags: ['a', 'b'], maxTags: 2 });
    const [m1] = comp.update({ type: 'insert-char', char: 'c' }, m);
    const [m2] = comp.update({ type: 'commit-tag' }, m1);
    expect(m2.tags).toEqual(['a', 'b']);
    expect(m2.inputBuffer).toBe('c');
  });

  it('commit-tag rejects empty input', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'commit-tag' }, m);
    expect(m1.tags).toEqual([]);
  });

  it('commit-tag rejects whitespace-only input', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: ' ' }, m);
    const [m2] = comp.update({ type: 'insert-char', char: ' ' }, m1);
    const [m3] = comp.update({ type: 'commit-tag' }, m2);
    expect(m3.tags).toEqual([]);
  });

  it('commit-tag returns Cmd.none()', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'insert-char', char: 'x' }, m);
    const [, cmd] = comp.update({ type: 'commit-tag' }, m1);
    expect(cmd._kind.kind).toBe('none');
  });
});

/* ── update – tag removal ────────────────────────────────────── */

describe('tagInput – update – tag removal', () => {
  it('remove-tag removes the tag at index and calls onChange', () => {
    const onChange = vi.fn();
    const [comp, m] = initModel({ tags: ['a', 'b', 'c'], onChange });
    const [m1] = comp.update({ type: 'remove-tag', index: 1 }, m);
    expect(m1.tags).toEqual(['a', 'c']);
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
  });

  it('remove-tag ignores negative index', () => {
    const [comp, m] = initModel({ tags: ['a'] });
    const [m1] = comp.update({ type: 'remove-tag', index: -1 }, m);
    expect(m1.tags).toEqual(['a']);
  });

  it('remove-tag ignores out-of-bounds index', () => {
    const [comp, m] = initModel({ tags: ['a'] });
    const [m1] = comp.update({ type: 'remove-tag', index: 5 }, m);
    expect(m1.tags).toEqual(['a']);
  });

  it('backspace on empty buffer highlights last tag', () => {
    const [comp, m] = initModel({ tags: ['a', 'b'] });
    const [m1] = comp.update({ type: 'backspace' }, m);
    expect(m1.highlightedTag).toBe(1);
    expect(m1.tags).toEqual(['a', 'b']);
  });

  it('second backspace on empty buffer removes the highlighted tag', () => {
    const onChange = vi.fn();
    const [comp, m] = initModel({ tags: ['a', 'b'], onChange });
    const [m1] = comp.update({ type: 'backspace' }, m);
    expect(m1.highlightedTag).toBe(1);
    const [m2] = comp.update({ type: 'backspace' }, m1);
    expect(m2.tags).toEqual(['a']);
    expect(m2.highlightedTag).toBe(-1);
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('backspace on empty buffer with no tags does nothing', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'backspace' }, m);
    expect(m1.tags).toEqual([]);
    expect(m1.highlightedTag).toBe(-1);
  });
});

/* ── update – highlighting ───────────────────────────────────── */

describe('tagInput – update – highlighting', () => {
  it('highlight-tag-left wraps from 0 to last tag', () => {
    const [comp, m] = initModel({ tags: ['a', 'b', 'c'] });
    const m0 = { ...m, highlightedTag: 0 };
    const [m1] = comp.update({ type: 'highlight-tag-left' }, m0);
    expect(m1.highlightedTag).toBe(2);
  });

  it('highlight-tag-left moves left', () => {
    const [comp, m] = initModel({ tags: ['a', 'b', 'c'] });
    const m0 = { ...m, highlightedTag: 2 };
    const [m1] = comp.update({ type: 'highlight-tag-left' }, m0);
    expect(m1.highlightedTag).toBe(1);
  });

  it('highlight-tag-right wraps from last to 0', () => {
    const [comp, m] = initModel({ tags: ['a', 'b', 'c'] });
    const m0 = { ...m, highlightedTag: 2 };
    const [m1] = comp.update({ type: 'highlight-tag-right' }, m0);
    expect(m1.highlightedTag).toBe(0);
  });

  it('highlight-tag-right moves right', () => {
    const [comp, m] = initModel({ tags: ['a', 'b', 'c'] });
    const m0 = { ...m, highlightedTag: 0 };
    const [m1] = comp.update({ type: 'highlight-tag-right' }, m0);
    expect(m1.highlightedTag).toBe(1);
  });

  it('highlight-tag-left does nothing with no tags', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'highlight-tag-left' }, m);
    expect(m1.highlightedTag).toBe(-1);
  });

  it('highlight-tag-right does nothing with no tags', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'highlight-tag-right' }, m);
    expect(m1.highlightedTag).toBe(-1);
  });

  it('insert-char clears highlighted tag', () => {
    const [comp, m] = initModel({ tags: ['a', 'b'] });
    const [m1] = comp.update({ type: 'backspace' }, m);
    expect(m1.highlightedTag).toBe(1);
    const [m2] = comp.update({ type: 'insert-char', char: 'x' }, m1);
    expect(m2.highlightedTag).toBe(-1);
  });
});

/* ── update – focus / blur ───────────────────────────────────── */

describe('tagInput – update – focus / blur', () => {
  it('focus sets focused to true', () => {
    const [comp, m] = initModel();
    const [m1] = comp.update({ type: 'focus' }, m);
    expect(m1.focused).toBe(true);
  });

  it('blur sets focused to false and clears highlight', () => {
    const [comp, m] = initModel({ tags: ['a'] });
    const m0 = { ...m, focused: true, highlightedTag: 0 };
    const [m1] = comp.update({ type: 'blur' }, m0);
    expect(m1.focused).toBe(false);
    expect(m1.highlightedTag).toBe(-1);
  });
});

/* ── view ────────────────────────────────────────────────────── */

describe('tagInput – view', () => {
  it('returns a focusable event surface', () => {
    const [comp, m] = initModel();
    const vnode = comp.view(m);
    expect(vnode.kind).toBe('focus');
    expect(JSON.stringify(vnode)).toContain('onClick');
  });

  it('shows placeholder text when unfocused with no tags', () => {
    const [comp, m] = initModel({ placeholder: 'Add tags...' });
    const vnode = comp.view(m);
    expect(JSON.stringify(vnode)).toContain('Add tags...');
  });

  it('renders tag chips for each tag', () => {
    const [comp, m] = initModel({ tags: ['alpha', 'beta'] });
    const vnode = comp.view(m);
    const serialized = JSON.stringify(vnode);
    expect(serialized).toContain('alpha');
    expect(serialized).toContain('beta');
    expect(serialized).toContain('×');
    expect(serialized).toContain('Remove tag alpha');
    expect(serialized).toContain('onMouseEnter');
    expect(serialized).toContain('onMouseLeave');
  });

  it('tracks chip hover independently and clears only the matching target', () => {
    const [comp, model] = initModel({ tags: ['alpha', 'beta'] });
    const [hovered] = comp.update({ type: 'hover-tag', index: 1 }, model);
    expect(hovered.hoveredTag).toBe(1);
    expect(comp.update({ type: 'leave-tag', index: 0 }, hovered)[0].hoveredTag).toBe(1);
    expect(comp.update({ type: 'leave-tag', index: 1 }, hovered)[0].hoveredTag).toBe(-1);
    expect(comp.update({ type: 'hover-tag', index: 99 }, model)[0]).toBe(model);
  });
});

/* ── subscriptions ───────────────────────────────────────────── */

describe('tagInput – subscriptions', () => {
  it('keeps pointer interaction active when unfocused', () => {
    const [comp, m] = initModel();
    const sub = comp.subscriptions!(m);
    expect(sub._kind.kind).toBe('elementMouse');
  });

  it('returns Sub.batch() when focused', () => {
    const [comp, m] = initModel();
    const m1 = { ...m, focused: true };
    const sub = comp.subscriptions!(m1);
    expect(sub._kind.kind).toBe('batch');
  });

  it('includes decoded key and paste subscriptions when focused', () => {
    const [comp, m] = initModel();
    const m1 = { ...m, focused: true };
    const sub = comp.subscriptions!(m1);
    expect(sub._kind.kind).toBe('batch');
    const subs = (sub._kind as any).subs as any[];
    expect(subs.map((s: any) => s._kind.kind)).toEqual(['elementMouse', 'keyEvent', 'paste']);
  });
});

/* ── tagInputHitTest ─────────────────────────────────────────── */

describe('tagInputHitTest', () => {
  it('returns null for empty tags', () => {
    expect(tagInputHitTest([], 0)).toBeNull();
  });

  it('hits the first chip at x=0', () => {
    const result = tagInputHitTest(['abc'], 0);
    expect(result).toEqual({ type: 'remove-tag', index: 0 });
  });

  it('hits the correct chip for multi-tag layout', () => {
    // chip widths: 'hi' = 2+4=6, 'there' = 5+4=9
    // chip 0: positions 0..5, gap at 6, chip 1: positions 7..15
    const result = tagInputHitTest(['hi', 'there'], 8);
    expect(result).toEqual({ type: 'remove-tag', index: 1 });
  });

  it('returns null for click in the gap between chips', () => {
    // chip 0 'ab': width 2+4=6, occupies 0..5, gap at 6
    const result = tagInputHitTest(['ab', 'cd'], 6);
    expect(result).toBeNull();
  });

  it('returns null for click beyond all chips', () => {
    // chip 0 'x': width 1+4=5, occupies 0..4, gap at 5 → total 6
    const result = tagInputHitTest(['x'], 100);
    expect(result).toBeNull();
  });

  it('measures wide labels in terminal cells', () => {
    // 界 occupies two cells, so the gap begins after a six-cell chip.
    expect(tagInputHitTest(['界', 'x'], 6)).toBeNull();
    expect(tagInputHitTest(['界', 'x'], 7)).toEqual({ type: 'remove-tag', index: 1 });
  });

  it('edits emoji sequences as one grapheme', () => {
    const [comp, initial] = initModel();
    const [withEmoji] = comp.update({ type: 'insert-char', char: '👩‍🚀' }, initial);
    expect(withEmoji.cursorPos).toBe(1);
    const [deleted] = comp.update({ type: 'backspace' }, withEmoji);
    expect(deleted.inputBuffer).toBe('');
    expect(deleted.cursorPos).toBe(0);
  });
});
