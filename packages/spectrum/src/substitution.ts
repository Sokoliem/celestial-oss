import { color, style } from '@celestial/corona';
import { row, text, type VNode } from '@celestial/nebula';
import { registerLanguage } from './grammars.js';
import { substitutionGrammar } from './substitution-grammar.js';
import type { LanguageGrammar } from './types.js';

export interface Range {
  readonly start: number;
  readonly end: number;
}

export interface SubstitutionModeConfig {
  readonly opener?: string;
  readonly closer?: string;
  readonly known?: ReadonlySet<string>;
  readonly fills?: ReadonlyMap<string, string>;
}

export type SubstitutionTokenKind =
  | 'literal'
  | 'substitution-open'
  | 'substitution-name'
  | 'substitution-close'
  | 'substitution-filled'
  | 'substitution-unfilled'
  | 'substitution-unknown';

export interface SubstitutionToken {
  readonly kind: SubstitutionTokenKind;
  readonly text: string;
  readonly range: Range;
  readonly substitutionName?: string;
}

type SubstitutionStatusKind = 'substitution-filled' | 'substitution-unfilled' | 'substitution-unknown';

export interface SubstitutionRenderTheme {
  readonly literal?: (text: string) => string;
  readonly syntax?: (text: string, status: SubstitutionStatusKind) => string;
  readonly name?: (text: string, status: SubstitutionStatusKind) => string;
  readonly replacement?: (text: string, status: SubstitutionStatusKind) => string;
  readonly diffArrow?: (text: string) => string;
}

export interface SubstitutionModeRegistry {
  registerLanguage(grammar: LanguageGrammar): void;
}

export interface Disposable {
  dispose(): void;
}

const DEFAULT_OPENER = '${';
const DEFAULT_CLOSER = '}';

function isEscaped(input: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && input[cursor] === '\\'; cursor--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

function findSubstitutionClose(input: string, start: number, opener: string, closer: string): number {
  let cursor = start;
  while (cursor < input.length) {
    if (input.startsWith(opener, cursor) && !isEscaped(input, cursor)) {
      return -1;
    }
    if (input.startsWith(closer, cursor) && !isEscaped(input, cursor)) {
      return cursor;
    }
    cursor++;
  }
  return -1;
}

function pushLiteral(tokens: SubstitutionToken[], input: string, start: number, end: number): void {
  if (start >= end) return;
  const text = input.slice(start, end);
  const previous = tokens[tokens.length - 1];
  if (previous?.kind === 'literal' && previous.range.end === start) {
    tokens[tokens.length - 1] = {
      kind: 'literal',
      text: previous.text + text,
      range: { start: previous.range.start, end },
    };
    return;
  }
  tokens.push({
    kind: 'literal',
    text,
    range: { start, end },
  });
}

function getStatusToken(name: string, placeholder: string, range: Range, config: SubstitutionModeConfig): SubstitutionToken {
  const filled = config.fills?.get(name);
  if (filled !== undefined) {
    return {
      kind: 'substitution-filled',
      text: filled,
      range,
      substitutionName: name,
    };
  }
  if (config.known && !config.known.has(name)) {
    return {
      kind: 'substitution-unknown',
      text: placeholder,
      range,
      substitutionName: name,
    };
  }
  return {
    kind: 'substitution-unfilled',
    text: placeholder,
    range,
    substitutionName: name,
  };
}

export function tokenizeSubstitutions(input: string, config: SubstitutionModeConfig = {}): readonly SubstitutionToken[] {
  const opener = config.opener ?? DEFAULT_OPENER;
  const closer = config.closer ?? DEFAULT_CLOSER;
  if (!input) return [];
  if (!opener || !closer) {
    return [{ kind: 'literal', text: input, range: { start: 0, end: input.length } }];
  }

  const tokens: SubstitutionToken[] = [];
  let index = 0;
  let literalStart = 0;

  while (index < input.length) {
    const openIndex = input.indexOf(opener, index);
    if (openIndex === -1) break;
    if (isEscaped(input, openIndex)) {
      index = openIndex + opener.length;
      continue;
    }

    const closeIndex = findSubstitutionClose(input, openIndex + opener.length, opener, closer);
    if (closeIndex === -1) {
      break;
    }

    const nameStart = openIndex + opener.length;
    const rawName = input.slice(nameStart, closeIndex);
    const name = rawName.trim();
    if (!name) {
      index = openIndex + opener.length;
      continue;
    }

    pushLiteral(tokens, input, literalStart, openIndex);

    const placeholderRange = { start: openIndex, end: closeIndex + closer.length };
    const placeholder = input.slice(placeholderRange.start, placeholderRange.end);

    tokens.push({
      kind: 'substitution-open',
      text: opener,
      range: { start: openIndex, end: nameStart },
      substitutionName: name,
    });
    tokens.push({
      kind: 'substitution-name',
      text: rawName,
      range: { start: nameStart, end: closeIndex },
      substitutionName: name,
    });
    tokens.push({
      kind: 'substitution-close',
      text: closer,
      range: { start: closeIndex, end: closeIndex + closer.length },
      substitutionName: name,
    });
    tokens.push(getStatusToken(name, placeholder, placeholderRange, config));

    index = closeIndex + closer.length;
    literalStart = index;
  }

  pushLiteral(tokens, input, literalStart, input.length);
  return tokens;
}

function defaultTheme(): Required<SubstitutionRenderTheme> {
  return {
    literal: (value) => value,
    syntax: (value, status) => {
      switch (status) {
        case 'substitution-filled':
          return style({ color: color.green, dim: true }).render(value);
        case 'substitution-unknown':
          return style({ color: color.red, dim: true }).render(value);
        case 'substitution-unfilled':
        default:
          return style({ color: color.yellow, dim: true }).render(value);
      }
    },
    name: (value, status) => {
      switch (status) {
        case 'substitution-filled':
          return style({ color: color.green, bold: true }).render(value);
        case 'substitution-unknown':
          return style({ color: color.red, bold: true, underline: true }).render(value);
        case 'substitution-unfilled':
        default:
          return style({ color: color.yellow, bold: true }).render(value);
      }
    },
    replacement: (value, status) => {
      switch (status) {
        case 'substitution-filled':
          return style({ color: color.green, bold: true }).render(value);
        case 'substitution-unknown':
          return style({ color: color.red, bold: true }).render(value);
        case 'substitution-unfilled':
        default:
          return style({ color: color.yellow, italic: true }).render(value);
      }
    },
    diffArrow: (value) => style({ color: color.gray, dim: true }).render(value),
  };
}

function mergeTheme(theme?: SubstitutionRenderTheme): Required<SubstitutionRenderTheme> {
  return { ...defaultTheme(), ...theme };
}

function findStatusToken(tokens: readonly SubstitutionToken[], index: number): SubstitutionToken | null {
  const candidate = tokens[index + 3];
  if (candidate?.kind === 'substitution-filled' || candidate?.kind === 'substitution-unfilled' || candidate?.kind === 'substitution-unknown') {
    return candidate;
  }
  return null;
}

function statusKindOf(token: SubstitutionToken | null): SubstitutionStatusKind {
  if (!token || token.kind === 'substitution-unfilled') return 'substitution-unfilled';
  if (token.kind === 'substitution-filled') return 'substitution-filled';
  return 'substitution-unknown';
}

function placeholderText(openToken: SubstitutionToken, nameToken: SubstitutionToken, closeToken: SubstitutionToken): string {
  return `${openToken.text}${nameToken.text}${closeToken.text}`;
}

function strike(textValue: string): string {
  return style({ strikethrough: true, dim: true }).render(textValue);
}

export function renderSubstitutions(tokens: readonly SubstitutionToken[], opts: { diffStyle?: boolean; theme?: SubstitutionRenderTheme } = {}): VNode {
  const theme = mergeTheme(opts.theme);
  const nodes: VNode[] = [];

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.kind === 'literal') {
      nodes.push(text(theme.literal(token.text)));
      continue;
    }

    if (token.kind === 'substitution-open' && tokens[index + 1]?.kind === 'substitution-name' && tokens[index + 2]?.kind === 'substitution-close') {
      const openToken = token;
      const nameToken = tokens[index + 1]!;
      const closeToken = tokens[index + 2]!;
      const statusToken = findStatusToken(tokens, index);
      const status = statusKindOf(statusToken);
      const original = placeholderText(openToken, nameToken, closeToken);

      if (opts.diffStyle && statusToken?.kind === 'substitution-filled') {
        nodes.push(text(strike(original)));
        nodes.push(text(theme.diffArrow(' -> ')));
        nodes.push(text(theme.replacement(statusToken.text, status)));
      } else {
        nodes.push(text(theme.syntax(openToken.text, status)));
        nodes.push(text(theme.name(nameToken.text, status)));
        nodes.push(text(theme.syntax(closeToken.text, status)));
      }

      index += statusToken ? 3 : 2;
      continue;
    }

    const fallbackStatus = token.kind === 'substitution-filled' || token.kind === 'substitution-unknown' ? token.kind : 'substitution-unfilled';
    nodes.push(text(theme.replacement(token.text, fallbackStatus)));
  }

  return row(...nodes);
}

export function registerSubstitutionMode(
  registry: SubstitutionModeRegistry = {
    registerLanguage,
  },
): Disposable {
  registry.registerLanguage(substitutionGrammar);
  return {
    dispose() {
      // The core grammar registry is additive-only today, so disposal is a no-op.
    },
  };
}
