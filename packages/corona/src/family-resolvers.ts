/**
 * One-call resolvers for the phase / tool / model domain families. Returns
 * `{ value, color, glyph, label }` so view code does not have to compose the
 * contract + family + glyph-level resolution by hand.
 */

import type { Color } from './color.js';
import {
  type ClaudeModel,
  type ClaudeTool,
  modelFamily,
  modelTokens,
  phaseFamily,
  phaseTokens,
  resolveDomainTokens,
  resolveFamilyGlyph,
  type SessionPhase,
  toolFamily,
  toolTokens,
} from './domain-tokens.js';
import type { SemanticTheme } from './theme.js';

export interface ResolvedFamilyValue<V extends string> {
  readonly value: V;
  readonly color: Color;
  readonly glyph: string;
  readonly label: string;
}

export interface FamilyResolveOptions {
  /** Glyph fidelity level. 1 = ASCII, 2 = wide Unicode (default), 3 = Nerd Font. */
  level?: 1 | 2 | 3;
}

const DEFAULT_LEVEL = 2 as const;

/** camelCase or single-word lowercase -> Title Case with word boundaries on lower→Upper. */
function humanize(value: string): string {
  if (value.length === 0) return '';
  const spaced = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function resolvePhase(theme: SemanticTheme, phase: SessionPhase, opts?: FamilyResolveOptions): ResolvedFamilyValue<SessionPhase> {
  const colors = resolveDomainTokens(phaseTokens, theme);
  return {
    value: phase,
    color: colors[phase],
    glyph: resolveFamilyGlyph(phaseFamily, phase, opts?.level ?? DEFAULT_LEVEL),
    label: humanize(phase),
  };
}

export function resolveTool(theme: SemanticTheme, tool: ClaudeTool, opts?: FamilyResolveOptions): ResolvedFamilyValue<ClaudeTool> {
  const colors = resolveDomainTokens(toolTokens, theme);
  return {
    value: tool,
    color: colors[tool],
    glyph: resolveFamilyGlyph(toolFamily, tool, opts?.level ?? DEFAULT_LEVEL),
    label: humanize(tool),
  };
}

export function resolveModel(theme: SemanticTheme, model: ClaudeModel, opts?: FamilyResolveOptions): ResolvedFamilyValue<ClaudeModel> {
  const colors = resolveDomainTokens(modelTokens, theme);
  return {
    value: model,
    color: colors[model],
    glyph: resolveFamilyGlyph(modelFamily, model, opts?.level ?? DEFAULT_LEVEL),
    label: humanize(model),
  };
}
