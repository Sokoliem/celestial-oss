import { describe, expect, it } from 'vitest';
import { openUrl } from '../native/open-url.js';
import { makeProbe, makeSpawn } from './__fixtures__/platform-injection.js';

describe('openUrl', () => {
  it('uses `open` on darwin', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('https://example.com', { env: makeProbe('darwin'), spawn });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('open');
    expect(spawn.invocations[0]!.cmd).toBe('open');
    expect(spawn.invocations[0]!.args).toEqual(['https://example.com']);
  });

  it('uses `cmd /c start ""` on win32 (empty title prevents URL-as-title)', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('https://example.com', { env: makeProbe('win32'), spawn });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('start');
    expect(spawn.invocations[0]!.cmd).toBe('cmd');
    expect(spawn.invocations[0]!.args).toEqual(['/c', 'start', '""', 'https://example.com']);
  });

  it('uses xdg-open on linux', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('https://example.com', { env: makeProbe('linux'), spawn });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('xdg-open');
  });

  it('prefers wslview when WSL_DISTRO_NAME is set', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('https://example.com', {
      env: makeProbe('linux', { WSL_DISTRO_NAME: 'Ubuntu' }),
      spawn,
    });
    expect(result.tool).toBe('wslview');
  });

  it('falls back to xdg-open if wslview fails inside WSL', async () => {
    const spawn = makeSpawn({ wslview: { code: 1 } });
    const result = await openUrl('https://example.com', {
      env: makeProbe('linux', { WSL_DISTRO_NAME: 'Ubuntu' }),
      spawn,
    });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('xdg-open');
  });

  it('rejects malformed URLs without spawning anything', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('not a url', { env: makeProbe('darwin'), spawn });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('invalid URL');
    expect(spawn.invocations).toHaveLength(0);
  });

  it('returns ok:false when the open tool exits non-zero', async () => {
    const spawn = makeSpawn({ open: { code: 1 } });
    const result = await openUrl('https://example.com', { env: makeProbe('darwin'), spawn });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exited 1');
  });

  it('does not invoke a shell (no shell:true seam)', async () => {
    const spawn = makeSpawn();
    await openUrl('https://example.com?evil=`whoami`', { env: makeProbe('darwin'), spawn });
    // The URL must arrive as a single argv element — never embedded in a shell string.
    expect(spawn.invocations[0]!.args).toEqual(['https://example.com?evil=`whoami`']);
  });
});
