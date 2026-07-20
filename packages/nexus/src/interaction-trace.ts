import type { RegionRouteEvent, RegionRouteMatch } from './region-router.js';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type InteractionTraceResultKind = 'handled' | 'ignored' | 'blocked' | 'failed';

export interface TraceableInteractionRegion {
  readonly id: string;
  readonly localId?: string;
  readonly handlerTag?: string;
  readonly localX?: number;
  readonly localY?: number;
  readonly metadata?: {
    readonly label?: string;
    readonly intent?: string;
    readonly extra?: Readonly<Record<string, unknown>>;
  };
}

export interface InteractionTraceInput {
  readonly type: string;
  readonly phase?: string;
  readonly handlerTag?: string;
  readonly x?: number;
  readonly y?: number;
  readonly localX?: number;
  readonly localY?: number;
  readonly button?: number | 'none';
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly timestamp?: number;
}

export interface InteractionTraceResult {
  readonly kind: InteractionTraceResultKind;
  readonly detail?: string;
}

export interface InteractionTraceEntry {
  readonly id: string;
  readonly regionId: string;
  readonly eventType: string;
  readonly timestamp: number;
  readonly localId?: string;
  readonly phase?: string;
  readonly handlerTag?: string;
  readonly intent?: string;
  readonly label?: string;
  readonly x?: number;
  readonly y?: number;
  readonly localX?: number;
  readonly localY?: number;
  readonly button?: number | 'none';
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly result?: InteractionTraceResult;
  readonly target?: { readonly [key: string]: JsonValue };
}

export interface InteractionTraceSnapshot {
  readonly entries: readonly InteractionTraceEntry[];
}

export interface InteractionTraceRecorder {
  record(region: TraceableInteractionRegion, event: InteractionTraceInput, result?: InteractionTraceResult): InteractionTraceEntry;
  recordRoute(match: RegionRouteMatch, event: RegionRouteEvent, result?: InteractionTraceResult): InteractionTraceEntry;
  entries(): readonly InteractionTraceEntry[];
  snapshot(): InteractionTraceSnapshot;
  clear(): void;
}

let traceCounter = 0;

function nextTraceId(timestamp: number): string {
  traceCounter += 1;
  return `trace_${timestamp}_${traceCounter}`;
}

function sanitizeJson(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 6) {
    return '[truncated]';
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJson(item, depth + 1) ?? null);
  }
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeJson(item, depth + 1);
      if (sanitized !== undefined) {
        out[key] = sanitized;
      }
    }
    return out;
  }
  return undefined;
}

function sanitizeTarget(extra: Readonly<Record<string, unknown>> | undefined): { readonly [key: string]: JsonValue } | undefined {
  const value = sanitizeJson(extra);
  return value && !Array.isArray(value) && typeof value === 'object' ? value : undefined;
}

export function recordInteractionTrace(
  region: TraceableInteractionRegion,
  event: InteractionTraceInput,
  result?: InteractionTraceResult,
): InteractionTraceEntry {
  const timestamp = event.timestamp ?? Date.now();
  const handlerTag = event.handlerTag ?? region.handlerTag;
  const localX = event.localX ?? region.localX;
  const localY = event.localY ?? region.localY;
  const target = sanitizeTarget(region.metadata?.extra);
  return {
    id: nextTraceId(timestamp),
    regionId: region.id,
    eventType: event.type,
    timestamp,
    ...(region.localId ? { localId: region.localId } : {}),
    ...(event.phase ? { phase: event.phase } : {}),
    ...(handlerTag ? { handlerTag } : {}),
    ...(region.metadata?.intent ? { intent: region.metadata.intent } : {}),
    ...(region.metadata?.label ? { label: region.metadata.label } : {}),
    ...(event.x !== undefined ? { x: event.x } : {}),
    ...(event.y !== undefined ? { y: event.y } : {}),
    ...(localX !== undefined ? { localX } : {}),
    ...(localY !== undefined ? { localY } : {}),
    ...(event.button !== undefined ? { button: event.button } : {}),
    ...(event.ctrl !== undefined ? { ctrl: event.ctrl } : {}),
    ...(event.alt !== undefined ? { alt: event.alt } : {}),
    ...(event.shift !== undefined ? { shift: event.shift } : {}),
    ...(result ? { result } : {}),
    ...(target ? { target } : {}),
  };
}

export function recordRegionRouteTrace(match: RegionRouteMatch, event: RegionRouteEvent, result?: InteractionTraceResult): InteractionTraceEntry {
  return recordInteractionTrace(
    {
      id: match.region.id,
      localId: match.region.eventPath.at(-1),
      handlerTag: match.handlerTag,
      localX: match.localX,
      localY: match.localY,
      metadata: {
        label: match.metadata?.label,
        intent: match.intent,
        extra: match.metadata?.extra,
      },
    },
    {
      type: event.type,
      phase: match.phase,
      handlerTag: match.handlerTag,
      x: event.x,
      y: event.y,
      localX: match.localX,
      localY: match.localY,
      button: event.button,
      ctrl: event.ctrl,
      alt: event.alt,
      shift: event.shift,
    },
    result,
  );
}

export function createInteractionTraceRecorder(maxEntries = 200): InteractionTraceRecorder {
  const entries: InteractionTraceEntry[] = [];
  const capacity = Math.max(1, Math.floor(maxEntries));

  function push(entry: InteractionTraceEntry): InteractionTraceEntry {
    entries.push(entry);
    if (entries.length > capacity) {
      entries.splice(0, entries.length - capacity);
    }
    return entry;
  }

  return {
    record(region, event, result) {
      return push(recordInteractionTrace(region, event, result));
    },
    recordRoute(match, event, result) {
      return push(recordRegionRouteTrace(match, event, result));
    },
    entries() {
      return [...entries];
    },
    snapshot() {
      return { entries: [...entries] };
    },
    clear() {
      entries.length = 0;
    },
  };
}
