export interface MouseEvent {
  type: 'press' | 'release' | 'move' | 'scroll-up' | 'scroll-down' | 'scroll-left' | 'scroll-right';
  button: 0 | 1 | 2 | 3 | 4 | 'none';
  x: number;
  y: number;
  /** Pixel-level X when SGR-pixel mode (DEC 1016) was enabled. `x` is cell-snapped. */
  readonly pixelX?: number;
  readonly pixelY?: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Wire encoding the parser dispatched to ('sgr' | 'urxvt' | 'x10'). */
  readonly encoding?: 'sgr' | 'urxvt' | 'x10';
}

function decodeButton(rawButton: number, suffix: 'M' | 'm' | null): { type: MouseEvent['type']; button: MouseEvent['button'] } | null {
  const shift = (rawButton & 4) !== 0;
  const alt = (rawButton & 8) !== 0;
  const ctrl = (rawButton & 16) !== 0;
  void shift;
  void alt;
  void ctrl;
  const baseButton = rawButton & ~(4 | 8 | 16);

  // Scroll wheel (vertical + horizontal).
  if (baseButton === 64) return { type: 'scroll-up', button: 'none' };
  if (baseButton === 65) return { type: 'scroll-down', button: 'none' };
  if (baseButton === 66) return { type: 'scroll-left', button: 'none' };
  if (baseButton === 67) return { type: 'scroll-right', button: 'none' };

  // Motion (button held).
  if (baseButton >= 32 && baseButton <= 35) return { type: 'move', button: 'none' };

  // Standard buttons.
  if (baseButton >= 0 && baseButton <= 2) {
    return { type: suffix === 'M' ? 'press' : 'release', button: baseButton as 0 | 1 | 2 };
  }

  // Extended buttons (X1 back / X2 forward).
  // SGR 1006 encodes these at base 128 (button 3) and 129 (button 4).
  if (baseButton === 128) {
    return { type: suffix === 'M' ? 'press' : 'release', button: 3 };
  }
  if (baseButton === 129) {
    return { type: suffix === 'M' ? 'press' : 'release', button: 4 };
  }

  return null;
}

/**
 * Parse an SGR 1006 mouse escape: `\x1b[<button;x;yM` (press) or `\x1b[<b;x;ym` (release).
 *
 * Button encoding (after stripping modifier flags 4/8/16):
 *   0=left, 1=middle, 2=right
 *   32-35=move
 *   64=scroll-up, 65=scroll-down, 66=scroll-left, 67=scroll-right
 *   128=X1 (back), 129=X2 (forward)
 *
 * Coordinates are 1-indexed in the protocol; the parser converts to 0-indexed.
 */
export function parseSgrMouseEvent(data: string): MouseEvent | null {
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
  if (!match) return null;

  const rawButton = parseInt(match[1]!, 10);
  const rawX = parseInt(match[2]!, 10);
  const rawY = parseInt(match[3]!, 10);
  const suffix = match[4]! as 'M' | 'm';
  if (Number.isNaN(rawButton) || Number.isNaN(rawX) || Number.isNaN(rawY)) return null;

  const decoded = decodeButton(rawButton, suffix);
  if (!decoded) return null;

  return {
    ...decoded,
    x: rawX - 1,
    y: rawY - 1,
    ctrl: (rawButton & 16) !== 0,
    alt: (rawButton & 8) !== 0,
    shift: (rawButton & 4) !== 0,
    encoding: 'sgr',
  };
}

/**
 * Parse SGR-pixel 1016 mouse: `\x1b[<button;pixelX;pixelYM/m`.
 * Returns same MouseEvent shape with `pixelX`/`pixelY` populated. `x`/`y`
 * are reported as the same values (callers convert to cells using their
 * own cell metrics).
 */
export function parseSgrPixelMouseEvent(data: string, cellWidth: number, cellHeight: number): MouseEvent | null {
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
  if (!match) return null;
  const rawButton = parseInt(match[1]!, 10);
  const pixelX = parseInt(match[2]!, 10);
  const pixelY = parseInt(match[3]!, 10);
  const suffix = match[4]! as 'M' | 'm';
  if (Number.isNaN(rawButton) || Number.isNaN(pixelX) || Number.isNaN(pixelY)) return null;
  const decoded = decodeButton(rawButton, suffix);
  if (!decoded) return null;
  return {
    ...decoded,
    x: cellWidth > 0 ? Math.floor(pixelX / cellWidth) : pixelX,
    y: cellHeight > 0 ? Math.floor(pixelY / cellHeight) : pixelY,
    pixelX,
    pixelY,
    ctrl: (rawButton & 16) !== 0,
    alt: (rawButton & 8) !== 0,
    shift: (rawButton & 4) !== 0,
    encoding: 'sgr',
  };
}

/**
 * Parse urxvt 1015 encoding: `\x1b[<button;x;yM` (always M). Modifier and
 * button rules match SGR; the encoding differs only in the lack of
 * press-vs-release suffix.
 */
export function parseUrxvt1015MouseEvent(data: string): MouseEvent | null {
  const match = /^\x1b\[(\d+);(\d+);(\d+)M$/.exec(data);
  if (!match) return null;
  const rawButton = parseInt(match[1]!, 10);
  const rawX = parseInt(match[2]!, 10);
  const rawY = parseInt(match[3]!, 10);
  if (Number.isNaN(rawButton) || Number.isNaN(rawX) || Number.isNaN(rawY)) return null;
  const decoded = decodeButton(rawButton, 'M');
  if (!decoded) return null;
  return {
    ...decoded,
    x: rawX - 1,
    y: rawY - 1,
    ctrl: (rawButton & 16) !== 0,
    alt: (rawButton & 8) !== 0,
    shift: (rawButton & 4) !== 0,
    encoding: 'urxvt',
  };
}

/**
 * Parse X10 encoding: `\x1b[M<btn+32><x+32><y+32>` — three bytes after CSI M.
 * Cannot express press-vs-release on most buttons (release is button=3).
 */
export function parseX10MouseEvent(data: string): MouseEvent | null {
  if (!data.startsWith('\x1b[M') || data.length < 6) return null;
  const b = data.charCodeAt(3);
  const x = data.charCodeAt(4);
  const y = data.charCodeAt(5);
  if (b < 32 || x < 32 || y < 32) return null;
  const rawButton = b - 32;
  const baseButton = rawButton & ~(4 | 8 | 16);

  let type: MouseEvent['type'];
  let button: MouseEvent['button'];

  if (baseButton === 3) {
    type = 'release';
    button = 'none';
  } else if (baseButton === 64) {
    type = 'scroll-up';
    button = 'none';
  } else if (baseButton === 65) {
    type = 'scroll-down';
    button = 'none';
  } else if (baseButton >= 0 && baseButton <= 2) {
    type = 'press';
    button = baseButton as 0 | 1 | 2;
  } else {
    return null;
  }

  return {
    type,
    button,
    x: x - 33,
    y: y - 33,
    ctrl: (rawButton & 16) !== 0,
    alt: (rawButton & 8) !== 0,
    shift: (rawButton & 4) !== 0,
    encoding: 'x10',
  };
}

/**
 * Parse a mouse escape sequence using a fallback chain — SGR 1006 first,
 * then urxvt 1015, then X10. Returns null if no encoder matches.
 */
export function parseMouseEvent(data: string): MouseEvent | null {
  return parseSgrMouseEvent(data) ?? parseUrxvt1015MouseEvent(data) ?? parseX10MouseEvent(data);
}

export interface MouseTrackingOpts {
  /**
   * 'none'   — no motion (DEC 1000 button-only).
   * 'button' — motion while button pressed (DEC 1002). DEFAULT.
   * 'any'    — motion at all times (DEC 1003). Higher CPU cost.
   */
  readonly motion?: 'none' | 'button' | 'any';
  /** Enable SGR-pixel reporting (DEC 1016) for sub-cell precision. */
  readonly pixelPrecision?: boolean;
  /** Bundle focus events (DEC 1004) with mouse enable. */
  readonly focusEvents?: boolean;
  /** Always emits DEC 1006 (SGR encoding). False only for legacy tests. */
  readonly sgrEncoding?: boolean;
}

const DEFAULTS: Required<MouseTrackingOpts> = {
  motion: 'button',
  pixelPrecision: false,
  focusEvents: false,
  sgrEncoding: true,
};

function resolveOpts(opts?: MouseTrackingOpts): Required<MouseTrackingOpts> {
  return {
    motion: opts?.motion ?? DEFAULTS.motion,
    pixelPrecision: opts?.pixelPrecision ?? DEFAULTS.pixelPrecision,
    focusEvents: opts?.focusEvents ?? DEFAULTS.focusEvents,
    sgrEncoding: opts?.sgrEncoding ?? DEFAULTS.sgrEncoding,
  };
}

/** Compose mouse-enable sequence per opts. */
export function enableMouseTracking(opts?: MouseTrackingOpts): string {
  const r = resolveOpts(opts);
  let out = '\x1b[?1000h';
  if (r.motion === 'button') out += '\x1b[?1002h';
  else if (r.motion === 'any') out += '\x1b[?1003h';
  if (r.sgrEncoding) out += '\x1b[?1006h';
  if (r.pixelPrecision) out += '\x1b[?1016h';
  if (r.focusEvents) out += '\x1b[?1004h';
  return out;
}

/** Matching disable sequence. Must be passed the SAME opts used to enable. */
export function disableMouseTracking(opts?: MouseTrackingOpts): string {
  const r = resolveOpts(opts);
  let out = '\x1b[?1000l';
  if (r.motion === 'button') out += '\x1b[?1002l';
  else if (r.motion === 'any') out += '\x1b[?1003l';
  if (r.sgrEncoding) out += '\x1b[?1006l';
  if (r.pixelPrecision) out += '\x1b[?1016l';
  if (r.focusEvents) out += '\x1b[?1004l';
  return out;
}

/**
 * Legacy escape strings — byte-identical to enableMouseTracking({ motion: 'button' })
 * / disableMouseTracking({ motion: 'button' }). Kept as named exports for
 * v0.0.1 backward compatibility (PRD R-1 / AC-9.2 locked snapshot).
 */
export const mouseEnable = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
export const mouseDisable = '\x1b[?1000l\x1b[?1002l\x1b[?1006l';
