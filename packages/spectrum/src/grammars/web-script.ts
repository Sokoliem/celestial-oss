/**
 * Web and Script Grammars
 */

import { functionCall, identifier, keywords, lineComment, numberLiteral, operators, stringLiteral, templateLiteral, whitespace } from '../grammar-helpers.js';
import type { LanguageGrammar } from '../types.js';
import { cStyleBlockComment, htmlBlockComment } from './common.js';

// TypeScript

export const typescriptGrammar: LanguageGrammar = {
  name: 'typescript',
  aliases: ['ts', 'tsx'],
  rules: [
    lineComment('//'),
    stringLiteral("'"),
    stringLiteral('"'),
    templateLiteral(),
    // Decorators (must come before identifier/number)
    { pattern: /@[a-zA-Z_$][a-zA-Z_$0-9.]*/y, token: 'meta' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'import', 'export', 'from', 'class', 'type', 'interface', 'enum', 'async', 'await', 'new', 'this', 'super', 'extends', 'implements', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'try', 'catch', 'finally', 'throw', 'yield', 'delete', 'void', 'in', 'of', 'as', 'is', 'keyof', 'readonly', 'declare', 'namespace', 'module', 'abstract', 'static', 'private', 'protected', 'public', 'override', 'satisfies', 'infer', 'never', 'unknown', 'any']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'void', 'Array', 'Promise', 'Map', 'Set', 'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['console', 'Math', 'JSON', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Error', 'RegExp', 'Symbol', 'Promise', 'Proxy', 'Reflect'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// JavaScript

export const javascriptGrammar: LanguageGrammar = {
  name: 'javascript',
  aliases: ['js', 'jsx', 'mjs', 'cjs'],
  rules: [
    lineComment('//'),
    stringLiteral("'"),
    stringLiteral('"'),
    templateLiteral(),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'import', 'export', 'from', 'class', 'async', 'await', 'new', 'this', 'super', 'extends', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'try', 'catch', 'finally', 'throw', 'yield', 'delete', 'void', 'in', 'of', 'with', 'debugger']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['console', 'Math', 'JSON', 'Date', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Error', 'RegExp', 'Symbol', 'Promise', 'Proxy', 'Reflect', 'globalThis', 'window', 'document'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Python

export const pythonGrammar: LanguageGrammar = {
  name: 'python',
  aliases: ['py'],
  rules: [
    // Triple-quoted strings (must come before single-char string delimiters)
    { pattern: /"""(?:[^"\\]|\\.|"(?!"")|""(?!"))*"""/y, token: 'string' },
    { pattern: /'''(?:[^'\\]|\\.|'(?!'')|''(?!'))*'''/y, token: 'string' },
    lineComment('#'),
    stringLiteral("'"),
    stringLiteral('"'),
    // Decorators
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9.]*/y, token: 'meta' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'True', 'False', 'None', 'with', 'in', 'not', 'and', 'or', 'is', 'lambda', 'try', 'except', 'finally', 'raise', 'pass', 'break', 'continue', 'yield', 'del', 'global', 'nonlocal', 'assert', 'async', 'await']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['int', 'float', 'str', 'bool', 'list', 'dict', 'tuple', 'set', 'bytes', 'type', 'object', 'None'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'input', 'open', 'super', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'property', 'staticmethod', 'classmethod', 'abs', 'min', 'max', 'sum', 'any', 'all', 'iter', 'next'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~@:'),
    whitespace(),
  ],
};

// Ruby

export const rubyGrammar: LanguageGrammar = {
  name: 'ruby',
  aliases: ['rb'],
  rules: [
    lineComment('#'),
    // Symbols
    { pattern: /:[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'constant' },
    // Instance/class variables
    { pattern: /@@?[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    stringLiteral("'"),
    stringLiteral('"'),
    // Regex literals
    { pattern: /\/(?:[^/\\]|\\.)*\//y, token: 'regexp' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['def', 'class', 'module', 'end', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'do', 'begin', 'rescue', 'ensure', 'raise', 'return', 'yield', 'self', 'super', 'true', 'false', 'nil', 'and', 'or', 'not', 'in', 'then', 'case', 'when', 'require', 'include', 'extend', 'attr_reader', 'attr_writer', 'attr_accessor', 'lambda', 'proc']),
    // block_given? needs a dedicated rule since ? is not an identifier char
    { pattern: /block_given\?/y, token: 'keyword' },
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['puts', 'print', 'p', 'pp', 'gets', 'chomp', 'to_s', 'to_i', 'to_f', 'length', 'size', 'each', 'map', 'select', 'reject', 'reduce', 'inject', 'sort', 'flatten', 'compact', 'freeze', 'dup', 'clone'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
};

// PHP

export const phpGrammar: LanguageGrammar = {
  name: 'php',
  rules: [
    lineComment('//'),
    lineComment('#'),
    // PHP tags
    { pattern: /<\?php|\?>/y, token: 'meta' },
    // Variable
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    stringLiteral("'"),
    stringLiteral('"'),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'and', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile', 'extends', 'final', 'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'instanceof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield', 'true', 'false', 'null', 'enum', 'array']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['echo', 'print', 'var_dump', 'print_r', 'isset', 'unset', 'empty', 'count', 'strlen', 'substr', 'strpos', 'array_push', 'array_pop', 'array_map', 'array_filter', 'array_merge', 'implode', 'explode', 'json_encode', 'json_decode', 'file_get_contents', 'file_put_contents'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Svelte

export const svelteGrammar: LanguageGrammar = {
  name: 'svelte',
  rules: [
    { pattern: /{[#:/@][^}]+}/y, token: 'keyword' },
    { pattern: /{[^}]+}/y, token: 'meta' },
    { pattern: /<\/?[a-zA-Z][a-zA-Z0-9-]*/y, token: 'tag' },
    { pattern: /\/?>/y, token: 'tag' },
    { pattern: /(?:bind|class|on|use|in|out|animate|transition):[a-zA-Z_][a-zA-Z_0-9-]*/y, token: 'attribute' },
    { pattern: /[a-zA-Z_:][a-zA-Z_0-9:.-]*(?=\s*=)/y, token: 'attribute' },
    stringLiteral('"'),
    stringLiteral("'"),
    { pattern: /&[a-zA-Z]+;|&#\d+;|&#x[\da-fA-F]+;/y, token: 'escape' },
    operators('='),
    whitespace(),
    identifier(),
  ],
  states: [htmlBlockComment()],
};

// Vue

export const vueGrammar: LanguageGrammar = {
  name: 'vue',
  rules: [
    { pattern: /{{[^}]+}}/y, token: 'meta' },
    { pattern: /<\/?[a-zA-Z][a-zA-Z0-9-]*/y, token: 'tag' },
    { pattern: /\/?>/y, token: 'tag' },
    { pattern: /(?:v-[a-zA-Z-]+|:[a-zA-Z_][a-zA-Z_0-9-]*|@[a-zA-Z_][a-zA-Z_0-9-]*)(?=\s*=|\s|>)/y, token: 'attribute' },
    { pattern: /[a-zA-Z_:][a-zA-Z_0-9:.-]*(?=\s*=)/y, token: 'attribute' },
    stringLiteral('"'),
    stringLiteral("'"),
    { pattern: /&[a-zA-Z]+;|&#\d+;|&#x[\da-fA-F]+;/y, token: 'escape' },
    operators('='),
    whitespace(),
    identifier(),
  ],
  states: [htmlBlockComment()],
};

// Dart

export const dartGrammar: LanguageGrammar = {
  name: 'dart',
  rules: [
    lineComment('//'),
    { pattern: /'''(?:[^'\\]|\\.|'(?!'')|''(?!'))*'''/y, token: 'string' },
    { pattern: /"""(?:[^"\\]|\\.|"(?!"")|""(?!"))*"""/y, token: 'string' },
    stringLiteral("'"),
    stringLiteral('"'),
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'deferred', 'do', 'else', 'enum', 'export', 'extends', 'extension', 'external', 'factory', 'false', 'final', 'finally', 'for', 'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library', 'mixin', 'new', 'null', 'operator', 'part', 'required', 'rethrow', 'return', 'show', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typedef', 'var', 'void', 'while', 'with', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['int', 'double', 'num', 'bool', 'String', 'List', 'Map', 'Set', 'Object', 'Future', 'Stream', 'Never'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['print', 'identical', 'runtimeType', 'Duration'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};
