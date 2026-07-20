import { describe, expect, it } from 'vitest';
import { auditDomainTokenCoverage } from '../a11y.js';
import { color } from '../color.js';
import { costTokens, gitTokens, statusTokens } from '../domain-tokens.js';
import { createTheme, defaultTheme, extendTheme } from '../theme.js';

describe('auditDomainTokenCoverage', () => {
  it('passes for defaultTheme over [statusTokens, gitTokens, costTokens] at AA', () => {
    const report = auditDomainTokenCoverage(defaultTheme, [statusTokens, gitTokens, costTokens]);
    // 16 keys total (7 status + 6 git + 3 cost) × 3 backgrounds = 48 pairs
    expect(report.total).toBe(48);
    expect(report.passed).toBe(report.total - report.violations.length);
    expect(report.violations).toHaveLength(0);
  });

  it('reports a violation when a tone is forced too close to surface', () => {
    // Pin warning tone to a near-surface color so contrast collapses below AA.
    // surface in defaultTheme is dark; pin warning to a near-black to ensure failure.
    const broken = extendTheme(defaultTheme, {
      colors: {
        tones: {
          warning: color.hex('#0a0e16'),
        },
      },
    });

    const report = auditDomainTokenCoverage(broken, [statusTokens]);
    expect(report.violations.length).toBeGreaterThan(0);

    const warningViolation = report.violations.find((v) => v.key === 'warning');
    expect(warningViolation).toBeDefined();
    if (!warningViolation) return;
    expect(warningViolation.contract).toBe('contract-0');
    expect(warningViolation.required).toBe(4.5);
    expect(warningViolation.ratio).toBeGreaterThanOrEqual(1);
    expect(warningViolation.ratio).toBeLessThan(4.5);
    expect(warningViolation.background).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('AAA threshold (7:1) produces at least as many violations as AA (4.5:1)', () => {
    // Build a theme with deliberately low-contrast tones so AAA bites harder.
    const marginal = extendTheme(defaultTheme, {
      colors: {
        tones: {
          warning: color.hex('#5a5a5a'),
          info: color.hex('#4a4a4a'),
        },
      },
    });

    const aaReport = auditDomainTokenCoverage(marginal, [statusTokens], { level: 'AA' });
    const aaaReport = auditDomainTokenCoverage(marginal, [statusTokens], { level: 'AAA' });

    expect(aaaReport.violations.length).toBeGreaterThanOrEqual(aaReport.violations.length);
    // And strictly greater for these tones — they pass AA but fail AAA.
    expect(aaaReport.violations.length).toBeGreaterThan(aaReport.violations.length);
    for (const v of aaaReport.violations) {
      expect(v.required).toBe(7);
    }
  });

  it('largeText: true relaxes thresholds (AA → 3, AAA → 4.5)', () => {
    const broken = extendTheme(defaultTheme, {
      colors: {
        tones: {
          warning: color.hex('#3a3a3a'),
        },
      },
    });

    const aaNormal = auditDomainTokenCoverage(broken, [statusTokens], { level: 'AA' });
    const aaLarge = auditDomainTokenCoverage(broken, [statusTokens], { level: 'AA', largeText: true });

    // Looser threshold ⇒ no more violations than the strict threshold.
    expect(aaLarge.violations.length).toBeLessThanOrEqual(aaNormal.violations.length);
    for (const v of aaLarge.violations) {
      expect(v.required).toBe(3);
    }

    const aaaLarge = auditDomainTokenCoverage(broken, [statusTokens], { level: 'AAA', largeText: true });
    for (const v of aaaLarge.violations) {
      expect(v.required).toBe(4.5);
    }
  });

  it('contractNames map produces named violations', () => {
    const broken = createTheme({
      colors: {
        tones: {
          warning: color.hex('#181818'),
        },
        surface: color.hex('#101010'),
        surfaceAlt: color.hex('#101010'),
        surfaceRaised: color.hex('#101010'),
      },
    });

    const names = new Map<typeof statusTokens, string>([[statusTokens, 'status']]);
    const report = auditDomainTokenCoverage(broken, [statusTokens], { contractNames: names });

    expect(report.violations.length).toBeGreaterThan(0);
    for (const v of report.violations) {
      expect(v.contract).toBe('status');
    }
  });

  it('falls back to contract-<index> when contractNames omits an entry', () => {
    const broken = extendTheme(defaultTheme, {
      colors: {
        tones: {
          warning: color.hex('#0a0e16'),
        },
      },
    });

    // Pass an empty names map — every contract should fall back to its index label.
    const report = auditDomainTokenCoverage(broken, [statusTokens, gitTokens], {
      contractNames: new Map(),
    });
    const contractNames = new Set(report.violations.map((v) => v.contract));
    for (const name of contractNames) {
      expect(name).toMatch(/^contract-\d+$/);
    }
  });

  it('respects custom backgrounds option', () => {
    const customBg = color.hex('#ffffff');
    const report = auditDomainTokenCoverage(defaultTheme, [statusTokens], {
      backgrounds: [customBg],
    });
    // 7 status keys × 1 background = 7 pairs
    expect(report.total).toBe(7);
    for (const v of report.violations) {
      expect(v.background).toBe('#ffffff');
    }
  });

  it('total counts every (token, background) pair, passed = total - violations', () => {
    const report = auditDomainTokenCoverage(defaultTheme, [statusTokens, gitTokens]);
    // (7 + 6) × 3 = 39
    expect(report.total).toBe(39);
    expect(report.passed + report.violations.length).toBe(report.total);
  });

  it('violation hex backgrounds are lowercase #rrggbb', () => {
    const broken = extendTheme(defaultTheme, {
      colors: {
        tones: {
          warning: color.hex('#0a0e16'),
        },
      },
    });
    const report = auditDomainTokenCoverage(broken, [statusTokens]);
    for (const v of report.violations) {
      expect(v.background).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
