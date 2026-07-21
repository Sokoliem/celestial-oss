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

  it('uses rundll32 directly on win32 without a command shell', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('https://example.com', { env: makeProbe('win32'), spawn });
    expect(result.ok).toBe(true);
    expect(result.tool).toBe('rundll32');
    expect(spawn.invocations[0]!.cmd).toBe('rundll32.exe');
    expect(spawn.invocations[0]!.args).toEqual(['url.dll,FileProtocolHandler', 'https://example.com']);
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

  it('rejects executable URL schemes unless explicitly allowed', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('javascript:alert(1)', { env: makeProbe('darwin'), spawn });
    expect(result).toEqual({ ok: false, error: 'URL protocol is not allowed: javascript:' });
    expect(spawn.invocations).toHaveLength(0);
  });

  it('supports explicit protocol opt-in', async () => {
    const spawn = makeSpawn();
    const result = await openUrl('file:///tmp/readme.txt', {
      allowedProtocols: ['file'],
      env: makeProbe('darwin'),
      spawn,
    });
    expect(result.ok).toBe(true);
    expect(spawn.invocations[0]!.args).toEqual(['file:///tmp/readme.txt']);
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
