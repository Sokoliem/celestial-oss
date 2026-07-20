import { describe, expect, it } from 'vitest';
import type { ConfirmPromptMsg, InputPromptMsg, MultiSelectPromptMsg, SelectPromptMsg } from '../prompt.js';
import { confirmPrompt, inputPrompt, multiSelectPrompt, selectPrompt } from '../prompt.js';
import { required } from '../validation.js';

function collectText(node: any): string[] {
  if (!node || typeof node !== 'object') return [];
  if (node.kind === 'text') return [node.content];
  if ('children' in node && Array.isArray(node.children)) {
    return node.children.flatMap((child: any) => collectText(child));
  }
  if ('child' in node) {
    return collectText(node.child);
  }
  return [];
}

// ─── inputPrompt ────────────────────────────────────────────────────────────

describe('inputPrompt', () => {
  const prompt = inputPrompt({ message: 'Name?' });

  it('init returns empty model with cursor at 0', () => {
    const [model] = prompt.init();
    expect(model.value).toBe('');
    expect(model.cursor).toBe(0);
    expect(model.done).toBe(false);
    expect(model.error).toBeNull();
    expect(model.focused).toBe(true);
  });

  it('init uses defaultValue when provided', () => {
    const p = inputPrompt({ message: 'Name?', defaultValue: 'Alice' });
    const [model] = p.init();
    expect(model.value).toBe('Alice');
    expect(model.cursor).toBe(5);
  });

  it('char message appends character at cursor', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:char', char: 'h' } as InputPromptMsg, model);
    [model] = prompt.update({ type: 'prompt:char', char: 'i' } as InputPromptMsg, model);
    expect(model.value).toBe('hi');
    expect(model.cursor).toBe(2);
  });

  it('backspace removes character before cursor', () => {
    const p = inputPrompt({ message: 'Name?', defaultValue: 'hello' });
    let [model] = p.init();
    [model] = p.update({ type: 'prompt:backspace' } as InputPromptMsg, model);
    expect(model.value).toBe('hell');
    expect(model.cursor).toBe(4);
  });

  it('edits extended graphemes without splitting them', () => {
    const p = inputPrompt({ message: 'Name?', defaultValue: `A👩‍🚀` });
    let [model] = p.init();
    expect(model.cursor).toBe(2);
    [model] = p.update({ type: 'prompt:backspace' }, model);
    expect(model.value).toBe('A');
    expect(model.cursor).toBe(1);
  });

  it('accepts Unicode key events and bracketed paste', () => {
    const p = inputPrompt({ message: 'Name?' });
    let [model] = p.init();
    [model] = p.update({ type: 'prompt:key', event: { key: '界', char: '界', ctrl: false, alt: false, shift: false } }, model);
    [model] = p.update({ type: 'prompt:paste', value: '👩‍🚀\nready' }, model);
    expect(model.value).toBe(`界👩‍🚀 ready`);
    expect(model.cursor).toBe(8);
  });

  it('backspace at start does nothing', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:backspace' } as InputPromptMsg, model);
    expect(model.value).toBe('');
    expect(model.cursor).toBe(0);
  });

  it('submit marks as done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:char', char: 'x' } as InputPromptMsg, model);
    [model] = prompt.update({ type: 'prompt:submit' } as InputPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toBe('x');
    expect(prompt.isDone(model)).toBe(true);
  });

  it('submit with validation error does not mark done', () => {
    const p = inputPrompt({
      message: 'Name?',
      validate: [required('Required')],
    });
    let [model] = p.init();
    [model] = p.update({ type: 'prompt:submit' } as InputPromptMsg, model);
    expect(model.done).toBe(false);
    expect(model.error).toBe('Required');
  });

  it('ignores messages after done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:char', char: 'a' } as InputPromptMsg, model);
    [model] = prompt.update({ type: 'prompt:submit' } as InputPromptMsg, model);
    [model] = prompt.update({ type: 'prompt:char', char: 'b' } as InputPromptMsg, model);
    expect(model.value).toBe('a');
  });

  it('focus/blur toggle focused state', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:blur' } as InputPromptMsg, model);
    expect(model.focused).toBe(false);
    [model] = prompt.update({ type: 'prompt:focus' } as InputPromptMsg, model);
    expect(model.focused).toBe(true);
  });

  it('view returns a VNode', () => {
    const [model] = prompt.init();
    const vnode = prompt.view(model);
    expect(vnode).toBeDefined();
  });

  it('view renders cursor with reverse style when focused and has value', () => {
    const p = inputPrompt({ message: 'Name?', defaultValue: 'hello' });
    const [model] = p.init();
    const vnode = p.view(model);
    // The view should contain a row node with the cursor character rendered in reverse
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      // The interactive wrapper keeps the cursor row mouse-focusable.
      const inputTarget = vnode.children[1];
      expect(inputTarget).toBeDefined();
      expect(inputTarget!.kind).toBe('event');
      if (inputTarget?.kind === 'event') expect(inputTarget.child.kind).toBe('row');
    }
  });

  it('view renders cursor placeholder when focused and empty', () => {
    const [model] = prompt.init();
    const vnode = prompt.view(model);
    // When focused and empty, should show a row with cursor
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      const inputTarget = vnode.children[1];
      expect(inputTarget).toBeDefined();
      expect(inputTarget!.kind).toBe('event');
      if (inputTarget?.kind === 'event') expect(inputTarget.child.kind).toBe('row');
    }
  });

  it('view renders plain text when not focused', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:blur' } as InputPromptMsg, model);
    const vnode = prompt.view(model);
    expect(vnode.kind).toBe('column');
    if (vnode.kind === 'column') {
      const inputTarget = vnode.children[1];
      expect(inputTarget).toBeDefined();
      expect(inputTarget!.kind).toBe('event');
      if (inputTarget?.kind === 'event') expect(inputTarget.child.kind).toBe('text');
    }
  });

  it('subscriptions returns Sub when focused and not done', () => {
    const [model] = prompt.init();
    const sub = prompt.subscriptions?.(model);
    expect(sub).toBeDefined();
    expect(sub?._kind.kind).toBe('batch');
    if (sub?._kind.kind === 'batch') expect(sub._kind.subs.map((entry) => entry._kind.kind)).toEqual(['elementMouse', 'keyEvent', 'paste']);
  });

  it('normalizes externally corrupted cursors before editing', () => {
    const p = inputPrompt({ message: 'Name?', defaultValue: 'ab' });
    const [model] = p.init();
    const [updated] = p.update({ type: 'prompt:char', char: 'c' }, { ...model, cursor: Number.NaN });
    expect(updated.value).toBe('cab');
    expect(updated.cursor).toBe(1);
  });

  it('snapshots validators instead of retaining the caller array', () => {
    const validators = [required('Required')];
    const p = inputPrompt({ message: 'Name?', validate: validators });
    validators.length = 0;
    let [model] = p.init();
    [model] = p.update({ type: 'prompt:submit' }, model);
    expect(model.done).toBe(false);
    expect(model.error).toBe('Required');
  });

  it('keeps pointer focus available while blurred', () => {
    const [model] = prompt.init();
    const [blurred] = prompt.update({ type: 'prompt:blur' }, model);
    expect(prompt.subscriptions!(blurred)._kind.kind).toBe('elementMouse');
  });

  it('subscriptions returns none when done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'prompt:char', char: 'x' } as InputPromptMsg, model);
    [model] = prompt.update({ type: 'prompt:submit' } as InputPromptMsg, model);
    const sub = prompt.subscriptions?.(model);
    // Sub.none() is a valid sub — just check it exists
    expect(sub).toBeDefined();
  });

  it('renders prompt labels and descriptions when provided', () => {
    const p = inputPrompt({
      message: 'Name?',
      label: 'Profile',
      description: 'Tell us how this field should appear.',
    } as any);

    const [model] = p.init();
    const textContent = collectText(p.view(model)).join('\n');
    expect(textContent).toContain('Profile');
    expect(textContent).toContain('Tell us how this field should appear.');
    expect(textContent).toContain('Name?');
  });
});

// ─── confirmPrompt ──────────────────────────────────────────────────────────

describe('confirmPrompt', () => {
  const prompt = confirmPrompt({ message: 'Continue?' });

  it('init returns null value, not done', () => {
    const [model] = prompt.init();
    expect(model.value).toBeNull();
    expect(model.done).toBe(false);
    expect(model.focused).toBe(true);
  });

  it('yes marks done with true', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'confirm:yes' } as ConfirmPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toBe(true);
  });

  it('no marks done with false', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'confirm:no' } as ConfirmPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toBe(false);
  });

  it('submit uses default value (false by default)', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'confirm:submit' } as ConfirmPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toBe(false);
  });

  it('submit uses provided default value', () => {
    const p = confirmPrompt({ message: 'Continue?', defaultValue: true });
    let [model] = p.init();
    [model] = p.update({ type: 'confirm:submit' } as ConfirmPromptMsg, model);
    expect(model.done).toBe(true);
    expect(p.getValue(model)).toBe(true);
  });

  it('ignores messages after done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'confirm:yes' } as ConfirmPromptMsg, model);
    [model] = prompt.update({ type: 'confirm:no' } as ConfirmPromptMsg, model);
    expect(prompt.getValue(model)).toBe(true);
  });

  it('isDone reflects state', () => {
    let [model] = prompt.init();
    expect(prompt.isDone(model)).toBe(false);
    [model] = prompt.update({ type: 'confirm:yes' } as ConfirmPromptMsg, model);
    expect(prompt.isDone(model)).toBe(true);
  });

  it('view returns a VNode', () => {
    const [model] = prompt.init();
    const vnode = prompt.view(model);
    expect(vnode).toBeDefined();
  });

  it('renders direct pointer choices and keeps them active while blurred', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'confirm:blur' }, model);
    expect(collectText(prompt.view(model)).join(' ')).toContain('Yes');
    expect(collectText(prompt.view(model)).join(' ')).toContain('No');
    expect(prompt.subscriptions!(model)._kind.kind).toBe('elementMouse');
  });

  it('renders label and description above confirm prompts', () => {
    const p = confirmPrompt({
      message: 'Continue?',
      label: 'Danger zone',
      description: 'This action cannot be undone.',
    } as any);

    const [model] = p.init();
    const textContent = collectText(p.view(model)).join('\n');
    expect(textContent).toContain('Danger zone');
    expect(textContent).toContain('This action cannot be undone.');
    expect(textContent).toContain('Continue?');
  });
});

// ─── selectPrompt ───────────────────────────────────────────────────────────

describe('selectPrompt', () => {
  const prompt = selectPrompt({
    message: 'Pick a fruit',
    options: ['Apple', 'Banana', 'Cherry'],
  });

  it('init starts at highlight 0, not done', () => {
    const [model] = prompt.init();
    expect(model.highlighted).toBe(0);
    expect(model.selected).toBeNull();
    expect(model.done).toBe(false);
    expect(model.options).toHaveLength(3);
  });

  it('init with defaultValue starts at correct index', () => {
    const p = selectPrompt({
      message: 'Pick a fruit',
      options: [
        { label: 'Apple', value: 'apple' },
        { label: 'Banana', value: 'banana' },
        { label: 'Cherry', value: 'cherry' },
      ],
      defaultValue: 'banana',
    });
    const [model] = p.init();
    expect(model.highlighted).toBe(1);
  });

  it('down moves highlight', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(1);
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(2);
  });

  it('up moves highlight', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:up' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(1);
  });

  it('does not go below 0', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:up' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(0);
  });

  it('does not go beyond last', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(2);
  });

  it('submit selects current highlight', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:submit' } as SelectPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toBe('Banana');
    expect(prompt.isDone(model)).toBe(true);
  });

  it('ignores messages after done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'select:submit' } as SelectPromptMsg, model);
    [model] = prompt.update({ type: 'select:down' } as SelectPromptMsg, model);
    expect(model.highlighted).toBe(0);
  });

  it('works with object options', () => {
    const p = selectPrompt({
      message: 'Pick',
      options: [
        { label: 'Apple', value: 'a' },
        { label: 'Banana', value: 'b' },
      ],
    });
    let [model] = p.init();
    [model] = p.update({ type: 'select:down' } as SelectPromptMsg, model);
    [model] = p.update({ type: 'select:submit' } as SelectPromptMsg, model);
    expect(p.getValue(model)).toBe('b');
  });

  it('view returns a VNode', () => {
    const [model] = prompt.init();
    const vnode = prompt.view(model);
    expect(vnode).toBeDefined();
  });

  it('snapshots object options and supports direct pointer selection', () => {
    const mutable = [{ label: 'Original', value: 'original' }];
    const p = selectPrompt({ message: 'Pick', options: mutable });
    mutable[0]!.label = 'Changed';
    mutable.push({ label: 'Injected', value: 'injected' });
    let [model] = p.init();
    expect(collectText(p.view(model)).join(' ')).toContain('Original');
    expect(collectText(p.view(model)).join(' ')).not.toContain('Changed');
    [model] = p.update({ type: 'select:choose-at', index: 0 }, model);
    expect(p.getValue(model)).toBe('original');
    expect(model.done).toBe(true);
  });

  it('keeps empty option lists stable and incomplete', () => {
    const p = selectPrompt({ message: 'Pick', options: [] });
    let [model] = p.init();
    [model] = p.update({ type: 'select:down' }, model);
    expect(model.highlighted).toBe(0);
    [model] = p.update({ type: 'select:submit' }, model);
    expect(model.done).toBe(false);
    expect(collectText(p.view(model)).join(' ')).toContain('No options');
  });

  it('windows large option lists around the active item', () => {
    const p = selectPrompt({ message: 'Pick', options: Array.from({ length: 20 }, (_, index) => `Option ${index}`), maxVisible: 3 });
    let [model] = p.init();
    model = { ...model, highlighted: 10 };
    const rendered = collectText(p.view(model)).join('\n');
    expect(rendered).toContain('Option 10');
    expect(rendered).not.toContain('Option 0\n');
    expect(p.subscriptions!(model)._kind.kind).toBe('batch');
  });

  it('formats completed selections using locale list rules', () => {
    const p = multiSelectPrompt({
      message: 'Choisissez',
      options: ['Rouge', 'Vert', 'Bleu'],
      locale: 'fr-FR',
    });

    let [model] = p.init();
    [model] = p.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);

    const vnode = p.view(model);
    if (vnode.kind === 'column') {
      let rendered = '';
      for (const child of vnode.children) {
        if (child.kind === 'text') {
          rendered += `${child.content}\n`;
        }
      }

      expect(rendered).toContain('Rouge et Vert');
    }
  });
});

// ─── multiSelectPrompt ──────────────────────────────────────────────────────

describe('multiSelectPrompt', () => {
  const prompt = multiSelectPrompt({
    message: 'Pick colors',
    options: ['Red', 'Green', 'Blue'],
  });

  it('init starts with nothing selected', () => {
    const [model] = prompt.init();
    expect(model.selected.size).toBe(0);
    expect(model.highlighted).toBe(0);
    expect(model.done).toBe(false);
  });

  it('init with defaultValues pre-selects', () => {
    const p = multiSelectPrompt({
      message: 'Pick colors',
      options: [
        { label: 'Red', value: 'red' },
        { label: 'Green', value: 'green' },
        { label: 'Blue', value: 'blue' },
      ],
      defaultValues: ['red', 'blue'],
    });
    const [model] = p.init();
    expect(model.selected.has(0)).toBe(true);
    expect(model.selected.has(2)).toBe(true);
    expect(model.selected.has(1)).toBe(false);
  });

  it('toggle selects and deselects', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    expect(model.selected.has(0)).toBe(true);
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    expect(model.selected.has(0)).toBe(false);
  });

  it('can select multiple items', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    expect(model.selected.has(0)).toBe(true);
    expect(model.selected.has(2)).toBe(true);
    expect(model.selected.has(1)).toBe(false);
  });

  it('submit confirms selection', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);
    expect(model.done).toBe(true);
    expect(prompt.getValue(model)).toEqual(['Red']);
  });

  it('getValue returns values in order', () => {
    let [model] = prompt.init();
    // Select index 2 first
    [model] = prompt.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    // Then select index 0
    [model] = prompt.update({ type: 'multi:up' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:up' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);
    expect(prompt.getValue(model)).toEqual(['Red', 'Blue']);
  });

  it('minSelect enforces minimum', () => {
    const p = multiSelectPrompt({
      message: 'Pick colors',
      options: ['Red', 'Green', 'Blue'],
      minSelect: 2,
    });
    let [model] = p.init();
    [model] = p.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);
    expect(model.done).toBe(false);
    expect(model.error).toBe('Select at least 2 options');
  });

  it('maxSelect enforces maximum', () => {
    const p = multiSelectPrompt({
      message: 'Pick colors',
      options: ['Red', 'Green', 'Blue'],
      maxSelect: 1,
    });
    let [model] = p.init();
    [model] = p.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    [model] = p.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    expect(model.selected.size).toBe(1);
    expect(model.error).toBe('Maximum 1 selections allowed');
  });

  it('ignores messages after done', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);
    [model] = prompt.update({ type: 'multi:toggle' } as MultiSelectPromptMsg, model);
    expect(model.selected.size).toBe(1);
  });

  it('up/down navigation', () => {
    let [model] = prompt.init();
    [model] = prompt.update({ type: 'multi:down' } as MultiSelectPromptMsg, model);
    expect(model.highlighted).toBe(1);
    [model] = prompt.update({ type: 'multi:up' } as MultiSelectPromptMsg, model);
    expect(model.highlighted).toBe(0);
    // Clamp at boundaries
    [model] = prompt.update({ type: 'multi:up' } as MultiSelectPromptMsg, model);
    expect(model.highlighted).toBe(0);
  });

  it('isDone reflects state', () => {
    let [model] = prompt.init();
    expect(prompt.isDone(model)).toBe(false);
    [model] = prompt.update({ type: 'multi:submit' } as MultiSelectPromptMsg, model);
    expect(prompt.isDone(model)).toBe(true);
  });

  it('view returns a VNode', () => {
    const [model] = prompt.init();
    const vnode = prompt.view(model);
    expect(vnode).toBeDefined();
  });

  it('ignores invalid direct indices and corrupted selected entries', () => {
    const [model] = prompt.init();
    expect(prompt.update({ type: 'multi:toggle-at', index: Number.NaN }, model)[0]).toBe(model);
    const corrupted = { ...model, selected: new Set([0, -1, Number.NaN, 99]) };
    expect(prompt.getValue(corrupted)).toEqual(['Red']);
  });

  it('rejects impossible selection constraints', () => {
    expect(() => multiSelectPrompt({ message: 'Pick', options: ['A'], minSelect: 2 })).toThrow(RangeError);
    expect(() => multiSelectPrompt({ message: 'Pick', options: ['A'], minSelect: 1, maxSelect: 0 })).toThrow(RangeError);
    expect(() => multiSelectPrompt({ message: 'Pick', options: ['A'], maxSelect: Number.NaN })).toThrow(RangeError);
  });

  it('supports pointer toggles while blurred and bounds the visible list', () => {
    const p = multiSelectPrompt({ message: 'Pick', options: Array.from({ length: 20 }, (_, index) => `Option ${index}`), maxVisible: 4 });
    let [model] = p.init();
    [model] = p.update({ type: 'multi:blur' }, model);
    expect(p.subscriptions!(model)._kind.kind).toBe('elementMouse');
    [model] = p.update({ type: 'multi:toggle-at', index: 12 }, model);
    expect(p.getValue(model)).toEqual(['Option 12']);
    const rendered = collectText(p.view(model)).join('\n');
    expect(rendered).toContain('Option 12');
    expect(rendered).not.toContain('Option 0\n');
  });
});
