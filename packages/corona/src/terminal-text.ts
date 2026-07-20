import { charWidth } from './unicode-width.js';

const ESC = '\x1b';
const BEL = '\x07';
const ST = `${ESC}\\`;
const DEFAULT_CACHE_LIMIT = 4096;
const DEFAULT_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
const widthCache = new Map<string, number>();

export type TerminalTextToken =
  | { kind: 'text'; value: string }
  | { kind: 'sgr'; value: string; parameters: string }
  | { kind: 'hyperlink-open'; value: string; parameters: string; href: string }
  | { kind: 'hyperlink-close'; value: string }
  | { kind: 'control'; value: string; family: 'c0' | 'c1' | 'csi' | 'osc' | 'dcs' | 'apc' | 'pm' | 'sos' | 'esc' };

declare const trustedTerminalTextBrand: unique symbol;
export type TrustedTerminalText = string & { readonly [trustedTerminalTextBrand]: true };

export interface SanitizeTerminalTextOptions {
  allowSgr?: boolean;
  allowHyperlinks?: boolean;
  allowedLinkSchemes?: readonly string[];
  controlPolicy?: 'escape' | 'strip';
}

export interface CellSliceOptions extends SanitizeTerminalTextOptions {
  trusted?: boolean;
}

export interface WrapCellsOptions extends CellSliceOptions {
  preserveWords?: boolean;
  /** Omit whitespace consumed at a line break. Defaults to false for lossless wrapping. */
  trimBreakWhitespace?: boolean;
  /** Drop only a whitespace token that would itself overflow a full line. */
  dropOverflowWhitespace?: boolean;
}

interface Atom {
  readonly raw: string;
  readonly width: number;
  readonly whitespace: boolean;
  readonly token?: TerminalTextToken;
  readonly newline?: boolean;
}

function segmentGraphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (entry) => entry.segment) : Array.from(text);
}

function isEmojiCapable(codePoint: number): boolean {
  return (
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2b00 && codePoint <= 0x2bff) ||
    codePoint === 0x23 ||
    codePoint === 0x2a ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0x00a9 ||
    codePoint === 0x00ae ||
    codePoint === 0x203c ||
    codePoint === 0x2049 ||
    (codePoint >= 0x2190 && codePoint <= 0x21ff)
  );
}

export function graphemeCellWidth(grapheme: string): number {
  let width = 0;
  let previousCodePoint = 0;
  let previousWidth = 0;
  let hasVariationSelector16 = false;

  for (const character of grapheme) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0xfe0f) {
      hasVariationSelector16 = true;
      if (previousWidth === 1 && isEmojiCapable(previousCodePoint)) width = Math.max(width, 2);
      continue;
    }
    const measured = charWidth(codePoint);
    width = Math.max(width, measured);
    previousCodePoint = codePoint;
    previousWidth = measured;
  }

  if (hasVariationSelector16 && segmentGraphemes(grapheme).length === 1) {
    const base = Array.from(grapheme, (character) => character.codePointAt(0)!).find((codePoint) => codePoint !== 0xfe0f);
    if (base !== undefined && isEmojiCapable(base)) width = Math.max(width, 2);
  }
  return width;
}

function csiEnd(text: string, start: number): number {
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index + 1;
    index++;
  }
  return text.length;
}

function stringControlEnd(text: string, start: number, allowBel: boolean): number {
  let index = start;
  while (index < text.length) {
    if (allowBel && text[index] === BEL) return index + 1;
    if (text[index] === ESC && text[index + 1] === '\\') return index + 2;
    if (text.charCodeAt(index) === 0x9c) return index + 1;
    index++;
  }
  return text.length;
}

function parseOsc(value: string): TerminalTextToken {
  const payloadStart = value[0] === ESC ? 2 : 1;
  let payloadEnd = value.length;
  if (value.endsWith(ST)) payloadEnd -= 2;
  else if (value.endsWith(BEL) || value.charCodeAt(value.length - 1) === 0x9c) payloadEnd -= 1;
  const payload = value.slice(payloadStart, payloadEnd);
  if (!payload.startsWith('8;')) return { kind: 'control', value, family: 'osc' };
  const separator = payload.indexOf(';', 2);
  if (separator === -1) return { kind: 'control', value, family: 'osc' };
  const parameters = payload.slice(2, separator);
  const href = payload.slice(separator + 1);
  return href.length === 0 ? { kind: 'hyperlink-close', value } : { kind: 'hyperlink-open', value, parameters, href };
}

export function tokenizeTerminalText(text: string): TerminalTextToken[] {
  const tokens: TerminalTextToken[] = [];
  let plainStart = 0;
  let index = 0;

  const pushPlain = (end: number) => {
    if (end > plainStart) tokens.push({ kind: 'text', value: text.slice(plainStart, end) });
  };

  while (index < text.length) {
    const code = text.charCodeAt(index);
    const isC0 = code < 0x20 && code !== 0x09 && code !== 0x0a;
    const isC1 = code >= 0x80 && code <= 0x9f;
    if (text[index] !== ESC && !isC0 && !isC1 && code !== 0x7f) {
      index++;
      continue;
    }

    pushPlain(index);
    const start = index;
    let token: TerminalTextToken;

    if (text[index] === ESC) {
      const introducer = text[index + 1];
      if (introducer === '[') {
        index = csiEnd(text, index + 2);
        const value = text.slice(start, index);
        token = value.endsWith('m') ? { kind: 'sgr', value, parameters: value.slice(2, -1) } : { kind: 'control', value, family: 'csi' };
      } else if (introducer === ']') {
        index = stringControlEnd(text, index + 2, true);
        token = parseOsc(text.slice(start, index));
      } else if (introducer === 'P' || introducer === '_' || introducer === '^' || introducer === 'X') {
        index = stringControlEnd(text, index + 2, false);
        const family = introducer === 'P' ? 'dcs' : introducer === '_' ? 'apc' : introducer === '^' ? 'pm' : 'sos';
        token = { kind: 'control', value: text.slice(start, index), family };
      } else {
        index = Math.min(text.length, index + (introducer === undefined ? 1 : 2));
        token = { kind: 'control', value: text.slice(start, index), family: 'esc' };
      }
    } else if (code === 0x9b) {
      index = csiEnd(text, index + 1);
      const value = text.slice(start, index);
      token = value.endsWith('m') ? { kind: 'sgr', value, parameters: value.slice(1, -1) } : { kind: 'control', value, family: 'csi' };
    } else if (code === 0x9d) {
      index = stringControlEnd(text, index + 1, true);
      token = parseOsc(text.slice(start, index));
    } else if (code === 0x90 || code === 0x9f || code === 0x9e || code === 0x98) {
      index = stringControlEnd(text, index + 1, false);
      const family = code === 0x90 ? 'dcs' : code === 0x9f ? 'apc' : code === 0x9e ? 'pm' : 'sos';
      token = { kind: 'control', value: text.slice(start, index), family };
    } else {
      index++;
      token = { kind: 'control', value: text.slice(start, index), family: isC1 ? 'c1' : 'c0' };
    }

    tokens.push(token);
    plainStart = index;
  }

  pushPlain(text.length);
  return tokens;
}

function escapeControls(value: string): string {
  let output = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint === 0x1b) output += '␛';
    else if (codePoint >= 0 && codePoint <= 0x1f) output += String.fromCodePoint(0x2400 + codePoint);
    else if (codePoint === 0x7f) output += '␡';
    else if (codePoint >= 0x80 && codePoint <= 0x9f) output += `\\u{${codePoint.toString(16).padStart(2, '0')}}`;
    else output += character;
  }
  return output;
}

function normalizeSchemes(schemes: readonly string[] | undefined): Set<string> {
  return schemes ? new Set(schemes.map((scheme) => `${scheme.replace(/:$/, '').toLowerCase()}:`)) : DEFAULT_LINK_SCHEMES;
}

export function sanitizeHyperlink(href: string, allowedSchemes?: readonly string[]): string | undefined {
  if (href.length === 0 || href.length > 2048 || /[\u0000-\u001f\u007f-\u009f]/u.test(href)) return undefined;
  try {
    const parsed = new URL(href);
    return normalizeSchemes(allowedSchemes).has(parsed.protocol.toLowerCase()) ? href : undefined;
  } catch {
    return undefined;
  }
}

function safeSgrToken(token: Extract<TerminalTextToken, { kind: 'sgr' }>): string | undefined {
  return token.value.length <= 256 && /^[0-9:;]*$/u.test(token.parameters) ? token.value : undefined;
}

export function sanitizeSgr(value: string): string {
  const tokens = tokenizeTerminalText(value);
  if (tokens.some((token) => token.kind !== 'sgr')) return '';
  return tokens.map((token) => (token.kind === 'sgr' ? (safeSgrToken(token) ?? '') : '')).join('');
}

export function sanitizeTerminalText(text: string, options: SanitizeTerminalTextOptions = {}): string {
  const allowSgr = options.allowSgr ?? true;
  const allowHyperlinks = options.allowHyperlinks ?? true;
  const controlPolicy = options.controlPolicy ?? 'escape';
  const output: string[] = [];

  for (const token of tokenizeTerminalText(text)) {
    switch (token.kind) {
      case 'text':
        output.push(token.value);
        break;
      case 'sgr': {
        const safe = allowSgr ? safeSgrToken(token) : undefined;
        if (safe) output.push(safe);
        else if (controlPolicy === 'escape') output.push(escapeControls(token.value));
        break;
      }
      case 'hyperlink-open': {
        const href = allowHyperlinks ? sanitizeHyperlink(token.href, options.allowedLinkSchemes) : undefined;
        if (href && /^[\x20-\x7e]*$/u.test(token.parameters)) output.push(`${ESC}]8;${token.parameters};${href}${ST}`);
        break;
      }
      case 'hyperlink-close':
        if (allowHyperlinks) output.push(`${ESC}]8;;${ST}`);
        break;
      case 'control':
        if (controlPolicy === 'escape') output.push(escapeControls(token.value));
        break;
    }
  }

  return output.join('');
}

export function trustedTerminalText(text: string): TrustedTerminalText {
  return text as TrustedTerminalText;
}

export function stripAnsi(text: string): string {
  return tokenizeTerminalText(text)
    .filter((token): token is Extract<TerminalTextToken, { kind: 'text' }> => token.kind === 'text')
    .map((token) => token.value)
    .join('');
}

function rememberWidth(text: string, width: number): void {
  if (widthCache.has(text)) widthCache.delete(text);
  widthCache.set(text, width);
  if (widthCache.size > DEFAULT_CACHE_LIMIT) {
    const oldest = widthCache.keys().next().value;
    if (oldest !== undefined) widthCache.delete(oldest);
  }
}

export function cellWidth(text: string): number {
  const cached = widthCache.get(text);
  if (cached !== undefined) {
    widthCache.delete(text);
    widthCache.set(text, cached);
    return cached;
  }
  const width = tokenizeTerminalText(text).reduce(
    (total, token) => (token.kind === 'text' ? total + segmentGraphemes(token.value).reduce((sum, grapheme) => sum + graphemeCellWidth(grapheme), 0) : total),
    0,
  );
  rememberWidth(text, width);
  return width;
}

function normalizeWidth(width: number, name: string): number {
  if (!Number.isFinite(width)) throw new TypeError(`${name} must be a finite number`);
  if (width < 0) throw new RangeError(`${name} must be >= 0`);
  return Math.floor(width);
}

export function sliceCells(text: string, maxWidth: number, options: CellSliceOptions = {}): [fit: string, rest: string] {
  const widthLimit = normalizeWidth(maxWidth, 'maxWidth');
  if (widthLimit === 0 || text.length === 0) return ['', text];
  const safeText = options.trusted ? text : sanitizeTerminalText(text, { controlPolicy: 'strip', ...options });
  const tokens = tokenizeTerminalText(safeText);
  const fit: string[] = [];
  const pending: string[] = [];
  let width = 0;

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex]!;
    if (token.kind !== 'text') {
      pending.push(token.value);
      continue;
    }
    const graphemes = segmentGraphemes(token.value);
    for (let graphemeIndex = 0; graphemeIndex < graphemes.length; graphemeIndex++) {
      const grapheme = graphemes[graphemeIndex]!;
      const graphemeWidth = graphemeCellWidth(grapheme);
      if (width + graphemeWidth > widthLimit) {
        const tail = `${pending.join('')}${graphemes.slice(graphemeIndex).join('')}${tokens
          .slice(tokenIndex + 1)
          .map((entry) => entry.value)
          .join('')}`;
        return [fit.join(''), tail];
      }
      if (pending.length > 0) {
        fit.push(...pending);
        pending.length = 0;
      }
      fit.push(grapheme);
      width += graphemeWidth;
    }
  }

  fit.push(...pending);
  return [fit.join(''), ''];
}

export function truncateCells(text: string, maxWidth: number, ellipsis = '…', options: CellSliceOptions = {}): string {
  const widthLimit = normalizeWidth(maxWidth, 'maxWidth');
  if (widthLimit === 0) return '';
  const safeText = options.trusted ? text : sanitizeTerminalText(text, { controlPolicy: 'strip', ...options });
  if (cellWidth(safeText) <= widthLimit) return safeText;
  const safeEllipsis = sanitizeTerminalText(ellipsis, { ...options, allowHyperlinks: false });
  const ellipsisWidth = cellWidth(safeEllipsis);
  if (ellipsisWidth >= widthLimit) return sliceCells(safeEllipsis, widthLimit, { ...options, trusted: true })[0];
  return `${sliceCells(safeText, widthLimit - ellipsisWidth, { ...options, trusted: true })[0]}${safeEllipsis}`;
}

function toAtoms(text: string): Atom[] {
  const atoms: Atom[] = [];
  for (const token of tokenizeTerminalText(text)) {
    if (token.kind !== 'text') {
      atoms.push({ raw: token.value, width: 0, whitespace: false, token });
      continue;
    }
    for (const grapheme of segmentGraphemes(token.value)) {
      if (grapheme === '\n') atoms.push({ raw: grapheme, width: 0, whitespace: false, newline: true });
      else atoms.push({ raw: grapheme, width: graphemeCellWidth(grapheme), whitespace: /^\s+$/u.test(grapheme) });
    }
  }
  return atoms;
}

function splitAtoms(atoms: Atom[], widthLimit: number, preserveWords: boolean, trimBreakWhitespace: boolean, dropOverflowWhitespace: boolean): Atom[][] {
  const lines: Atom[][] = [];
  let current: Atom[] = [];
  let currentWidth = 0;

  const flush = () => {
    lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const atom of atoms) {
    if (atom.newline) {
      flush();
      continue;
    }
    if (atom.width === 0 || currentWidth + atom.width <= widthLimit) {
      current.push(atom);
      currentWidth += atom.width;
      continue;
    }

    if (preserveWords) {
      if ((trimBreakWhitespace || dropOverflowWhitespace) && atom.whitespace) {
        if (trimBreakWhitespace) while (current.at(-1)?.whitespace) current.pop();
        flush();
        continue;
      }

      let breakIndex = -1;
      for (let index = current.length - 1; index >= 0; index--) {
        if (current[index]!.whitespace) {
          breakIndex = index;
          break;
        }
      }
      if (breakIndex >= 0) {
        const carry = current.splice(breakIndex + 1);
        if (trimBreakWhitespace) {
          while (current.at(-1)?.whitespace) current.pop();
        }
        flush();
        current = carry;
        currentWidth = carry.reduce((sum, entry) => sum + entry.width, 0);
      } else if (current.length > 0) {
        flush();
      }
    } else if (current.length > 0) {
      flush();
    }

    current.push(atom);
    currentWidth += atom.width;
  }
  if (current.length > 0 || lines.length === 0) lines.push(current);
  return lines;
}

export function wrapCells(text: string, maxWidth: number, options: WrapCellsOptions = {}): string[] {
  const widthLimit = normalizeWidth(maxWidth, 'maxWidth');
  if (widthLimit === 0) return [];
  const safeText = options.trusted ? text : sanitizeTerminalText(text, { controlPolicy: 'strip', ...options });
  const lines = splitAtoms(
    toAtoms(safeText),
    widthLimit,
    options.preserveWords ?? true,
    options.trimBreakWhitespace ?? false,
    options.dropOverflowWhitespace ?? false,
  );
  const activeSgr: string[] = [];
  let activeHyperlink: string | undefined;

  return lines.map((atoms) => {
    let output = `${activeHyperlink ?? ''}${activeSgr.join('')}`;
    for (const atom of atoms) {
      output += atom.raw;
      const token = atom.token;
      if (token?.kind === 'sgr') {
        const parameters = token.parameters === '' ? ['0'] : token.parameters.split(';');
        if (parameters.some((parameter) => parameter.split(':')[0] === '0')) activeSgr.length = 0;
        if (!parameters.every((parameter) => parameter.split(':')[0] === '0')) activeSgr.push(token.value);
      } else if (token?.kind === 'hyperlink-open') activeHyperlink = token.value;
      else if (token?.kind === 'hyperlink-close') activeHyperlink = undefined;
    }
    if (activeHyperlink) output += `${ESC}]8;;${ST}`;
    if (activeSgr.length > 0) output += `${ESC}[0m`;
    return output;
  });
}
