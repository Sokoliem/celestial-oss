import { describe, expect, it } from 'vitest';
import { registerFenceRenderers } from '../register-fence-renderers.js';

describe('registerFenceRenderers', () => {
  it('registers a single plugin', () => {
    const renderers = registerFenceRenderers({
      tag: 'json',
      render: () => 'json result',
    });
    expect(renderers.json).toBeDefined();
    expect(renderers.json!({} as never, {} as never)).toBe('json result');
  });

  it('last-plugin-wins on tag collision', () => {
    const renderers = registerFenceRenderers({ tag: 'json', render: () => 'first' }, { tag: 'json', render: () => 'second' });
    expect(renderers.json!({} as never, {} as never)).toBe('second');
  });

  it('returns an empty object when no plugins are passed', () => {
    const renderers = registerFenceRenderers();
    expect(Object.keys(renderers).length).toBe(0);
    expect(Object.getPrototypeOf(renderers)).toBeNull();
  });

  it('normalizes tags and safely supports prototype-like names', () => {
    const renderers = registerFenceRenderers({ tag: ' JSON ', render: () => 'json' }, { tag: '__proto__', render: () => 'safe' });
    expect(renderers.json!({} as never, {} as never)).toBe('json');
    expect(renderers.__proto__!({} as never, {} as never)).toBe('safe');
    expect(Object.getPrototypeOf(renderers)).toBeNull();
  });

  it('rejects malformed plugin shapes', () => {
    expect(() => registerFenceRenderers({ tag: '', render: () => '' })).toThrow(/tags/);
    expect(() => registerFenceRenderers({ tag: 'json', render: 'nope' } as never)).toThrow(/function/);
  });
});
