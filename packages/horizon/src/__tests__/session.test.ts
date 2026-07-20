import { describe, expect, it } from 'vitest';
import { createSessionStore, listSessions, loadSession, saveSession } from '../index.js';

describe('session store', () => {
  it('saves named sessions with preview metadata', () => {
    const store = createSessionStore();
    const next = saveSession(store, {
      name: 'dev',
      workspace: { layout: { kind: 'split' }, activeIndex: 1 },
      preview: { title: 'Development', panes: 3 },
    });

    expect(listSessions(next)).toEqual(['dev']);
    expect(loadSession(next, 'dev')?.preview.title).toBe('Development');
  });

  it('restores sessions with restore policy defaults', () => {
    const store = saveSession(createSessionStore(), {
      name: 'ops',
      workspace: { layout: { kind: 'grid' }, activeIndex: 0 },
      preview: { title: 'Ops', panes: 2 },
    });

    expect(loadSession(store, 'ops')?.restore.restoreFocus).toBe(true);
  });
});
