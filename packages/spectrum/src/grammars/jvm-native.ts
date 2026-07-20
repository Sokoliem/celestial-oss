/**
 * JVM and Native Grammars
 */

import { functionCall, identifier, keywords, lineComment, numberLiteral, operators, punctuation, stringLiteral, whitespace } from '../grammar-helpers.js';
import type { LanguageGrammar } from '../types.js';
import { cStyleBlockComment } from './common.js';

// Java

export const javaGrammar: LanguageGrammar = {
  name: 'java',
  rules: [
    lineComment('//'),
    // Annotations
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    stringLiteral('"'),
    // Char literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null', 'var', 'record', 'sealed', 'permits', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['String', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character', 'Byte', 'Short', 'Object', 'List', 'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet', 'Optional', 'Stream', 'Comparable', 'Iterable', 'Collection'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['System', 'Math', 'Arrays', 'Collections', 'Objects', 'Thread', 'Runnable', 'Exception', 'RuntimeException', 'IOException', 'StringBuilder', 'StringBuffer'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// C

export const cGrammar: LanguageGrammar = {
  name: 'c',
  aliases: ['h'],
  rules: [
    lineComment('//'),
    // Preprocessor directives
    { pattern: /#\s*(?:include|define|undef|ifdef|ifndef|if|elif|else|endif|pragma|error|warning|line)\b[^\n]*/y, token: 'meta' },
    stringLiteral('"'),
    // Char literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['int', 'char', 'float', 'double', 'long', 'short', 'void', 'size_t', 'ptrdiff_t', 'FILE', 'bool', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['printf', 'scanf', 'malloc', 'calloc', 'realloc', 'free', 'memcpy', 'memset', 'strlen', 'strcmp', 'strcpy', 'strcat', 'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'NULL', 'stdin', 'stdout', 'stderr', 'EXIT_SUCCESS', 'EXIT_FAILURE'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// C++

export const cppGrammar: LanguageGrammar = {
  name: 'cpp',
  aliases: ['c++', 'cxx', 'cc', 'hpp'],
  rules: [
    lineComment('//'),
    // Preprocessor directives
    { pattern: /#\s*(?:include|define|undef|ifdef|ifndef|if|elif|else|endif|pragma|error|warning|line)\b[^\n]*/y, token: 'meta' },
    stringLiteral('"'),
    // Char literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    // Raw strings R"delimiter(...)delimiter"
    { pattern: /R"([^()\s]*)\([\s\S]*?\)\1"/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'const_cast', 'continue', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr', 'operator', 'private', 'protected', 'public', 'register', 'reinterpret_cast', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while', 'co_await', 'co_return', 'co_yield', 'concept', 'requires']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['string', 'vector', 'map', 'set', 'unordered_map', 'unordered_set', 'array', 'pair', 'tuple', 'optional', 'variant', 'any', 'shared_ptr', 'unique_ptr', 'weak_ptr', 'size_t', 'ptrdiff_t'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['std', 'cout', 'cin', 'cerr', 'endl', 'move', 'forward', 'make_shared', 'make_unique', 'make_pair', 'make_tuple', 'sort', 'find', 'begin', 'end', 'push_back', 'emplace_back', 'static_assert'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// C#

export const csharpGrammar: LanguageGrammar = {
  name: 'csharp',
  aliases: ['cs', 'c#'],
  rules: [
    lineComment('//'),
    // Verbatim strings
    { pattern: /@"(?:[^"]|"")*"/y, token: 'string' },
    stringLiteral('"'),
    // Char literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    // Attributes
    { pattern: /\[[a-zA-Z_][a-zA-Z_0-9]*(?:\([^)]*\))?\]/y, token: 'meta' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char', 'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate', 'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false', 'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit', 'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace', 'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private', 'protected', 'public', 'readonly', 'ref', 'return', 'sbyte', 'sealed', 'short', 'sizeof', 'static', 'string', 'struct', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong', 'unchecked', 'unsafe', 'ushort', 'using', 'var', 'virtual', 'void', 'volatile', 'while', 'async', 'await', 'record', 'init', 'required', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['String', 'Int32', 'Int64', 'Double', 'Boolean', 'Object', 'List', 'Dictionary', 'HashSet', 'Task', 'IEnumerable', 'Action', 'Func', 'Nullable', 'Span', 'Memory'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['Console', 'Math', 'Convert', 'Enumerable', 'Environment', 'GC', 'Type', 'Activator', 'Attribute', 'Buffer', 'DateTime', 'TimeSpan', 'Guid'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Swift

export const swiftGrammar: LanguageGrammar = {
  name: 'swift',
  rules: [
    lineComment('//'),
    // Attributes
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    stringLiteral('"'),
    // Multi-line strings
    { pattern: /"""(?:[^"\\]|\\.)*"""/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['actor', 'associatedtype', 'async', 'await', 'break', 'case', 'catch', 'class', 'continue', 'default', 'defer', 'deinit', 'do', 'else', 'enum', 'extension', 'fallthrough', 'false', 'for', 'func', 'guard', 'if', 'import', 'in', 'init', 'inout', 'internal', 'is', 'lazy', 'let', 'nil', 'open', 'operator', 'private', 'protocol', 'public', 'repeat', 'return', 'self', 'static', 'struct', 'subscript', 'super', 'switch', 'throw', 'throws', 'true', 'try', 'typealias', 'var', 'weak', 'where', 'while']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['Int', 'Double', 'Float', 'Bool', 'String', 'Character', 'Array', 'Dictionary', 'Set', 'Optional', 'Result', 'Void', 'Any', 'AnyObject', 'Error', 'Codable', 'Hashable', 'Equatable', 'Comparable'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['print', 'debugPrint', 'fatalError', 'precondition', 'assert', 'type', 'MemoryLayout', 'Mirror', 'stride', 'zip', 'map', 'filter', 'reduce', 'sorted', 'compactMap', 'flatMap', 'forEach'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Kotlin

export const kotlinGrammar: LanguageGrammar = {
  name: 'kotlin',
  aliases: ['kt', 'kts'],
  rules: [
    lineComment('//'),
    // Annotations
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    stringLiteral('"'),
    // Multi-line (raw) strings
    { pattern: /"""(?:[^"\\]|\\.)*"""/y, token: 'string' },
    // String templates
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'actual', 'annotation', 'as', 'break', 'by', 'catch', 'class', 'companion', 'const', 'constructor', 'continue', 'crossinline', 'data', 'do', 'else', 'enum', 'expect', 'external', 'false', 'final', 'finally', 'for', 'fun', 'if', 'import', 'in', 'infix', 'init', 'inline', 'inner', 'interface', 'internal', 'is', 'it', 'lateinit', 'noinline', 'null', 'object', 'open', 'operator', 'out', 'override', 'package', 'private', 'protected', 'public', 'reified', 'return', 'sealed', 'super', 'suspend', 'this', 'throw', 'true', 'try', 'typealias', 'val', 'var', 'vararg', 'when', 'where', 'while', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['Int', 'Long', 'Short', 'Byte', 'Float', 'Double', 'Boolean', 'Char', 'String', 'Unit', 'Nothing', 'Any', 'Array', 'List', 'Map', 'Set', 'MutableList', 'MutableMap', 'MutableSet', 'Pair', 'Triple'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['println', 'print', 'readLine', 'require', 'check', 'error', 'TODO', 'run', 'with', 'let', 'also', 'apply', 'takeIf', 'takeUnless', 'repeat', 'lazy', 'listOf', 'mapOf', 'setOf', 'arrayOf', 'mutableListOf', 'mutableMapOf', 'mutableSetOf'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Scala

export const scalaGrammar: LanguageGrammar = {
  name: 'scala',
  aliases: ['sc'],
  rules: [
    lineComment('//'),
    // Triple-quoted strings
    { pattern: /"""(?:[^"\\]|\\.)*"""/y, token: 'string' },
    stringLiteral('"'),
    stringLiteral("'"),
    // String interpolation prefix
    { pattern: /[sf](?=")/y, token: 'meta' },
    // Annotations
    { pattern: /@[a-zA-Z_][a-zA-Z_$0-9.]*/y, token: 'meta' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['abstract', 'case', 'catch', 'class', 'def', 'do', 'else', 'enum', 'extends', 'final', 'finally', 'for', 'forSome', 'given', 'if', 'implicit', 'import', 'lazy', 'match', 'new', 'object', 'override', 'package', 'private', 'protected', 'return', 'sealed', 'super', 'then', 'this', 'throw', 'trait', 'try', 'type', 'using', 'val', 'var', 'while', 'with', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false', 'null'], 'constant'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['Int', 'Long', 'Short', 'Byte', 'Float', 'Double', 'Char', 'Boolean', 'String', 'Unit', 'Any', 'AnyRef', 'AnyVal', 'Nothing', 'Null', 'Option', 'Some', 'None', 'List', 'Map', 'Set', 'Seq', 'Array', 'Vector', 'Future', 'Either', 'Left', 'Right', 'Try', 'Success', 'Failure'], 'type'),
    functionCall(),
    identifier(),
    operators('=><+-*/%!&|^~:?'),
    punctuation('()[]{}.,;@#'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};
