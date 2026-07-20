import type { ComponentNode, SafeAreaEdge, SafeAreaInsets, SafeAreaReservation, SafeAreaScope, VNode } from './types.js';

const DEFAULT_ZONE = 'global';

const reservationsByZone = new Map<string, Map<string, SafeAreaReservation>>();

function emptyInsets(): SafeAreaInsets {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

function aggregate(reservations: Iterable<SafeAreaReservation>): SafeAreaInsets {
  const insets = emptyInsets();
  for (const reservation of reservations) {
    const size = Number.isFinite(reservation.size) ? Math.max(0, Math.floor(reservation.size)) : 0;
    insets[reservation.edge] += size;
  }
  return insets;
}

function ensureZone(zone: string): Map<string, SafeAreaReservation> {
  let bucket = reservationsByZone.get(zone);
  if (!bucket) {
    bucket = new Map<string, SafeAreaReservation>();
    reservationsByZone.set(zone, bucket);
  }
  return bucket;
}

export interface ReserveSafeAreaInput {
  edge: SafeAreaEdge;
  size: number;
  source: string;
  zone?: string;
}

export interface SafeAreaReservationHandle {
  /** Update the reservation in place (idempotent by source). */
  update(input: Pick<ReserveSafeAreaInput, 'edge' | 'size'>): void;
  /** Remove this reservation from its zone. */
  release(): void;
  /** Inspect the underlying reservation (for tests / debugging). */
  current(): SafeAreaReservation | null;
}

export function reserveSafeArea(input: ReserveSafeAreaInput): SafeAreaReservationHandle {
  if (!input.source) {
    throw new Error('reserveSafeArea: `source` is required so reservations can be deduped.');
  }
  const zone = input.zone ?? DEFAULT_ZONE;
  const bucket = ensureZone(zone);
  const reservation: SafeAreaReservation = {
    edge: input.edge,
    size: Math.max(0, Math.floor(input.size)),
    source: input.source,
    zone,
  };
  bucket.set(input.source, reservation);

  return {
    update: (next) => {
      const refreshed: SafeAreaReservation = {
        edge: next.edge,
        size: Math.max(0, Math.floor(next.size)),
        source: input.source,
        zone,
      };
      bucket.set(input.source, refreshed);
    },
    release: () => {
      bucket.delete(input.source);
      if (bucket.size === 0) {
        reservationsByZone.delete(zone);
      }
    },
    current: () => bucket.get(input.source) ?? null,
  };
}

export function clearSafeArea(zone?: string): void {
  if (zone === undefined) {
    reservationsByZone.clear();
    return;
  }
  reservationsByZone.delete(zone);
}

export function getSafeAreaScope(zone: string = DEFAULT_ZONE): SafeAreaScope {
  const bucket = reservationsByZone.get(zone);
  const reservations = bucket ? [...bucket.values()] : [];
  return {
    zone,
    insets: aggregate(reservations),
    reservations,
  };
}

export function useSafeAreaInsets(zone: string = DEFAULT_ZONE): SafeAreaInsets {
  return getSafeAreaScope(zone).insets;
}

export interface SafeAreaScopeRunOptions<T> {
  zone?: string;
  reservations?: readonly ReserveSafeAreaInput[];
  run: () => T;
}

/**
 * Execute `run` with a fresh isolated zone (default: a unique scope id) so
 * tests / sub-trees can publish reservations without leaking into the global
 * scope. Returns whatever `run()` returns.
 */
export function withSafeAreaScope<T>(options: SafeAreaScopeRunOptions<T>): T {
  const zone = options.zone ?? `scope:${nextScopeId()}`;
  const handles: SafeAreaReservationHandle[] = [];
  for (const reservation of options.reservations ?? []) {
    handles.push(reserveSafeArea({ ...reservation, zone }));
  }
  try {
    return options.run();
  } finally {
    for (const handle of handles) handle.release();
    clearSafeArea(zone);
  }
}

let scopeCounter = 0;
function nextScopeId(): number {
  scopeCounter += 1;
  return scopeCounter;
}

export interface InSafeAreaOptions {
  zone?: string;
  edges?: readonly SafeAreaEdge[];
}

/**
 * Wrap a child VNode so its layout respects the active safe-area insets for
 * the supplied zone. Implemented as padding on a `box` so the child is
 * positioned inside the reserved gutters.
 */
export function inSafeArea(child: VNode, options: InSafeAreaOptions = {}): ComponentNode {
  const zone = options.zone ?? DEFAULT_ZONE;
  const allowed = new Set<SafeAreaEdge>(options.edges ?? ['top', 'bottom', 'left', 'right']);

  return {
    kind: 'component',
    render: (): VNode => {
      const insets = useSafeAreaInsets(zone);
      const top = allowed.has('top') ? insets.top : 0;
      const right = allowed.has('right') ? insets.right : 0;
      const bottom = allowed.has('bottom') ? insets.bottom : 0;
      const left = allowed.has('left') ? insets.left : 0;

      if (top === 0 && right === 0 && bottom === 0 && left === 0) {
        return child;
      }

      return {
        kind: 'box',
        style: { padding: [top, right, bottom, left] },
        children: [child],
      };
    },
  };
}
