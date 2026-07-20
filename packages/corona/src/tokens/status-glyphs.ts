/**
 * Status glyph tokens — semantic surface glyphs for success / warning / danger
 * / info / pending / offline / queued / neutral.
 *
 * Used by `statusIcon` in constellation. Consumers resolve via `resolveGlyph`
 * against the active atlas-detected unicode level.
 *
 * These intentionally live in corona (not constellation) because the glyph
 * vocabulary is theme-aware: theme overrides go through `defineDomainTokens`,
 * and downstream packages (beacon, quasar) can consume them without depending
 * on constellation.
 */

import type { GlyphToken } from '../glyphs.js';

export type StatusKind = 'success' | 'warning' | 'danger' | 'info' | 'pending' | 'offline' | 'queued' | 'neutral';

export const statusGlyphTokens: Record<StatusKind, GlyphToken> = {
  success: { full: '', wide: '✓', basic: '+', none: 'OK' },
  warning: { full: '', wide: '⚠', basic: '!', none: '!' },
  danger: { full: '', wide: '✕', basic: 'X', none: 'X' },
  info: { full: '', wide: 'ⓘ', basic: 'i', none: 'i' },
  pending: { full: '', wide: '⋯', basic: '...', none: '...' },
  offline: { full: '', wide: '○', basic: 'o', none: '-' },
  queued: { full: '', wide: '◌', basic: '*', none: '*' },
  neutral: { full: '', wide: '·', basic: '.', none: '.' },
};
