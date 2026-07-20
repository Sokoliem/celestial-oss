import { describe, expect, it } from 'vitest';
import { themeToCssVars } from '../css-export.js';
import { defineDomainTokens } from '../domain-tokens.js';
import { defaultTheme } from '../theme.js';

describe('themeToCssVars', () => {
  it('emits at least 12 --celestial-color-* declarations covering the core color tokens', () => {
    const out = themeToCssVars(defaultTheme);
    expect(out.length).toBeGreaterThan(0);

    const matches = out.match(/--celestial-color-[a-z0-9-]+:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(12);

    // Top-level color tokens
    expect(out).toContain('--celestial-color-text:');
    expect(out).toContain('--celestial-color-bg:');
    expect(out).toContain('--celestial-color-surface:');
    expect(out).toContain('--celestial-color-surface-alt:');
    expect(out).toContain('--celestial-color-surface-raised:');
    expect(out).toContain('--celestial-color-muted:');
    expect(out).toContain('--celestial-color-border:');
    expect(out).toContain('--celestial-color-border-active:');

    // Tones (5+) — nested under colors.tones
    expect(out).toContain('--celestial-color-tones-accent:');
    expect(out).toContain('--celestial-color-tones-success:');
    expect(out).toContain('--celestial-color-tones-warning:');
    expect(out).toContain('--celestial-color-tones-danger:');
    expect(out).toContain('--celestial-color-tones-info:');
  });

  it('emits hex color values', () => {
    const out = themeToCssVars(defaultTheme);
    // every declaration value should be a #rrggbb
    const valueMatches = out.match(/: #[0-9a-f]{6};/g) ?? [];
    expect(valueMatches.length).toBeGreaterThanOrEqual(12);
  });

  it('produces single-line output by default (no newlines)', () => {
    const out = themeToCssVars(defaultTheme);
    expect(out).not.toContain('\n');
  });

  it('pretty: true adds newlines and 2-space indent for rule format', () => {
    const out = themeToCssVars(defaultTheme, { pretty: true });
    expect(out).toContain('\n');
  });

  it("format: 'rule' wraps output in :root { ... }", () => {
    const out = themeToCssVars(defaultTheme, { format: 'rule' });
    expect(out.startsWith(':root {')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
    expect(out).toContain('--celestial-color-text:');
  });

  it("format: 'rule' with pretty produces indented lines inside the rule", () => {
    const out = themeToCssVars(defaultTheme, { format: 'rule', pretty: true });
    expect(out.startsWith(':root {\n')).toBe(true);
    expect(out.endsWith('\n}')).toBe(true);
    expect(out).toMatch(/\n {2}--celestial-color-text:/);
  });

  it('honours a custom prefix', () => {
    const out = themeToCssVars(defaultTheme, { prefix: '--cw' });
    expect(out).toContain('--cw-color-text:');
    expect(out).toContain('--cw-color-bg:');
    expect(out).not.toContain('--celestial-color-text:');
  });

  it('is deterministic — repeated calls return identical output', () => {
    const a = themeToCssVars(defaultTheme);
    const b = themeToCssVars(defaultTheme);
    expect(a).toBe(b);

    const c = themeToCssVars(defaultTheme, { format: 'rule', pretty: true, prefix: '--x' });
    const d = themeToCssVars(defaultTheme, { format: 'rule', pretty: true, prefix: '--x' });
    expect(c).toBe(d);
  });

  it('emits domain tokens prefixed by the domain name', () => {
    const demoContract = defineDomainTokens({
      foo: (t) => t.colors.text,
      bar: (t) => t.colors.tones.accent,
    });
    const out = themeToCssVars(defaultTheme, {
      domains: [{ name: 'demo', contract: demoContract }],
    });
    expect(out).toMatch(/--celestial-demo-foo: #[0-9a-f]{6};/);
    expect(out).toMatch(/--celestial-demo-bar: #[0-9a-f]{6};/);
  });

  it('kebab-cases camelCase keys (e.g. surfaceAlt -> surface-alt)', () => {
    const out = themeToCssVars(defaultTheme);
    expect(out).toContain('--celestial-color-surface-alt:');
    expect(out).toContain('--celestial-color-surface-raised:');
    expect(out).toContain('--celestial-color-border-active:');
    expect(out).toContain('--celestial-color-border-hover:');
    expect(out).toContain('--celestial-color-text-soft:');
  });
});
