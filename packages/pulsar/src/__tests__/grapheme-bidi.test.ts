import { describe, expect, it } from 'vitest';
import { visualWidth } from '../renderer/width.js';
import { renderMarkdown } from '../renderer.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('grapheme-aware visualWidth', () => {
  it('measures ASCII as 1 cell per char', () => {
    expect(visualWidth('hello')).toBe(5);
  });

  it('measures CJK as 2 cells per character', () => {
    expect(visualWidth('日本語')).toBe(6);
  });

  it('counts a ZWJ emoji family as a single grapheme cluster', () => {
    // 👨‍👩‍👧 is one grapheme cluster (joined family). The legacy
    // code-point heuristic counted each emoji separately giving 6+ cells;
    // rosetta's grapheme-aware width returns 2 (the cluster's display width).
    expect(visualWidth('👨‍👩‍👧')).toBe(2);
  });

  it('counts combining marks as 0 width contribution', () => {
    // "café" with combining acute (e + ́) is 4 cells, same as "cafe" + 1.
    const composed = 'café';
    expect(visualWidth(composed)).toBe(4);
  });

  it('ignores ANSI codes when measuring', () => {
    expect(visualWidth('\x1b[31mhello\x1b[0m')).toBe(5);
  });
});

describe('ANSI-preserving bidi', () => {
  it('reorders RTL paragraph text', () => {
    // Hebrew "שלום" plus Latin should reorder. We just verify the output
    // differs from the source plain text (some reordering happened) and
    // that no ANSI escape was emitted from the input we provided.
    const out = renderMarkdown('שלום world', { bidi: true });
    expect(stripAnsi(out)).not.toBe('שלום world');
    expect(stripAnsi(out).length).toBeGreaterThan(0);
  });

  it('preserves SGR codes when reordering RTL text containing styles', () => {
    // Markdown bold injects SGR codes. With bidi reordering, the codes
    // should NOT be dropped (the legacy implementation stripped them).
    const out = renderMarkdown('**שלום** world', { bidi: true });
    expect(out).toContain('\x1b[');
  });

  it('passes through LTR text unchanged when bidi is enabled', () => {
    const ltr = renderMarkdown('Hello **world**', { bidi: true });
    const noBidi = renderMarkdown('Hello **world**', { bidi: false });
    expect(ltr).toBe(noBidi);
  });
});
