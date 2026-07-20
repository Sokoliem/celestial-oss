/**
 * Spectrum Language Detection
 *
 * Detect supported spectrum languages from file paths and shebang lines.
 */

import { getLanguageGrammar } from './grammars.js';

const EXTENSION_MAP: ReadonlyMap<string, string> = new Map([
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.mts', 'typescript'],
  ['.cts', 'typescript'],

  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],

  ['.py', 'python'],
  ['.pyw', 'python'],
  ['.rs', 'rust'],
  ['.go', 'go'],
  ['.rb', 'ruby'],
  ['.java', 'java'],
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
  ['.dart', 'dart'],

  ['.c', 'c'],
  ['.h', 'c'],

  ['.cpp', 'cpp'],
  ['.hpp', 'cpp'],
  ['.cc', 'cpp'],
  ['.cxx', 'cpp'],
  ['.hxx', 'cpp'],

  ['.cs', 'csharp'],
  ['.swift', 'swift'],
  ['.php', 'php'],
  ['.zig', 'zig'],
  ['.wgsl', 'wgsl'],

  ['.sh', 'bash'],
  ['.bash', 'bash'],
  ['.zsh', 'bash'],
  ['.env', 'bash'],

  ['.css', 'css'],
  ['.scss', 'scss'],
  ['.less', 'css'],
  ['.html', 'html'],
  ['.htm', 'html'],
  ['.svelte', 'svelte'],
  ['.vue', 'vue'],
  ['.xml', 'xml'],
  ['.svg', 'svg'],
  ['.json', 'json'],
  ['.jsonc', 'jsonc'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
  ['.toml', 'toml'],
  ['.md', 'markdown'],
  ['.mdx', 'markdown'],
  ['.sql', 'sql'],
  ['.lua', 'lua'],
  ['.ex', 'elixir'],
  ['.exs', 'elixir'],
  ['.hs', 'haskell'],
  ['.lhs', 'haskell'],
  ['.ml', 'ocaml'],
  ['.mli', 'ocaml'],
  ['.tf', 'terraform'],
  ['.tfvars', 'terraform'],
  ['.nix', 'nix'],
  ['.gitignore', 'gitignore'],

  ['.r', 'r'],
  ['.R', 'r'],
  ['.rmd', 'r'],

  ['.scala', 'scala'],
  ['.sc', 'scala'],
  ['.sbt', 'scala'],

  ['.graphql', 'graphql'],
  ['.gql', 'graphql'],

  ['.proto', 'protobuf'],

  ['.pl', 'perl'],
  ['.pm', 'perl'],
  ['.t', 'perl'],
]);

const BASENAME_MAP: ReadonlyMap<string, string> = new Map([
  ['dockerfile', 'dockerfile'],
  ['makefile', 'makefile'],
  ['gemfile', 'ruby'],
  ['rakefile', 'ruby'],
]);

const SHEBANG_MAP: ReadonlyMap<string, string> = new Map([
  ['node', 'javascript'],
  ['nodejs', 'javascript'],
  ['python', 'python'],
  ['python2', 'python'],
  ['python3', 'python'],
  ['ruby', 'ruby'],
  ['bash', 'bash'],
  ['sh', 'bash'],
  ['zsh', 'bash'],
  ['php', 'php'],
  ['lua', 'lua'],
  ['Rscript', 'r'],
  ['perl', 'perl'],
  ['scala', 'scala'],
]);

function resolveSupportedLanguage(language: string | undefined): string | undefined {
  if (!language) return undefined;
  return getLanguageGrammar(language)?.name;
}

/**
 * Detect a supported language from a file path or basename.
 * Returns the canonical spectrum language name when supported.
 */
export function detectLanguage(filePath: string): string | undefined {
  if (!filePath) return undefined;

  const basename = filePath.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!basename) return undefined;

  const basenameLower = basename.toLowerCase();
  const basenameMatch = resolveSupportedLanguage(BASENAME_MAP.get(basenameLower));
  if (basenameMatch) return basenameMatch;

  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex === -1) return undefined;

  const ext = basename.slice(dotIndex).toLowerCase();
  const extMatch = resolveSupportedLanguage(EXTENSION_MAP.get(ext));
  if (extMatch) return extMatch;

  if (basename.startsWith('.')) {
    return resolveSupportedLanguage(EXTENSION_MAP.get(basenameLower));
  }

  return undefined;
}

/**
 * Detect a supported language from a shebang line.
 * Supports both direct interpreter paths and env-based shebangs.
 */
export function detectLanguageFromShebang(firstLine: string): string | undefined {
  if (!firstLine?.startsWith('#!')) return undefined;

  const rest = firstLine.slice(2).trim();
  const parts = rest.split(/\s+/);
  const command = parts[0]?.replace(/\\/g, '/').split('/').pop() ?? '';

  let interpreter = command;

  if (command === 'env' && parts.length > 1) {
    let index = 1;
    while (index < parts.length && (parts[index]!.startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(parts[index]!))) {
      index++;
    }
    interpreter = parts[index] ?? '';
  }

  if (!interpreter) return undefined;

  const direct = resolveSupportedLanguage(SHEBANG_MAP.get(interpreter) ?? SHEBANG_MAP.get(interpreter.toLowerCase()));
  if (direct) return direct;

  const stripped = interpreter.replace(/\d+$/, '');
  if (stripped !== interpreter) {
    return resolveSupportedLanguage(SHEBANG_MAP.get(stripped));
  }

  return undefined;
}
