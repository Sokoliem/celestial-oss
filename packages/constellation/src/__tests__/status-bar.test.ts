import { getVNodeMeta } from '@celestial/core/nebula';
import { measureTextWidth } from '@celestial/rosetta';
import { auditA11y, renderToLines } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { type StatusBarModel, statusBar } from '../status-bar.js';

function textContent(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const candidate = node as { kind?: string; content?: string; child?: unknown; children?: unknown[] };
  const own = candidate.kind === 'text' ? (candidate.content ?? '') : '';
  return `${own}${(candidate.children ?? []).map(textContent).join('')}${candidate.child === undefined ? '' : textContent(candidate.child)}`;
}

describe('statusBar', () => {
  it('normalizes widths and owns immutable section snapshots', () => {
    const left = [{ text: 'NORMAL', mode: true }] as const;
    const component = statusBar({ width: Number.NaN, left });
    const [model] = component.init();

    expect(model.width).toBe(80);
    expect(model.left).toEqual(left);
    expect(model.left).not.toBe(left);

    const [negative] = component.update({ type: 'resize', width: -10 }, model);
    expect(negative.width).toBe(1);
    const [infinite] = component.update({ type: 'resize', width: Number.POSITIVE_INFINITY }, model);
    expect(infinite.width).toBe(model.width);
  });

  it('renders exactly the requested cell width and centers by cell geometry', () => {
    const component = statusBar({
      width: 32,
      left: [{ text: '界', mode: true }],
      center: [{ text: 'e\u0301ditor', bold: true }],
      right: [{ text: 'Ln 1' }],
    });
    const [model] = component.init();
    const rendered = textContent(component.view(model));

    expect(measureTextWidth(rendered)).toBe(32);
    expect(measureTextWidth(rendered.slice(0, rendered.indexOf('e\u0301ditor')))).toBe(Math.floor((32 - measureTextWidth('e\u0301ditor')) / 2));
  });

  it('clips overflowing zones without splitting emoji or combining graphemes', () => {
    const component = statusBar({
      width: 18,
      left: [{ text: '👩‍🚀 mission-control-that-is-long', mode: true }],
      right: [{ text: 'e\u0301tat: ready' }],
    });
    const [model] = component.init();
    const rendered = textContent(component.view(model));

    expect(measureTextWidth(rendered)).toBe(18);
    expect(rendered).not.toContain('\uFFFD');
    expect(rendered).not.toMatch(/\u200D$/u);
    expect(rendered).toContain('…');
  });

  it('rejects multiline status sections instead of corrupting one-line geometry', () => {
    expect(() => statusBar({ left: [{ text: 'line one\nline two' }] })).toThrow(/single-line/i);
  });

  it('rejects invisible terminal controls before geometry reaches the painter', () => {
    for (const control of ['\t', '\u0000', '\u001b', '\u007f', '\u009f']) {
      expect(() => statusBar({ left: [{ text: `ready${control}` }] })).toThrow(/printable/i);
    }
  });

  it('rejects non-printing Unicode and non-boolean presentation flags', () => {
    for (const unsafe of ['\u2028', '\u2029', '\u2066', '\ud800']) {
      expect(() => statusBar({ left: [{ text: `ready${unsafe}` }] })).toThrow(/printable/i);
    }
    expect(() => statusBar({ left: [{ text: 'ready', bold: 1 as never }] })).toThrow(/bold.*boolean/i);
    expect(() => statusBar({ left: [{ text: 'ready', mode: 'yes' as never }] })).toThrow(/mode.*boolean/i);
  });

  it('rejects accessor sections and oversized sparse arrays without reading them', () => {
    let textReads = 0;
    const accessor = Object.defineProperty({}, 'text', {
      enumerable: true,
      get: () => {
        textReads += 1;
        return 'ready';
      },
    });
    expect(() => statusBar({ left: [accessor as never] })).toThrow(/text.*own data property/i);
    expect(textReads).toBe(0);

    const huge = new Array<never>(4_294_967_295);
    expect(() => statusBar({ left: huge })).toThrow(/at most 10000/i);
  });

  it('quotes unknown message types without leaking terminal or directionality controls', () => {
    const component = statusBar({});
    const [model] = component.init();

    for (const unsafe of ['\n', '\u001b', '\u202e', '\u2066', '\ud800']) {
      let message = '';
      try {
        component.update({ type: `unknown${unsafe}type` } as never, model);
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).toContain('Unknown status bar message type');
      expect(message).not.toContain(unsafe);
    }

    let boundedMessage = '';
    try {
      component.update({ type: 'x'.repeat(10_000) } as never, model);
    } catch (error) {
      boundedMessage = error instanceof Error ? error.message : '';
    }
    expect(boundedMessage.length).toBeLessThan(1_100);
    expect(boundedMessage).toContain('…');
  });

  it('preserves the exact cell-width contract through rasterization', () => {
    const component = statusBar({
      width: 18,
      left: [{ text: '界', mode: true }],
      center: [{ text: 'e\u0301dit' }],
      right: [{ text: '1:2' }],
    });
    const [model] = component.init();
    const [line = ''] = renderToLines(component.view(model), { width: 18, height: 1 });

    expect(measureTextWidth(line)).toBe(18);
    expect(line).toContain('界');
    expect(line).toContain('e\u0301dit');
    expect(line).toContain('1:2');
  });

  it('carries status semantics and passes the accessibility audit', () => {
    const component = statusBar({ left: [{ text: 'READY', mode: true }], right: [{ text: '0 errors' }] });
    const [model] = component.init();
    const view = component.view(model);

    expect(getVNodeMeta(view)?.a11y).toMatchObject({ role: 'status' });
    expect(getVNodeMeta(view)?.a11y?.label).toContain('READY');
    expect(auditA11y(view).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  it('replaces zones with validated snapshots and subscribes to resize', () => {
    const component = statusBar({});
    const [initial] = component.init();
    const next = [{ text: 'INSERT', mode: true }] as const;
    const [updated] = component.update({ type: 'update-left', sections: next }, initial);

    expect(updated.left).toEqual(next);
    expect(updated.left).not.toBe(next);
    expect((component.subscriptions?.(updated) as unknown as { _kind: { kind: string } })._kind.kind).toBe('resize');
  });

  it('keeps an externally supplied model bounded at render time', () => {
    const component = statusBar({});
    const hostile = {
      left: [{ text: 'left' }],
      center: [],
      right: [],
      width: Number.POSITIVE_INFINITY,
    } satisfies StatusBarModel;

    expect(measureTextWidth(textContent(component.view(hostile)))).toBe(80);
  });

  it('rejects accessor-backed external models before rendering or deriving accessibility text', () => {
    const component = statusBar({});
    let leftReads = 0;
    const hostile = Object.defineProperties(
      {},
      {
        left: {
          enumerable: true,
          get: () => {
            leftReads += 1;
            return leftReads === 1 ? [{ text: 'safe' }] : [{ text: '\u001b[31munsafe' }];
          },
        },
        center: { enumerable: true, value: [] },
        right: { enumerable: true, value: [] },
        width: { enumerable: true, value: 80 },
      },
    ) as StatusBarModel;

    expect(() => component.view(hostile)).toThrow(/left.*own data property/i);
    expect(leftReads).toBe(0);
  });
});
