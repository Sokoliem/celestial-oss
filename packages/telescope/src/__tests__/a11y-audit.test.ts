import { column, focus, text, type VNode } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { auditA11y } from '../a11y-audit.js';
import { a11y } from '../queries.js';

describe('a11y audit', () => {
  // ── interactive-elements-have-labels ───────────────────────────────

  describe('interactive-elements-have-labels', () => {
    it('passes when interactive elements have labels', () => {
      const tree: VNode = a11y({ role: 'button', label: 'Submit' }, text('Submit'));
      const result = auditA11y(tree);
      expect(result.violations.filter((v) => v.rule === 'interactive-elements-have-labels')).toHaveLength(0);
    });

    it('reports violation when interactive element lacks label', () => {
      const tree: VNode = a11y({ role: 'button' }, text(''));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'interactive-elements-have-labels');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('passes when interactive element has visible text content', () => {
      const tree: VNode = a11y({ role: 'button' }, text('Click Me'));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'interactive-elements-have-labels');
      expect(violations).toHaveLength(0);
    });

    it('ignores aria-hidden interactive elements by default', () => {
      const tree: VNode = a11y({ role: 'button', hidden: true }, text(''));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'interactive-elements-have-labels');
      expect(violations).toHaveLength(0);
    });

    it('ignores interactive descendants of aria-hidden containers', () => {
      const tree: VNode = a11y({ hidden: true }, column(a11y({ role: 'button' }, text(''))));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'interactive-elements-have-labels');
      expect(violations).toHaveLength(0);
    });
  });

  // ── focus-visible ──────────────────────────────────────────────────

  describe('focus-visible', () => {
    it('passes when focused element has visible indicator', () => {
      const tree: VNode = focus('btn', text('> Submit <'), true);
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'focus-visible');
      expect(violations).toHaveLength(0);
    });

    it('reports violation when focused element has no visible focus cue', () => {
      const tree: VNode = focus('btn', text('Submit'), true);
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'focus-visible');
      expect(violations).toHaveLength(1);
    });

    it('passes when focused element has focus styling', () => {
      const tree: VNode = focus(
        'btn',
        {
          kind: 'text',
          content: 'Submit',
          style: { underline: true },
        },
        true,
      );
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'focus-visible');
      expect(violations).toHaveLength(0);
    });
  });

  // ── heading-levels-sequential ──────────────────────────────────────

  describe('heading-levels-sequential', () => {
    it('passes with sequential heading levels', () => {
      const tree: VNode = column(a11y({ role: 'heading', level: 1 }, text('Title')), a11y({ role: 'heading', level: 2 }, text('Subtitle')));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'heading-levels-sequential');
      expect(violations).toHaveLength(0);
    });

    it('reports violation when heading levels skip', () => {
      const tree: VNode = column(a11y({ role: 'heading', level: 1 }, text('Title')), a11y({ role: 'heading', level: 3 }, text('Skipped to H3')));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'heading-levels-sequential');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('ignores hidden headings in level ordering', () => {
      const tree: VNode = column(
        a11y({ role: 'heading', level: 1 }, text('Visible Title')),
        a11y({ role: 'heading', level: 2, hidden: true }, text('Hidden Subtitle')),
        a11y({ role: 'heading', level: 2 }, text('Visible Subtitle')),
      );
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'heading-levels-sequential');
      expect(violations).toHaveLength(0);
    });
  });

  // ── live-regions-have-politeness ───────────────────────────────────

  describe('live-regions-have-politeness', () => {
    it('passes when live region has politeness level', () => {
      const tree: VNode = a11y({ live: 'polite' }, text('Status: OK'));
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'live-regions-have-politeness');
      expect(violations).toHaveLength(0);
    });
  });

  describe('color-contrast', () => {
    it('reports violation for low-contrast text', () => {
      const tree: VNode = {
        kind: 'text',
        content: 'Muted',
        style: { fg: '\x1b[30m', bg: '\x1b[40m' },
      };
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'color-contrast');
      expect(violations.length).toBeGreaterThan(0);
    });

    it('passes high-contrast text', () => {
      const tree: VNode = {
        kind: 'text',
        content: 'Readable',
        style: { fg: '\x1b[30m', bg: '\x1b[107m' },
      };
      const result = auditA11y(tree);
      const violations = result.violations.filter((v) => v.rule === 'color-contrast');
      expect(violations).toHaveLength(0);
    });
  });

  // ── overall audit ──────────────────────────────────────────────────

  describe('overall audit', () => {
    it('returns passes for rules that pass', () => {
      const tree: VNode = a11y({ role: 'button', label: 'OK' }, text('OK'));
      const result = auditA11y(tree);
      expect(result.passes.length).toBeGreaterThan(0);
    });

    it('handles empty tree', () => {
      const tree: VNode = text('');
      const result = auditA11y(tree);
      expect(result.violations).toBeDefined();
      expect(result.passes).toBeDefined();
    });

    it('handles deeply nested tree', () => {
      const tree: VNode = column(
        a11y(
          { role: 'navigation', label: 'Main' },
          column(a11y({ role: 'button', label: 'Home' }, text('Home')), a11y({ role: 'button', label: 'About' }, text('About'))),
        ),
      );
      const result = auditA11y(tree);
      const labelViolations = result.violations.filter((v) => v.rule === 'interactive-elements-have-labels');
      expect(labelViolations).toHaveLength(0);
    });
  });
});
