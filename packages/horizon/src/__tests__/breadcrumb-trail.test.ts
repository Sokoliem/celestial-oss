import { describe, expect, it } from 'vitest';
import { breadcrumbTrailUpdate, canGoBack, canGoForward, createBreadcrumbTrailModel, getCurrentBreadcrumb, pushFocusChange } from '../breadcrumb-trail.js';

describe('breadcrumb-trail', () => {
  it('tracks push, back, and forward navigation', () => {
    let model = createBreadcrumbTrailModel();
    model = breadcrumbTrailUpdate({ type: 'push', id: 'one' }, model);
    model = breadcrumbTrailUpdate({ type: 'push', id: 'two' }, model);
    model = breadcrumbTrailUpdate({ type: 'back' }, model);

    expect(getCurrentBreadcrumb(model)).toBe('one');
    expect(canGoBack(model)).toBe(false);
    expect(canGoForward(model)).toBe(true);

    model = breadcrumbTrailUpdate({ type: 'forward' }, model);
    expect(getCurrentBreadcrumb(model)).toBe('two');
  });

  it('pushes focus changes when focus actually moves', () => {
    let model = createBreadcrumbTrailModel();
    model = pushFocusChange(model, null, 'left');
    model = pushFocusChange(model, 'left', 'right');

    expect(model.history).toEqual(['left', 'right']);
  });
});
