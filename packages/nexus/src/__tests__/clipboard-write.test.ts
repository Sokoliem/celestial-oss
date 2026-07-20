import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { writeClipboard } from '../clipboard.js';
import { _resetClipboardToolCache } from '../native/process-env.js';
import { makeProbe, makeSpawn, makeSshProbe } from './__fixtures__/platform-injection.js';

function makePathWithTools(names: readonly string[]): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-clip-write-'));
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

describe('writeClipboard — macOS (AC-1.1)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('selects pbcopy on darwin', async () => {
    const path = makePathWithTools(['pbcopy']);
    try {
      const spawn = makeSpawn();
      const escapes: string[] = [];
      const result = await writeClipboard('hello', {
        env: makeProbe('darwin', { PATH: path.dir }),
        spawn,
        writeEscape: (s) => escapes.push(s),
      });
      expect(result.ok).toBe(true);
      expect(result.source).toBe('both');
      expect(result.nativeTool).toBe('pbcopy');
      expect(spawn.invocations).toHaveLength(1);
      expect(spawn.invocations[0]!.cmd).toBe('pbcopy');
      expect(spawn.invocations[0]!.stdin.join('')).toBe('hello');
      expect(escapes).toHaveLength(1);
      expect(escapes[0]).toContain('\x1b]52;c;');
    } finally {
      path.cleanup();
    }
  });
});

describe('writeClipboard — Linux Wayland (AC-1.2)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('prefers wl-copy when WAYLAND_DISPLAY is set', async () => {
    const path = makePathWithTools(['wl-copy', 'xclip', 'xsel']);
    try {
      const spawn = makeSpawn();
      const result = await writeClipboard('hello', {
        env: makeProbe('linux', { PATH: path.dir, WAYLAND_DISPLAY: 'wayland-0' }),
        spawn,
        writeEscape: () => undefined,
      });
      expect(result.ok).toBe(true);
      expect(result.nativeTool).toBe('wl-copy');
      expect(spawn.invocations[0]!.cmd).toBe('wl-copy');
    } finally {
      path.cleanup();
    }
  });
});

describe('writeClipboard — Linux X11 (AC-1.3)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('prefers xclip when WAYLAND_DISPLAY unset', async () => {
    const path = makePathWithTools(['xclip', 'xsel']);
    try {
      const spawn = makeSpawn();
      const result = await writeClipboard('hello', {
        env: makeProbe('linux', { PATH: path.dir, DISPLAY: ':0' }),
        spawn,
        writeEscape: () => undefined,
      });
      expect(result.ok).toBe(true);
      expect(result.nativeTool).toBe('xclip');
      expect(spawn.invocations[0]!.cmd).toBe('xclip');
      expect(spawn.invocations[0]!.args).toEqual(['-selection', 'clipboard']);
    } finally {
      path.cleanup();
    }
  });

  it('falls through to xsel when xclip exits non-zero', async () => {
    const path = makePathWithTools(['xclip', 'xsel']);
    try {
      const spawn = makeSpawn({ xclip: { code: 1 } });
      const result = await writeClipboard('hello', {
        env: makeProbe('linux', { PATH: path.dir, DISPLAY: ':0' }),
        spawn,
        writeEscape: () => undefined,
      });
      expect(result.ok).toBe(true);
      expect(result.nativeTool).toBe('xsel');
      expect(spawn.invocations.map((i) => i.cmd)).toEqual(['xclip', 'xsel']);
    } finally {
      path.cleanup();
    }
  });
});

describe('writeClipboard — Windows (AC-1.4)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('uses clip on win32 with UTF-16LE BOM', async () => {
    const path = makePathWithTools(['clip.exe']);
    try {
      const spawn = makeSpawn();
      const result = await writeClipboard('hi', {
        env: makeProbe('win32', { PATH: path.dir, PATHEXT: '.EXE' }),
        spawn,
        writeEscape: () => undefined,
      });
      expect(result.ok).toBe(true);
      expect(result.nativeTool).toBe('clip');
      const stdin = Buffer.concat(spawn.invocations[0]!.stdinRaw);
      // UTF-16LE BOM
      expect(stdin[0]).toBe(0xff);
      expect(stdin[1]).toBe(0xfe);
      // 'hi' as UTF-16LE: 0x68 0x00 0x69 0x00
      expect(stdin.slice(2).equals(Buffer.from([0x68, 0x00, 0x69, 0x00]))).toBe(true);
    } finally {
      path.cleanup();
    }
  });
});

describe('writeClipboard — SSH (AC-1.5)', () => {
  it('uses OSC 52 only when SSH_CONNECTION is set', async () => {
    const escapes: string[] = [];
    const spawn = makeSpawn();
    const result = await writeClipboard('hello', {
      env: makeSshProbe(),
      spawn,
      writeEscape: (s) => escapes.push(s),
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('osc52');
    expect(escapes).toHaveLength(1);
    expect(spawn.invocations).toHaveLength(0);
  });
});

describe('writeClipboard — DI seam (AC-4.1)', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('uses injected spawn without globally mocking node:child_process', async () => {
    const path = makePathWithTools(['pbcopy']);
    try {
      const spawn = makeSpawn();
      await writeClipboard('x', {
        env: makeProbe('darwin', { PATH: path.dir }),
        spawn,
        writeEscape: () => undefined,
      });
      expect(spawn.invocations).toHaveLength(1);
      expect(spawn.invocations[0]!.cmd).toBe('pbcopy');
    } finally {
      path.cleanup();
    }
  });

  it('records the path recorder events for both osc52 and native', async () => {
    const path = makePathWithTools(['pbcopy']);
    try {
      const events: { path: string; ok: boolean }[] = [];
      const recorder = { record: (e: { path: 'osc52' | 'native'; ok: boolean; durationMs: number }) => events.push(e) };
      await writeClipboard('x', {
        env: makeProbe('darwin', { PATH: path.dir }),
        spawn: makeSpawn(),
        writeEscape: () => undefined,
        _recorder: recorder,
      });
      expect(events.map((e) => e.path)).toEqual(['osc52', 'native']);
      expect(events.every((e) => e.ok)).toBe(true);
    } finally {
      path.cleanup();
    }
  });
});

describe('writeClipboard — failure modes', () => {
  beforeEach(() => _resetClipboardToolCache());

  it('returns source none when neither path succeeds', async () => {
    const path = makePathWithTools(['xclip']);
    try {
      const spawn = makeSpawn({ xclip: { code: 1 } });
      const result = await writeClipboard('x', {
        env: makeProbe('linux', { PATH: path.dir, DISPLAY: ':0' }),
        spawn,
        writeEscape: () => undefined,
        nativeOnly: true,
      });
      expect(result.ok).toBe(false);
      expect(result.source).toBe('none');
    } finally {
      path.cleanup();
    }
  });

  it('returns source none when no native tools are on PATH', async () => {
    const path = makePathWithTools([]);
    try {
      const result = await writeClipboard('x', {
        env: makeProbe('linux', { PATH: path.dir }),
        spawn: makeSpawn(),
        writeEscape: () => undefined,
        nativeOnly: true,
      });
      expect(result.ok).toBe(false);
      expect(result.source).toBe('none');
      expect(result.error).toContain('no native clipboard tool');
    } finally {
      path.cleanup();
    }
  });

  it('handles spawn synchronous throw (ENOENT-style)', async () => {
    const path = makePathWithTools(['xclip']);
    try {
      const spawn = makeSpawn({ xclip: { spawnError: Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) } });
      const result = await writeClipboard('x', {
        env: makeProbe('linux', { PATH: path.dir, DISPLAY: ':0' }),
        spawn,
        writeEscape: () => undefined,
        nativeOnly: true,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('ENOENT');
    } finally {
      path.cleanup();
    }
  });

  it('preferOsc52 short-circuits the native path', async () => {
    const result = await writeClipboard('x', {
      env: makeProbe('darwin', { PATH: '/nonexistent' }),
      spawn: makeSpawn(),
      writeEscape: () => undefined,
      preferOsc52: true,
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('osc52');
  });
});
