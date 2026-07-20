/**
 * @celestial/rosetta — Reactive message catalog helpers.
 *
 * Provides a tiny observable store for locale message catalogs so apps
 * can swap translations at runtime and trigger a re-render.
 */

import type { CatalogStore, MessageCatalog } from './types.js';

type CatalogListener<TCatalog extends MessageCatalog> = (catalog: TCatalog) => void;

class CatalogStoreImpl<TCatalog extends MessageCatalog> implements CatalogStore<TCatalog> {
  private catalog: TCatalog;
  private readonly listeners = new Set<CatalogListener<TCatalog>>();

  constructor(initialCatalog: TCatalog) {
    this.catalog = initialCatalog;
  }

  getCatalog(): TCatalog {
    return this.catalog;
  }

  setCatalog(nextCatalog: TCatalog): void {
    this.catalog = nextCatalog;

    for (const listener of this.listeners) {
      listener(nextCatalog);
    }
  }

  subscribe(listener: CatalogListener<TCatalog>): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}

export function createCatalogStore<TCatalog extends MessageCatalog>(initialCatalog: TCatalog): CatalogStore<TCatalog> {
  return new CatalogStoreImpl(initialCatalog);
}

export function getCatalog<TCatalog extends MessageCatalog>(store: CatalogStore<TCatalog>): TCatalog {
  return store.getCatalog();
}

export function setCatalog<TCatalog extends MessageCatalog>(store: CatalogStore<TCatalog>, nextCatalog: TCatalog): void {
  store.setCatalog(nextCatalog);
}

export function catalogSub<TCatalog extends MessageCatalog>(store: CatalogStore<TCatalog>, listener: (catalog: TCatalog) => void): () => void {
  return store.subscribe(listener);
}

export function isCatalogStore<TCatalog extends MessageCatalog>(value: unknown): value is CatalogStore<TCatalog> {
  return typeof value === 'object' && value !== null && 'getCatalog' in value && 'setCatalog' in value && 'subscribe' in value;
}
