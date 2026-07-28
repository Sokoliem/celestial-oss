import { color, style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import { auditInteractionTree, buildAutomationSnapshot, setVNodeMeta } from '../../automation.js';
import { box, column, event, row, text } from '../../elements.js';
import { layout } from '../../vdom.js';
import type { EventNode } from '../../vdom.js';

function rules(node: Parameters<typeof auditInteractionTree>[0]): string[] {
  return auditInteractionTree(node, { width: 40, height: 8 }).violations.map((violation) => violation.rule);
}

describe('auditInteractionTree', () => {
  it('accepts a fully described, readable mouse region', () => {
    const node = event(
      'save-control',
      box(text('Save', style({ color: color.rgb(0, 0, 0) })), style({ background: color.rgb(255, 255, 255) })),
      { onClick: 'save', onMouseEnter: 'hover', onMouseLeave: 'leave' },
      {
        label: 'Save',
        intent: 'submit',
        affordances: ['hover', 'click'],
        cursor: 'pointer',
        keyboardHint: 'Enter',
      },
    );

    const result = auditInteractionTree(node, { width: 12, height: 2 });
    expect(result.violations).toEqual([]);
    expect(result.passes).toEqual(
      expect.arrayContaining([
        'mouse-regions-have-valid-ids',
        'mouse-regions-have-valid-handlers',
        'mouse-regions-have-labels',
        'mouse-regions-have-hit-areas',
        'mouse-regions-have-affordances',
        'mouse-regions-have-cursors',
        'mouse-actions-have-hover-feedback',
        'disabled-mouse-regions-are-inert',
        'mouse-region-color-contrast',
      ]),
    );
  });

  it('accepts automatic fallback feedback and rejects incomplete managed feedback', () => {
    const automatic = event(
      'automatic',
      text('Open'),
      { onClick: 'open' },
      { label: 'Open', affordances: ['click'], cursor: 'pointer' },
    );
    expect(rules(automatic)).not.toContain('mouse-actions-have-hover-feedback');

    const incomplete: EventNode = {
      kind: 'event',
      id: 'incomplete',
      child: text('Open'),
      handlers: { onClick: 'open', onMouseEnter: 'enter' },
      metadata: {
        label: 'Open',
        affordances: ['hover', 'click'],
        cursor: 'pointer',
        hoverFeedback: 'managed',
      },
    };
    expect(rules(incomplete)).toContain('mouse-actions-have-hover-feedback');
  });

  it('rejects unsafe IDs, empty handler tags, missing labels, affordances, and cursors', () => {
    const malformed: EventNode = {
      kind: 'event',
      id: 'unsafe\u001b[2J',
      child: text(''),
      handlers: { onClick: '' },
      metadata: { affordances: [] },
    };

    expect(rules(malformed)).toEqual(
      expect.arrayContaining([
        'mouse-regions-have-valid-ids',
        'mouse-regions-have-valid-handlers',
        'mouse-regions-have-labels',
        'mouse-regions-have-affordances',
        'mouse-regions-have-cursors',
      ]),
    );
  });

  it('requires pointer gestures to expose an action affordance', () => {
    const malformed: EventNode = {
      kind: 'event',
      id: 'resize-handle',
      child: text('│'),
      handlers: { onMouseDown: 'resize-start', onMouseMove: 'resize-move' },
      metadata: { label: 'Resize handle', affordances: ['hover'], cursor: 'ew-resize' },
    };
    expect(rules(malformed)).toContain('mouse-regions-have-affordances');

    const valid = event(
      'valid-resize-handle',
      text('│', style({ color: color.rgb(255, 255, 255) })),
      { onMouseDown: 'resize-start', onMouseMove: 'resize-move' },
      { label: 'Resize handle', affordances: ['resize'], cursor: 'ew-resize' },
    );
    expect(rules(valid)).not.toContain('mouse-regions-have-affordances');
  });

  it('rejects active regions with zero-sized layout geometry', () => {
    const node = event(
      'zero-size',
      box(text('Open'), undefined, { width: 0, height: 0 }),
      { onClick: 'open' },
      { label: 'Open', affordances: ['click'], cursor: 'pointer' },
    );
    expect(rules(node)).toContain('mouse-regions-have-hit-areas');
  });

  it('rejects active handlers beneath accessibility-disabled regions', () => {
    const node = event(
      'disabled-control',
      text('Disabled'),
      { onClick: 'activate' },
      { label: 'Disabled control', affordances: ['click'], cursor: 'not-allowed' },
    );
    setVNodeMeta(node, { a11y: { role: 'button', label: 'Disabled control', disabled: true } });
    expect(rules(node)).toContain('disabled-mouse-regions-are-inert');

    const passive = event(
      'disabled-scroll-row',
      text('Disabled row'),
      { onMouseEnter: 'show-help', onScroll: 'scroll-list' },
      { label: 'Disabled row', affordances: ['hover', 'scroll'], cursor: 'default' },
    );
    setVNodeMeta(passive, { a11y: { role: 'listitem', label: 'Disabled row', disabled: true } });
    expect(rules(passive)).not.toContain('disabled-mouse-regions-are-inert');
  });

  it('allows repeated semantic targets but rejects conflicting contracts for one active ID', () => {
    const control = (label: string) =>
      event('duplicate', text(label), { onClick: `activate-${label}` }, { label, affordances: ['click'], cursor: 'pointer' });
    expect(rules(row(control('One'), control('Two')))).toContain('mouse-regions-have-valid-ids');
    expect(rules(row(control('One'), control('One')))).not.toContain('mouse-regions-have-valid-ids');
  });

  it('checks final text and graphical glyph contrast inside mouse regions', () => {
    const lowText = event(
      'low-text',
      box(text('Activate', style({ color: color.rgb(180, 180, 180) })), style({ background: color.rgb(255, 255, 255) })),
      { onClick: 'activate' },
      { label: 'Activate', affordances: ['click'], cursor: 'pointer' },
    );
    const lowGraphic = event(
      'low-graphic',
      box(text('█', style({ color: color.rgb(180, 180, 180) })), style({ background: color.rgb(255, 255, 255) })),
      { onMouseDown: 'drag' },
      { label: 'Drag thumb', affordances: ['drag'], cursor: 'grab' },
    );
    const result = auditInteractionTree(column(lowText, lowGraphic), { width: 12, height: 3 });
    const contrast = result.violations.filter((violation) => violation.rule === 'mouse-region-color-contrast');
    expect(contrast).toHaveLength(2);
    expect(contrast[0]?.message).toContain('4.5:1');
    expect(contrast[1]?.message).toContain('3.0:1');
  });

  it('uses supplied terminal defaults for otherwise unstyled cells', () => {
    const node = event('default-colors', text('Open'), { onClick: 'open' }, { label: 'Open', affordances: ['click'], cursor: 'pointer' });
    expect(
      auditInteractionTree(node, {
        width: 8,
        height: 1,
        defaultForeground: color.rgb(20, 20, 20),
        defaultBackground: color.rgb(255, 255, 255),
      }).violations,
    ).toEqual([]);
  });

  it('keeps spatial catch-alls structural without attributing descendant contrast to them', () => {
    const node = event(
      'workspace-menu',
      text('Workspace', style({ color: color.rgb(180, 180, 180), background: color.rgb(255, 255, 255) })),
      { onRightClick: 'open-menu' },
      { label: 'Workspace context menu', affordances: ['click'], cursor: 'pointer', presentation: 'spatial' },
    );
    expect(rules(node)).not.toContain('mouse-region-color-contrast');
  });

  it('is wired into automation snapshots with the exact painted grid', () => {
    const node = event(
      'snapshot-control',
      box(text('Open', style({ color: color.rgb(190, 190, 190) })), style({ background: color.rgb(255, 255, 255) })),
      { onClick: 'open' },
      { label: 'Open', affordances: ['click'], cursor: 'pointer' },
    );
    const snapshot = buildAutomationSnapshot(node, layout(node, 12, 2), 12, 2);
    expect(snapshot.audit.violations.map((violation) => violation.rule)).toContain('mouse-region-color-contrast');
  });
});
