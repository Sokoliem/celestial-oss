import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { osc52Write, readClipboard } from '../clipboard.js';
import { _resetClipboardToolCache } from '../native/process-env.js';
import { makeProbe, makeSpawn, makeSshProbe } from './__fixtures__/platform-injection.js';

function makePathWithTools(names: readonly string[]): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-clip-read-'));
  for (const name of names) {
    const file = join(dir, name);
    writeFileSync(file, '#!/bin/sh\n');
    chmodSync(file, 0o755);
  }
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe('readClipboard — OSC 52 happy path', () => {
  it('returns text from a valid OSC 52 response', async () => {
    const result = await readClipboard({
      env: makeSshProbe(),
      readEscape: async () => osc52Write('hello'),
      writeEscape: () => undefined,
    });
    expect(result.text).toBe('hello');
    expect(result.source).toBe('osc52');
  });
});

describe('readClipboard — OSC 52 timeout (AC-2.1)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('falls through to native when readEscape returns null', async () => {
    const path = makePathWithTools(['pbpaste']);
    try {
      const spawn = makeSpawn({ pbpaste: { stdout: ['from-pbpaste'] } });
      const result = await readClipboard({
        env: makeProbe('darwin', { PATH: path.dir }),
        readEscape: async () => null,
        writeEscape: () => undefined,
        spawn,
      });
      expect(result.text).toBe('from-pbpaste');
      expect(result.source).toBe('native');
      expect(spawn.invocations[0]!.cmd).toBe('pbpaste');
    } finally {
      path.cleanup();
    }
  });

  it('returns text:null source:none when no readEscape and SSH', async () => {
    const result = await readClipboard({
      env: makeSshProbe(),
      writeEscape: () => undefined,
    });
    expect(result.text).toBeNull();
    expect(result.source).toBe('none');
  });

  it('OSC 52 wall-clock timeout falls through to native', async () => {
    const path = makePathWithTools(['pbpaste']);
    try {
      const spawn = makeSpawn({ pbpaste: { stdout: ['cb'] } });
      const result = await readClipboard({
        env: makeProbe('darwin', { PATH: path.dir }),
        readEscape: () => new Promise((resolve) => setTimeout(() => resolve('garbage'), 80)),
        writeEscape: () => undefined,
        osc52TimeoutMs: 10,
        spawn,
      });
      expect(result.source).toBe('native');
      expect(result.text).toBe('cb');
    } finally {
      path.cleanup();
    }
  });
});

describe('readClipboard — Linux Wayland', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('uses wl-paste when WAYLAND_DISPLAY set', async () => {
    const path = makePathWithTools(['wl-paste', 'xclip', 'xsel']);
    try {
      const spawn = makeSpawn({ 'wl-paste': { stdout: ['wayland-text'] } });
      const result = await readClipboard({
        env: makeProbe('linux', { PATH: path.dir, WAYLAND_DISPLAY: 'wayland-0' }),
        writeEscape: () => undefined,
        spawn,
      });
      expect(result.source).toBe('native');
      expect(result.text).toBe('wayland-text');
      expect(spawn.invocations[0]!.cmd).toBe('wl-paste');
    } finally {
      path.cleanup();
    }
  });
});

describe('readClipboard — Windows', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('uses powershell Get-Clipboard on win32', async () => {
    const path = makePathWithTools(['powershell.exe']);
    try {
      const spawn = makeSpawn({ powershell: { stdout: ['win-cb'] } });
      const result = await readClipboard({
        env: makeProbe('win32', { PATH: path.dir, PATHEXT: '.EXE' }),
        writeEscape: () => undefined,
        spawn,
      });
      expect(result.source).toBe('native');
      expect(result.text).toBe('win-cb');
      expect(spawn.invocations[0]!.cmd).toBe('powershell');
    } finally {
      path.cleanup();
    }
  });

  it('kills readers whose output exceeds the configured bound', async () => {
    const path = makePathWithTools(['powershell.exe']);
    try {
      const spawn = makeSpawn({ powershell: { stdout: ['too much clipboard data'] } });
      const result = await readClipboard({
        env: makeProbe('win32', { PATH: path.dir, PATHEXT: '.EXE' }),
        writeEscape: () => undefined,
        maxNativeBytes: 4,
        spawn,
      });
      expect(result.text).toBeNull();
      expect(result.source).toBe('none');
      expect(result.error).toContain('exceeded 4 bytes');
    } finally {
      path.cleanup();
    }
  });
});
