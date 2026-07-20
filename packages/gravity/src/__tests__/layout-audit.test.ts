import { box, empty, overlay, region, text } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { auditVNodeLayout } from '../layout-audit.js';

describe('auditVNodeLayout', () => {
  it('passes bounded labeled interactive regions', () => {
    const result = auditVNodeLayout(region('ok', { label: 'Open', intent: 'open' }, text('Open'), { onClick: 'open' }), {
      width: 20,
      height: 5,
      requireInteractiveLabels: true,
    });

    expect(result.ok).toBe(true);
  });

  it('reports interactive regions without metadata labels', () => {
    const result = auditVNodeLayout(region('missing', {}, text('Open'), { onClick: 'open' }), {
      width: 20,
      height: 5,
      requireInteractiveLabels: true,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('interactive-missing-label');
  });

  it('reports entries outside the viewport', () => {
    const result = auditVNodeLayout(overlay(box(empty(4, 2)), { x: 8, y: 0 }), {
      width: 10,
      height: 5,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('entry-out-of-bounds');
  });
});
