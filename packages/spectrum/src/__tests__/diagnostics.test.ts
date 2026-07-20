import { describe, expect, it } from 'vitest';
import {
  applyOverlaysToLine,
  type DiagnosticMarker,
  type DiagnosticProvider,
  groupDiagnosticsByLine,
  groupInlaysByLine,
  type InlayChip,
  pickHighestSeverity,
} from '../diagnostics.js';

const mark = (line: number, col: number, len: number, severity: DiagnosticMarker['severity'], message = 'oops'): DiagnosticMarker => ({
  line,
  col,
  len,
  severity,
  message,
});

const chip = (line: number, col: number, text: string, kind: InlayChip['kind'] = 'type'): InlayChip => ({ line, col, text, kind });

describe('groupDiagnosticsByLine / groupInlaysByLine', () => {
  it('groups markers by line preserving insertion order', () => {
    const grouped = groupDiagnosticsByLine([mark(0, 1, 1, 'error'), mark(0, 5, 1, 'warn'), mark(2, 0, 3, 'info')]);
    expect(grouped.size).toBe(2);
    expect(grouped.get(0)?.length).toBe(2);
    expect(grouped.get(0)?.[0]?.severity).toBe('error');
    expect(grouped.get(0)?.[1]?.severity).toBe('warn');
    expect(grouped.get(2)?.length).toBe(1);
  });

  it('returns empty map for empty input', () => {
    expect(groupDiagnosticsByLine([]).size).toBe(0);
    expect(groupInlaysByLine([]).size).toBe(0);
  });

  it('groups inlays by line', () => {
    const grouped = groupInlaysByLine([chip(0, 1, 'string'), chip(0, 5, 'number'), chip(1, 2, 'param')]);
    expect(grouped.size).toBe(2);
    expect(grouped.get(0)?.length).toBe(2);
    expect(grouped.get(1)?.length).toBe(1);
  });
});

describe('pickHighestSeverity', () => {
  it('returns undefined for empty input', () => {
    expect(pickHighestSeverity([])).toBeUndefined();
  });

  it('picks error over warn over info', () => {
    expect(pickHighestSeverity([mark(0, 0, 1, 'info'), mark(0, 2, 1, 'warn'), mark(0, 4, 1, 'error')])?.severity).toBe('error');
    expect(pickHighestSeverity([mark(0, 0, 1, 'info'), mark(0, 2, 1, 'warn')])?.severity).toBe('warn');
    expect(pickHighestSeverity([mark(0, 0, 1, 'info'), mark(0, 2, 1, 'info')])?.severity).toBe('info');
  });

  it('ignores malformed runtime severity values', () => {
    const malformed = { ...mark(0, 0, 1, 'info'), severity: 'fatal' } as unknown as DiagnosticMarker;
    expect(pickHighestSeverity([malformed, mark(0, 1, 1, 'warn')])?.severity).toBe('warn');
  });
});

describe('applyOverlaysToLine', () => {
  it('returns the styled text unchanged when no overlays are present', () => {
    const styled = '\x1b[1mhello\x1b[0m';
    expect(applyOverlaysToLine(styled, 'hello', [], [])).toBe(styled);
  });

  it('appends a diagnostic segment after the line', () => {
    const styled = 'const x = 1;';
    const out = applyOverlaysToLine(styled, 'const x = 1;', [mark(0, 6, 1, 'error', 'unused')], []);
    expect(out.startsWith(styled)).toBe(true);
    expect(out).toContain('error: unused');
  });

  it('appends inlay chips after the line in column order', () => {
    const out = applyOverlaysToLine('const x = 1', 'const x = 1', [], [chip(0, 7, ': string'), chip(0, 11, ': number')]);
    const idxString = out.indexOf(': string');
    const idxNumber = out.indexOf(': number');
    expect(idxString).toBeGreaterThan(0);
    expect(idxNumber).toBeGreaterThan(idxString);
  });

  it('emits curly-underline ANSI when curlyUnderline is true (default)', () => {
    const out = applyOverlaysToLine('hello', 'hello', [mark(0, 0, 5, 'error')], []);
    expect(out).toContain('\x1b[4:3m');
    expect(out).toContain('\x1b[24m');
  });

  it('omits curly-underline when curlyUnderline is false', () => {
    const out = applyOverlaysToLine('hello', 'hello', [mark(0, 0, 5, 'error')], [], { curlyUnderline: false });
    expect(out).not.toContain('\x1b[4:3m');
  });

  it('honours custom severity colors', () => {
    const out = applyOverlaysToLine('hello', 'hello', [mark(0, 0, 5, 'error', 'bad')], [], {
      severityColors: { error: (t) => `<<E>>${t}<</>>` },
    });
    expect(out).toContain('<<E>>');
  });

  it('honours custom inlay style and bracket', () => {
    const out = applyOverlaysToLine('x', 'x', [], [chip(0, 1, 'string')], {
      inlayStyle: (t) => `<<I>>${t}<</>>`,
      inlayBracket: ['[', ']'],
    });
    expect(out).toContain('<<I>>[string]<</>>');
  });

  it('clamps marker columns within the line text', () => {
    // marker spans columns 0-100 but the line is only 5 chars
    const out = applyOverlaysToLine('hello', 'hello', [mark(0, 0, 100, 'warn', 'big')], []);
    // The slice used must be at most the line length.
    expect(out).toContain('warn: big');
  });

  it('ignores malformed numeric overlays instead of throwing', () => {
    const malformed = mark(0, Number.NaN, Number.POSITIVE_INFINITY, 'error');
    expect(() => applyOverlaysToLine('hello', 'hello', [malformed], [chip(0, Number.NaN, 'bad')])).not.toThrow();
    expect(applyOverlaysToLine('hello', 'hello', [malformed], [chip(0, Number.NaN, 'bad')])).toBe('hello');
  });
});

describe('DiagnosticProvider — type contract', () => {
  it('provider returns markers asynchronously', async () => {
    const provider: DiagnosticProvider = async () => [mark(0, 0, 1, 'error', 'fake')];
    const result = await provider('test://uri');
    expect(result.length).toBe(1);
    expect(result[0]?.severity).toBe('error');
  });
});
