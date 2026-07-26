import { Cmd, getVNodeMeta, Sub, text } from '@celestial/core/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { auditA11y, createTestApp } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { formatDisplayKey, formatKeyBinding, getMatchingKeyBinding, helpView, type KeyBinding, keyMap, matchesKeyBinding } from '../keyboard.js';

type Msg = { readonly type: string };
type RuntimeModel = { readonly received: readonly string[] };

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

function createKeyMapApp(bindings: readonly KeyBinding<string>[]) {
  return createTestApp<RuntimeModel, string>({
    init: () => [{ received: [] }, Cmd.none()],
    update: (message, model) => [{ received: [...model.received, message] }, Cmd.none()],
    view: (model) => text(model.received.join(',')),
    subscriptions: () => keyMap(bindings),
  });
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
  it('dispatches only the exact modifier match through the real input path', () => {
    const app = createKeyMapApp([
      { key: 'f10', msg: 'plain', description: 'Plain F10' },
      { key: 'f10', modifiers: { shift: true }, msg: 'shift', description: 'Shift F10' },
    ]);

    app.pressKey('f10', { shift: true });

    expect(app.model.received).toEqual(['shift']);
    app.stop();
  });

  it('dispatches only the first active binding when shortcuts collide', () => {
    const app = createKeyMapApp([
      { key: 'x', msg: 'first', description: 'First' },
      { key: 'x', msg: 'second', description: 'Second' },
    ]);

    app.pressKey('x');

    expect(app.model.received).toEqual(['first']);
    app.stop();
  });

  it('allows a later colliding binding when the earlier guard is false', () => {
    const app = createKeyMapApp([
      { key: 'x', msg: 'inactive', description: 'Inactive', when: () => false },
      { key: 'x', msg: 'active', description: 'Active' },
    ]);

    app.pressKey('x');

    expect(app.model.received).toEqual(['active']);
    app.stop();
  });

  it('routes Tab and Shift+Tab before the runtime performs focus traversal', () => {
    const app = createKeyMapApp([
      { key: 'tab', msg: 'next', description: 'Next' },
      { key: 'tab', modifiers: { shift: true }, msg: 'previous', description: 'Previous' },
    ]);

    app.pressKey('tab');
    app.pressKey('tab', { shift: true });

    expect(app.model.received).toEqual(['next', 'previous']);
    app.stop();
  });

  it('normalizes canonical named-key aliases and ASCII letter case', () => {
    const app = createKeyMapApp([
      { key: 'esc', msg: 'close', description: 'Close' },
      { key: 'A', msg: 'alpha', description: 'Alpha' },
    ]);

    app.pressKey('escape');
    app.pressKey('a');

    expect(app.model.received).toEqual(['close', 'alpha']);
    app.stop();
  });

  it('canonicalizes a literal space to the decoder named key', () => {
    const app = createKeyMapApp([{ key: ' ', msg: 'space', description: 'Space' }]);

    app.pressKey('space');

    expect(app.model.received).toEqual(['space']);
    app.stop();
  });

  it('reconciles the active key map after raw key handlers update the model', () => {
    type ReconciledMsg = { readonly type: 'raw' | 'close' | 'save' };
    const app = createTestApp<{ readonly open: boolean; readonly received: readonly string[] }, ReconciledMsg>({
      init: () => [{ open: true, received: [] }, Cmd.none()],
      update: (message, model) => {
        if (message.type === 'raw') return [{ open: false, received: [...model.received, 'raw'] }, Cmd.none()];
        return [{ ...model, received: [...model.received, message.type] }, Cmd.none()];
      },
      view: (model) => text(model.received.join(',')),
      subscriptions: (model) =>
        Sub.batch(
          Sub.keyEvent(() => ({ type: 'raw' as const })),
          keyMap([{ key: 'escape', msg: { type: model.open ? ('close' as const) : ('save' as const) }, description: 'Contextual action' }]),
        ),
    });

    app.pressKey('escape');

    expect(app.model.received).toEqual(['raw', 'save']);
    app.stop();
  });

  it('rejects keys that the terminal decoder can never emit as one event', () => {
    expect(() => keyMap([{ key: '👩‍🚀', msg: 'launch', description: 'Launch' }])).toThrow(/single Unicode scalar/i);
    expect(() => keyMap([{ key: '\t', msg: 'tab', description: 'Raw tab' }])).toThrow(/printable Unicode scalar/i);
    expect(() => keyMap([{ key: '\ud800', msg: 'surrogate', description: 'Lone surrogate' }])).toThrow(/printable Unicode scalar/i);
    expect(() => keyMap([{ key: '1', modifiers: { shift: true }, msg: 'number', description: 'Shift number' }])).toThrow(/cannot be represented/i);
    expect(() => keyMap([{ key: 's', modifiers: { ctrl: true, shift: true }, msg: 'save', description: 'Save' }])).toThrow(/cannot be represented/i);
    expect(() => keyMap([{ key: 'h', modifiers: { ctrl: true }, msg: 'help', description: 'Help' }])).toThrow(/cannot be represented/i);
    expect(() => keyMap([{ key: '[', modifiers: { alt: true }, msg: 'bracket', description: 'Bracket' }])).toThrow(/cannot be represented/i);
    expect(() => keyMap([{ key: ']', modifiers: { alt: true }, msg: 'bracket', description: 'Bracket' }])).toThrow(/cannot be represented/i);
    expect(() => keyMap([{ key: 'o', modifiers: { alt: true, shift: true }, msg: 'open', description: 'Open' }])).toThrow(/cannot be represented/i);
  });

  it('rejects separators, bidi controls, and forged binding booleans', () => {
    for (const unsafe of ['\u2028', '\u2029', '\u202e', '\u2066']) {
      expect(() => keyMap([{ key: unsafe, msg: 'unsafe', description: 'Unsafe' }])).toThrow(/printable Unicode scalar/i);
      expect(() => helpView([{ key: unsafe, msg: 'unsafe', description: 'Unsafe' }])).toThrow(/printable Unicode scalar/i);
    }
    expect(() =>
      keyMap([
        {
          key: 'a',
          modifiers: { ctrl: 'false' as never },
          msg: 'forged',
          description: 'Forged',
        },
      ]),
    ).toThrow(/ctrl.*boolean/i);
    expect(() =>
      helpView([
        {
          key: 'a',
          discoverable: 'false' as never,
          msg: 'forged',
          description: 'Forged',
        },
      ]),
    ).toThrow(/discoverable.*boolean/i);
    expect(() =>
      helpView([{ key: 'a', msg: 'a', description: 'Alpha' }], {
        includeInactive: 'yes' as never,
      }),
    ).toThrow(/includeInactive.*boolean/i);
  });

  it('rejects binding and help-option accessors plus oversized sparse arrays without reading them', () => {
    let descriptionReads = 0;
    const accessorBinding = Object.defineProperties(
      {},
      {
        key: { enumerable: true, value: 'a' },
        msg: { enumerable: true, value: 'a' },
        description: {
          enumerable: true,
          get: () => {
            descriptionReads += 1;
            return 'Alpha';
          },
        },
      },
    );
    expect(() => helpView([accessorBinding as never])).toThrow(/description.*own data property/i);
    expect(() => keyMap([accessorBinding as never])).toThrow(/description.*own data property/i);
    expect(descriptionReads).toBe(0);

    let optionReads = 0;
    const accessorOptions = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: () => {
        optionReads += 1;
        return 'Keys';
      },
    });
    expect(() => helpView([{ key: 'a', msg: 'a', description: 'Alpha' }], accessorOptions)).toThrow(/title.*own data property/i);
    expect(optionReads).toBe(0);

    const huge = new Array<KeyBinding<string>>(4_294_967_295);
    expect(() => helpView(huge)).toThrow(/at most 10000/i);
    expect(() => keyMap(huge)).toThrow(/at most 10000/i);
  });

  it('produces no subscription when nothing is active', () => {
    const subs = keyMap<Msg>([{ key: 'a', msg: { type: 'x' }, description: 'X', when: () => false }]);
    expect((subs as unknown as { _kind?: { kind?: string } })._kind?.kind).toBe('none');
  });
});

describe('display helpers', () => {
  it('rejects controls, bidi text, and lone surrogates before rendering key labels', () => {
    for (const unsafe of ['\u001b[31m', '\u202e', '\ud800']) {
      for (const format of [formatDisplayKey, formatKeyBinding]) {
        let thrown: unknown;
        try {
          format(unsafe);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(TypeError);
        expect((thrown as Error).message).toMatch(/Unicode scalar|printable/i);
        expect((thrown as Error).message).not.toContain(unsafe);
      }
    }
  });

  it('snapshots and validates display modifiers without invoking accessors', () => {
    let ctrlReads = 0;
    const hostile = Object.defineProperty({}, 'ctrl', {
      enumerable: true,
      get: () => {
        ctrlReads += 1;
        return true;
      },
    });

    expect(() => formatKeyBinding('c', hostile)).toThrow(/ctrl.*own data property/i);
    expect(ctrlReads).toBe(0);
  });

  it('keeps display-only combining and emoji graphemes intact', () => {
    expect(formatDisplayKey('e\u0301')).toBe('e\u0301');
    expect(formatDisplayKey('👩')).toBe('👩');
    expect(() => formatKeyBinding('e\u0301')).toThrow(/Unicode scalar/i);
    expect(formatKeyBinding('👩')).toBe('👩');
  });
});

describe('helpView', () => {
  it('aligns the description column by display width, not code-unit length', () => {
    // The key label is a single emoji grapheme: 2 display cells but 5 UTF-16
    // code units. Aligning on .length over-pads by three cells and the column
    // visibly breaks — this is the grapheme hazard the public repo guards for.
    const wide = '界';
    expect(measureTextWidth(wide)).toBeGreaterThan(wide.length);

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
    expect(auditA11y(node).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
    expect(auditA11y(node).violations.filter((violation) => violation.rule === 'color-contrast')).toEqual([]);
  });

  it('refuses to advertise a key that the runtime cannot bind', () => {
    expect(() => helpView([{ key: '👩‍🚀'.repeat(40), msg: 'launch', description: 'Launch' }])).toThrow(/single Unicode scalar/i);
  });

  it('does not advertise bindings whose guard is currently false', () => {
    const lines = textLines(
      helpView([
        { key: 'a', msg: 'active', description: 'Active', when: () => true },
        { key: 'i', msg: 'inactive', description: 'Inactive', when: () => false },
      ]),
    );

    expect(lines.join('\n')).toContain('Active');
    expect(lines.join('\n')).not.toContain('Inactive');
  });

  it('advertises only the first active owner of an alias-equivalent chord', () => {
    const lines = textLines(
      helpView([
        { key: 'esc', msg: 'first', description: 'First close' },
        { key: 'escape', msg: 'second', description: 'Second close' },
      ]),
    ).join('\n');

    expect(lines).toContain('First close');
    expect(lines).not.toContain('Second close');
  });

  it('never exceeds the requested width, even below the normal indentation width', () => {
    const lines = textLines(helpView([{ key: 'x', msg: 'x', description: 'Execute action' }], { width: 2 }));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => measureTextWidth(line) <= 2)).toBe(true);
  });

  it('keeps non-ASCII printable keys identical to the executable chord', () => {
    const binding: KeyBinding<string> = { key: 'ß', msg: 'eszett', description: 'Insert eszett' };
    expect(matchesKeyBinding(binding, press('ß'))).toBe(true);
    expect(textLines(helpView([binding])).join('\n')).toContain('ß');
    expect(textLines(helpView([binding])).join('\n')).not.toContain('SS');
  });

  it('rejects terminal controls in measured headings, categories, and descriptions', () => {
    const binding: KeyBinding<string> = { key: 'x', msg: 'x', description: 'Execute' };

    expect(() => helpView([binding], { title: 'Keys\tNow' })).toThrow(/printable/i);
    expect(() => helpView([{ ...binding, category: 'Shell\u001b' }])).toThrow(/printable/i);
    expect(() => helpView([{ ...binding, description: 'Execute\u009fnow' }])).toThrow(/printable/i);
  });

  it('rejects separators, bidi controls, and lone surrogates in help text', () => {
    const binding: KeyBinding<string> = { key: 'x', msg: 'x', description: 'Execute' };

    for (const unsafe of ['\u2028', '\u2029', '\u2066', '\ud800']) {
      expect(() => helpView([binding], { title: `Keys${unsafe}` })).toThrow(/printable/i);
      expect(() => helpView([{ ...binding, category: `Shell${unsafe}` }])).toThrow(/printable/i);
      expect(() => helpView([{ ...binding, description: `Execute${unsafe}` }])).toThrow(/printable/i);
    }
  });

  it('retains intentional line feeds in wrapped descriptions', () => {
    const output = textLines(helpView([{ key: 'x', msg: 'x', description: 'First line\nSecond line' }], { width: 24 })).join('\n');
    expect(output).toContain('First line');
    expect(output).toContain('Second line');
  });
});
