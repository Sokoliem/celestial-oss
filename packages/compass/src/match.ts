import {
  assertWellFormedString,
  captureDenseArray,
  captureObject,
  diagnosticText,
  freezeSnapshot,
} from './internal.js';
import { type LocalUrlInput, type ParsedUrl, parseLocalPathname, toParsedUrl } from './url.js';

const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface RouteDefinition<RouteId extends string = string> {
  readonly id: RouteId;
  readonly pattern: string;
}

export interface RouteMatch<RouteId extends string = string> {
  readonly route: Readonly<RouteDefinition<RouteId>>;
  readonly params: Readonly<Record<string, string>>;
  readonly location: ParsedUrl;
}

type CompiledSegment =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'catch-all'; readonly name: string };

interface CompiledRoute<RouteId extends string> {
  readonly route: Readonly<RouteDefinition<RouteId>>;
  readonly segments: readonly CompiledSegment[];
  readonly structureKey: string;
}

function assertRouteId(id: unknown, index: number): asserts id is string {
  if (typeof id !== 'string') {
    throw new TypeError(`Route definition ${index} id must be a string`);
  }
  assertWellFormedString(id, `Route definition ${index} id`);
  if (id.length === 0 || id.trim() !== id) {
    throw new RangeError(`Route definition ${index} id must be a non-empty printable string without surrounding whitespace`);
  }
}

function assertParameterName(name: string, pattern: string): void {
  if (!PARAMETER_NAME.test(name)) {
    throw new RangeError(
      `Route pattern "${diagnosticText(pattern)}" contains an invalid parameter name "${diagnosticText(name)}"`,
    );
  }
  if (PROTOTYPE_KEYS.has(name)) {
    throw new RangeError(`Route pattern "${diagnosticText(pattern)}" contains a prototype-sensitive parameter`);
  }
}

function decodeStaticSegment(segment: string, pattern: string): string {
  const placeholder = `/placeholder/${segment}`;
  const parsed = parseLocalPathname(placeholder, `route pattern "${diagnosticText(pattern)}"`);
  const value = parsed.segments[1];
  if (value === undefined) {
    throw new RangeError(`Route pattern "${diagnosticText(pattern)}" contains an invalid static segment`);
  }
  return value;
}

function compileRoute<RouteId extends string>(definition: unknown, index: number): CompiledRoute<RouteId> {
  const captured = captureObject(definition, `Route definition ${index}`, ['id', 'pattern']);
  const id = captured.values.id;
  const pattern = captured.values.pattern;
  assertRouteId(id, index);
  assertWellFormedString(pattern, `Route definition ${index} pattern`);
  if (!pattern.startsWith('/') || pattern.startsWith('//')) {
    throw new RangeError(`Route pattern "${diagnosticText(pattern)}" must be a local path beginning with one "/"`);
  }
  if (pattern.includes('\\') || pattern.includes('?') || pattern.includes('#')) {
    throw new RangeError(`Route pattern "${diagnosticText(pattern)}" contains forbidden separators or delimiters`);
  }

  const rawSegments = pattern.slice(1).split('/');
  if (rawSegments[rawSegments.length - 1] === '') rawSegments.pop();
  if (rawSegments.some((segment) => segment.length === 0)) {
    throw new RangeError(`Route pattern "${diagnosticText(pattern)}" must not contain empty interior segments`);
  }

  const names = new Set<string>();
  const segments: CompiledSegment[] = rawSegments.map((segment, segmentIndex) => {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      assertParameterName(name, pattern);
      if (names.has(name)) {
        throw new RangeError(`Route pattern "${diagnosticText(pattern)}" repeats parameter "${diagnosticText(name)}"`);
      }
      names.add(name);
      return freezeSnapshot({ kind: 'param', name });
    }
    if (segment.startsWith('*')) {
      const name = segment.slice(1);
      assertParameterName(name, pattern);
      if (segmentIndex !== rawSegments.length - 1) {
        throw new RangeError(`Route catch-all "*${diagnosticText(name)}" must be the terminal segment`);
      }
      if (names.has(name)) {
        throw new RangeError(`Route pattern "${diagnosticText(pattern)}" repeats parameter "${diagnosticText(name)}"`);
      }
      names.add(name);
      return freezeSnapshot({ kind: 'catch-all', name });
    }
    const value = decodeStaticSegment(segment, pattern);
    return freezeSnapshot({ kind: 'static', value });
  });

  const canonicalPattern =
    segments.length === 0
      ? '/'
      : `/${segments
          .map((segment) => {
            if (segment.kind === 'static') return encodeURIComponent(segment.value);
            return `${segment.kind === 'param' ? ':' : '*'}${segment.name}`;
          })
          .join('/')}`;
  const structureKey = segments.map((segment) => (segment.kind === 'static' ? `s:${segment.value}` : segment.kind === 'param' ? 'p' : 'c')).join('/');

  return freezeSnapshot({
    route: freezeSnapshot({ id: id as RouteId, pattern: canonicalPattern }),
    segments: freezeSnapshot(segments),
    structureKey,
  });
}

function specificity(segment: CompiledSegment): number {
  if (segment.kind === 'static') return 3;
  if (segment.kind === 'param') return 2;
  return 1;
}

function compareSpecificity<RouteId extends string>(left: CompiledRoute<RouteId>, right: CompiledRoute<RouteId>): number {
  const length = Math.max(left.segments.length, right.segments.length);
  for (let index = 0; index < length; index++) {
    const leftSegment = left.segments[index];
    const rightSegment = right.segments[index];
    if (leftSegment === undefined || rightSegment === undefined) {
      if (leftSegment === undefined && rightSegment?.kind === 'catch-all') return -1;
      if (rightSegment === undefined && leftSegment?.kind === 'catch-all') return 1;
      return leftSegment === undefined ? 1 : -1;
    }
    const difference = specificity(rightSegment) - specificity(leftSegment);
    if (difference !== 0) return difference;
  }
  const patternOrder = left.route.pattern.localeCompare(right.route.pattern);
  return patternOrder !== 0 ? patternOrder : left.route.id.localeCompare(right.route.id);
}

function matchCompiled<RouteId extends string>(route: CompiledRoute<RouteId>, location: ParsedUrl): RouteMatch<RouteId> | null {
  const pathSegments = parseLocalPathname(location.pathname).segments;
  const params = Object.create(null) as Record<string, string>;
  let pathIndex = 0;

  for (const segment of route.segments) {
    if (segment.kind === 'catch-all') {
      params[segment.name] = pathSegments.slice(pathIndex).join('/');
      pathIndex = pathSegments.length;
      break;
    }
    const pathSegment = pathSegments[pathIndex];
    if (pathSegment === undefined) return null;
    if (segment.kind === 'static') {
      if (segment.value !== pathSegment) return null;
    } else {
      params[segment.name] = pathSegment;
    }
    pathIndex += 1;
  }

  if (pathIndex !== pathSegments.length) return null;
  return freezeSnapshot({
    route: route.route,
    params: freezeSnapshot(params),
    location,
  });
}

/**
 * Validate, snapshot, and rank route definitions.
 *
 * This is exported only for package-internal router reuse; it is not part of
 * the package root surface.
 */
export function validateRouteDefinitions<RouteId extends string>(definitions: readonly RouteDefinition<RouteId>[]): readonly CompiledRoute<RouteId>[] {
  const captured = captureDenseArray<unknown>(definitions, 'Route definitions');
  const compiled = captured.values.map((definition, index) => compileRoute<RouteId>(definition, index));
  const ids = new Set<string>();
  const structures = new Set<string>();

  for (const route of compiled) {
    if (ids.has(route.route.id)) {
      throw new RangeError(`Route IDs must be unique; duplicate id "${diagnosticText(route.route.id)}"`);
    }
    ids.add(route.route.id);
    if (structures.has(route.structureKey)) {
      throw new RangeError(
        `Route definitions contain an ambiguous duplicate structure at "${diagnosticText(route.route.pattern)}"`,
      );
    }
    structures.add(route.structureKey);
  }

  return freezeSnapshot([...compiled].sort(compareSpecificity));
}

export function matchValidatedRoutes<RouteId extends string>(
  compiled: readonly CompiledRoute<RouteId>[],
  locationInput: LocalUrlInput,
): RouteMatch<RouteId> | null {
  const location = toParsedUrl(locationInput);
  for (const route of compiled) {
    const match = matchCompiled(route, location);
    if (match !== null) return match;
  }
  return null;
}

/**
 * Match a location against validated definitions by structural specificity.
 *
 * Static segments outrank named parameters, which outrank a terminal named
 * catch-all. Declaration order never changes the winner.
 */
export function matchRoute<RouteId extends string>(definitions: readonly RouteDefinition<RouteId>[], location: LocalUrlInput): RouteMatch<RouteId> | null {
  return matchValidatedRoutes(validateRouteDefinitions(definitions), location);
}
