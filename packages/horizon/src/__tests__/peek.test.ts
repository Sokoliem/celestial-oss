import { describe, expect, it } from 'vitest';
import { createPeekModel, isPeekingPanel, isPinnedPanel, peekUpdate } from '../peek.js';

describe('peek', () => {
  it('enters and exits peek mode', () => {
    let model = createPeekModel();
    model = peekUpdate({ type: 'peek-enter', panelId: 'sidebar', peekWidth: 24 }, model);
    expect(isPeekingPanel(model, 'sidebar')).toBe(true);

    model = peekUpdate({ type: 'peek-exit', panelId: 'sidebar' }, model);
    expect(isPeekingPanel(model, 'sidebar')).toBe(false);
  });

  it('pins a peeked panel', () => {
    let model = createPeekModel();
    model = peekUpdate({ type: 'peek-enter', panelId: 'sidebar', peekWidth: 24 }, model);
    model = peekUpdate({ type: 'peek-pin', panelId: 'sidebar' }, model);

    expect(isPinnedPanel(model, 'sidebar')).toBe(true);
    expect(model.peeking).toBe(false);
  });
});
