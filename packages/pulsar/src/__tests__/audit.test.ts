import { describe, expect, it } from 'vitest';
import { auditMarkdown } from '../audit.js';
import { parseMarkdown } from '../parser.js';
import { renderMarkdown } from '../renderer.js';

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
}

describe('auditMarkdown', () => {
  it('returns passed=true for a clean document', () => {
    const report = auditMarkdown('# Hello\n\nThis is fine.');
    expect(report.passed).toBe(true);
  });

  it('reports heading-level skips', () => {
    const report = auditMarkdown('# H1\n\n### H3');
    const skips = report.findings.filter((f) => f.message.includes('Heading level skip'));
    expect(skips.length).toBeGreaterThanOrEqual(1);
    expect(skips[0]?.level).toBe('info');
  });

  it('reports broken anchor references', () => {
    const report = auditMarkdown('[link](#missing)');
    const broken = report.findings.filter((f) => f.message.includes('Broken anchor'));
    expect(broken.length).toBe(1);
    expect(broken[0]?.level).toBe('warn');
  });

  it('reports missing image alt text', () => {
    const report = auditMarkdown('![](url)');
    const missing = report.findings.filter((f) => f.message.includes('missing alt'));
    expect(missing.length).toBe(1);
    expect(missing[0]?.level).toBe('warn');
  });

  it('reports unknown fence languages', () => {
    const report = auditMarkdown('```obscure-lang\nfoo\n```');
    const unknown = report.findings.filter((f) => f.message.includes('Unknown fence'));
    expect(unknown.length).toBe(1);
    expect(unknown[0]?.level).toBe('info');
  });

  it('reports footnote orphans', () => {
    const report = auditMarkdown('Text [^1]');
    const orphan = report.findings.filter((f) => f.message.includes('without definition'));
    expect(orphan.length).toBe(1);
  });
});

describe('corona-domain admonitions (B10)', () => {
  it('parses namespaced admonition kinds', () => {
    const tokens = parseMarkdown('> [!ROLE:permission]\n> content');
    const admonition = tokens[0] as Extract<import('../types.js').Token, { type: 'admonition' }>;
    expect(admonition.type).toBe('admonition');
    expect(admonition.kind).toBe('role:permission');
  });

  it('renders namespaced admonition without crashing', () => {
    const out = renderMarkdown('> [!ROLE:permission]\n> content');
    const plain = stripAnsi(out);
    expect(plain).toContain('Role:permission');
    expect(plain).toContain('content');
  });
});

describe('screen-reader hints (B11)', () => {
  it('emits structural markers when screenReaderHints is true', () => {
    const out = renderMarkdown('# Hello', { screenReaderHints: true });
    expect(out).toContain('\x1b[?2000h');
    expect(out).toContain('[heading level 1]');
    expect(out).toContain('\x1b[?2000l');
  });

  it('omits markers when screenReaderHints is false', () => {
    const out = renderMarkdown('# Hello', { screenReaderHints: false });
    expect(out).not.toContain('\x1b[?2000h');
  });
});
