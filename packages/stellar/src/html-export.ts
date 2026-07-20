/** Minimal ANSI-to-HTML adapter used by Stellar's static export pipeline. */

export interface CssStyle {
  color?: string;
  backgroundColor?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  opacity?: string;
}

export interface StyledSegment {
  text: string;
  style: CssStyle;
}

const ANSI_COLORS = [
  '#1e1e1e',
  '#cc0000',
  '#00cc00',
  '#cccc00',
  '#0000cc',
  '#cc00cc',
  '#00cccc',
  '#cccccc',
  '#666666',
  '#ff0000',
  '#00ff00',
  '#ffff00',
  '#0000ff',
  '#ff00ff',
  '#00ffff',
  '#ffffff',
] as const;

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function ansi256ToHex(index: number): string {
  if (index < 0 || index > 255) return '#000000';
  if (index < 16) return ANSI_COLORS[index] ?? '#000000';
  if (index < 232) {
    const value = index - 16;
    const channel = (part: number): string => (part === 0 ? 0 : 55 + part * 40).toString(16).padStart(2, '0');
    return `#${channel(Math.floor(value / 36))}${channel(Math.floor(value / 6) % 6)}${channel(value % 6)}`;
  }
  const gray = (8 + (index - 232) * 10).toString(16).padStart(2, '0');
  return `#${gray}${gray}${gray}`;
}

function rgbHex(red: number, green: number, blue: number): string {
  const channel = (value: number): string => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function applySgr(current: CssStyle, rawParams: string): CssStyle {
  const style = { ...current };
  const params = rawParams === '' ? [0] : rawParams.split(';').map((value) => Number(value));

  for (let index = 0; index < params.length; index += 1) {
    const code = params[index] ?? 0;
    if (code === 0) {
      for (const key of Object.keys(style) as Array<keyof CssStyle>) delete style[key];
    } else if (code === 1) style.fontWeight = 'bold';
    else if (code === 2) style.opacity = '0.6';
    else if (code === 3) style.fontStyle = 'italic';
    else if (code === 4) style.textDecoration = 'underline';
    else if (code === 9) style.textDecoration = 'line-through';
    else if (code === 22) {
      delete style.fontWeight;
      delete style.opacity;
    } else if (code === 23) delete style.fontStyle;
    else if (code === 24 || code === 29) delete style.textDecoration;
    else if (code >= 30 && code <= 37) style.color = ANSI_COLORS[code - 30];
    else if (code === 39) delete style.color;
    else if (code >= 40 && code <= 47) style.backgroundColor = ANSI_COLORS[code - 40];
    else if (code === 49) delete style.backgroundColor;
    else if (code >= 90 && code <= 97) style.color = ANSI_COLORS[code - 90 + 8];
    else if (code >= 100 && code <= 107) style.backgroundColor = ANSI_COLORS[code - 100 + 8];
    else if ((code === 38 || code === 48) && params[index + 1] === 5 && params[index + 2] !== undefined) {
      const value = ansi256ToHex(params[index + 2]!);
      if (code === 38) style.color = value;
      else style.backgroundColor = value;
      index += 2;
    } else if (
      (code === 38 || code === 48) &&
      params[index + 1] === 2 &&
      params[index + 2] !== undefined &&
      params[index + 3] !== undefined &&
      params[index + 4] !== undefined
    ) {
      const value = rgbHex(params[index + 2]!, params[index + 3]!, params[index + 4]!);
      if (code === 38) style.color = value;
      else style.backgroundColor = value;
      index += 4;
    }
  }

  return style;
}

export function parseAnsiString(input: string): StyledSegment[] {
  const segments: StyledSegment[] = [];
  let style: CssStyle = {};
  let pending = '';
  let index = 0;

  const flush = (): void => {
    if (pending === '') return;
    segments.push({ text: pending, style: { ...style } });
    pending = '';
  };

  while (index < input.length) {
    const sgr = input.slice(index).match(/^\x1b\[([\d;]*)m/);
    if (sgr) {
      flush();
      style = applySgr(style, sgr[1] ?? '');
      index += sgr[0].length;
      continue;
    }

    // OSC controls (including hyperlinks) are metadata, not visible chart text.
    if (input.startsWith('\x1b]', index)) {
      flush();
      const bell = input.indexOf('\x07', index + 2);
      const stringTerminator = input.indexOf('\x1b\\', index + 2);
      const candidates = [bell, stringTerminator].filter((value) => value >= 0);
      if (candidates.length > 0) {
        const end = Math.min(...candidates);
        index = end + (input[end] === '\x07' ? 1 : 2);
        continue;
      }
    }

    pending += input[index];
    index += 1;
  }

  flush();
  return segments;
}

export function cssStyleToString(style: CssStyle): string {
  const parts: string[] = [];
  if (style.color) parts.push(`color:${style.color}`);
  if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style:${style.fontStyle}`);
  if (style.textDecoration) parts.push(`text-decoration:${style.textDecoration}`);
  if (style.opacity) parts.push(`opacity:${style.opacity}`);
  return parts.join(';');
}
