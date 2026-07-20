import { describe, expect, it } from 'vitest';
import * as test from '../index.js';

describe('@celestial/test preview surface', () => {
  it('provides deterministic headless helpers', () => {
    expect(test.MockTerminal).toBeTypeOf('function');
    expect(test.createTestApp).toBeTypeOf('function');
    expect(test.renderToText).toBeTypeOf('function');
    expect(test.fireMouse).toBeTypeOf('function');
    expect(test.auditA11y).toBeTypeOf('function');
  });

  it('does not pull visual or phase integrations into the default entry', () => {
    expect('compareVisualSnapshot' in test).toBe(false);
    expect('createPhaseTestHarness' in test).toBe(false);
  });
});
