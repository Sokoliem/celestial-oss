import type { ComponentNode, SafeAreaEdge, SafeAreaInsets, VNode, WorkAreaReservation, WorkAreaScope } from './types.js';

const DEFAULT_ZONE = 'global';

const reservationsByZone = new Map<string, Map<string, WorkAreaReservation>>();

function emptyInsets(): SafeAreaInsets {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

function aggregate(reservations: Iterable<WorkAreaReservation>): SafeAreaInsets {
  const insets = emptyInsets();
  for (const reservation of reservations) {
    const size = Number.isFinite(reservation.size) ? Math.max(0, Math.floor(reservation.size)) : 0;
    insets[reservation.edge] += size;
  }
  return insets;
}

function ensureZone(zone: string): Map<string, WorkAreaReservation> {
  let bucket = reservationsByZone.get(zone);
  if (!bucket) {
    bucket = new Map<string, WorkAreaReservation>();
    reservationsByZone.set(zone, bucket);
  }
  return bucket;
}

export interface ReserveWorkAreaInput {
  edge: SafeAreaEdge;
  size: number;
  source: string;
  zone?: string;
}

export interface WorkAreaReservationHandle {
  update(input: Pick<ReserveWorkAreaInput, 'edge' | 'size'>): void;
  release(): void;
  current(): WorkAreaReservation | null;
}

export function reserveWorkArea(input: ReserveWorkAreaInput): WorkAreaReservationHandle {
  if (!input.source) {
    throw new Error('reserveWorkArea: `source` is required so reservations can be deduped.');
  }
  const zone = input.zone ?? DEFAULT_ZONE;
  const bucket = ensureZone(zone);
  const reservation: WorkAreaReservation = {
    edge: input.edge,
    size: Math.max(0, Math.floor(input.size)),
    source: input.source,
    zone,
  };
  bucket.set(input.source, reservation);

  return {
    update: (next) => {
      bucket.set(input.source, {
        edge: next.edge,
        size: Math.max(0, Math.floor(next.size)),
        source: input.source,
        zone,
      });
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

export function releaseWorkArea(source: string, zone: string = DEFAULT_ZONE): void {
  const bucket = reservationsByZone.get(zone);
  if (!bucket) return;
  bucket.delete(source);
  if (bucket.size === 0) {
    reservationsByZone.delete(zone);
  }
}

export function clearWorkArea(zone?: string): void {
  if (zone === undefined) {
    reservationsByZone.clear();
    return;
  }
  reservationsByZone.delete(zone);
}

export function getWorkAreaScope(zone: string = DEFAULT_ZONE): WorkAreaScope {
  const bucket = reservationsByZone.get(zone);
  const reservations = bucket ? [...bucket.values()] : [];
  return {
    zone,
    insets: aggregate(reservations),
    reservations,
  };
}

export function useWorkAreaInsets(zone: string = DEFAULT_ZONE): SafeAreaInsets {
  return getWorkAreaScope(zone).insets;
}

export interface WorkAreaScopeRunOptions<T> {
  zone?: string;
  reservations?: readonly ReserveWorkAreaInput[];
  run: () => T;
}

export function withWorkAreaScope<T>(options: WorkAreaScopeRunOptions<T>): T {
  const zone = options.zone ?? `work-area:${nextScopeId()}`;
  const handles: WorkAreaReservationHandle[] = [];
  for (const reservation of options.reservations ?? []) {
    handles.push(reserveWorkArea({ ...reservation, zone }));
  }
  try {
    return options.run();
  } finally {
    for (const handle of handles) handle.release();
    clearWorkArea(zone);
  }
}

export interface InWorkAreaOptions {
  zone?: string;
  edges?: readonly SafeAreaEdge[];
}

export function inWorkArea(child: VNode, options: InWorkAreaOptions = {}): ComponentNode {
  const zone = options.zone ?? DEFAULT_ZONE;
  const allowed = new Set<SafeAreaEdge>(options.edges ?? ['top', 'bottom', 'left', 'right']);

  return {
    kind: 'component',
    render: (): VNode => {
      const insets = useWorkAreaInsets(zone);
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

let scopeCounter = 0;
function nextScopeId(): number {
  scopeCounter += 1;
  return scopeCounter;
}
