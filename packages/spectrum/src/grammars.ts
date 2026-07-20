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
import type { LanguageGrammar } from './types.js';

const GRAMMARS: Map<string, LanguageGrammar> = new Map();

function reg(grammar: LanguageGrammar): void {
  GRAMMARS.set(grammar.name, grammar);
  if (grammar.aliases) {
    for (const alias of grammar.aliases) {
      GRAMMARS.set(alias, grammar);
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
  return GRAMMARS.get(language.toLowerCase());
}

/**
 * List all registered language names (canonical names only, no aliases).
 */
export function listLanguages(): string[] {
  return Array.from(new Set(Array.from(GRAMMARS.values()).map((g) => g.name))).sort();
}
