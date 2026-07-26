import { getVNodeMeta } from '@celestial/core/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { describe, expect, it } from 'vitest';
import { getMatchingKeyBinding, helpView, type KeyBinding, keyMap, matchesKeyBinding } from '../keyboard.js';

type Msg = { readonly type: string };

const press = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  key,
  ctrl: mods.ctrl ?? false,
  alt: mods.alt ?? false,
  shift: mods.shift ?? false,
});

function textLines(node: unknown): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const record = node as { kind?: string; content?: string; child?: unknown; children?: unknown[] };
  const own = record.kind === 'text' && typeof record.content === 'string' ? [record.content] : [];
  const nested = [...(record.children ?? []), ...(record.child === undefined ? [] : [record.child])];
  return [...own, ...nested.flatMap(textLines)];
}

describe('matchesKeyBinding', () => {
  it('requires every modifier to match exactly', () => {
    const binding: KeyBinding<Msg> = { key: 'c', modifiers: { ctrl: true }, msg: { type: 'copy' }, description: 'Copy' };

    expect(matchesKeyBinding(binding, press('c', { ctrl: true }))).toBe(true);
    expect(matchesKeyBinding(binding, press('c'))).toBe(false);
    expect(matchesKeyBinding(binding, press('c', { ctrl: true, shift: true }))).toBe(false);
  });

  it('honours a when() guard', () => {
    let enabled = false;
    const binding: KeyBinding<Msg> = { key: 'x', msg: { type: 'cut' }, description: 'Cut', when: () => enabled };

    expect(matchesKeyBinding(binding, press('x'))).toBe(false);
    enabled = true;
    expect(matchesKeyBinding(binding, press('x'))).toBe(true);
  });

  it('returns the first matching binding, or null', () => {
    const bindings: KeyBinding<Msg>[] = [
      { key: 'a', msg: { type: 'first' }, description: 'First' },
      { key: 'a', msg: { type: 'second' }, description: 'Second' },
    ];

    expect(getMatchingKeyBinding(bindings, press('a'))?.msg).toEqual({ type: 'first' });
    expect(getMatchingKeyBinding(bindings, press('z'))).toBeNull();
  });
});

describe('keyMap', () => {
  it('drops bindings whose guard is false', () => {
    const subs = keyMap<Msg>([
      { key: 'a', msg: { type: 'on' }, description: 'On', when: () => true },
      { key: 'b', msg: { type: 'off' }, description: 'Off', when: () => false },
    ]);

    // A batch of exactly one means the guarded binding was filtered out.
    const kind = (subs as unknown as { _kind?: { kind?: string } })._kind;
    expect(kind?.kind).toBe('key');
  });

  it('produces no subscription when nothing is active', () => {
    const subs = keyMap<Msg>([{ key: 'a', msg: { type: 'x' }, description: 'X', when: () => false }]);
    expect((subs as unknown as { _kind?: { kind?: string } })._kind?.kind).toBe('none');
  });
});

describe('helpView', () => {
  it('aligns the description column by display width, not code-unit length', () => {
    // The key label is a single emoji grapheme: 2 display cells but 5 UTF-16
    // code units. Aligning on .length over-pads by three cells and the column
    // visibly breaks — this is the grapheme hazard the public repo guards for.
    const wide = '👩‍🚀';
    expect(measureTextWidth(wide)).toBeLessThan(wide.length);

    const lines = textLines(
      helpView<Msg>([
        { key: wide, msg: { type: 'a' }, description: 'Launch' },
        { key: 'b', msg: { type: 'b' }, description: 'Back' },
      ]),
    ).filter((line) => line.includes('Launch') || line.includes('Back'));

    expect(lines).toHaveLength(2);
    const descriptionColumns = lines.map((line) => measureTextWidth(line.slice(0, line.lastIndexOf(line.trim().split(/\s{2,}/).pop() ?? ''))));
    expect(descriptionColumns[0]).toBe(descriptionColumns[1]);
  });

  it('reports an empty binding list rather than rendering a bare heading', () => {
    expect(textLines(helpView<Msg>([])).join('\n')).toContain('No key bindings');
  });

  it('carries an accessible role and label', () => {
    const node = helpView<Msg>([{ key: 'a', msg: { type: 'a' }, description: 'Alpha' }]);
    const meta = getVNodeMeta(node);
    expect(meta?.a11y?.role).toBe('region');
    expect(meta?.a11y?.label).toContain('Key bindings');
  });
});
