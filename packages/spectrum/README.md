# @celestial/spectrum

State-machine syntax highlighting engine for the Celestial TUI framework. Tokenizes source code into categorized spans and renders them with ANSI styling. Supports 37 languages, 8 built-in themes, document-level tokenization helpers, and extensible grammars.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Highlights

- Regex-based state-machine tokenizer with multi-line construct support
- 37 built-in language grammars with aliases
- 8 built-in themes (`default`, `monokai`, `github`, `github-light`, `github-dark`, `dracula`, `nord`, `solarized`)
- Incremental document tokenization, bracket matching, and folding helpers
- TextMate grammar import plus custom theme and grammar registration
- Grammar helper utilities for building new language definitions
- Zero external runtime dependencies (only `@celestial/corona` for ANSI styling)

## Quick Start

```typescript
import { highlight, highlightCode, tokenizeCode } from '@celestial/spectrum';

const styled = highlight('const x = 42;', 'typescript');
const styledWithOptions = highlightCode('const x = 42;', {
  language: 'typescript',
  theme: 'monokai',
});

const tokens = tokenizeCode('const x = 42;', 'typescript');
console.log(tokens);
// [
//   { category: 'keyword', text: 'const' },
//   { category: 'text', text: ' ' },
//   { category: 'variable', text: 'x' },
//   { category: 'text', text: ' ' },
//   { category: 'operator', text: '=' },
//   { category: 'text', text: ' ' },
//   { category: 'number', text: '42' },
//   { category: 'punctuation', text: ';' },
// ]
```

## Substitution Mode

Prompt-template substitutions ship as an additive subpath export:

```typescript
import { renderSubstitutions, tokenizeSubstitutions } from '@celestial/spectrum/substitution';

const template = 'Review ${file} for ${owner}.';
const tokens = tokenizeSubstitutions(template, {
  known: new Set(['file', 'owner']),
  fills: new Map([
    ['file', 'packages/spectrum/src/substitution.ts'],
    ['owner', 'Ada'],
  ]),
});

const originalPreview = renderSubstitutions(tokens);
const diffPreview = renderSubstitutions(tokens, { diffStyle: true });
```

`tokenizeSubstitutions()` emits stable token kinds for literals, substitution delimiters, substitution names, and resolved-status markers (`filled`, `unfilled`, `unknown`). `renderSubstitutions()` returns a `VNode` row with corona-styled text nodes, and `diffStyle: true` renders filled substitutions as `original -> resolved`.

For the integrated spectrum mode, the built-in `substitution` language can also be used with the normal highlighter:

```typescript
import { highlight } from '@celestial/spectrum';

const ansi = highlight('Review ${file}', 'substitution');
```

See [`examples/spectrum-template-preview`](../../examples/spectrum-template-preview) for the Appendix B example consumer.

## Highlighting API

### `highlight`

```typescript
import { highlight } from '@celestial/spectrum';

const result: string = highlight(code, language, theme?);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | `string` | Source code to highlight |
| `language` | `string` | Language identifier (e.g. `'typescript'`, `'py'`, `'sql'`) |
| `theme` | `HighlightThemeName \| HighlightTheme` | Theme name or object (default: `'default'`) |

Returns ANSI-styled text. Returns the input unmodified if the language is not registered. Empty strings pass through unchanged.

### `highlightCode`

```typescript
import { highlightCode } from '@celestial/spectrum';

const result: string = highlightCode(code, { language, theme? });
```

Same as `highlight` but accepts an options object.

### `tokenizeCode`

```typescript
import { tokenizeCode } from '@celestial/spectrum';

const tokens: Token[] | null = tokenizeCode(code, language);
```

Tokenizes code into an array of `Token` objects without applying any theme styling. Returns `null` for unknown languages.

## Tokenizer API

### `tokenizeLine`

```typescript
import { tokenizeLine, initialState } from '@celestial/spectrum';

let state = initialState();
const [tokens, nextState]: [Token[], TokenizerState] = tokenizeLine(line, grammar, state);
```

Tokenizes a single line of source code. Returns a tuple of tokens and the updated state. Feed `nextState` into subsequent calls for multi-line construct continuity (block comments, multi-line strings).

### `tokenize`

```typescript
import { tokenize } from '@celestial/spectrum';

const tokens: Token[] = tokenize(source, grammar);
```

Tokenizes an entire multi-line source string. Newline characters are not included as tokens.

### `initialState`

```typescript
import { initialState } from '@celestial/spectrum';

const state: TokenizerState = initialState();
```

Returns `{ stack: [] }` — the root-level tokenizer state.

### Document Tokenization

```typescript
import {
  findMatchingBracket,
  getFoldingRanges,
  retokenizeDocument,
  tokenizeDocument,
} from '@celestial/spectrum';

const document = tokenizeDocument(source, 'typescript');
const updated = retokenizeDocument(document, {
  startLine: 10,
  endLine: 12,
  newText: 'const answer = 42;\n',
});

const match = findMatchingBracket(updated, { line: 10, column: 13 });
const folds = getFoldingRanges(updated);
```

`tokenizeDocument` returns a `TokenizedDocument` with per-line state checkpoints, cached line hashes, and flattened tokens for the full file. `retokenizeDocument` reuses unchanged lines and only continues retokenizing while downstream tokenizer state changes.

## Theme API

### `getTheme`

```typescript
import { getTheme } from '@celestial/spectrum';

const theme: HighlightTheme = getTheme('monokai');
```

Returns a built-in theme by name. Instances are cached.

### `createTheme`

```typescript
import { createTheme } from '@celestial/spectrum';

const theme = createTheme({
  name: 'my-theme',
  keyword: (t) => `\x1b[35m${t}\x1b[0m`,
  string: (t) => `\x1b[32m${t}\x1b[0m`,
});
```

Creates a custom theme by merging overrides onto the default theme. All unspecified categories fall back to the default styling.

### `applyTheme`

```typescript
import { applyTheme } from '@celestial/spectrum';

const styled: string = applyTheme(theme, 'keyword', 'const');
```

Resolves a token category to the appropriate theme function and renders the text. Extended categories (`meta`, `tag`, `attribute`, `regexp`, `constant`, `namespace`, `parameter`, `property`, `label`, `escape`, `text`) fall back to related base categories if not defined on the theme.

### `resolveTheme`

```typescript
import { resolveTheme } from '@celestial/spectrum';

const theme = resolveTheme('dracula');
const theme2 = resolveTheme(myThemeObject);
const theme3 = resolveTheme();
```

Accepts a theme name string, a `HighlightTheme` object, or `undefined` (returns the default theme).

### Built-in Themes

| Name | Description |
|------|-------------|
| `default` | ANSI 16-color with cyan keywords, green strings, dim gray comments |
| `monokai` | Classic Monokai palette (F92672 pink, E6DB74 yellow, AE81FF purple) |
| `github` | Backward-compatible alias of GitHub Light |
| `github-light` | GitHub light theme (CF222E red, 0A3069 navy, 6E7781 gray) |
| `github-dark` | GitHub dark theme (FF7B72 red, A5D6FF blue, 8B949E gray) |
| `dracula` | Dracula palette (FF79C6 pink, F1FA8C yellow, BD93F9 purple) |
| `nord` | Nord palette (81A1C1 blue, A3BE8C green, B48EAD purple) |
| `solarized` | Solarized palette (859900 green, 2AA198 cyan, D33682 magenta) |

## Grammar API

### `detectLanguage`

```typescript
import { detectLanguage } from '@celestial/spectrum';

const language = detectLanguage('src/index.ts');
const docker = detectLanguage('Dockerfile');
const ignore = detectLanguage('.gitignore');
```

Detects a supported spectrum language from a file path or basename. Returns the canonical language name or `undefined` when no supported match is found.

### `detectLanguageFromShebang`

```typescript
import { detectLanguageFromShebang } from '@celestial/spectrum';

const language = detectLanguageFromShebang('#!/usr/bin/env python3');
```

Detects a supported spectrum language from a shebang line. Supports direct interpreter paths and `env`-style shebangs.

### `getLanguageGrammar`

```typescript
import { getLanguageGrammar } from '@celestial/spectrum';

const grammar: LanguageGrammar | undefined = getLanguageGrammar('typescript');
const byAlias = getLanguageGrammar('py');
```

Case-insensitive lookup by canonical name or alias. Returns `undefined` for unregistered languages.

### `registerLanguage`

```typescript
import { registerLanguage, keywords, lineComment, stringLiteral } from '@celestial/spectrum';

registerLanguage({
  name: 'mylang',
  aliases: ['ml', 'myl'],
  rules: [
    lineComment('//'),
    stringLiteral('"'),
    keywords(['fn', 'let', 'if', 'else', 'return']),
    { pattern: /[a-zA-Z_$][a-zA-Z_$0-9]*/y, token: 'variable' },
  ],
});
```

Registers a custom language grammar at runtime.

### `registerGrammar`

```typescript
import { registerGrammar } from '@celestial/spectrum';

registerGrammar('mylang', {
  aliases: ['ml'],
  rules: [
    { pattern: /\bfn\b/y, token: 'keyword' },
    { pattern: /[a-zA-Z_][a-zA-Z_0-9]*/y, token: 'variable' },
  ],
});
```

Alias-friendly custom grammar registration API. Accepts either `(name, rules)` or a full `LanguageGrammar`.

### `listLanguages`

```typescript
import { listLanguages } from '@celestial/spectrum';

const languages: string[] = listLanguages();
```

Returns sorted array of canonical language names (no aliases).

### TextMate Import

```typescript
import { importTextMateGrammar, parseTextMateGrammar } from '@celestial/spectrum';

const parsed = parseTextMateGrammar(rawTmLanguage);
const grammar = importTextMateGrammar(rawTmLanguage, { name: 'custom-textmate' });
```

Imports `.tmLanguage` JSON or plist/XML into Spectrum grammars. The importer supports top-level patterns, repository includes, nested repository references, `match`, `begin`/`end`, captures, `name`, and `contentName`.

## Supported Languages

| Language | Aliases |
|----------|---------|
| `bash` | `sh`, `shell`, `zsh` |
| `c` | `h` |
| `cpp` | `c++`, `cxx`, `cc`, `hpp` |
| `csharp` | `cs`, `c#` |
| `css` | — |
| `diff` | `patch` |
| `dockerfile` | `docker` |
| `dart` | — |
| `elixir` | `ex`, `exs` |
| `gitignore` | — |
| `go` | `golang` |
| `haskell` | `hs` |
| `html` | `htm`, `xml`, `svg` |
| `java` | — |
| `javascript` | `js`, `jsx`, `mjs`, `cjs` |
| `json` | `jsonc` |
| `kotlin` | `kt`, `kts` |
| `lua` | — |
| `markdown` | `md` |
| `makefile` | `make` |
| `nix` | — |
| `ocaml` | `ml`, `mli` |
| `php` | — |
| `python` | `py` |
| `ruby` | `rb` |
| `rust` | `rs` |
| `scss` | — |
| `sql` | — |
| `svelte` | — |
| `swift` | — |
| `terraform` | `tf`, `hcl` |
| `toml` | — |
| `typescript` | `ts`, `tsx` |
| `vue` | — |
| `wgsl` | — |
| `yaml` | `yml` |
| `zig` | — |

## Grammar Helpers

Utilities for building language grammars with less boilerplate. Each returns a `TokenRule`.

```typescript
import {
  keywords,
  keywordsCI,
  lineComment,
  stringLiteral,
  templateLiteral,
  numberLiteral,
  functionCall,
  identifier,
  operators,
  whitespace,
  punctuation,
} from '@celestial/spectrum';
```

| Helper | Signature | Description |
|--------|-----------|-------------|
| `keywords` | `(words: string[], token?: TokenCategory) => TokenRule` | Word-boundary alternation (case-sensitive) |
| `keywordsCI` | `(words: string[], token?: TokenCategory) => TokenRule` | Word-boundary alternation (case-insensitive) |
| `lineComment` | `(prefix: string) => TokenRule` | Line comment from prefix to end of line |
| `stringLiteral` | `(delim: string) => TokenRule` | Single-line string with backslash escapes |
| `templateLiteral` | `() => TokenRule` | Backtick-delimited string |
| `numberLiteral` | `() => TokenRule` | Integers, floats, hex, octal, binary, scientific notation |
| `functionCall` | `() => TokenRule` | Identifier followed by `(` |
| `identifier` | `(token?: TokenCategory) => TokenRule` | Word-boundary identifier (default: `'variable'`) |
| `operators` | `(chars: string) => TokenRule` | One or more operator characters |
| `whitespace` | `() => TokenRule` | Whitespace as `'text'` tokens |
| `punctuation` | `(chars: string) => TokenRule` | Single punctuation character |

## Types

```typescript
type TokenCategory =
  | 'keyword' | 'string' | 'comment' | 'number' | 'operator'
  | 'type' | 'function' | 'variable' | 'punctuation' | 'builtin'
  | 'meta' | 'tag' | 'attribute' | 'regexp' | 'constant'
  | 'namespace' | 'parameter' | 'property' | 'label' | 'escape'
  | 'text';

interface Token {
  readonly category: TokenCategory;
  readonly text: string;
}

interface TokenRule {
  pattern: RegExp;
  token: TokenCategory;
  push?: string;
  pop?: boolean;
  group?: number;
}

interface StateRule {
  name: string;
  begin: RegExp;
  end: RegExp;
  token: TokenCategory;
  contentToken?: TokenCategory;
  contentRules?: TokenRule[];
}

interface LanguageGrammar {
  name: string;
  aliases?: string[];
  rules: TokenRule[];
  states?: StateRule[];
}

interface HighlightTheme {
  name: string;
  keyword: (text: string) => string;
  string: (text: string) => string;
  comment: (text: string) => string;
  number: (text: string) => string;
  operator: (text: string) => string;
  type: (text: string) => string;
  function: (text: string) => string;
  variable: (text: string) => string;
  punctuation: (text: string) => string;
  builtin: (text: string) => string;
  meta?: (text: string) => string;
  tag?: (text: string) => string;
  attribute?: (text: string) => string;
  regexp?: (text: string) => string;
  constant?: (text: string) => string;
  namespace?: (text: string) => string;
  parameter?: (text: string) => string;
  property?: (text: string) => string;
  label?: (text: string) => string;
  escape?: (text: string) => string;
  text?: (text: string) => string;
}

type HighlightThemeName =
  | 'default'
  | 'monokai'
  | 'github'
  | 'github-light'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'solarized';

interface TokenizerState {
  readonly stack: readonly string[];
}

interface LinePosition {
  readonly line: number;
  readonly column: number;
}

interface TokenizedLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly tokens: readonly Token[];
  readonly stateBefore: TokenizerState;
  readonly stateAfter: TokenizerState;
  readonly hash: string;
}

interface TokenizedDocument {
  readonly language: string;
  readonly lines: readonly TokenizedLine[];
  readonly tokens: readonly Token[];
}

interface LineChange {
  readonly startLine: number;
  readonly endLine: number;
  readonly newText: string;
}

interface BracketMatch {
  readonly open: LinePosition;
  readonly close: LinePosition;
}

interface FoldingRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly kind: 'indent' | 'bracket';
}
```

## Related Packages

- **@celestial/corona** - ANSI styling and color primitives used by themes
- **@celestial/pulsar** - Markdown parser and terminal renderer

## License

MIT
