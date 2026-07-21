/**
 * Spectrum Language Grammars
 *
 * Registry facade for built-in and custom language grammars.
 */

import {
  cssGrammar,
  graphqlGrammar,
  htmlGrammar,
  jsonGrammar,
  markdownGrammar,
  protobufGrammar,
  scssGrammar,
  sqlGrammar,
  tomlGrammar,
  yamlGrammar,
} from './grammars/data-markup.js';
import { elixirGrammar, haskellGrammar, luaGrammar, ocamlGrammar, perlGrammar, rGrammar } from './grammars/functional-other.js';
import { cGrammar, cppGrammar, csharpGrammar, javaGrammar, kotlinGrammar, scalaGrammar, swiftGrammar } from './grammars/jvm-native.js';
import {
  bashGrammar,
  diffGrammar,
  dockerfileGrammar,
  gitignoreGrammar,
  goGrammar,
  makefileGrammar,
  nixGrammar,
  rustGrammar,
  terraformGrammar,
  wgslGrammar,
  zigGrammar,
} from './grammars/systems.js';
import { dartGrammar, javascriptGrammar, phpGrammar, pythonGrammar, rubyGrammar, svelteGrammar, typescriptGrammar, vueGrammar } from './grammars/web-script.js';
import { substitutionGrammar } from './substitution-grammar.js';
import type { LanguageGrammar, TokenCategory, TokenRule } from './types.js';

const GRAMMARS: Map<string, LanguageGrammar> = new Map();
const CANONICAL_NAMES = new Set<string>();
const MAX_GRAMMAR_RULES = 100_000;
const MAX_GRAMMAR_STATES = 10_000;
const MAX_GRAMMAR_ALIASES = 1_000;
const TOKEN_CATEGORIES = new Set<TokenCategory>([
  'keyword',
  'string',
  'comment',
  'number',
  'operator',
  'type',
  'function',
  'variable',
  'punctuation',
  'builtin',
  'meta',
  'tag',
  'attribute',
  'regexp',
  'constant',
  'namespace',
  'parameter',
  'property',
  'label',
  'escape',
  'text',
]);

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function assertRule(rule: TokenRule, location: string): void {
  if (!(rule.pattern instanceof RegExp)) throw new TypeError(`${location}.pattern must be a RegExp`);
  if (!TOKEN_CATEGORIES.has(rule.token)) throw new TypeError(`${location}.token is not a supported token category`);
  if (rule.group !== undefined && (!Number.isSafeInteger(rule.group) || rule.group < 0)) {
    throw new TypeError(`${location}.group must be a non-negative safe integer`);
  }
  if (rule.push !== undefined && (typeof rule.push !== 'string' || rule.push.trim().length === 0)) {
    throw new TypeError(`${location}.push must be a non-empty state name`);
  }
}

function assertGrammar(grammar: LanguageGrammar): string {
  if (!grammar || typeof grammar !== 'object') throw new TypeError('Language grammar must be an object');
  if (typeof grammar.name !== 'string' || normalizeIdentifier(grammar.name).length === 0 || grammar.name.length > 256) {
    throw new TypeError('Language grammar name must be a non-empty string of at most 256 characters');
  }
  if (!Array.isArray(grammar.rules) || grammar.rules.length > MAX_GRAMMAR_RULES) {
    throw new TypeError(`Language grammar rules must be an array with at most ${MAX_GRAMMAR_RULES} entries`);
  }
  grammar.rules.forEach((rule, index) => assertRule(rule, `Language grammar rule ${index}`));

  if (grammar.aliases !== undefined) {
    if (!Array.isArray(grammar.aliases) || grammar.aliases.length > MAX_GRAMMAR_ALIASES) {
      throw new TypeError(`Language grammar aliases must be an array with at most ${MAX_GRAMMAR_ALIASES} entries`);
    }
    for (const alias of grammar.aliases) {
      if (typeof alias !== 'string' || normalizeIdentifier(alias).length === 0 || alias.length > 256) {
        throw new TypeError('Language grammar aliases must be non-empty strings of at most 256 characters');
      }
    }
  }

  if (grammar.states !== undefined) {
    if (!Array.isArray(grammar.states) || grammar.states.length > MAX_GRAMMAR_STATES) {
      throw new TypeError(`Language grammar states must be an array with at most ${MAX_GRAMMAR_STATES} entries`);
    }
    const names = new Set<string>();
    for (let index = 0; index < grammar.states.length; index++) {
      const state = grammar.states[index]!;
      if (typeof state.name !== 'string' || state.name.trim().length === 0 || names.has(state.name)) {
        throw new TypeError(`Language grammar state ${index} must have a unique, non-empty name`);
      }
      names.add(state.name);
      if (!(state.begin instanceof RegExp) || !(state.end instanceof RegExp)) {
        throw new TypeError(`Language grammar state ${state.name} begin/end must be RegExp values`);
      }
      if (!TOKEN_CATEGORIES.has(state.token) || (state.contentToken !== undefined && !TOKEN_CATEGORIES.has(state.contentToken))) {
        throw new TypeError(`Language grammar state ${state.name} uses an unsupported token category`);
      }
      if (state.contentRules !== undefined) {
        if (!Array.isArray(state.contentRules) || state.contentRules.length > MAX_GRAMMAR_RULES) {
          throw new TypeError(`Language grammar state ${state.name} has too many content rules`);
        }
        state.contentRules.forEach((rule, ruleIndex) => assertRule(rule, `Language grammar state ${state.name} rule ${ruleIndex}`));
      }
    }
  }

  return normalizeIdentifier(grammar.name);
}

function reg(grammar: LanguageGrammar): void {
  const canonicalName = assertGrammar(grammar);
  GRAMMARS.set(canonicalName, grammar);
  CANONICAL_NAMES.add(canonicalName);
  if (grammar.aliases) {
    for (const alias of grammar.aliases) {
      GRAMMARS.set(normalizeIdentifier(alias), grammar);
    }
  }
}

const builtInGrammars: readonly LanguageGrammar[] = [
  typescriptGrammar,
  substitutionGrammar,
  javascriptGrammar,
  pythonGrammar,
  bashGrammar,
  goGrammar,
  rustGrammar,
  rubyGrammar,
  javaGrammar,
  cGrammar,
  cppGrammar,
  csharpGrammar,
  jsonGrammar,
  yamlGrammar,
  cssGrammar,
  scssGrammar,
  htmlGrammar,
  sqlGrammar,
  dockerfileGrammar,
  makefileGrammar,
  gitignoreGrammar,
  markdownGrammar,
  tomlGrammar,
  diffGrammar,
  phpGrammar,
  swiftGrammar,
  kotlinGrammar,
  luaGrammar,
  svelteGrammar,
  vueGrammar,
  dartGrammar,
  elixirGrammar,
  haskellGrammar,
  ocamlGrammar,
  zigGrammar,
  wgslGrammar,
  terraformGrammar,
  nixGrammar,
  rGrammar,
  scalaGrammar,
  graphqlGrammar,
  protobufGrammar,
  perlGrammar,
];

for (const grammar of builtInGrammars) {
  reg(grammar);
}

/**
 * Register a custom language grammar.
 */
export function registerLanguage(grammar: LanguageGrammar): void {
  reg(grammar);
}

/**
 * Register a custom language grammar using the generic grammar API name.
 */
export function registerGrammar(name: string, rules: Omit<LanguageGrammar, 'name'> | LanguageGrammar): void {
  if ('name' in rules) {
    reg(rules);
    return;
  }
  reg({ name, ...rules });
}

/**
 * Get a language grammar by name (case-insensitive lookup).
 */
export function getLanguageGrammar(language: string): LanguageGrammar | undefined {
  if (typeof language !== 'string') return undefined;
  return GRAMMARS.get(normalizeIdentifier(language));
}

/**
 * List all registered language names (canonical names only, no aliases).
 */
export function listLanguages(): string[] {
  return [...CANONICAL_NAMES].sort();
}
