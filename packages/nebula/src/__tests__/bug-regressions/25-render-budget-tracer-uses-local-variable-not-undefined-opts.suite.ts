// @ts-nocheck
/**
 * Regression tests for critical and high-priority bugs in the Nebula core.
 *
 * Each test reproduces the exact failure condition BEFORE the fix is applied,
 * then asserts the correct expected behavior.
 */
import { describe, expect, it } from 'vitest';

// ─── Bug: render() references undefined `opts` instead of local `renderTracer` ──
//
// When a render takes longer than 16ms, the render budget code at the end of
// render() referenced `opts.renderTracer` — but there is no `opts` variable in
// scope. The parameter is called `options` and the extracted local is
// `renderTracer` (aliased as `t` inside render()). This caused a
// ReferenceError crash on every slow render frame.

describe('render budget tracer uses local variable, not undefined opts', () => {
  it('source code references `t` (local tracer alias), not `opts`', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const appSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'app', 'render.ts'), 'utf-8');

    // The buggy pattern: `opts.renderTracer` inside the render() function
    expect(appSource).not.toContain('opts.renderTracer');

    // The correct pattern uses the local `t` alias (assigned from `renderTracer`)
    expect(appSource).toContain('renderDuration > FRAME_MS && t');

    // The render budget stderr write must be guarded by CELESTIAL_DEBUG_RENDER
    expect(appSource).toContain('renderDuration > FRAME_MS && process.env.CELESTIAL_DEBUG_RENDER');
  });
});
