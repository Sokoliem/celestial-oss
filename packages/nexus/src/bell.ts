/**
 * Terminal bell. Audible by default; `visual: true` is a hint to the
 * emulator for status-line flash but emitter still sends BEL — most
 * terminals own visual-bell rendering as a user setting.
 */

export interface BellOpts {
  readonly visual?: boolean;
}

export function bell(_opts: BellOpts = {}): string {
  return '\x07';
}
