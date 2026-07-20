import { describe, expect, it, vi } from 'vitest';
import { catalogSub, createCatalogStore, getCatalog, setCatalog } from '../catalog.js';

describe('catalog store', () => {
  it('returns the initial catalog', () => {
    const store = createCatalogStore({
      greeting: 'Hello',
    });

    expect(getCatalog(store)).toEqual({
      greeting: 'Hello',
    });
  });

  it('updates the current catalog via setCatalog', () => {
    const store = createCatalogStore({
      greeting: 'Hello',
    });

    setCatalog(store, {
      greeting: 'Bonjour',
    });

    expect(getCatalog(store)).toEqual({
      greeting: 'Bonjour',
    });
  });

  it('notifies subscribers when the catalog changes', () => {
    const store = createCatalogStore({
      greeting: 'Hello',
    });
    const listener = vi.fn();

    const unsubscribe = catalogSub(store, listener);
    setCatalog(store, {
      greeting: 'Hola',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      greeting: 'Hola',
    });

    unsubscribe();
    setCatalog(store, {
      greeting: 'Ciao',
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
