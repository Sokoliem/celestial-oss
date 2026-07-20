import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as horizon from '../index.js';

describe('@celestial/horizon beta boundary', () => {
  it('keeps PTY and advanced transition APIs out of the beta surface', () => {
    expect('ptyPaneInit' in horizon).toBe(false);
    expect('AnnotationBuffer' in horizon).toBe(false);
    expect('createWorkspaceTransitionModel' in horizon).toBe(false);
  });

  it('has only @celestial/core as a Celestial runtime dependency', () => {
    const manifestPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies?: Record<string, string> };
    const dependencies = Object.keys(manifest.dependencies ?? {}).filter((name) => name.startsWith('@celestial/'));
    expect(dependencies).toEqual(['@celestial/core']);
  });
});
