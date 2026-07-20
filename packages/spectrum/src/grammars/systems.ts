/**
 * Systems Grammars
 */

import { functionCall, identifier, keywords, lineComment, numberLiteral, operators, punctuation, stringLiteral, whitespace } from '../grammar-helpers.js';
import type { LanguageGrammar } from '../types.js';
import { cStyleBlockComment } from './common.js';

// Bash / Shell

export const bashGrammar: LanguageGrammar = {
  name: 'bash',
  aliases: ['sh', 'shell', 'zsh'],
  rules: [
    lineComment('#'),
    stringLiteral('"'),
    stringLiteral("'"),
    // Variable expansion
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    { pattern: /\$\{[^}]*\}/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'until', 'case', 'esac', 'function', 'in', 'select', 'return', 'local', 'declare', 'readonly', 'export', 'unset', 'shift', 'source', 'set', 'trap']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['echo', 'printf', 'cd', 'pwd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'sed', 'awk', 'find', 'sort', 'uniq', 'wc', 'head', 'tail', 'xargs', 'test', 'read', 'eval', 'exec', 'exit'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-=!<>&|'),
    whitespace(),
  ],
};

// Go

export const goGrammar: LanguageGrammar = {
  name: 'go',
  aliases: ['golang'],
  rules: [
    lineComment('//'),
    // Raw string literals
    { pattern: /`[^`]*`/y, token: 'string' },
    stringLiteral('"'),
    // Rune literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var', 'true', 'false', 'nil', 'iota']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'float32', 'float64', 'complex64', 'complex128', 'string', 'bool', 'byte', 'rune', 'error', 'any'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['append', 'cap', 'close', 'copy', 'delete', 'len', 'make', 'new', 'panic', 'print', 'println', 'recover', 'complex', 'imag', 'real'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^:'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Rust

export const rustGrammar: LanguageGrammar = {
  name: 'rust',
  aliases: ['rs'],
  rules: [
    lineComment('//'),
    // Attribute macros
    { pattern: /#!?\[[^\]]*\]/y, token: 'meta' },
    // Macro invocations
    { pattern: /[a-zA-Z_][a-zA-Z_0-9]*!/y, token: 'builtin' },
    // Lifetime annotations
    { pattern: /'[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'label' },
    stringLiteral('"'),
    // Raw strings
    { pattern: /r#*"(?:[^"]|"(?!#))*"#*/y, token: 'string' },
    // Char literals
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while', 'yield']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['i8', 'i16', 'i32', 'i64', 'i128', 'u8', 'u16', 'u32', 'u64', 'u128', 'f32', 'f64', 'bool', 'char', 'str', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc', 'HashMap', 'HashSet', 'usize', 'isize'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['println', 'eprintln', 'format', 'vec', 'panic', 'assert', 'assert_eq', 'assert_ne', 'dbg', 'todo', 'unimplemented', 'unreachable', 'cfg', 'include', 'include_str', 'env'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^?:@#'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Dockerfile

export const dockerfileGrammar: LanguageGrammar = {
  name: 'dockerfile',
  aliases: ['docker'],
  rules: [
    lineComment('#'),
    stringLiteral('"'),
    stringLiteral("'"),
    // Docker instructions (uppercase at start of line)
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL', 'AS']),
    // Variable expansion
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    { pattern: /\$\{[^}]*\}/y, token: 'variable' },
    numberLiteral(),
    functionCall(),
    identifier(),
    operators('='),
    whitespace(),
  ],
};

// Makefile

export const makefileGrammar: LanguageGrammar = {
  name: 'makefile',
  aliases: ['make'],
  rules: [
    lineComment('#'),
    stringLiteral('"'),
    stringLiteral("'"),
    { pattern: /\$\([^)]+\)/y, token: 'variable' },
    { pattern: /\$\{[^}]+\}/y, token: 'variable' },
    { pattern: /\$(?:[@%<?^+*|])/, token: 'variable' },
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['include', 'ifdef', 'ifndef', 'ifeq', 'ifneq', 'else', 'endif', 'define', 'endef', 'override', 'export', 'unexport', 'private', 'vpath', 'undefine']),
    { pattern: /[a-zA-Z_][a-zA-Z_0-9-]*(?=\s*(?:::?=|\+=|\?=|!=|=))/y, token: 'property' },
    { pattern: /[a-zA-Z0-9_./%+-]+(?=\s*:)/y, token: 'label' },
    numberLiteral(),
    identifier(),
    { pattern: /::?=|\+=|\?=|!=|=/y, token: 'operator' },
    operators('+-/|'),
    punctuation(':()'),
    whitespace(),
  ],
};

// Gitignore

export const gitignoreGrammar: LanguageGrammar = {
  name: 'gitignore',
  rules: [{ pattern: /^#.*/y, token: 'comment' }, { pattern: /!/y, token: 'operator' }, { pattern: /(?:\\.|[^\s])+/y, token: 'regexp' }, whitespace()],
};

// Diff / Patch

export const diffGrammar: LanguageGrammar = {
  name: 'diff',
  aliases: ['patch'],
  rules: [
    // Hunk headers
    { pattern: /@@[^@]*@@.*/y, token: 'type' },
    // File headers
    { pattern: /(?:diff |index |--- |(?:\+\+\+) ).*/y, token: 'comment' },
    // Added lines
    { pattern: /\+.*/y, token: 'string' },
    // Removed lines
    { pattern: /-.*/y, token: 'keyword' },
    // Context / everything else (use .+ to avoid zero-length match)
    { pattern: /.+/y, token: 'text' },
  ],
};

// Zig

export const zigGrammar: LanguageGrammar = {
  name: 'zig',
  rules: [
    lineComment('//'),
    stringLiteral('"'),
    { pattern: /'(?:[^'\\]|\\.)'/y, token: 'string' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['addrspace', 'align', 'allowzero', 'and', 'anyframe', 'asm', 'async', 'await', 'break', 'catch', 'comptime', 'const', 'continue', 'defer', 'else', 'enum', 'errdefer', 'error', 'export', 'extern', 'false', 'fn', 'for', 'if', 'inline', 'linksection', 'noalias', 'nosuspend', 'null', 'opaque', 'or', 'orelse', 'packed', 'pub', 'resume', 'return', 'struct', 'suspend', 'switch', 'test', 'threadlocal', 'true', 'try', 'union', 'unreachable', 'usingnamespace', 'var', 'volatile', 'while']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64', 'usize', 'isize', 'bool', 'void', 'anytype'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['std'], 'builtin'),
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:.'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// WGSL

export const wgslGrammar: LanguageGrammar = {
  name: 'wgsl',
  rules: [
    lineComment('//'),
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    stringLiteral('"'),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['alias', 'bitcast', 'break', 'case', 'const', 'continue', 'continuing', 'default', 'discard', 'else', 'enable', 'false', 'fn', 'for', 'if', 'let', 'loop', 'override', 'return', 'struct', 'switch', 'true', 'var', 'while']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['bool', 'f16', 'f32', 'i32', 'u32', 'vec2', 'vec3', 'vec4', 'mat2x2', 'mat3x3', 'mat4x4', 'sampler', 'sampler_comparison', 'texture_2d', 'texture_cube', 'ptr'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['textureSample', 'textureLoad', 'dot', 'normalize', 'length', 'clamp', 'select'], 'builtin'),
    functionCall(),
    identifier(),
    operators('+-*/%=!<>&|^~?:@'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Terraform

export const terraformGrammar: LanguageGrammar = {
  name: 'terraform',
  aliases: ['tf', 'hcl'],
  rules: [
    lineComment('#'),
    lineComment('//'),
    stringLiteral('"'),
    { pattern: /\$\{[^}]+\}/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['data', 'false', 'locals', 'module', 'null', 'output', 'provider', 'resource', 'terraform', 'true', 'variable']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['string', 'number', 'bool', 'list', 'map', 'object', 'tuple', 'set'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['var', 'local', 'path', 'file', 'lookup', 'merge', 'join', 'format'], 'builtin'),
    { pattern: /[a-zA-Z_][a-zA-Z_0-9-]*(?=\s*=)/y, token: 'property' },
    identifier(),
    operators('=.:'),
    { pattern: /[{}()[\],]/y, token: 'punctuation' },
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Nix

export const nixGrammar: LanguageGrammar = {
  name: 'nix',
  rules: [
    lineComment('#'),
    stringLiteral('"'),
    { pattern: /\$\{[^}]+\}/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['assert', 'else', 'if', 'in', 'inherit', 'let', 'or', 'rec', 'then', 'with']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['builtins', 'pkgs', 'lib', 'stdenv', 'fetchurl', 'fetchFromGitHub'], 'builtin'),
    { pattern: /[a-zA-Z_][a-zA-Z_0-9-]*(?=\s*=)/y, token: 'property' },
    identifier(),
    operators('=.:?+-/'),
    { pattern: /[{}()[\],;]/y, token: 'punctuation' },
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};
