/**
 * Data and Markup Grammars
 */

import {
  functionCall,
  identifier,
  keywords,
  keywordsCI,
  lineComment,
  numberLiteral,
  operators,
  punctuation,
  stringLiteral,
  whitespace,
} from '../grammar-helpers.js';
import type { LanguageGrammar } from '../types.js';
import { cStyleBlockComment, htmlBlockComment } from './common.js';

// JSON

export const jsonGrammar: LanguageGrammar = {
  name: 'json',
  aliases: ['jsonc'],
  rules: [
    lineComment('//'),
    // JSON keys (string followed by :)
    { pattern: /"(?:[^"\\]|\\.)*"(?=\s*:)/y, token: 'property' },
    stringLiteral('"'),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false', 'null'], 'constant'),
    operators(':,'),
    { pattern: /[{}[\]]/y, token: 'punctuation' },
    whitespace(),
  ],
};

// YAML

export const yamlGrammar: LanguageGrammar = {
  name: 'yaml',
  aliases: ['yml'],
  rules: [
    lineComment('#'),
    // Keys (unquoted word followed by :)
    { pattern: /[a-zA-Z_][a-zA-Z_0-9-]*(?=\s*:)/y, token: 'property' },
    stringLiteral("'"),
    stringLiteral('"'),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false', 'null', 'yes', 'no', 'on', 'off'], 'constant'),
    // Anchors and aliases
    { pattern: /[&*][a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    operators(':->|'),
    { pattern: /[[\]{}]/y, token: 'punctuation' },
    whitespace(),
    identifier(),
  ],
};

// CSS

export const cssGrammar: LanguageGrammar = {
  name: 'css',
  rules: [
    // Selectors: class, id, pseudo
    { pattern: /[.#][a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'tag' },
    { pattern: /:{1,2}[a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'meta' },
    stringLiteral("'"),
    stringLiteral('"'),
    // CSS functions
    { pattern: /[a-zA-Z_-][a-zA-Z_0-9-]*(?=\()/y, token: 'function' },
    numberLiteral(),
    // Units
    { pattern: /(?:px|em|rem|%|vh|vw|vmin|vmax|fr|ch|ex|deg|rad|ms|s)(?![a-zA-Z_])/y, token: 'type' },
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['important', 'inherit', 'initial', 'unset', 'revert'], 'constant'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['display', 'position', 'margin', 'padding', 'border', 'width', 'height', 'color', 'background', 'font', 'flex', 'grid', 'gap', 'align', 'justify', 'transition', 'transform', 'animation', 'opacity', 'overflow', 'cursor', 'visibility', 'outline', 'text', 'line', 'letter', 'white'], 'builtin'),
    // Property names (word followed by :)
    { pattern: /[a-zA-Z_-][a-zA-Z_0-9-]*(?=\s*:)/y, token: 'property' },
    identifier(),
    operators(':;>+~*,'),
    { pattern: /[{}()[\]]/y, token: 'punctuation' },
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// SCSS

export const scssGrammar: LanguageGrammar = {
  name: 'scss',
  rules: [
    { pattern: /(?:^|(?<=[\s;{]))\/\/.*/y, token: 'comment' },
    { pattern: /\$[a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'variable' },
    { pattern: /@[a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'meta' },
    { pattern: /&/y, token: 'operator' },
    { pattern: /[.#][a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'tag' },
    { pattern: /:{1,2}[a-zA-Z_-][a-zA-Z_0-9-]*/y, token: 'meta' },
    stringLiteral("'"),
    stringLiteral('"'),
    { pattern: /[a-zA-Z_-][a-zA-Z_0-9-]*(?=\()/y, token: 'function' },
    numberLiteral(),
    { pattern: /(?:px|em|rem|%|vh|vw|vmin|vmax|fr|ch|ex|deg|rad|ms|s)(?![a-zA-Z_])/y, token: 'type' },
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['important', 'inherit', 'initial', 'unset', 'revert'], 'constant'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['display', 'position', 'margin', 'padding', 'border', 'width', 'height', 'color', 'background', 'font', 'flex', 'grid', 'gap', 'align', 'justify', 'transition', 'transform', 'animation', 'opacity', 'overflow', 'cursor', 'visibility', 'outline', 'text', 'line', 'letter', 'white'], 'builtin'),
    { pattern: /[a-zA-Z_-][a-zA-Z_0-9-]*(?=\s*:)/y, token: 'property' },
    identifier(),
    operators(':;>+~*,'),
    { pattern: /[{}()[\]]/y, token: 'punctuation' },
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// HTML

export const htmlGrammar: LanguageGrammar = {
  name: 'html',
  aliases: ['htm', 'xml', 'svg'],
  rules: [
    // Doctype
    { pattern: /<!DOCTYPE\b[^>]*>/y, token: 'meta' },
    // Tags
    { pattern: /<\/?[a-zA-Z][a-zA-Z0-9-]*/y, token: 'tag' },
    { pattern: /\/?>/y, token: 'tag' },
    // Attributes
    { pattern: /[a-zA-Z_:][a-zA-Z_0-9:.-]*(?=\s*=)/y, token: 'attribute' },
    stringLiteral('"'),
    stringLiteral("'"),
    // Entities
    { pattern: /&[a-zA-Z]+;|&#\d+;|&#x[\da-fA-F]+;/y, token: 'escape' },
    operators('='),
    whitespace(),
    identifier(),
  ],
  states: [htmlBlockComment()],
};

// SQL

export const sqlGrammar: LanguageGrammar = {
  name: 'sql',
  rules: [
    lineComment('--'),
    stringLiteral("'"),
    // Quoted identifiers
    { pattern: /"[^"]*"/y, token: 'variable' },
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywordsCI(['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'HAVING', 'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK', 'UNIQUE', 'WITH', 'RECURSIVE', 'TRUE', 'FALSE']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywordsCI(['INTEGER', 'TEXT', 'VARCHAR', 'CHAR', 'BOOLEAN', 'FLOAT', 'DOUBLE', 'DECIMAL', 'DATE', 'TIMESTAMP', 'BLOB', 'SERIAL', 'BIGINT', 'SMALLINT', 'NUMERIC', 'REAL', 'UUID', 'JSONB', 'JSON', 'ARRAY'], 'type'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywordsCI(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'NULLIF', 'CAST', 'CONVERT', 'CONCAT', 'LENGTH', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER', 'NOW', 'CURRENT_TIMESTAMP', 'EXTRACT', 'DATE_TRUNC', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'], 'builtin'),
    functionCall(),
    identifier(),
    operators('=!<>+-*/%|&'),
    { pattern: /[();,]/y, token: 'punctuation' },
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};

// Markdown

export const markdownGrammar: LanguageGrammar = {
  name: 'markdown',
  aliases: ['md'],
  rules: [
    // Headings
    { pattern: /^#{1,6}\s.*/y, token: 'keyword' },
    // Bold
    { pattern: /\*\*[^*]+\*\*/y, token: 'keyword' },
    { pattern: /__[^_]+__/y, token: 'keyword' },
    // Italic
    { pattern: /\*[^*]+\*/y, token: 'variable' },
    { pattern: /_[^_]+_/y, token: 'variable' },
    // Code
    { pattern: /`[^`]+`/y, token: 'string' },
    // Links
    { pattern: /\[[^\]]*\]\([^)]*\)/y, token: 'type' },
    // Everything else
    { pattern: /[^#*_`[\]]+/y, token: 'text' },
    { pattern: /./y, token: 'text' },
  ],
};

// TOML

export const tomlGrammar: LanguageGrammar = {
  name: 'toml',
  rules: [
    lineComment('#'),
    // Table headers
    { pattern: /\[\[?[a-zA-Z_][a-zA-Z_0-9.-]*\]?\]/y, token: 'tag' },
    // Keys
    { pattern: /[a-zA-Z_][a-zA-Z_0-9-]*(?=\s*=)/y, token: 'property' },
    // Triple-quoted strings
    { pattern: /"""(?:[^"\\]|\\.)*"""/y, token: 'string' },
    { pattern: /'''(?:[^'\\]|\\.)*'''/y, token: 'string' },
    stringLiteral('"'),
    stringLiteral("'"),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false'], 'constant'),
    // Dates
    { pattern: /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/y, token: 'number' },
    operators('='),
    { pattern: /[{}[\],]/y, token: 'punctuation' },
    whitespace(),
    identifier(),
  ],
};

// GraphQL

export const graphqlGrammar: LanguageGrammar = {
  name: 'graphql',
  aliases: ['gql'],
  rules: [
    lineComment('#'),
    // Triple-quoted (block) strings
    { pattern: /"""(?:[^"\\]|\\.)*"""/y, token: 'string' },
    stringLiteral('"'),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['query', 'mutation', 'subscription', 'fragment', 'on', 'schema', 'extend', 'input', 'type', 'interface', 'union', 'enum', 'scalar', 'directive', 'implements', 'repeatable']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false', 'null'], 'constant'),
    // Directives
    { pattern: /@[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'meta' },
    // Type references (capitalized)
    { pattern: /[A-Z][a-zA-Z_0-9]*/y, token: 'type' },
    // Variables
    { pattern: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
    functionCall(),
    identifier(),
    operators('=!|&:'),
    punctuation('()[]{}.,'),
    whitespace(),
  ],
};

// Protobuf

export const protobufGrammar: LanguageGrammar = {
  name: 'protobuf',
  aliases: ['proto'],
  rules: [
    lineComment('//'),
    stringLiteral('"'),
    stringLiteral("'"),
    numberLiteral(),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['syntax', 'package', 'import', 'public', 'option', 'message', 'enum', 'service', 'rpc', 'returns', 'stream', 'oneof', 'map', 'extend', 'extensions', 'reserved', 'to', 'max', 'repeated', 'optional', 'required']),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['true', 'false'], 'constant'),
    // biome-ignore format: keep compact grammar tables under the 500-line budget.
    keywords(['double', 'float', 'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64', 'bool', 'string', 'bytes', 'Any', 'Timestamp', 'Duration', 'Empty'], 'type'),
    // Field numbers
    { pattern: /=\s*\d+/y, token: 'number' },
    // Type references (capitalized)
    { pattern: /[A-Z][a-zA-Z_0-9]*/y, token: 'type' },
    functionCall(),
    identifier(),
    operators('=;'),
    punctuation('()[]{}.,<>'),
    whitespace(),
  ],
  states: [cStyleBlockComment()],
};
