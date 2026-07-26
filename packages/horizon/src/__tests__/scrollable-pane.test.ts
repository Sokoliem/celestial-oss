import { color } from '@celestial/core/corona';
import { createThemeContext, text, type VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { createScrollRegionModel, type ScrollRegionMsg, scrollRegionUpdate } from '../scroll.js';
import {
  formatIndicator,
  formatScrollKey,
  resolveScrollKeyBindings,
  type ScrollablePaneConfig,
  type ScrollKeyBinding,
  scrollablePane,
  scrollIndicatorState,
  scrollPaneSubscriptions,
} from '../scrollable-pane.js';

/** Render the pane and unwrap to the inner column's children for assertion. */
function paneChildren(config: ScrollablePaneConfig): VNode[] {
  const node = scrollablePane(config);
  if (node.kind !== 'box') throw new Error('expected box');
  const inner = node.children[0];
  if (!inner || inner.kind !== 'column') throw new Error('expected column inside box');
  return inner.children;
}

function findScrollNode(children: VNode[]): { height: number; offset: number } {
  const scrollNode = children.find((c) => c.kind === 'scroll');
  if (!scrollNode || scrollNode.kind !== 'scroll') throw new Error('expected scroll node');
  return { height: scrollNode.height, offset: scrollNode.offset };
}

describe('scrollablePane', () => {
  it('returns a box VNode wrapping a column of (header?, scroll, indicator?, footer?)', () => {
    const node = scrollablePane({
      body: text('hello'),
      scrollY: 0,
      viewportHeight: 10,
      contentHeight: 10,
      title: 'Doc',
      footer: text('q quit'),
    });
    expect(node.kind).toBe('box');
    if (node.kind !== 'box') throw new Error('not a box');
    const inner = node.children[0];
    expect(inner?.kind).toBe('column');
  });

  it('clamps a zero or negative viewportHeight to 1', () => {
    const children = paneChildren({ body: text('x'), scrollY: 0, viewportHeight: 0 });
    expect(findScrollNode(children).height).toBe(1);
  });

  it('passes scrollY through to the scroll node offset (clamped to >= 0)', () => {
    expect(findScrollNode(paneChildren({ body: text('x'), scrollY: 7, viewportHeight: 10 })).offset).toBe(7);
    expect(findScrollNode(paneChildren({ body: text('x'), scrollY: -5, viewportHeight: 10 })).offset).toBe(0);
  });

  it('hides the indicator when contentHeight is omitted', () => {
    const children = paneChildren({ body: text('x'), scrollY: 0, viewportHeight: 10 });
    // No indicator → only the scroll viewport child.
    expect(children).toHaveLength(1);
  });

  it('shows the indicator by default when contentHeight is provided', () => {
    const children = paneChildren({ body: text('x'), scrollY: 5, viewportHeight: 10, contentHeight: 30 });
    expect(children).toHaveLength(2); // scroll + indicator
  });

  it('renders header VNode, scroll, indicator, footer VNode in that order', () => {
    const children = paneChildren({
      body: text('body'),
      header: text('HEADER'),
      footer: text('FOOTER'),
      scrollY: 0,
      viewportHeight: 10,
      contentHeight: 10,
    });
    expect(children).toHaveLength(4);
    expect(children.map((c) => c.kind)).toEqual(['text', 'scroll', 'text', 'text']);
  });

  it('treats string header and string footer as text nodes', () => {
    const children = paneChildren({
      body: text('body'),
      header: 'Title',
      footer: 'q quit',
      scrollY: 0,
      viewportHeight: 5,
    });
    expect(children.map((c) => c.kind)).toEqual(['text', 'scroll', 'text']);
  });

  it('respects showIndicator: false even when contentHeight is provided', () => {
    const children = paneChildren({
      body: text('x'),
      scrollY: 0,
      viewportHeight: 10,
      contentHeight: 30,
      showIndicator: false,
    });
    expect(children).toHaveLength(1);
  });

  it('reads border and indicator chrome from the live theme context', () => {
    const themeCtx = createThemeContext();
    themeCtx.patch({ colors: { border: color.hex('#123456'), text: color.hex('#fedcba') } });
    const node = scrollablePane({
      body: text('body'),
      scrollY: 0,
      viewportHeight: 2,
      contentHeight: 5,
      themeCtx,
    });
    if (node.kind !== 'box') throw new Error('expected box');
    expect(node.style?.fg).toBe(themeCtx.current().elevation.raised.border?.fg() ?? themeCtx.current().colors.border.fg());
  });
});

describe('formatIndicator', () => {
  it('content fits in viewport — pct 100', () => {
    expect(formatIndicator(0, 24, 24)).toBe('lines 1–24 of 24  (100%)');
  });

  it('partway through long doc', () => {
    expect(formatIndicator(10, 24, 120)).toBe('lines 11–34 of 120  (10%)');
  });

  it('at top of long doc', () => {
    expect(formatIndicator(0, 24, 120)).toBe('lines 1–24 of 120  (0%)');
  });

  it('at bottom of long doc', () => {
    // contentHeight 120, viewport 24 → maxScroll 96. scrollY = 96 → 100%.
    expect(formatIndicator(96, 24, 120)).toBe('lines 97–120 of 120  (100%)');
  });

  it('clamps end at contentHeight', () => {
    // viewport extends past content end → end = contentHeight, not start + viewport.
    expect(formatIndicator(110, 24, 120)).toContain('lines 97–120 of 120');
  });

  it('clamps pct between 0 and 100 even with weird inputs', () => {
    expect(formatIndicator(-5, 24, 120)).toContain('(0%)');
    expect(formatIndicator(99999, 24, 120)).toContain('(100%)');
  });

  it('handles empty content gracefully', () => {
    expect(formatIndicator(0, 24, 0)).toBe('lines 0–0 of 0  (100%)');
  });
});

describe('scrollIndicatorState', () => {
  it('derives indicator and progress from a ScrollRegionModel', () => {
    let m = createScrollRegionModel('test');
    m = scrollRegionUpdate({ type: 'set-content-size', height: 100, width: 80 }, m);
    m = scrollRegionUpdate({ type: 'set-viewport-size', height: 20, width: 80 }, m);
    m = scrollRegionUpdate({ type: 'scroll-down', amount: 40 }, m);

    const state = scrollIndicatorState(m);
    expect(state.text).toBe('lines 41–60 of 100  (50%)');
    expect(state.progress).toBeCloseTo(0.5, 5);
  });

  it('progress is 1 when content fits', () => {
    let m = createScrollRegionModel('test');
    m = scrollRegionUpdate({ type: 'set-content-size', height: 10, width: 80 }, m);
    m = scrollRegionUpdate({ type: 'set-viewport-size', height: 20, width: 80 }, m);
    expect(scrollIndicatorState(m).progress).toBe(1);
  });
});

describe('resolveScrollKeyBindings', () => {
  it('default preset includes arrows + j/k + PgUp/PgDn + Home/End + Ctrl-u/Ctrl-d', () => {
    const pairs = resolveScrollKeyBindings('default');
    const plain = pairs.filter((p) => !p.ctrl && !p.alt).map((p) => p.key);
    for (const k of ['up', 'down', 'k', 'j', 'pageup', 'pagedown', 'home', 'end']) {
      expect(plain).toContain(k);
    }
    // Ctrl-u and Ctrl-d are stored with `ctrl: true`, NOT as the literal
    // string 'ctrl+u' — that string would never fire through nebula's
    // Sub.key matcher (which requires no ctrl/alt to match).
    expect(pairs).toContainEqual(expect.objectContaining({ key: 'u', ctrl: true }));
    expect(pairs).toContainEqual(expect.objectContaining({ key: 'd', ctrl: true }));
  });

  it('vim preset uses j/k + g/G but no arrows', () => {
    const plain = resolveScrollKeyBindings('vim')
      .filter((p) => !p.ctrl && !p.alt)
      .map((p) => p.key);
    expect(plain).toContain('j');
    expect(plain).toContain('k');
    expect(plain).toContain('g');
    expect(plain).toContain('G');
    expect(plain).not.toContain('up');
    expect(plain).not.toContain('down');
    expect(plain).not.toContain('home');
    expect(plain).not.toContain('end');
  });

  it('arrows-only preset has no j/k or Ctrl-u/Ctrl-d', () => {
    const pairs = resolveScrollKeyBindings('arrows-only');
    const keys = pairs.map((p) => p.key);
    expect(keys).toContain('up');
    expect(keys).toContain('down');
    expect(keys).not.toContain('j');
    expect(keys).not.toContain('k');
    expect(pairs.find((p) => p.ctrl)).toBeUndefined();
  });

  it('minimal preset only has up/down/PgUp/PgDn', () => {
    const pairs = resolveScrollKeyBindings('minimal');
    expect(new Set(pairs.map((p) => p.key))).toEqual(new Set(['up', 'down', 'pageup', 'pagedown']));
    expect(pairs.find((p) => p.ctrl)).toBeUndefined();
  });

  it('maps each key to a sensible ScrollRegionMsg', () => {
    const pairs = resolveScrollKeyBindings('default');
    const findPlain = (k: string): ScrollRegionMsg | undefined => pairs.find((p) => p.key === k && !p.ctrl && !p.alt)?.msg;
    expect(findPlain('up')).toEqual({ type: 'scroll-up' });
    expect(findPlain('down')).toEqual({ type: 'scroll-down' });
    expect(findPlain('pageup')).toEqual({ type: 'scroll-page-up' });
    expect(findPlain('pagedown')).toEqual({ type: 'scroll-page-down' });
    expect(findPlain('home')).toEqual({ type: 'scroll-to-top' });
    expect(findPlain('end')).toEqual({ type: 'scroll-to-bottom' });
    // Half-page bindings emit scroll-up/scroll-down with a fixed amount,
    // attached to ctrl-u and ctrl-d.
    const ctrlU = pairs.find((p) => p.key === 'u' && p.ctrl === true);
    const ctrlD = pairs.find((p) => p.key === 'd' && p.ctrl === true);
    expect(ctrlU?.msg).toEqual({ type: 'scroll-up', amount: 12 });
    expect(ctrlD?.msg).toEqual({ type: 'scroll-down', amount: 12 });
  });

  it('vim preset maps g/G to top/bottom', () => {
    const pairs = resolveScrollKeyBindings('vim');
    expect(pairs.find((p) => p.key === 'g' && !p.ctrl)?.msg).toEqual({ type: 'scroll-to-top' });
    expect(pairs.find((p) => p.key === 'G' && !p.ctrl)?.msg).toEqual({ type: 'scroll-to-bottom' });
  });
});

describe('formatScrollKey', () => {
  it('formats a plain key as the key name', () => {
    expect(formatScrollKey({ key: 'up', msg: { type: 'scroll-up' } })).toBe('up');
    expect(formatScrollKey({ key: 'G', msg: { type: 'scroll-to-bottom' } })).toBe('G');
  });

  it('prepends ctrl when set', () => {
    expect(formatScrollKey({ key: 'u', ctrl: true, msg: { type: 'scroll-up', amount: 12 } })).toBe('ctrl+u');
    expect(formatScrollKey({ key: 'd', ctrl: true, msg: { type: 'scroll-down', amount: 12 } })).toBe('ctrl+d');
  });

  it('prepends alt when set', () => {
    const b: ScrollKeyBinding = { key: 'down', alt: true, msg: { type: 'scroll-down' } };
    expect(formatScrollKey(b)).toBe('alt+down');
  });

  it('orders ctrl before alt', () => {
    const b: ScrollKeyBinding = { key: 'x', ctrl: true, alt: true, msg: { type: 'scroll-down' } };
    expect(formatScrollKey(b)).toBe('ctrl+alt+x');
  });
});

describe('scrollPaneSubscriptions', () => {
  type BatchSub = {
    _kind: {
      kind: 'batch';
      subs: Array<{ _kind: { kind: 'key' | 'keyWithModifiers'; key: string; modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean } } }>;
    };
  };

  it('returns a Sub.batch wrapping each resolved key', () => {
    const sub = scrollPaneSubscriptions((msg) => ({ wrapped: msg }), 'minimal');
    expect(sub._tag).toBe('sub');
    const inner = (sub as unknown as BatchSub)._kind;
    expect(inner.kind).toBe('batch');
    // Minimal has 4 keys, all plain (no modifiers).
    expect(inner.subs).toHaveLength(4);
    for (const s of inner.subs) {
      expect(s._kind.kind).toBe('key');
    }
  });

  it('default toMsg passthrough preserves the ScrollRegionMsg type', () => {
    type Wrapped = { kind: 'scroll'; msg: ScrollRegionMsg };
    const sub = scrollPaneSubscriptions<Wrapped>((msg) => ({ kind: 'scroll', msg }), 'default');
    expect(sub._tag).toBe('sub');
  });

  it('Ctrl-u / Ctrl-d use Sub.keyWithModifiers, not plain Sub.key', () => {
    // Plain Sub.key matches only when !event.ctrl && !event.alt — so a
    // binding for Ctrl+U MUST go through keyWithModifiers to fire. This
    // test locks the dispatch path so we don't regress the silent-failure
    // bug.
    const sub = scrollPaneSubscriptions((msg) => ({ wrapped: msg }), 'default');
    const inner = (sub as unknown as BatchSub)._kind;
    const ctrlSubs = inner.subs.filter((s) => s._kind.kind === 'keyWithModifiers' && s._kind.modifiers?.ctrl === true);
    // default preset has 2 ctrl bindings: ctrl+u and ctrl+d.
    expect(ctrlSubs).toHaveLength(2);
    const ctrlKeys = ctrlSubs.map((s) => s._kind.key).sort();
    expect(ctrlKeys).toEqual(['d', 'u']);
    // No plain Sub.key entries should claim 'ctrl+u' as the literal key
    // string — that was the original bug.
    const plainSubs = inner.subs.filter((s) => s._kind.kind === 'key');
    for (const s of plainSubs) {
      expect(s._kind.key).not.toMatch(/^ctrl\+/);
    }
  });

  it('vim preset also routes Ctrl-u / Ctrl-d through keyWithModifiers', () => {
    const sub = scrollPaneSubscriptions((msg) => ({ wrapped: msg }), 'vim');
    const inner = (sub as unknown as BatchSub)._kind;
    const ctrlSubs = inner.subs.filter((s) => s._kind.kind === 'keyWithModifiers' && s._kind.modifiers?.ctrl === true);
    expect(ctrlSubs).toHaveLength(2);
  });

  it('arrows-only and minimal presets emit only plain Sub.key entries', () => {
    for (const preset of ['arrows-only', 'minimal'] as const) {
      const sub = scrollPaneSubscriptions((msg) => ({ wrapped: msg }), preset);
      const inner = (sub as unknown as BatchSub)._kind;
      for (const s of inner.subs) {
        expect(s._kind.kind).toBe('key');
      }
    }
  });
});

describe('scroll model integration', () => {
  it('applies a scroll-down msg returned from the bindings', () => {
    let m = createScrollRegionModel('doc');
    m = scrollRegionUpdate({ type: 'set-content-size', height: 100, width: 80 }, m);
    m = scrollRegionUpdate({ type: 'set-viewport-size', height: 20, width: 80 }, m);

    const downMsg = resolveScrollKeyBindings('default').find((p) => p.key === 'down')?.msg;
    if (!downMsg) throw new Error('no down binding');
    m = scrollRegionUpdate(downMsg, m);
    expect(m.scrollY).toBe(1);
  });

  it('applies scroll-page-down', () => {
    let m = createScrollRegionModel('doc');
    m = scrollRegionUpdate({ type: 'set-content-size', height: 100, width: 80 }, m);
    m = scrollRegionUpdate({ type: 'set-viewport-size', height: 20, width: 80 }, m);

    const pdMsg = resolveScrollKeyBindings('default').find((p) => p.key === 'pagedown')?.msg;
    if (!pdMsg) throw new Error('no pagedown binding');
    m = scrollRegionUpdate(pdMsg, m);
    expect(m.scrollY).toBe(20);
  });
});
