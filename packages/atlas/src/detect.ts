import { applyMultiplexerDowngrades, detectMultiplexer } from './multiplexer.js';
import { getPreferredImageProtocol, resolveSurfaceCapabilities, shouldAnimate } from './policy.js';
import { lookupTerminal } from './terminal-db.js';
import type {
  AtlasCapabilities,
  AtlasColorLevel,
  AtlasPerformanceClass,
  AtlasSurface,
  AtlasUnicodeLevel,
  DetectCapabilitiesOptions,
  GetCapabilitiesOptions,
  TerminalRecord,
} from './types.js';

const DEFAULT_SURFACE: AtlasSurface = 'terminal';
const DEFAULT_UNICODE_VERSION = 15;
const DEFAULT_TTL = 30_000;
const EMPTY_ENV: NodeJS.ProcessEnv = {};

interface CacheEntry {
  capabilities: AtlasCapabilities;
  timestamp: number;
}

const cachedCapabilities = new Map<AtlasSurface, CacheEntry>();
let pinnedOverrides: Partial<AtlasCapabilities> | null = null;

function getProcessEnv(): NodeJS.ProcessEnv {
  return typeof process !== 'undefined' && process.env ? process.env : EMPTY_ENV;
}

function getEnv(options?: DetectCapabilitiesOptions): NodeJS.ProcessEnv {
  return options?.env ?? getProcessEnv();
}

export function getTerminalName(env: NodeJS.ProcessEnv): string {
  const termProgram = env['TERM_PROGRAM'] ?? '';
  const term = env['TERM'] ?? '';

  if (env['KITTY_PID']) return 'kitty';
  if (termProgram === 'kitty' || term.includes('xterm-kitty')) return 'kitty';
  if (termProgram === 'WezTerm') return 'wezterm';
  if (termProgram === 'iTerm.app' || termProgram === 'iTerm2' || env['LC_TERMINAL'] === 'iTerm2') return 'iterm2';
  if (env['WT_SESSION']) return 'windows-terminal';
  if (termProgram === 'alacritty') return 'alacritty';
  if (termProgram === 'foot') return 'foot';
  if (termProgram === 'ghostty') return 'ghostty';
  if (termProgram === 'vscode') return 'vscode';
  if (termProgram === 'Hyper') return 'hyper';
  if (termProgram === 'Tabby') return 'tabby';
  if (termProgram === 'contour') return 'contour';
  if (termProgram === 'rio') return 'rio';
  if (termProgram === 'mintty') return 'mintty';
  if (termProgram === 'mlterm') return 'mlterm';
  if (termProgram === 'WarpTerminal' || termProgram === 'Warp') return 'warp';
  if (termProgram) return termProgram.toLowerCase();
  return 'unknown';
}

const TERM_FEATURES_MAP: Record<string, keyof TerminalRecord> = {
  styled_underlines: 'styledUnderlines',
  overline: 'overline',
  sixel: 'sixelGraphics',
  kitty_graphics: 'kittyGraphics',
  iterm2_images: 'iterm2Images',
  kitty_keyboard: 'kittyKeyboard',
  hyperlinks: 'hyperlinks',
  undercurl: 'undercurl',
  sync_output: 'syncOutput',
  cursor_shapes: 'cursorShapes',
  focus_events: 'focusEvents',
};

function parseTermFeatures(env: NodeJS.ProcessEnv): Partial<TerminalRecord> {
  const raw = env['TERM_FEATURES'];
  if (!raw) return {};
  const overrides: Record<string, boolean> = {};
  for (const feature of raw.split(',')) {
    const trimmed = feature.trim();
    const key = TERM_FEATURES_MAP[trimmed];
    if (key) {
      overrides[key] = true;
    }
    const negated = trimmed.startsWith('no_') ? trimmed.slice(3) : trimmed.startsWith('-') ? trimmed.slice(1) : null;
    if (negated) {
      const negKey = TERM_FEATURES_MAP[negated];
      if (negKey) {
        overrides[negKey] = false;
      }
    }
  }
  return overrides as Partial<TerminalRecord>;
}

export function detectColorLevel(env?: NodeJS.ProcessEnv): AtlasColorLevel {
  const resolvedEnv = env ?? getProcessEnv();

  if (resolvedEnv['FORCE_COLOR'] === '0') return 'none';
  if (resolvedEnv['FORCE_COLOR'] === '3') return 'truecolor';
  if (resolvedEnv['FORCE_COLOR'] === '2') return '256';
  if (resolvedEnv['FORCE_COLOR'] === '1') return '16';
  if (resolvedEnv['NO_COLOR'] !== undefined) return 'none';

  const terminalName = getTerminalName(resolvedEnv);
  const colorterm = resolvedEnv['COLORTERM'] ?? '';
  const term = resolvedEnv['TERM'] ?? '';

  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  if (['kitty', 'wezterm', 'iterm2', 'windows-terminal', 'ghostty', 'warp'].includes(terminalName)) return 'truecolor';
  if (term.includes('256color') || ['alacritty', 'foot', 'vscode', 'hyper', 'tabby', 'contour', 'rio', 'mintty', 'mlterm'].includes(terminalName)) {
    return '256';
  }
  if (term !== '' && term !== 'dumb') return '16';
  return 'none';
}

export function detectDarkBackground(env?: NodeJS.ProcessEnv): boolean {
  const resolvedEnv = env ?? getProcessEnv();
  const colorfgbg = resolvedEnv['COLORFGBG'];
  if (colorfgbg) {
    const parts = colorfgbg.split(';');
    const bg = parseInt(parts[parts.length - 1] ?? '0', 10);
    return Number.isFinite(bg) ? bg < 8 : true;
  }
  return true;
}

export function detectReducedMotion(env?: NodeJS.ProcessEnv): boolean {
  const resolvedEnv = env ?? getProcessEnv();
  const check = (value: string | undefined): boolean => value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
  return check(resolvedEnv['NO_MOTION']) || check(resolvedEnv['REDUCE_MOTION']);
}

/**
 * Terminals known to ship Unicode 16 octant glyphs (U+1CD00–U+1CDEF)
 * via their bundled fonts in early-2026-era releases. Conservative list —
 * users on other terminals can opt in via `TERM_FEATURES=unicode16`.
 *
 * `wezterm` is included because recent builds bundle a Roboto Mono variant
 * with octant coverage; older WezTerm releases will render tofu and the
 * user should drop back via `TERM_FEATURES=-unicode16` (the override
 * mechanism understood by the parser, see `parseTermFeatures`).
 */
const UNICODE16_TERMINALS = new Set(['ghostty', 'kitty', 'wezterm']);

function detectUnicodeLevel(env: NodeJS.ProcessEnv): AtlasUnicodeLevel {
  const locale = env['LC_ALL'] || env['LANG'] || '';
  const term = env['TERM'] ?? '';
  if (term === 'dumb') return 'none';
  const utf8 = /utf-?8/i.test(locale);
  if (!utf8) return 'basic';

  // User opt-in or terminal-database opt-in for Unicode 16 octant coverage.
  const features = (env['TERM_FEATURES'] ?? '').split(',').map((s) => s.trim());
  if (features.includes('unicode16')) return 'unicode16';
  const terminalName = getTerminalName(env);
  if (UNICODE16_TERMINALS.has(terminalName)) return 'unicode16';

  return 'full';
}

function detectPerformanceClass(env: NodeJS.ProcessEnv, terminalName: string, surface: AtlasSurface): AtlasPerformanceClass {
  if (surface === 'test') return 'low';
  if (env['CI']) return 'low';
  if (['kitty', 'wezterm', 'ghostty', 'windows-terminal', 'warp'].includes(terminalName)) return 'high';
  return 'standard';
}

export function detectCapabilities(options?: DetectCapabilitiesOptions): AtlasCapabilities {
  const env = getEnv(options);
  const surface = options?.surface ?? DEFAULT_SURFACE;
  const terminalName = getTerminalName(env);
  const term = env['TERM'] ?? '';
  const isDumb = term === 'dumb';
  const vteVersion = parseInt(env['VTE_VERSION'] ?? '', 10);
  const colorLevel = detectColorLevel(env);

  // Step 1: Look up DB entry
  let record: TerminalRecord = { ...lookupTerminal(terminalName) };

  // Step 2: VTE-based overrides (VTE spans multiple terminals, not in DB)
  if (Number.isFinite(vteVersion) && vteVersion >= 5000) record = { ...record, hyperlinks: true };
  if (Number.isFinite(vteVersion) && vteVersion >= 7200) record = { ...record, sixelGraphics: true };

  // Step 3: Multiplexer downgrades
  record = applyMultiplexerDowngrades(record, detectMultiplexer(env));

  // Step 4: TERM_FEATURES user overrides
  const termFeatures = parseTermFeatures(env);
  if (Object.keys(termFeatures).length > 0) {
    record = { ...record, ...termFeatures };
  }

  // Step 5: Dumb terminal overrides
  if (isDumb) {
    record = { ...record, bracketedPaste: false, mouseTracking: false };
  }

  const base: AtlasCapabilities = {
    surface,
    terminalName,
    colorLevel,
    darkBackground: detectDarkBackground(env),
    reducedMotion: detectReducedMotion(env),
    kittyKeyboard: record.kittyKeyboard,
    bracketedPaste: record.bracketedPaste,
    focusEvents: record.focusEvents,
    mouseTracking: record.mouseTracking,
    kittyGraphics: record.kittyGraphics,
    iterm2Images: record.iterm2Images,
    iterm2ImagesMultipart: record.iterm2ImagesMultipart,
    sixelGraphics: record.sixelGraphics,
    syncOutput: record.syncOutput,
    hyperlinks: record.hyperlinks,
    undercurl: record.undercurl,
    styledUnderlines: record.styledUnderlines,
    overline: record.overline,
    cursorShapes: record.cursorShapes,
    unicodeLevel: detectUnicodeLevel(env),
    unicodeVersion: DEFAULT_UNICODE_VERSION,
    performanceClass: detectPerformanceClass(env, terminalName, surface),
  };

  const surfaceResolved = resolveSurfaceCapabilities(base, surface);

  if (pinnedOverrides) {
    return { ...surfaceResolved, ...pinnedOverrides };
  }

  return surfaceResolved;
}

export function getCapabilities(surface: AtlasSurface = DEFAULT_SURFACE, options?: GetCapabilitiesOptions): AtlasCapabilities {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const cached = cachedCapabilities.get(surface);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.capabilities;
  }

  const next = detectCapabilities({ surface });
  cachedCapabilities.set(surface, { capabilities: next, timestamp: Date.now() });
  return next;
}

export function resetCapabilitiesCache(): void {
  cachedCapabilities.clear();
}

export function pinCapabilities(overrides: Partial<AtlasCapabilities>): void {
  pinnedOverrides = overrides;
  cachedCapabilities.clear();
}

export function unpinCapabilities(): void {
  pinnedOverrides = null;
  cachedCapabilities.clear();
}

export { getPreferredImageProtocol, shouldAnimate };
