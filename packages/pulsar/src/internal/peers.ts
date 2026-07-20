/**
 * Compatibility loader for the one optional integration promoted into the
 * public preview. New code can import `@celestial/stellar` directly.
 */

export interface PeerRegistry {
  stellar?: typeof import('@celestial/stellar');
}

const cache: Partial<Record<keyof PeerRegistry, unknown>> = {};

export async function loadPeer<K extends keyof PeerRegistry>(name: K): Promise<PeerRegistry[K] | null> {
  if (cache[name] !== undefined) return (cache[name] as PeerRegistry[K]) ?? null;

  try {
    const module = await import('@celestial/stellar');
    cache.stellar = module;
    return module as unknown as PeerRegistry[K];
  } catch {
    cache[name] = null;
    return null;
  }
}

export function hasPeer<K extends keyof PeerRegistry>(name: K): boolean {
  return cache[name] !== undefined && cache[name] !== null;
}

export function getPeerSync<K extends keyof PeerRegistry>(name: K): PeerRegistry[K] | undefined {
  return cache[name] as PeerRegistry[K] | undefined;
}
