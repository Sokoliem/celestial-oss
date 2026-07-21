import { describe, expect, it } from 'vitest';
import { modelTokens, phaseTokens, resolveDomainTokens, toolTokens } from '../domain-tokens.js';
import { resolveModel, resolvePhase, resolveTool } from '../family-resolvers.js';
import { applyVariant, defaultTheme, lightVariant } from '../theme.js';

describe('family-resolvers — resolvePhase', () => {
  it('returns the {value, color, glyph, label} shape', () => {
    const r = resolvePhase(defaultTheme, 'planning');
    expect(r.value).toBe('planning');
    expect(r.color).toBeDefined();
    expect(typeof r.glyph).toBe('string');
    expect(r.label).toBe('Planning');
  });

  it('color equals the direct contract resolution', () => {
    const direct = resolveDomainTokens(phaseTokens, defaultTheme);
    expect(resolvePhase(defaultTheme, 'planning').color).toBe(direct.planning);
    expect(resolvePhase(defaultTheme, 'idle').color).toBe(direct.idle);
  });

  it('default level is 2 (wide Unicode)', () => {
    const def = resolvePhase(defaultTheme, 'planning');
    const explicit = resolvePhase(defaultTheme, 'planning', { level: 2 });
    expect(def.glyph).toBe(explicit.glyph);
  });

  it('level 1 returns the ASCII glyph', () => {
    expect(resolvePhase(defaultTheme, 'planning', { level: 1 }).glyph).toBe('*');
    expect(resolvePhase(defaultTheme, 'idle', { level: 1 }).glyph).toBe('.');
  });

  it('level 3 returns a string (may be empty until Nerd Font codes filled)', () => {
    expect(typeof resolvePhase(defaultTheme, 'planning', { level: 3 }).glyph).toBe('string');
  });

  it('works on light variant', () => {
    const light = applyVariant(defaultTheme, lightVariant);
    expect(resolvePhase(light, 'testing').value).toBe('testing');
    expect(resolvePhase(light, 'testing').label).toBe('Testing');
  });
});

describe('family-resolvers — resolveTool', () => {
  it('humanizes camelCase tool keys', () => {
    expect(resolveTool(defaultTheme, 'webFetch').label).toBe('Web Fetch');
    expect(resolveTool(defaultTheme, 'webSearch').label).toBe('Web Search');
    expect(resolveTool(defaultTheme, 'read').label).toBe('Read');
  });

  it('color equals the direct contract resolution', () => {
    const direct = resolveDomainTokens(toolTokens, defaultTheme);
    expect(resolveTool(defaultTheme, 'bash').color).toBe(direct.bash);
    expect(resolveTool(defaultTheme, 'fallback').color).toBe(direct.fallback);
  });

  it('returns level-1 ASCII glyph when level: 1', () => {
    expect(resolveTool(defaultTheme, 'bash', { level: 1 }).glyph).toBe('$');
    expect(resolveTool(defaultTheme, 'read', { level: 1 }).glyph).toBe('R');
  });
});

describe('family-resolvers — resolveModel', () => {
  it('returns the {value, color, glyph, label} shape', () => {
    const r = resolveModel(defaultTheme, 'opus');
    expect(r.value).toBe('opus');
    expect(r.label).toBe('Opus');
  });

  it('color equals the direct contract resolution', () => {
    const direct = resolveDomainTokens(modelTokens, defaultTheme);
    expect(resolveModel(defaultTheme, 'haiku').color).toBe(direct.haiku);
    expect(resolveModel(defaultTheme, 'unknown').color).toBe(direct.unknown);
  });

  it('humanizes unknown to "Unknown"', () => {
    expect(resolveModel(defaultTheme, 'unknown').label).toBe('Unknown');
  });
});
