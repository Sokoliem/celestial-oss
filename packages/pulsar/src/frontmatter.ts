/**
 * Frontmatter extraction (A4)
 *
 * Detects YAML, TOML, or JSON frontmatter at the top of a markdown document.
 * Returns the parsed data object and the remaining body.
 *
 * Safe subset: rejects YAML `!!` tags to mitigate deserialization attacks.
 */

export interface FrontmatterResult {
  readonly data: Record<string, unknown>;
  readonly body: string;
}

const MAX_FRONTMATTER_LENGTH = 1024 * 1024;
const MAX_FRONTMATTER_DEPTH = 64;
const MAX_FRONTMATTER_NODES = 100_000;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function emptyRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

/**
 * Extract frontmatter from markdown source.
 *
 * Supports:
 *   ---\nkey: value\n---   (YAML)
 *   +++\nkey = "value"\n+++ (TOML)
 *   {\n  "key": "value"\n}\n    (JSON, bare object at start)
 */
export function extractFrontmatter(input: string): FrontmatterResult {
  const trimmed = input.trimStart();

  // YAML frontmatter
  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const raw = trimmed.slice(3, endIdx).trim();
      if (raw.length > MAX_FRONTMATTER_LENGTH) return { data: emptyRecord(), body: input };
      const body = trimmed.slice(endIdx + 4).trimStart();
      return { data: safeParseYaml(raw), body };
    }
  }

  // TOML frontmatter
  if (trimmed.startsWith('+++')) {
    const endIdx = trimmed.indexOf('\n+++', 3);
    if (endIdx !== -1) {
      const raw = trimmed.slice(3, endIdx).trim();
      if (raw.length > MAX_FRONTMATTER_LENGTH) return { data: emptyRecord(), body: input };
      const body = trimmed.slice(endIdx + 4).trimStart();
      return { data: safeParseToml(raw), body };
    }
  }

  // JSON frontmatter (bare object)
  if (trimmed.startsWith('{')) {
    const endIdx = findJsonObjectEnd(trimmed);
    if (endIdx !== -1) {
      const raw = trimmed.slice(0, endIdx + 1);
      if (raw.length > MAX_FRONTMATTER_LENGTH) return { data: emptyRecord(), body: input };
      const body = trimmed.slice(endIdx + 1).trimStart();
      return { data: safeParseJson(raw), body };
    }
  }

  return { data: emptyRecord(), body: input };
}

function safeParseYaml(raw: string): Record<string, unknown> {
  if (/!!\w/.test(raw)) {
    return emptyRecord();
  }
  const out = emptyRecord();
  for (const line of raw.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1]!;
      const value = match[2]!.trim();
      if (!UNSAFE_KEYS.has(key)) out[key] = parseScalar(value);
    }
  }
  return out;
}

function safeParseToml(raw: string): Record<string, unknown> {
  const out = emptyRecord();
  for (const line of raw.split('\n')) {
    const match = line.match(/^(\w+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1]!;
      const value = match[2]!.trim();
      if (!UNSAFE_KEYS.has(key)) out[key] = parseScalar(value);
    }
  }
  return out;
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const budget = { remaining: MAX_FRONTMATTER_NODES };
      const safe = sanitizeJsonValue(parsed, 0, budget);
      if (safe && typeof safe === 'object' && !Array.isArray(safe)) return safe as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return emptyRecord();
}

function sanitizeJsonValue(value: unknown, depth: number, budget: { remaining: number }): unknown {
  budget.remaining--;
  if (budget.remaining < 0 || depth > MAX_FRONTMATTER_DEPTH) throw new Error('frontmatter limit exceeded');
  if (Array.isArray(value)) {
    return value.slice(0, MAX_FRONTMATTER_NODES).map((item) => sanitizeJsonValue(item, depth + 1, budget));
  }
  if (value && typeof value === 'object') {
    const out = emptyRecord();
    for (const [key, child] of Object.entries(value).slice(0, MAX_FRONTMATTER_NODES)) {
      if (!UNSAFE_KEYS.has(key)) out[key] = sanitizeJsonValue(child, depth + 1, budget);
    }
    return out;
  }
  return value;
}

function parseScalar(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+$/.test(value) || /^-?\d+\.\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return sanitizeJsonValue(JSON.parse(value), 0, { remaining: MAX_FRONTMATTER_NODES });
    } catch {
      return value;
    }
  }
  return value;
}

function findJsonObjectEnd(s: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
