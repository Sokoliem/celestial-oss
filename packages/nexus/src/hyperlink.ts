import { supportsHyperlinks } from './detection.js';

export interface HyperlinkOpts {
  id?: string;
  fallback?: boolean;
}

// OSC sequences are terminated by BEL (\x07) or ST (\x1b\\). Either character
// inside the URL or id silently truncates the sequence and corrupts the
// surrounding output. Reject these (and other C0 controls) up front so a bad
// input is a loud error instead of garbage on the terminal.
const SEQUENCE_BREAKING = /[\x00-\x1f\x7f]/;

/**
 * Generate an OSC 8 hyperlink escape sequence.
 *
 * Format: \x1b]8;params;uri\x07text\x1b]8;;\x07
 *
 * If `fallback: true` and the terminal does not support hyperlinks,
 * returns `text (url)` instead.
 *
 * Throws if `url` or `opts.id` contain characters that would corrupt the OSC
 * sequence (C0 controls or DEL). The id additionally cannot contain `;` or
 * `:` because those delimit OSC parameters.
 */
export function hyperlink(text: string, url: string, opts?: HyperlinkOpts): string {
  if (SEQUENCE_BREAKING.test(url)) {
    throw new Error('hyperlink: url cannot contain control characters (C0 or DEL)');
  }
  if (opts?.id !== undefined) {
    if (SEQUENCE_BREAKING.test(opts.id)) {
      throw new Error('hyperlink: id cannot contain control characters (C0 or DEL)');
    }
    if (opts.id.includes(';') || opts.id.includes(':')) {
      throw new Error('hyperlink: id cannot contain `;` or `:` (reserved as OSC delimiters)');
    }
  }

  if (opts?.fallback && !supportsHyperlinks()) {
    return `${text} (${url})`;
  }

  const params = opts?.id ? `id=${opts.id}` : '';
  return `\x1b]8;${params};${url}\x07${text}\x1b]8;;\x07`;
}
