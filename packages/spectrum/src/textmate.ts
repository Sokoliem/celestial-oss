import { registerLanguage } from './grammars.js';
import type { LanguageGrammar, StateRule, TokenCategory, TokenRule } from './types.js';

type TextMateNode = Record<string, unknown> & {
  match?: string;
  begin?: string;
  end?: string;
  include?: string;
  name?: string;
  contentName?: string;
  patterns?: unknown[];
  repository?: Record<string, unknown>;
  captures?: Record<string, unknown>;
  beginCaptures?: Record<string, unknown>;
  endCaptures?: Record<string, unknown>;
  fileTypes?: string[];
  scopeName?: string;
};

export interface TextMateImportOptions {
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly register?: boolean;
}

interface CompileContext {
  readonly sourceName: string;
  readonly repository: Record<string, unknown>;
  readonly rootPatterns: readonly unknown[];
  stateIndex: number;
  nodeCount: number;
  readonly stateNames: Set<string>;
  readonly activeIncludes: Set<string>;
  readonly activeNodes: WeakSet<object>;
}

const MAX_TEXTMATE_SOURCE_LENGTH = 5 * 1024 * 1024;
const MAX_TEXTMATE_DEPTH = 128;
const MAX_TEXTMATE_NODES = 20_000;
const MAX_TEXTMATE_COLLECTION = 10_000;
const MAX_REGEX_SOURCE_LENGTH = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertSourceSize(source: string): void {
  if (source.length > MAX_TEXTMATE_SOURCE_LENGTH) {
    throw new Error(`TextMate grammar exceeds the ${MAX_TEXTMATE_SOURCE_LENGTH}-character import limit`);
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseJsonGrammar(source: string): unknown {
  assertSourceSize(source);
  return JSON.parse(source);
}

function parsePlistGrammar(source: string): unknown {
  assertSourceSize(source);
  const input = source.replace(/<\?xml[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  let index = 0;
  let nodeCount = 0;

  function skipWhitespace(): void {
    while (index < input.length && /\s/.test(input[index]!)) index++;
  }

  function peekTag(): string | null {
    skipWhitespace();
    const match = input.slice(index).match(/^<\s*([a-zA-Z]+)(?:\s[^>]*)?(\/?)>/);
    return match?.[1] ?? null;
  }

  function readTextUntil(endTag: string): string {
    const endIndex = input.indexOf(endTag, index);
    if (endIndex === -1) {
      throw new Error(`TextMate plist parser: expected ${endTag}`);
    }
    const text = input.slice(index, endIndex);
    index = endIndex + endTag.length;
    return decodeXmlEntities(text.trim());
  }

  function consume(openTag: string, closeTag: string): string {
    skipWhitespace();
    if (!input.startsWith(openTag, index)) {
      throw new Error(`TextMate plist parser: expected ${openTag}`);
    }
    index += openTag.length;
    const text = readTextUntil(closeTag);
    return text;
  }

  function parseValue(depth = 0): unknown {
    if (depth > MAX_TEXTMATE_DEPTH) {
      throw new Error(`TextMate plist parser: nesting exceeds ${MAX_TEXTMATE_DEPTH} levels`);
    }
    nodeCount++;
    if (nodeCount > MAX_TEXTMATE_NODES) {
      throw new Error(`TextMate plist parser: value count exceeds ${MAX_TEXTMATE_NODES}`);
    }
    skipWhitespace();
    if (input.startsWith('<dict>', index)) {
      index += '<dict>'.length;
      return parseDict(depth + 1);
    }
    if (input.startsWith('<array>', index)) {
      index += '<array>'.length;
      return parseArray(depth + 1);
    }
    if (input.startsWith('<string>', index)) {
      return consume('<string>', '</string>');
    }
    if (input.startsWith('<integer>', index)) {
      return Number(consume('<integer>', '</integer>'));
    }
    if (input.startsWith('<real>', index)) {
      return Number(consume('<real>', '</real>'));
    }
    if (input.startsWith('<true/>', index)) {
      index += '<true/>'.length;
      return true;
    }
    if (input.startsWith('<false/>', index)) {
      index += '<false/>'.length;
      return false;
    }
    throw new Error('TextMate plist parser: unsupported value');
  }

  function parseDict(depth = 0): Record<string, unknown> {
    const result = Object.create(null) as Record<string, unknown>;
    let entries = 0;
    while (true) {
      skipWhitespace();
      if (input.startsWith('</dict>', index)) {
        index += '</dict>'.length;
        return result;
      }
      entries++;
      if (entries > MAX_TEXTMATE_COLLECTION) {
        throw new Error(`TextMate plist parser: dictionary exceeds ${MAX_TEXTMATE_COLLECTION} entries`);
      }
      const key = consume('<key>', '</key>');
      result[key] = parseValue(depth);
    }
  }

  function parseArray(depth = 0): unknown[] {
    const result: unknown[] = [];
    while (true) {
      skipWhitespace();
      if (input.startsWith('</array>', index)) {
        index += '</array>'.length;
        return result;
      }
      if (result.length >= MAX_TEXTMATE_COLLECTION) {
        throw new Error(`TextMate plist parser: array exceeds ${MAX_TEXTMATE_COLLECTION} entries`);
      }
      result.push(parseValue(depth));
    }
  }

  const plistIndex = input.indexOf('<plist');
  if (plistIndex >= 0) {
    index = input.indexOf('>', plistIndex) + 1;
  }

  skipWhitespace();
  const tag = peekTag();
  if (tag === 'dict') {
    index += '<dict>'.length;
    return parseDict();
  }
  if (tag === 'array') {
    index += '<array>'.length;
    return parseArray();
  }
  throw new Error('TextMate plist parser: expected plist dictionary or array');
}

function parseTextMateInput(source: string): unknown {
  const trimmed = source.trim();
  if (trimmed.startsWith('<')) {
    return parsePlistGrammar(trimmed);
  }
  return parseJsonGrammar(trimmed);
}

function scopeToToken(scope: string | undefined, fallback: TokenCategory = 'text'): TokenCategory {
  if (!scope) return fallback;
  const normalized = scope.toLowerCase();
  if (normalized.includes('comment')) return 'comment';
  if (normalized.includes('string')) return 'string';
  if (normalized.includes('regexp')) return 'regexp';
  if (normalized.includes('constant')) return 'constant';
  if (normalized.includes('keyword') || normalized.includes('storage')) return 'keyword';
  if (normalized.includes('operator')) return 'operator';
  if (normalized.includes('punctuation')) return 'punctuation';
  if (normalized.includes('entity.name.tag') || normalized.includes('.tag') || normalized.endsWith('tag')) return 'tag';
  if (normalized.includes('attribute')) return 'attribute';
  if (normalized.includes('parameter')) return 'parameter';
  if (normalized.includes('property')) return 'property';
  if (normalized.includes('namespace')) return 'namespace';
  if (normalized.includes('function') || normalized.includes('method')) return 'function';
  if (normalized.includes('type') || normalized.includes('class')) return 'type';
  if (normalized.includes('label')) return 'label';
  if (normalized.includes('escape')) return 'escape';
  if (normalized.includes('meta')) return 'meta';
  if (normalized.includes('builtin') || normalized.includes('support')) return 'builtin';
  if (normalized.includes('variable')) return 'variable';
  return fallback;
}

function compileRegex(source: string, insensitive = false): RegExp {
  if (source.length > MAX_REGEX_SOURCE_LENGTH) {
    throw new Error(`TextMate regular expression exceeds ${MAX_REGEX_SOURCE_LENGTH} characters`);
  }
  const flags = `${insensitive ? 'i' : ''}y`;
  return new RegExp(source, flags);
}

function captureToken(captures: Record<string, unknown> | undefined, fallback: TokenCategory): { token: TokenCategory; group?: number } {
  if (!captures) return { token: fallback };
  const entries: Array<{ group: number; value: Record<string, unknown> }> = [];
  for (const [key, value] of Object.entries(captures)) {
    const group = Number(key);
    if (Number.isSafeInteger(group) && group >= 0 && isRecord(value)) {
      entries.push({ group, value });
    }
  }
  entries.sort((left, right) => left.group - right.group);
  for (const entry of entries) {
    const name = typeof entry.value.name === 'string' ? entry.value.name : undefined;
    if (name) {
      return { token: scopeToToken(name, fallback), group: entry.group };
    }
  }
  return { token: fallback };
}

function uniqueStateName(base: string, context: CompileContext): string {
  const safeBase = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'state';
  let name = `${safeBase}-${context.stateIndex++}`;
  while (context.stateNames.has(name)) {
    name = `${safeBase}-${context.stateIndex++}`;
  }
  context.stateNames.add(name);
  return name;
}

function compileNode(node: TextMateNode, context: CompileContext, depth: number): { rules: TokenRule[]; states: StateRule[] } {
  const rules: TokenRule[] = [];
  const states: StateRule[] = [];

  if (depth > MAX_TEXTMATE_DEPTH) {
    throw new Error(`TextMate grammar ${context.sourceName} exceeds ${MAX_TEXTMATE_DEPTH} levels of nesting`);
  }
  if (context.activeNodes.has(node)) return { rules, states };
  context.activeNodes.add(node);

  try {
    if (typeof node.include === 'string') {
      const includeKey = node.include === '$self' || node.include === '$base' ? '$root' : node.include;
      if (context.activeIncludes.has(includeKey)) return { rules, states };

      context.activeIncludes.add(includeKey);
      try {
        if (includeKey === '$root') {
          return compilePatterns(context.rootPatterns, context, depth + 1);
        }
        if (includeKey.startsWith('#')) {
          const repositoryNode = context.repository[includeKey.slice(1)];
          if (isRecord(repositoryNode)) {
            return compileNode(repositoryNode as TextMateNode, context, depth + 1);
          }
        }
        return { rules, states };
      } finally {
        context.activeIncludes.delete(includeKey);
      }
    }

    if (typeof node.match === 'string') {
      const fallback = scopeToToken(node.name ?? node.contentName);
      const capture = captureToken(isRecord(node.captures) ? node.captures : undefined, fallback);
      rules.push({
        pattern: compileRegex(node.match, Boolean(node.ignoreCase)),
        token: capture.token,
        ...(capture.group !== undefined ? { group: capture.group } : {}),
      });
      return { rules, states };
    }

    if (typeof node.begin === 'string' && typeof node.end === 'string') {
      const stateName = uniqueStateName(node.name ?? node.contentName ?? 'textmate', context);
      const fallback = scopeToToken(node.name ?? node.contentName);
      const beginCapture = captureToken(isRecord(node.beginCaptures) ? node.beginCaptures : undefined, fallback);
      const endCapture = captureToken(isRecord(node.endCaptures) ? node.endCaptures : undefined, fallback);
      const contentFallback = scopeToToken(node.contentName ?? node.name, fallback);
      const nested = compilePatterns(Array.isArray(node.patterns) ? node.patterns : [], context, depth + 1);

      states.push({
        name: stateName,
        begin: compileRegex(node.begin, Boolean(node.ignoreCase)),
        end: compileRegex(node.end, Boolean(node.ignoreCase)),
        token: beginCapture.token,
        contentToken: contentFallback,
        contentRules: nested.rules,
      });
      states.push(...nested.states);

      rules.push({
        pattern: compileRegex(node.begin, Boolean(node.ignoreCase)),
        token: beginCapture.token,
        push: stateName,
        ...(beginCapture.group !== undefined ? { group: beginCapture.group } : {}),
      });

      if (endCapture.token !== beginCapture.token && node.end) {
        rules.push({
          pattern: compileRegex(node.end, Boolean(node.ignoreCase)),
          token: endCapture.token,
        });
      }

      return { rules, states };
    }

    if (Array.isArray(node.patterns)) {
      return compilePatterns(node.patterns, context, depth + 1);
    }

    return { rules, states };
  } finally {
    context.activeNodes.delete(node);
  }
}

function compilePatterns(patterns: readonly unknown[], context: CompileContext, depth = 0): { rules: TokenRule[]; states: StateRule[] } {
  const rules: TokenRule[] = [];
  const states: StateRule[] = [];

  if (patterns.length > MAX_TEXTMATE_COLLECTION) {
    throw new Error(`TextMate grammar ${context.sourceName} exceeds ${MAX_TEXTMATE_COLLECTION} patterns in one collection`);
  }
  for (const pattern of patterns) {
    if (!isRecord(pattern)) continue;
    context.nodeCount++;
    if (context.nodeCount > MAX_TEXTMATE_NODES) {
      throw new Error(`TextMate grammar ${context.sourceName} exceeds ${MAX_TEXTMATE_NODES} compiled nodes`);
    }
    const node = pattern as TextMateNode;
    const compiled = compileNode(node, context, depth);
    rules.push(...compiled.rules);
    states.push(...compiled.states);
  }

  return { rules, states };
}

function normalizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');
}

export function parseTextMateGrammar(source: string): unknown {
  return parseTextMateInput(source);
}

export function importTextMateGrammar(source: string | Record<string, unknown>, options?: TextMateImportOptions): LanguageGrammar {
  const parsed = typeof source === 'string' ? parseTextMateInput(source) : source;
  if (!isRecord(parsed)) {
    throw new Error('TextMate grammar root must be a dictionary');
  }
  const raw = parsed as TextMateNode;
  const fileTypes = Array.isArray(raw.fileTypes) ? raw.fileTypes.filter((value): value is string => typeof value === 'string') : [];
  const name = normalizeName(options?.name ?? raw.name ?? raw.scopeName ?? fileTypes[0], 'textmate');
  const repository = isRecord(raw.repository) ? raw.repository : Object.create(null);
  const rootPatterns = Array.isArray(raw.patterns) ? raw.patterns : [];

  const context: CompileContext = {
    sourceName: name,
    repository,
    rootPatterns,
    stateIndex: 0,
    nodeCount: 0,
    stateNames: new Set<string>(),
    activeIncludes: new Set<string>(['$root']),
    activeNodes: new WeakSet<object>(),
  };

  const compiled = compilePatterns(rootPatterns, context);
  const grammar: LanguageGrammar = {
    name,
    aliases: options?.aliases
      ? options.aliases.slice(0, MAX_TEXTMATE_COLLECTION).map((alias) => normalizeName(alias, '')).filter(Boolean)
      : undefined,
    rules: compiled.rules,
    states: compiled.states.length > 0 ? compiled.states : undefined,
  };

  if (options?.register) {
    registerLanguage(grammar);
  }

  return grammar;
}
